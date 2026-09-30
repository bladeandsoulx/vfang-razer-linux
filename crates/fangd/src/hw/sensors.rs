//! Temperature and power sources on Linux: hwmon for CPU temperature, RAPL
//! (powercap) for package and uncore power, and NVML for the discrete GPU.

use crate::hw::{runtime_pm::RuntimePmSnapshot, IgpuReading};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

/// One tick of sensor readings.
#[derive(Clone, Copy, Debug, Default)]
pub struct Readings {
    pub cpu_temp_c: Option<f32>,
    pub gpu_temp_c: Option<f32>,
    pub cpu_power_w: Option<f32>,
    pub gpu_power_w: Option<f32>,
    /// Runtime-PM reported `suspended` in the latest observed snapshot.
    pub gpu_asleep: bool,
    pub igpu: IgpuReading,
}

pub struct Sensors {
    cpu_temp_file: Option<PathBuf>,
    cpu_temp_failures: u8,
    nvml: NvmlState,
    nvidia_pm_dir: Option<PathBuf>,
    rapl: Option<Rapl>,
    rapl_uncore: Option<Rapl>,
}

/// NVML session, created lazily when runtime-PM state permits querying.
/// nvmlInit can itself change device power state, so we defer it at startup.
/// Once created it is held for the daemon's lifetime — never
/// cycled, because rapid nvmlInit/nvmlShutdown at 1 Hz can livelock the NVIDIA
/// driver and wedge the daemon.
enum NvmlState {
    /// Not initialized yet; initialization waits until runtime-PM policy allows a query.
    Untried,
    /// Boxed to keep the enum small — the other variants are empty.
    Ready(Box<nvml_wrapper::Nvml>),
    /// Init was attempted and failed (no driver); don't retry every tick.
    Unavailable,
}

const CPU_REDISCOVER_AFTER_FAILURES: u8 = 5;

/// Power of one RAPL zone via its energy counter (root-readable). Power is
/// the energy delta between consecutive samples.
struct Rapl {
    energy_file: PathBuf,
    max_energy_uj: u64,
    last: Option<(u64, Instant)>,
}

impl Rapl {
    /// Find the zone with this `name` (`package-0`, `uncore`, ...).
    fn discover(zone: &str) -> Option<Rapl> {
        for entry in fs::read_dir("/sys/class/powercap").ok()?.flatten() {
            let dir = entry.path();
            // Prefer the MSR-backed zone; skip the duplicate -mmio zone.
            if dir
                .file_name()
                .is_some_and(|n| n.to_string_lossy().contains("mmio"))
            {
                continue;
            }
            let name = fs::read_to_string(dir.join("name")).unwrap_or_default();
            if name.trim() == zone {
                let max_energy_uj = fs::read_to_string(dir.join("max_energy_range_uj"))
                    .ok()?
                    .trim()
                    .parse()
                    .ok()?;
                return Some(Rapl {
                    energy_file: dir.join("energy_uj"),
                    max_energy_uj,
                    last: None,
                });
            }
        }
        None
    }

    fn read_watts(&mut self) -> Option<f32> {
        let uj: u64 = fs::read_to_string(&self.energy_file)
            .ok()?
            .trim()
            .parse()
            .ok()?;
        let now = Instant::now();
        let prev = self.last.replace((uj, now));
        let (prev_uj, prev_t) = prev?;
        let dt = now.duration_since(prev_t).as_secs_f64();
        if dt <= 0.0 {
            return None;
        }
        // The counter wraps at max_energy_range_uj.
        let delta = if uj >= prev_uj {
            uj - prev_uj
        } else {
            self.max_energy_uj - prev_uj + uj
        };
        Some((delta as f64 / dt / 1e6) as f32)
    }
}

impl Sensors {
    pub fn discover() -> Sensors {
        let cpu_temp_file = find_cpu_temp();
        match &cpu_temp_file {
            Some(p) => log::info!("cpu temp source: {}", p.display()),
            None => log::warn!("no coretemp/k10temp hwmon found; cpu temp unavailable"),
        }
        let nvidia_pm_dir = find_nvidia_pm_dir();
        if nvidia_pm_dir.is_some() {
            log::info!("nvidia dGPU present; NVML init deferred based on runtime-PM state");
        }
        Sensors {
            cpu_temp_file,
            cpu_temp_failures: 0,
            // Deferred until runtime-PM state permits a first query.
            nvml: NvmlState::Untried,
            nvidia_pm_dir,
            rapl: Rapl::discover("package-0"),
            rapl_uncore: Rapl::discover("uncore"),
        }
    }

    pub fn read(&mut self) -> Readings {
        let cpu_temp_c = self.cpu_temperature();
        let cpu_power_w = self.rapl.as_mut().and_then(Rapl::read_watts);
        let pm = self.nvidia_pm_dir.as_deref().map(RuntimePmSnapshot::read);
        let gpu_asleep = pm.as_ref().is_some_and(RuntimePmSnapshot::gpu_asleep);
        let should_query_gpu = pm.as_ref().is_none_or(RuntimePmSnapshot::should_query_gpu);
        let (gpu_temp_c, gpu_power_w) = if should_query_gpu {
            self.gpu_reading()
        } else {
            (None, None)
        };
        let igpu = IgpuReading {
            // RAPL uncore may include iGPU activity, but is not an iGPU-only
            // meter. Keep the existing API field as an explicitly labeled proxy.
            power_w: self.rapl_uncore.as_mut().and_then(Rapl::read_watts),
            ..IgpuReading::default()
        };
        Readings {
            cpu_temp_c,
            gpu_temp_c,
            cpu_power_w,
            gpu_power_w,
            gpu_asleep,
            igpu,
        }
    }

    fn cpu_temperature(&mut self) -> Option<f32> {
        let reading = self.cpu_temp_file.as_ref().and_then(|path| {
            fs::read_to_string(path)
                .ok()
                .and_then(|raw| parse_cpu_temp(&raw))
        });
        if reading.is_some() {
            self.cpu_temp_failures = 0;
            return reading;
        }

        self.cpu_temp_failures = self.cpu_temp_failures.saturating_add(1);
        if self.cpu_temp_failures < CPU_REDISCOVER_AFTER_FAILURES {
            return None;
        }

        let previous = self.cpu_temp_file.clone();
        self.cpu_temp_file = find_cpu_temp();
        self.cpu_temp_failures = 0;
        if self.cpu_temp_file != previous {
            match &self.cpu_temp_file {
                Some(path) => log::info!("rediscovered CPU temp source: {}", path.display()),
                None => log::warn!("CPU temp source disappeared; continuing max-fan failsafe"),
            }
        }
        self.cpu_temp_file.as_ref().and_then(|path| {
            fs::read_to_string(path)
                .ok()
                .and_then(|raw| parse_cpu_temp(&raw))
        })
    }

    /// dGPU temperature and power via NVML, lazily creating the NVML session
    /// (see [`NvmlState`]). Callers gate this on the latest runtime-PM snapshot.
    fn gpu_reading(&mut self) -> (Option<f32>, Option<f32>) {
        // Runtime-PM state permits a query (or no runtime-PM directory was
        // found), so initialize the persistent NVML session on first use.
        if let NvmlState::Untried = self.nvml {
            self.nvml = match nvml_wrapper::Nvml::init() {
                Ok(n) => {
                    log::info!("NVML initialized (nvidia gpu telemetry available)");
                    NvmlState::Ready(Box::new(n))
                }
                Err(e) => {
                    log::info!("NVML unavailable ({e}); gpu telemetry disabled");
                    NvmlState::Unavailable
                }
            };
        }
        let NvmlState::Ready(nvml) = &self.nvml else {
            return (None, None);
        };
        let Ok(dev) = nvml.device_by_index(0) else {
            return (None, None);
        };
        let temp = dev
            .temperature(nvml_wrapper::enum_wrappers::device::TemperatureSensor::Gpu)
            .ok()
            .map(|t| t as f32);
        let power = dev.power_usage().ok().map(|mw| mw as f32 / 1000.0);
        (temp, power)
    }
}

fn parse_cpu_temp(raw: &str) -> Option<f32> {
    let temp = raw.trim().parse::<f32>().ok()? / 1000.0;
    (temp.is_finite() && (1.0..=125.0).contains(&temp)).then_some(temp)
}

/// Locate the NVIDIA VGA controller's runtime-PM directory on the PCI bus.
fn find_nvidia_pm_dir() -> Option<PathBuf> {
    for entry in fs::read_dir("/sys/bus/pci/devices").ok()?.flatten() {
        let dir = entry.path();
        let vendor = fs::read_to_string(dir.join("vendor")).unwrap_or_default();
        let class = fs::read_to_string(dir.join("class")).unwrap_or_default();
        if vendor.trim() == "0x10de" && class.trim().starts_with("0x03") {
            return Some(dir.join("power"));
        }
    }
    None
}

/// Locate the CPU package temperature: hwmon device named coretemp (Intel)
/// or k10temp/zenpower (AMD), preferring the package/Tctl label.
fn find_cpu_temp() -> Option<PathBuf> {
    let hwmon = fs::read_dir("/sys/class/hwmon").ok()?;
    for entry in hwmon.flatten() {
        let dir = entry.path();
        let name = fs::read_to_string(dir.join("name")).unwrap_or_default();
        let name = name.trim();
        if !matches!(name, "coretemp" | "k10temp" | "zenpower") {
            continue;
        }
        // Prefer the package sensor over per-core ones.
        for i in 1..=10 {
            let label = fs::read_to_string(dir.join(format!("temp{i}_label"))).unwrap_or_default();
            let label = label.trim();
            if label.starts_with("Package") || label == "Tctl" || label == "Tdie" {
                return Some(dir.join(format!("temp{i}_input")));
            }
        }
        let first = dir.join("temp1_input");
        if first.exists() {
            return Some(first);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::parse_cpu_temp;

    #[test]
    fn rejects_implausible_cpu_temperatures() {
        assert_eq!(parse_cpu_temp("65000\n"), Some(65.0));
        assert_eq!(parse_cpu_temp("0\n"), None);
        assert_eq!(parse_cpu_temp("200000\n"), None);
        assert_eq!(parse_cpu_temp("not-a-temperature\n"), None);
    }

    #[test]
    fn observed_suspended_snapshot_skips_nvml_initialization() {
        use super::{NvmlState, Sensors};
        use std::fs;
        // Fake sysfs power dir reporting the dGPU runtime-suspended.
        let dir = std::env::temp_dir().join("fangd-rtd3-lazy-test");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("control"), "auto\n").unwrap();
        fs::write(dir.join("runtime_status"), "suspended\n").unwrap();
        fs::write(dir.join("runtime_usage"), "0\n").unwrap();
        let mut s = Sensors {
            cpu_temp_file: None,
            cpu_temp_failures: 0,
            nvml: NvmlState::Untried,
            nvidia_pm_dir: Some(dir.clone()),
            rapl: None,
            rapl_uncore: None,
        };
        let r = s.read();
        fs::remove_dir_all(&dir).ok();
        assert_eq!(r.gpu_temp_c, None, "suspended card must report no temp");
        assert!(r.gpu_asleep, "suspended card must be reported asleep");
        assert!(
            matches!(s.nvml, NvmlState::Untried),
            "NVML must not be initialized while the card is suspended"
        );
    }
}
