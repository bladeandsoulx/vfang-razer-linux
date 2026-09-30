//! Bounded execution for helper programs used by the root daemon.

use std::io::Read;
use std::process::{Command, ExitStatus, Output, Stdio};
use std::sync::mpsc::{self, Receiver, TryRecvError};
use std::thread;
use std::time::{Duration, Instant};

const MAX_HELPER_OUTPUT_BYTES: usize = 1024 * 1024;

fn reader_thread<R: Read + Send + 'static>(reader: R) -> Receiver<(Vec<u8>, bool)> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let _ = tx.send(capture_output(reader));
    });
    rx
}

fn capture_output<R: Read>(mut reader: R) -> (Vec<u8>, bool) {
    let mut bytes = Vec::with_capacity(MAX_HELPER_OUTPUT_BYTES.min(8192));
    let mut truncated = false;
    let mut buffer = [0u8; 8192];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => {
                let remaining = MAX_HELPER_OUTPUT_BYTES.saturating_sub(bytes.len());
                let captured = count.min(remaining);
                bytes.extend_from_slice(&buffer[..captured]);
                truncated |= captured < count;
            }
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => break,
        }
    }
    (bytes, truncated)
}

/// Run a trusted local helper, kill it at the deadline, and collect its output.
/// Reader threads drain both pipes so a verbose helper cannot deadlock on a
/// full stdout/stderr buffer while the parent waits for it to exit.
pub fn output_with_timeout(
    program: &str,
    args: &[&str],
    timeout: Duration,
) -> Result<Output, String> {
    let started = Instant::now();
    let deadline = started
        .checked_add(timeout)
        .ok_or_else(|| format!("{program}: timeout is too large"))?;
    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // A dedicated process group lets the timeout terminate helper
        // descendants too (prime-select and envycontrol may spawn tools).
        command.process_group(0);
    }
    let mut child = command.spawn().map_err(|e| format!("{program}: {e}"))?;
    let stdout = child
        .stdout
        .take()
        .map(reader_thread)
        .ok_or_else(|| format!("{program}: stdout pipe unavailable"))?;
    let stderr = child
        .stderr
        .take()
        .map(reader_thread)
        .ok_or_else(|| format!("{program}: stderr pipe unavailable"))?;
    let mut status = None;
    let mut stdout_data = None;
    let mut stderr_data = None;
    loop {
        if stdout_data.is_none() {
            stdout_data = capture_result(&stdout);
        }
        if stderr_data.is_none() {
            stderr_data = capture_result(&stderr);
        }
        // Do not reap the process leader while descendants may still hold
        // inherited pipes open. Keeping its PID reserved ensures the deadline
        // can safely kill the original process group instead of a reused id.
        if status.is_none() && stdout_data.is_some() && stderr_data.is_some() {
            match child.try_wait() {
                Ok(result) => status = result,
                Err(e) => {
                    kill_process_group(&mut child);
                    let _ = child.wait();
                    return Err(format!("{program}: {e}"));
                }
            }
        }
        if status.is_some() && stdout_data.is_some() && stderr_data.is_some() {
            break;
        }
        if Instant::now() >= deadline {
            // The leader is still owned by `child`, so its PID cannot have
            // been reused. Kill the group before reaping it, then return
            // without joining reader threads indefinitely.
            kill_process_group(&mut child);
            let _ = child.wait();
            return Err(format!(
                "{program} timed out after {}",
                format_duration(timeout)
            ));
        }
        thread::sleep(Duration::from_millis(10));
    }

    let status: ExitStatus = status.expect("completion checked above");
    let (stdout, stdout_truncated) = stdout_data.expect("completion checked above");
    let (stderr, stderr_truncated) = stderr_data.expect("completion checked above");
    if stdout_truncated || stderr_truncated {
        return Err(format!(
            "{program} output exceeded {MAX_HELPER_OUTPUT_BYTES} bytes per stream"
        ));
    }

    Ok(Output {
        status,
        stdout,
        stderr,
    })
}

fn capture_result(receiver: &Receiver<(Vec<u8>, bool)>) -> Option<(Vec<u8>, bool)> {
    match receiver.try_recv() {
        Ok(result) => Some(result),
        Err(TryRecvError::Empty) => None,
        Err(TryRecvError::Disconnected) => Some((Vec::new(), false)),
    }
}

fn format_duration(timeout: Duration) -> String {
    if timeout.as_secs() > 0 {
        format!("{} seconds", timeout.as_secs_f64())
    } else {
        format!("{} ms", timeout.as_millis())
    }
}

#[cfg(unix)]
fn kill_process_group(child: &mut std::process::Child) {
    // SAFETY: the child was placed in a new process group whose id is its pid.
    // The caller keeps the Child unreaped until this call, so that PID cannot
    // have been reused; passing the negated id targets only that process group.
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    let _ = child.kill();
}

#[cfg(not(unix))]
fn kill_process_group(child: &mut std::process::Child) {
    let _ = child.kill();
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn captures_successful_output() {
        let out = output_with_timeout("sh", &["-c", "printf fang"], Duration::from_secs(1))
            .expect("helper output");
        assert!(out.status.success());
        assert_eq!(out.stdout, b"fang");
    }

    #[test]
    fn kills_a_timed_out_helper() {
        let started = Instant::now();
        let err = output_with_timeout("sh", &["-c", "sleep 2"], Duration::from_millis(50))
            .expect_err("must time out");
        assert!(err.contains("timed out"), "{err}");
        assert!(started.elapsed() < Duration::from_millis(500));
    }

    #[test]
    fn deadline_includes_descendants_holding_pipes_open() {
        let started = Instant::now();
        let error = output_with_timeout(
            "sh",
            &["-c", "sleep 1 & exit 0"],
            Duration::from_millis(100),
        )
        .expect_err("a descendant keeping the pipes open must hit the deadline");
        assert!(error.contains("timed out"), "{error}");
        assert!(started.elapsed() < Duration::from_millis(500));
    }
}

#[cfg(test)]
mod capture_tests {
    use super::{capture_output, MAX_HELPER_OUTPUT_BYTES};

    #[test]
    fn captured_helper_output_is_bounded() {
        let input = std::io::Cursor::new(vec![b'x'; MAX_HELPER_OUTPUT_BYTES + 1]);
        let (output, truncated) = capture_output(input);
        assert_eq!(output.len(), MAX_HELPER_OUTPUT_BYTES);
        assert!(truncated);
    }
}
