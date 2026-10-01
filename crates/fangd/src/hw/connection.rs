//! A replaceable EC handle with bounded discovery retries. Sensors/NVML live
//! outside this handle so recovering HID never cycles the GPU driver session.

use std::cell::Cell;
use std::time::{Duration, Instant};

const RETRY_INTERVAL: Duration = Duration::from_secs(5);

pub struct Connection<T> {
    current: Option<T>,
    lost: Cell<bool>,
    open: Box<dyn FnMut() -> Result<T, String> + Send>,
    retry_at: Instant,
}

impl<T> Connection<T> {
    pub fn new(open: impl FnMut() -> Result<T, String> + Send + 'static) -> Self {
        Self::new_at(open, Instant::now())
    }

    fn new_at(mut open: impl FnMut() -> Result<T, String> + Send + 'static, now: Instant) -> Self {
        let current = match open() {
            Ok(device) => Some(device),
            Err(error) => {
                log::warn!("Razer EC unavailable: {error}; monitoring while discovery retries");
                None
            }
        };
        Self {
            current,
            lost: Cell::new(false),
            open: Box::new(open),
            retry_at: now + RETRY_INTERVAL,
        }
    }

    pub fn get(&self) -> Option<&T> {
        if self.lost.get() {
            None
        } else {
            self.current.as_ref()
        }
    }

    /// Only a transport failure invalidates a handle. Busy/unsupported EC
    /// responses are command failures, not proof of device removal.
    pub fn invalidate(&self) {
        self.lost.set(true);
    }

    pub fn reconnect(&mut self) -> bool {
        self.reconnect_at(Instant::now())
    }

    fn reconnect_at(&mut self, now: Instant) -> bool {
        if self.get().is_some() || now < self.retry_at {
            return false;
        }
        self.retry_at = now + RETRY_INTERVAL;
        // Release the old HID handle before opening its replacement.
        self.current = None;
        match (self.open)() {
            Ok(device) => {
                self.current = Some(device);
                self.lost.set(false);
                log::info!("Razer EC connection recovered");
                true
            }
            Err(error) => {
                log::warn!("Razer EC discovery retry failed: {error}");
                false
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::{Arc, Mutex};

    fn scripted(
        results: Vec<Result<u32, String>>,
        now: Instant,
    ) -> (Connection<u32>, Arc<Mutex<usize>>) {
        let calls = Arc::new(Mutex::new(0));
        let trace = Arc::clone(&calls);
        let mut results: VecDeque<_> = results.into();
        let connection = Connection::new_at(
            move || {
                *trace.lock().unwrap() += 1;
                results.pop_front().expect("unexpected discovery attempt")
            },
            now,
        );
        (connection, calls)
    }

    #[test]
    fn missing_startup_device_is_retried_at_bounded_intervals() {
        let now = Instant::now();
        let (mut connection, calls) = scripted(
            vec![Err("absent".into()), Err("not ready".into()), Ok(7)],
            now,
        );
        assert!(connection.get().is_none());
        assert!(!connection.reconnect_at(now + Duration::from_secs(4)));
        assert_eq!(*calls.lock().unwrap(), 1);
        assert!(!connection.reconnect_at(now + Duration::from_secs(5)));
        assert!(!connection.reconnect_at(now + Duration::from_secs(9)));
        assert_eq!(*calls.lock().unwrap(), 2);
        assert!(connection.reconnect_at(now + Duration::from_secs(10)));
        assert_eq!(connection.get(), Some(&7));
    }

    #[test]
    fn a_lost_handle_is_unusable_until_replaced() {
        let now = Instant::now();
        let (mut connection, calls) = scripted(vec![Ok(1), Err("removed".into()), Ok(2)], now);
        connection.invalidate();
        assert!(connection.get().is_none());
        assert!(!connection.reconnect_at(now + Duration::from_secs(5)));
        assert!(connection.get().is_none());
        assert!(connection.reconnect_at(now + Duration::from_secs(10)));
        assert_eq!(connection.get(), Some(&2));
        assert_eq!(*calls.lock().unwrap(), 3);
    }

    #[test]
    fn healthy_handles_are_not_reopened() {
        let now = Instant::now();
        let (mut connection, calls) = scripted(vec![Ok(1)], now);
        assert!(!connection.reconnect_at(now + Duration::from_secs(60)));
        assert_eq!(*calls.lock().unwrap(), 1);
        // Also exercise the production constructor/clock path on Windows tests.
        let mut healthy = Connection::new(|| Ok::<_, String>(2));
        assert!(!healthy.reconnect());
    }
}
