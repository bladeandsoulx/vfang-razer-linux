//! Platform-neutral parsing and policy for a dGPU runtime-PM snapshot.
//!
//! The Linux backend reads the three sysfs values once per sample and derives
//! both query eligibility and the observed sleep state from that snapshot.

use std::fs;
use std::path::Path;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RuntimePmSnapshot {
    control: Option<String>,
    status: Option<String>,
    usage: Option<String>,
}

impl RuntimePmSnapshot {
    /// Read one sample of runtime-PM state. Missing or unreadable files remain
    /// distinguishable from valid sysfs values.
    pub fn read(dir: &Path) -> Self {
        Self {
            control: read_value(dir, "control"),
            status: read_value(dir, "runtime_status"),
            usage: read_value(dir, "runtime_usage"),
        }
    }

    /// Preserve the existing query policy: only `control == "auto"` gates
    /// queries, requiring an active device with another user (or an unreadable
    /// usage count). Other or unreadable control values keep the permissive fallback.
    pub fn should_query_gpu(&self) -> bool {
        if self.control.as_deref() != Some("auto") {
            return true;
        }
        self.status.as_deref() == Some("active")
            && self
                .usage
                .as_deref()
                .and_then(|value| value.parse::<u64>().ok())
                .is_none_or(|users| users > 0)
    }

    /// Whether sysfs reported the device as suspended in this snapshot.
    pub fn gpu_asleep(&self) -> bool {
        self.status.as_deref() == Some("suspended")
    }
}

fn read_value(dir: &Path, filename: &str) -> Option<String> {
    fs::read_to_string(dir.join(filename))
        .ok()
        .map(|value| value.trim().to_owned())
}

#[cfg(test)]
mod tests {
    use super::RuntimePmSnapshot;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            static NEXT_ID: AtomicU64 = AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!(
                "fangd-runtime-pm-{}-{}",
                std::process::id(),
                NEXT_ID.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }

        fn write(&self, filename: &str, value: &str) {
            fs::write(self.0.join(filename), value).unwrap();
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn snapshot(
        control: Option<&str>,
        status: Option<&str>,
        usage: Option<&str>,
    ) -> RuntimePmSnapshot {
        RuntimePmSnapshot {
            control: control.map(str::to_owned),
            status: status.map(str::to_owned),
            usage: usage.map(str::to_owned),
        }
    }

    #[test]
    fn sleep_state_is_distinct_from_query_eligibility() {
        let cases = [
            (Some("auto"), Some("suspended"), Some("0"), false, true),
            (Some("auto"), Some("active"), Some("0"), false, false),
            (Some("auto"), Some("active"), Some("1"), true, false),
            (Some("auto"), Some("active"), Some("invalid"), true, false),
            (Some("auto"), Some("resuming"), Some("1"), false, false),
            (Some("auto"), Some("suspending"), Some("0"), false, false),
            (Some("auto"), Some("malformed"), Some("0"), false, false),
            (Some("auto"), None, Some("0"), false, false),
            (Some("on"), Some("active"), Some("0"), true, false),
            (Some("on"), Some("suspended"), Some("0"), true, true),
        ];

        for (control, status, usage, should_query, asleep) in cases {
            let pm = snapshot(control, status, usage);
            assert_eq!(pm.should_query_gpu(), should_query, "{pm:?}");
            assert_eq!(pm.gpu_asleep(), asleep, "{pm:?}");
        }
    }

    #[test]
    fn file_snapshot_is_shared_by_both_decisions() {
        let fixture = Fixture::new();
        fixture.write("control", "auto\n");
        fixture.write("runtime_status", "active\n");
        fixture.write("runtime_usage", "0\n");

        let pm = RuntimePmSnapshot::read(&fixture.0);
        fixture.write("runtime_status", "suspended\n");

        assert!(!pm.should_query_gpu());
        assert!(!pm.gpu_asleep());
    }

    #[test]
    fn only_an_observed_suspended_status_reports_sleep() {
        let fixture = Fixture::new();
        fixture.write("control", "auto\n");
        fixture.write("runtime_status", "suspended\n");
        fixture.write("runtime_usage", "0\n");

        let pm = RuntimePmSnapshot::read(&fixture.0);
        assert!(!pm.should_query_gpu());
        assert!(pm.gpu_asleep());
    }

    #[test]
    fn missing_runtime_status_does_not_report_sleep() {
        let fixture = Fixture::new();
        fixture.write("control", "auto\n");
        fixture.write("runtime_usage", "0\n");

        let pm = RuntimePmSnapshot::read(&fixture.0);
        assert!(!pm.should_query_gpu());
        assert!(!pm.gpu_asleep());
    }
}
