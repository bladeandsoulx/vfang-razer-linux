//! JSON-lines socket server plus the 1 Hz telemetry loop.

use crate::core::Core;
use crate::peripherals::{read_snapshot, Peripherals, SnapshotStore};
use fang_protocol::api::{Command, Event, Request, Response, Telemetry, API_VERSION};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::{broadcast, Mutex};

pub type SharedCore = Arc<Mutex<Core>>;
pub type EventBus = broadcast::Sender<String>;

const MAX_REQUEST_BYTES: usize = 64 * 1024;
const PARTIAL_REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const UNSUBSCRIBED_IDLE_TIMEOUT: Duration = Duration::from_secs(30);
const SOCKET_WRITE_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug)]
enum RequestReadError {
    TooLarge,
    IncompleteTimeout,
    IdleTimeout,
    Io(std::io::Error),
    InvalidUtf8,
}

async fn read_request_line<R>(
    reader: &mut R,
    max_bytes: usize,
    partial_timeout: Duration,
    idle_timeout: Option<Duration>,
) -> Result<Option<String>, RequestReadError>
where
    R: AsyncBufRead + Unpin,
{
    let mut bytes = Vec::with_capacity(max_bytes.min(1024));
    let mut request_started = false;
    let mut partial_deadline = None;
    let idle_deadline = idle_timeout.map(|timeout| tokio::time::Instant::now() + timeout);
    loop {
        let deadline = partial_deadline.or(idle_deadline);
        let available = if let Some(deadline) = deadline {
            tokio::time::timeout_at(deadline, reader.fill_buf())
                .await
                .map_err(|_| {
                    if request_started {
                        RequestReadError::IncompleteTimeout
                    } else {
                        RequestReadError::IdleTimeout
                    }
                })?
                .map_err(RequestReadError::Io)?
        } else {
            reader.fill_buf().await.map_err(RequestReadError::Io)?
        };
        if available.is_empty() {
            if bytes.is_empty() {
                return Ok(None);
            }
            break;
        }

        let newline = available.iter().position(|byte| *byte == b'\n');
        let content_len = newline.unwrap_or(available.len());
        if bytes.len().saturating_add(content_len) > max_bytes {
            return Err(RequestReadError::TooLarge);
        }
        let consume_len = newline.map_or(available.len(), |index| index + 1);
        bytes.extend_from_slice(&available[..content_len]);
        reader.consume(consume_len);
        if newline.is_some() {
            break;
        }
        if !request_started {
            request_started = true;
            partial_deadline = Some(tokio::time::Instant::now() + partial_timeout);
        }
    }

    if bytes.last() == Some(&b'\r') {
        bytes.pop();
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| RequestReadError::InvalidUtf8)
}

pub fn event_bus() -> EventBus {
    broadcast::channel(64).0
}

async fn forward_events<W>(mut rx: broadcast::Receiver<String>, write: Arc<Mutex<W>>)
where
    W: AsyncWrite + Unpin + Send + 'static,
{
    loop {
        match rx.recv().await {
            Ok(msg) => {
                if write_with_timeout(&write, msg.as_bytes(), SOCKET_WRITE_TIMEOUT)
                    .await
                    .is_err()
                {
                    log::debug!("closing subscriber whose socket stopped accepting writes");
                    break;
                }
            }
            Err(broadcast::error::RecvError::Lagged(missed)) => {
                log::warn!(
                    "subscriber missed {missed} events; resuming with the oldest queued event"
                );
            }
            Err(broadcast::error::RecvError::Closed) => break,
        }
    }
}

async fn write_with_timeout<W>(
    write: &Arc<Mutex<W>>,
    bytes: &[u8],
    timeout: Duration,
) -> Result<(), ()>
where
    W: AsyncWrite + Unpin,
{
    tokio::time::timeout(timeout, async {
        let mut writer = write.lock().await;
        writer.write_all(bytes).await
    })
    .await
    .map_err(|_| ())?
    .map_err(|_| ())
}

fn event_line(event: &Event) -> String {
    let mut s = serde_json::to_string(event).expect("serializable");
    s.push('\n');
    s
}

async fn write_response<W>(write: &Arc<Mutex<W>>, response: Response) -> Result<(), ()>
where
    W: AsyncWrite + Unpin,
{
    let mut line = serde_json::to_string(&response).expect("serializable");
    line.push('\n');
    write_with_timeout(write, line.as_bytes(), SOCKET_WRITE_TIMEOUT).await
}

/// 1 Hz: sample sensors, broadcast telemetry, and reapply state after a
/// suspend/resume (detected as a wall-clock jump between ticks).
pub async fn telemetry_loop(core: SharedCore, peripherals: SnapshotStore, bus: EventBus) {
    let mut tick = tokio::time::interval(Duration::from_secs(1));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut last_wall = SystemTime::now();
    loop {
        tick.tick().await;
        let now = SystemTime::now();
        let jumped = now
            .duration_since(last_wall)
            .map(|d| d > Duration::from_secs(20))
            .unwrap_or(false);
        last_wall = now;

        let on_ac = crate::power::on_ac();
        let mut core = core.lock().await;
        if jumped {
            log::info!("wall clock jump detected (resume from suspend); reapplying state");
            core.reapply();
        }
        let s = core.sample();
        let auto_changed = core.power_tick(on_ac);
        let auto_status = auto_changed.then(|| core.status(&read_snapshot(&peripherals)));
        drop(core);

        let telemetry = Telemetry {
            cpu_temp_c: s.hw.cpu_temp_c,
            gpu_temp_c: s.hw.gpu_temp_c,
            cpu_power_w: s.hw.cpu_power_w,
            gpu_power_w: s.hw.gpu_power_w,
            gpu_asleep: s.hw.gpu_asleep,
            igpu_active_pct: s.hw.igpu.active_pct,
            igpu_power_w: s.hw.igpu.power_w,
            igpu_freq_mhz: s.hw.igpu.freq_mhz,
            on_ac,
            fan_rpm: s.hw.fan_rpm,
            fan_target_rpm: s.fan_target_rpm,
            thermal_override_active: s.thermal_override_active,
            thermal_sensor_ok: s.thermal_sensor_ok,
            thermal_override_reason: s.thermal_override_reason,
            ts_ms: now
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        };
        let _ = bus.send(event_line(&Event::Telemetry(telemetry)));
        // A power-source transition may have auto-switched the profile.
        if let Some(status) = auto_status {
            let _ = bus.send(event_line(&Event::StateChanged(status)));
        }
    }
}

/// Retry DDC/CI discovery after early boot or when a stale display failed.
/// No subprocess is launched while a monitor is already available.
pub async fn ddc_rescan_loop(core: SharedCore, peripherals: Peripherals, bus: EventBus) {
    let mut tick = tokio::time::interval(Duration::from_secs(15));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    // `interval` ticks immediately; initial discovery just ran, so wait for
    // the first real interval and give DRM/i2c device nodes time to appear.
    tick.tick().await;
    loop {
        tick.tick().await;
        if peripherals.ddc_available() {
            continue;
        }
        match peripherals.rescan_ddc_if_missing().await {
            Ok(true) => {
                log::info!("DDC color: monitor recovered by automatic rescan");
                let status = current_status(&core, &peripherals).await;
                let _ = bus.send(event_line(&Event::StateChanged(status)));
            }
            Ok(false) => {}
            Err(e) => log::warn!("automatic DDC rescan failed: {e}"),
        }
    }
}

async fn current_status(
    core: &SharedCore,
    peripherals: &Peripherals,
) -> fang_protocol::api::Status {
    let snapshot = peripherals.snapshot();
    core.lock().await.status(&snapshot)
}

pub async fn handle_conn<S>(stream: S, core: SharedCore, peripherals: Peripherals, bus: EventBus)
where
    S: AsyncRead + AsyncWrite + Send + 'static,
{
    let (read, write) = tokio::io::split(stream);
    let write = Arc::new(Mutex::new(write));
    let mut reader = BufReader::new(read);
    let mut forwarder: Option<tokio::task::JoinHandle<()>> = None;

    loop {
        let next_line = if let Some(task) = forwarder.as_mut() {
            tokio::select! {
                line = read_request_line(&mut reader, MAX_REQUEST_BYTES, PARTIAL_REQUEST_TIMEOUT, None) => line,
                _ = task => break,
            }
        } else {
            read_request_line(
                &mut reader,
                MAX_REQUEST_BYTES,
                PARTIAL_REQUEST_TIMEOUT,
                Some(UNSUBSCRIBED_IDLE_TIMEOUT),
            )
            .await
        };
        let line = match next_line {
            Ok(Some(line)) => line,
            Ok(None) => break,
            Err(RequestReadError::TooLarge) => {
                let _ = write_response(
                    &write,
                    Response::err(
                        0,
                        format!("request too large (maximum {MAX_REQUEST_BYTES} bytes)"),
                    ),
                )
                .await;
                break;
            }
            Err(RequestReadError::IncompleteTimeout) => {
                let _ =
                    write_response(&write, Response::err(0, "incomplete request timed out")).await;
                break;
            }
            Err(RequestReadError::IdleTimeout) => {
                let _ = write_response(&write, Response::err(0, "idle connection timed out")).await;
                break;
            }
            Err(RequestReadError::InvalidUtf8) => {
                let _ =
                    write_response(&write, Response::err(0, "bad request: invalid UTF-8")).await;
                break;
            }
            Err(RequestReadError::Io(e)) => {
                log::debug!("socket read failed: {e}");
                break;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        let resp = match serde_json::from_str::<Request>(&line) {
            Ok(req) => {
                let id = req.id;
                if req.cmd.is_mutating() && req.api_version != API_VERSION {
                    Response::err(
                        id,
                        format!(
                            "incompatible Fang API: client {}, daemon {API_VERSION}; update both packages",
                            req.api_version
                        ),
                    )
                } else {
                    match req.cmd {
                        Command::Ping => Response::ok(id, "pong"),
                        Command::GetStatus => {
                            Response::ok(id, current_status(&core, &peripherals).await)
                        }
                        Command::Subscribe => {
                            if forwarder.is_none() {
                                let rx = bus.subscribe();
                                let w = Arc::clone(&write);
                                forwarder = Some(tokio::spawn(forward_events(rx, w)));
                            }
                            Response::ok(id, "subscribed")
                        }
                        Command::SetGpuMode { gpu_mode } => {
                            match peripherals.set_gpu_mode(gpu_mode).await {
                                Ok(()) => {
                                    let status = current_status(&core, &peripherals).await;
                                    let _ =
                                        bus.send(event_line(&Event::StateChanged(status.clone())));
                                    Response::ok(id, status)
                                }
                                Err(e) => Response::err(id, e),
                            }
                        }
                        Command::SetColorPreset { value } => {
                            match peripherals.set_color_preset(value).await {
                                Ok(()) => {
                                    let status = current_status(&core, &peripherals).await;
                                    let _ =
                                        bus.send(event_line(&Event::StateChanged(status.clone())));
                                    Response::ok(id, status)
                                }
                                Err(e) => {
                                    let status = current_status(&core, &peripherals).await;
                                    let _ = bus.send(event_line(&Event::StateChanged(status)));
                                    Response::err(id, e)
                                }
                            }
                        }
                        Command::SetMonitorBrightness { value } => {
                            match peripherals.set_monitor_brightness(value).await {
                                Ok(()) => {
                                    let status = current_status(&core, &peripherals).await;
                                    let _ =
                                        bus.send(event_line(&Event::StateChanged(status.clone())));
                                    Response::ok(id, status)
                                }
                                Err(e) => {
                                    let status = current_status(&core, &peripherals).await;
                                    let _ = bus.send(event_line(&Event::StateChanged(status)));
                                    Response::err(id, e)
                                }
                            }
                        }
                        Command::RescanDdc => match peripherals.rescan_ddc().await {
                            Ok(_) => {
                                let status = current_status(&core, &peripherals).await;
                                let _ = bus.send(event_line(&Event::StateChanged(status.clone())));
                                Response::ok(id, status)
                            }
                            Err(e) => Response::err(id, e),
                        },
                        ref cmd @ (Command::SetPerfMode { .. }
                        | Command::SetFan { .. }
                        | Command::SetBho { .. }
                        | Command::SetLighting { .. }
                        | Command::SetAutoPower { .. }) => {
                            let snapshot = peripherals.snapshot();
                            let mut core = core.lock().await;
                            match core.handle_set(cmd) {
                                Ok(changed) => {
                                    let status = core.status(&snapshot);
                                    drop(core);
                                    if changed {
                                        let _ = bus
                                            .send(event_line(&Event::StateChanged(status.clone())));
                                    }
                                    Response::ok(id, status)
                                }
                                Err(e) => Response::err(id, e),
                            }
                        }
                    }
                }
            }
            Err(e) => Response::err(0, format!("bad request: {e}")),
        };

        if write_response(&write, resp).await.is_err() {
            break;
        }
    }
    if let Some(f) = forwarder {
        f.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hw::mock::MockHw;
    use crate::peripherals;
    use crate::state::AppliedState;
    use serde_json::Value;
    use std::path::PathBuf;
    use tokio::io::AsyncWriteExt;

    #[tokio::test]
    async fn oversized_request_line_is_rejected() {
        let (client, server) = tokio::io::duplex(1024);
        let core = Arc::new(Mutex::new(Core::new(
            Box::new(MockHw::new()),
            AppliedState::default(),
            PathBuf::from("unused-test-state.json"),
        )));
        let peripheral_store = peripherals::snapshot_store();
        let peripherals = Peripherals::open(true, peripheral_store).await;
        let task = tokio::spawn(handle_conn(server, core, peripherals, event_bus()));

        let request = format!(
            r#"{{"id":1,"cmd":"ping","extra":"{}"}}"#,
            "x".repeat(MAX_REQUEST_BYTES)
        );
        let mut client = client;
        client.write_all(request.as_bytes()).await.unwrap();
        client.write_all(b"\n").await.unwrap();
        let mut lines = BufReader::new(client).lines();
        let line = tokio::time::timeout(Duration::from_secs(2), lines.next_line())
            .await
            .expect("server did not answer the oversized request")
            .expect("read response")
            .expect("server closed without an error response");
        let response: Value = serde_json::from_str(&line).expect("valid JSON response");
        assert_eq!(response["ok"], false, "{response}");
        assert!(
            response["error"].as_str().unwrap().contains("too large"),
            "{response}"
        );
        drop(lines);
        task.abort();
    }

    #[tokio::test]
    async fn event_forwarder_recovers_after_broadcast_lag() {
        let (events, rx) = broadcast::channel(64);
        for i in 0..65 {
            events.send(format!("event-{i}\n")).unwrap();
        }
        let (client, server) = tokio::io::duplex(1024);
        let write = Arc::new(Mutex::new(server));
        let forwarder = tokio::spawn(forward_events(rx, write));
        let mut lines = BufReader::new(client).lines();
        let line = tokio::time::timeout(Duration::from_secs(1), lines.next_line())
            .await
            .expect("event forwarder did not recover from lag")
            .expect("read event")
            .expect("forwarder closed without an event");
        assert_eq!(line, "event-1");
        forwarder.abort();
    }

    #[tokio::test]
    async fn idle_connection_can_send_a_request_after_waiting() {
        let (mut client, server) = tokio::io::duplex(64);
        let mut reader = BufReader::new(server);
        let read = tokio::spawn(async move {
            read_request_line(
                &mut reader,
                MAX_REQUEST_BYTES,
                Duration::from_millis(20),
                None,
            )
            .await
        });
        tokio::time::sleep(Duration::from_millis(40)).await;
        assert!(!read.is_finished(), "idle connections must stay open");
        client.write_all(b"{\"id\":1}\n").await.unwrap();
        assert_eq!(read.await.unwrap().unwrap(), Some("{\"id\":1}".into()));
    }

    #[tokio::test]
    async fn partial_request_has_a_deadline() {
        let (mut client, server) = tokio::io::duplex(64);
        client.write_all(b"{\"id\":").await.unwrap();
        let mut reader = BufReader::new(server);
        let mut read = tokio::spawn(async move {
            read_request_line(
                &mut reader,
                MAX_REQUEST_BYTES,
                Duration::from_millis(20),
                None,
            )
            .await
        });
        let result = tokio::time::timeout(Duration::from_millis(200), &mut read).await;
        if result.is_err() {
            read.abort();
        }
        assert!(
            matches!(result, Ok(Ok(Err(RequestReadError::IncompleteTimeout)))),
            "partial request did not time out: {result:?}"
        );
    }

    #[tokio::test]
    async fn unsubscribed_idle_connection_expires() {
        let (_client, server) = tokio::io::duplex(64);
        let mut reader = BufReader::new(server);
        assert!(matches!(
            read_request_line(
                &mut reader,
                MAX_REQUEST_BYTES,
                Duration::from_secs(1),
                Some(Duration::from_millis(20)),
            )
            .await,
            Err(RequestReadError::IdleTimeout)
        ));
    }

    #[tokio::test]
    async fn stalled_socket_write_releases_the_writer_lock() {
        let (writer, _reader) = tokio::io::duplex(1);
        let writer = Arc::new(Mutex::new(writer));
        let result = write_with_timeout(&writer, &[b'x'; 4096], Duration::from_millis(20)).await;
        assert!(result.is_err(), "a stalled write must time out");
        assert!(
            tokio::time::timeout(Duration::from_millis(20), writer.lock())
                .await
                .is_ok(),
            "a timed-out writer must release its lock"
        );
    }
}
