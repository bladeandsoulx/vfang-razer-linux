use super::*;
use std::fs;

struct StateFile(PathBuf);

impl StateFile {
    fn new(state: &AppliedState) -> Self {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "fang-reliability-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&dir).unwrap();
        let file = Self(dir.join("state.json"));
        state.save(&file.0).unwrap();
        file
    }

    fn block_save(&self) {
        fs::create_dir(self.0.with_extension("json.tmp")).unwrap();
    }

    fn unblock_save(&self) {
        fs::remove_dir(self.0.with_extension("json.tmp")).unwrap();
    }
}

impl Drop for StateFile {
    fn drop(&mut self) {
        fs::remove_dir_all(self.0.parent().unwrap()).unwrap();
    }
}

fn persisted_core(state: AppliedState) -> (Core, Arc<ScriptedTrace>, StateFile) {
    let file = StateFile::new(&state);
    let (mut core, trace) = scripted_core(state, Sample::default(), vec![], vec![]);
    core.state_path = file.0.clone();
    core.reapply();
    trace.applied.lock().unwrap().clear();
    (core, trace, file)
}

fn silent_command() -> Command {
    Command::SetPerfMode {
        perf_mode: PerfMode::Silent,
        cpu_boost: None,
        gpu_boost: None,
    }
}

#[test]
fn failed_save_reports_error_and_restores_previous_hardware_and_file() {
    let initial = AppliedState {
        fan: FanMode::Manual { rpm: 3000 },
        ..AppliedState::default()
    };
    let (mut core, trace, file) = persisted_core(initial.clone());
    let bytes = fs::read(&file.0).unwrap();
    file.block_save();

    let error = core.handle_set(&silent_command()).unwrap_err();

    assert!(error.contains("failed to persist state"), "{error}");
    assert!(
        error.contains("previous hardware state restored"),
        "{error}"
    );
    assert_eq!(core.state, initial);
    assert_eq!(fs::read(&file.0).unwrap(), bytes);
    assert_eq!(AppliedState::load(&file.0), initial);
    let applied = trace.applied.lock().unwrap();
    assert_eq!(applied.len(), 2);
    assert_eq!(applied[0].perf_mode, PerfMode::Silent);
    assert_eq!(applied[1], initial);
    assert!(core.hardware_state_applied);
    assert_eq!(core.fan_target_rpm, Some(5000));
}

#[test]
fn failed_save_and_failed_rollback_fall_back_to_auto_without_target_writes() {
    let initial = AppliedState {
        fan: FanMode::Manual { rpm: 3000 },
        ..AppliedState::default()
    };
    let (mut core, trace, file) = persisted_core(initial.clone());
    file.block_save();
    *trace.apply_results.lock().unwrap() = vec![
        Ok(()),
        Err("rollback failed".into()),
        Err("rollback retry failed".into()),
    ]
    .into();

    let error = core.handle_set(&silent_command()).unwrap_err();

    assert!(error.contains("failed to persist state"), "{error}");
    assert!(
        error.contains("fell back to EC automatic fan control"),
        "{error}"
    );
    assert_eq!(core.state, initial);
    assert_eq!(AppliedState::load(&file.0), initial);
    assert!(!core.hardware_state_applied);
    assert_eq!(trace.restores.load(Ordering::Relaxed), 1);
    core.sample();
    assert_eq!(trace.fan_targets.load(Ordering::Relaxed), 0);
    assert_eq!(core.fan_target_rpm, None);
}

#[test]
fn unconfirmed_auto_recovery_is_reported_as_failed() {
    let (mut core, trace, file) = persisted_core(AppliedState::default());
    file.block_save();
    *trace.apply_results.lock().unwrap() =
        vec![Ok(()), Err("handle lost".into()), Err("no handle".into())].into();
    trace
        .restore_results
        .lock()
        .unwrap()
        .push_back(Err("no usable EC handle".into()));

    let error = core.handle_set(&silent_command()).unwrap_err();

    assert!(
        error.contains("EC automatic fan recovery also failed"),
        "{error}"
    );
    assert!(!error.contains("fell back"), "{error}");
    assert!(!core.hardware_state_applied);
    assert_eq!(AppliedState::load(&file.0), core.state);
}

#[test]
fn successful_save_publishes_the_same_state_to_disk_and_hardware() {
    let (mut core, trace, file) = persisted_core(AppliedState::default());
    assert!(core.handle_set(&silent_command()).unwrap());
    assert_eq!(core.state.perf_mode, PerfMode::Silent);
    assert_eq!(AppliedState::load(&file.0), core.state);
    assert_eq!(trace.applied.lock().unwrap().last(), Some(&core.state));
    assert!(!file.0.with_extension("json.tmp").exists());
}

fn automation_core() -> (Core, Arc<ScriptedTrace>, StateFile) {
    persisted_core(AppliedState {
        auto_power: true,
        ac_profile: PerfMode::Gaming,
        battery_profile: PerfMode::Silent,
        battery_fan: FanMode::Manual { rpm: 3000 },
        ..AppliedState::default()
    })
}

fn fail_transition(trace: &ScriptedTrace) {
    trace
        .apply_results
        .lock()
        .unwrap()
        .extend([Err("temporary EC error".into()), Ok(())]);
}

#[test]
fn failed_power_transition_retries_same_source_only_when_due() {
    let (mut core, trace, file) = automation_core();
    let now = Instant::now();
    fail_transition(&trace);
    assert!(!core.power_tick_at(Some(false), now));
    assert_eq!(core.state.perf_mode, PerfMode::Balanced);
    let attempts = trace.applied.lock().unwrap().len();
    for step in 1..50 {
        assert!(!core.power_tick_at(Some(false), now + Duration::from_millis(step * 100)));
    }
    assert_eq!(trace.applied.lock().unwrap().len(), attempts);
    assert!(core.power_tick_at(Some(false), now + POWER_RETRY_INTERVAL));
    assert_eq!(core.state.perf_mode, PerfMode::Silent);
    assert_eq!(core.state.fan, FanMode::Manual { rpm: 3000 });
    assert_eq!(AppliedState::load(&file.0), core.state);
    assert_eq!(trace.applied.lock().unwrap().len(), attempts + 1);
    assert!(!core.power_tick_at(Some(false), now + Duration::from_secs(60)));
}

#[test]
fn automation_persistence_failure_remains_pending_until_save_recovers() {
    let (mut core, trace, file) = automation_core();
    let now = Instant::now();
    file.block_save();
    assert!(!core.power_tick_at(Some(false), now));
    assert!(!core.power_tick_at(Some(false), now + POWER_RETRY_INTERVAL));
    assert_eq!(core.state.perf_mode, PerfMode::Balanced);
    assert_eq!(AppliedState::load(&file.0), core.state);
    let attempts = trace.applied.lock().unwrap().len();
    file.unblock_save();
    assert!(!core.power_tick_at(Some(false), now + Duration::from_secs(9)));
    assert_eq!(trace.applied.lock().unwrap().len(), attempts);
    assert!(core.power_tick_at(Some(false), now + Duration::from_secs(10)));
    assert_eq!(core.state.perf_mode, PerfMode::Silent);
    assert_eq!(AppliedState::load(&file.0), core.state);
}

#[test]
fn a_new_power_source_supersedes_a_failed_transition_immediately() {
    let (mut core, trace, _file) = automation_core();
    let now = Instant::now();
    fail_transition(&trace);
    assert!(!core.power_tick_at(Some(false), now));
    assert!(core.power_tick_at(Some(true), now + Duration::from_secs(1)));
    assert_eq!(core.state.perf_mode, PerfMode::Gaming);
    let attempts = trace.applied.lock().unwrap().len();
    assert!(!core.power_tick_at(Some(true), now + Duration::from_secs(6)));
    assert_eq!(trace.applied.lock().unwrap().len(), attempts);
    assert!(core.power_retry_at.is_none());
}

#[test]
fn unknown_power_source_cancels_old_retry_until_a_known_reading_returns() {
    let (mut core, trace, _file) = automation_core();
    let now = Instant::now();
    fail_transition(&trace);
    assert!(!core.power_tick_at(Some(false), now));
    assert!(!core.power_tick_at(None, now + Duration::from_secs(1)));
    assert!(!core.power_tick_at(None, now + Duration::from_secs(6)));
    assert!(core.power_retry_at.is_none());
    assert!(core.power_tick_at(Some(false), now + Duration::from_secs(7)));
}

#[test]
fn explicit_profile_fan_or_automation_choices_cancel_failed_retries() {
    let choices = [
        Command::SetPerfMode {
            perf_mode: PerfMode::Custom,
            cpu_boost: None,
            gpu_boost: None,
        },
        Command::SetFan {
            fan: FanMode::Manual { rpm: 4000 },
        },
        Command::SetAutoPower {
            enabled: false,
            ac_profile: PerfMode::Gaming,
            battery_profile: PerfMode::Silent,
            ac_fan: FanMode::Auto,
            battery_fan: FanMode::Auto,
        },
        Command::SetAutoPower {
            enabled: true,
            ac_profile: PerfMode::Balanced,
            battery_profile: PerfMode::Custom,
            ac_fan: FanMode::Auto,
            battery_fan: FanMode::Auto,
        },
    ];
    for choice in choices {
        let (mut core, trace, _file) = automation_core();
        let now = Instant::now();
        fail_transition(&trace);
        assert!(!core.power_tick_at(Some(false), now));
        core.handle_set(&choice).unwrap();
        let confirmed = core.state.clone();
        let attempts = trace.applied.lock().unwrap().len();
        assert!(!core.power_tick_at(Some(false), now + Duration::from_secs(60)));
        assert_eq!(core.state, confirmed);
        assert_eq!(trace.applied.lock().unwrap().len(), attempts);
    }
}

#[test]
fn a_failed_explicit_choice_does_not_cancel_the_automatic_retry() {
    let (mut core, trace, file) = automation_core();
    let now = Instant::now();
    fail_transition(&trace);
    assert!(!core.power_tick_at(Some(false), now));
    file.block_save();
    assert!(core.handle_set(&silent_command()).is_err());
    file.unblock_save();
    assert!(core.power_tick_at(Some(false), now + POWER_RETRY_INTERVAL));
    assert_eq!(core.state.perf_mode, PerfMode::Silent);
}

#[derive(Clone, Debug, PartialEq)]
enum RecoveryEvent {
    Apply(AppliedState),
    Target(u16),
    Auto,
}

struct RecoveryTrace {
    info: ModelInfo,
    sample: Sample,
    reconnect: bool,
    fail_applies: usize,
    events: Vec<RecoveryEvent>,
}

struct RecoveryHw(Arc<Mutex<RecoveryTrace>>);

impl Hw for RecoveryHw {
    fn info(&self) -> ModelInfo {
        self.0.lock().unwrap().info.clone()
    }

    fn reconnect(&mut self) -> bool {
        let mut trace = self.0.lock().unwrap();
        std::mem::take(&mut trace.reconnect)
    }

    fn apply(&mut self, state: &AppliedState) -> Result<(), String> {
        let mut trace = self.0.lock().unwrap();
        trace.events.push(RecoveryEvent::Apply(state.clone()));
        if !trace.info.device_present {
            return Err("EC absent".into());
        }
        if trace.fail_applies > 0 {
            trace.fail_applies -= 1;
            return Err("EC not ready".into());
        }
        Ok(())
    }

    fn set_fan_target(&mut self, rpm: u16) -> Result<(), String> {
        let mut trace = self.0.lock().unwrap();
        assert!(trace.info.device_present, "target sent without EC");
        trace.events.push(RecoveryEvent::Target(rpm));
        Ok(())
    }

    fn restore_auto_fan(&mut self, _perf_mode: PerfMode) -> Result<(), String> {
        let mut trace = self.0.lock().unwrap();
        trace.events.push(RecoveryEvent::Auto);
        if trace.info.device_present {
            Ok(())
        } else {
            Err("EC absent; recovery unconfirmed".into())
        }
    }

    fn sample(&mut self) -> Sample {
        self.0.lock().unwrap().sample.clone()
    }
}

fn recovery_core(
    state: AppliedState,
    present: bool,
) -> (Core, Arc<Mutex<RecoveryTrace>>, StateFile) {
    let file = StateFile::new(&state);
    let trace = Arc::new(Mutex::new(RecoveryTrace {
        info: ModelInfo {
            name: "recovering laptop".into(),
            device_present: present,
            verified: true,
            mock: true,
            fan_rpm_min: 2200,
            fan_rpm_max: 5000,
            has_cpu_boost_oc: true,
            has_bho: true,
            has_logo: true,
        },
        sample: Sample::default(),
        reconnect: false,
        fail_applies: 0,
        events: vec![],
    }));
    let core = Core::new(
        Box::new(RecoveryHw(Arc::clone(&trace))),
        state,
        file.0.clone(),
    );
    (core, trace, file)
}

#[test]
fn reapply_holds_manual_and_curve_fans_at_max_until_a_new_cpu_reading() {
    for fan in [
        FanMode::Manual { rpm: 2200 },
        FanMode::Curve {
            points: CURVE.to_vec(),
        },
    ] {
        let desired = AppliedState {
            fan,
            ..AppliedState::default()
        };
        let (mut core, trace, _file) = recovery_core(desired.clone(), true);
        let normalized = core.state.clone();
        core.reapply();
        trace.lock().unwrap().sample = Sample {
            cpu_temp_c: Some(40.0),
            gpu_temp_c: Some(40.0),
            ..Sample::default()
        };
        assert_eq!(core.sample().fan_target_rpm, Some(2200));
        {
            let mut trace = trace.lock().unwrap();
            trace.events.clear();
            trace.sample.cpu_temp_c = None;
        }

        // The resume loop reapplies before sampling with an intact connection
        // and a cool pre-suspend CPU reading still in the cache.
        core.reapply();
        assert_eq!(core.fan_target_rpm, Some(5000));
        assert!(!core.thermal_sensor_ok());
        assert_eq!(
            trace.lock().unwrap().events,
            vec![RecoveryEvent::Apply(normalized)]
        );
        for _ in 0..CPU_SENSOR_MISS_LIMIT {
            let missing = core.sample();
            assert_eq!(missing.fan_target_rpm, Some(5000));
            assert!(!missing.thermal_sensor_ok);
            assert_eq!(
                missing.thermal_override_reason,
                Some(ThermalOverrideReason::SensorUnavailable)
            );
        }
        assert_eq!(trace.lock().unwrap().events.len(), 1);
        trace.lock().unwrap().sample.cpu_temp_c = Some(40.0);
        let fresh = core.sample();
        assert_eq!(fresh.fan_target_rpm, Some(2200));
        assert!(fresh.thermal_sensor_ok);
        assert!(!fresh.thermal_override_active);
        assert_eq!(
            trace.lock().unwrap().events.last(),
            Some(&RecoveryEvent::Target(2200))
        );
    }
}

#[test]
fn reapply_discards_old_gpu_heat_and_uses_the_new_sample() {
    let state = AppliedState {
        fan: FanMode::Manual { rpm: 2200 },
        ..AppliedState::default()
    };
    let (mut core, trace, _file) = recovery_core(state, true);
    core.reapply();
    trace.lock().unwrap().sample = Sample {
        cpu_temp_c: Some(40.0),
        gpu_temp_c: Some(90.0),
        ..Sample::default()
    };
    assert_eq!(core.sample().fan_target_rpm, Some(5000));
    core.reapply();
    assert_eq!(core.last_gpu_temp_c, None);
    assert_eq!(core.fan_target_rpm, Some(5000));
    trace.lock().unwrap().sample.gpu_temp_c = None;
    let fresh = core.sample();
    assert_eq!(fresh.fan_target_rpm, Some(2200));
    assert!(!fresh.thermal_override_active);
}

#[test]
fn failed_reapply_with_successful_rollback_still_requires_a_fresh_cpu() {
    let state = AppliedState {
        fan: FanMode::Manual { rpm: 2200 },
        ..AppliedState::default()
    };
    let (mut core, trace) = scripted_core(
        state,
        Sample {
            cpu_temp_c: Some(40.0),
            ..Sample::default()
        },
        vec![Ok(()), Err("resume apply failed".into()), Ok(())],
        vec![],
    );
    core.reapply();
    assert_eq!(core.sample().fan_target_rpm, Some(2200));
    trace.fan_targets.store(0, Ordering::Relaxed);
    core.reapply();
    assert!(
        core.hardware_state_applied,
        "the previous state was restored"
    );
    assert!(!core.thermal_sensor_ok());
    assert_eq!(core.fan_target_rpm, Some(5000));
    assert_eq!(trace.fan_targets.load(Ordering::Relaxed), 0);
    assert_eq!(core.sample().fan_target_rpm, Some(2200));
}

#[test]
fn missing_startup_hardware_keeps_preferences_and_reapplies_every_field_on_recovery() {
    let desired = AppliedState {
        perf_mode: PerfMode::Custom,
        cpu_boost: Boost::High,
        gpu_boost: Boost::Low,
        fan: FanMode::Curve {
            points: CURVE.to_vec(),
        },
        fan_curve: CURVE.to_vec(),
        bho_enabled: true,
        bho_threshold: 75,
        kbd_brightness: 25,
        ..AppliedState::default()
    };
    let (mut core, trace, file) = recovery_core(desired.clone(), false);
    core.reapply();
    assert_eq!(core.state, desired);
    assert!(!core.sample().status_changed);
    assert!(!core.status(&PeripheralSnapshot::default()).device_present);
    assert!(core.handle_set(&silent_command()).is_err());
    assert_eq!(AppliedState::load(&file.0), desired);
    {
        let mut trace = trace.lock().unwrap();
        trace.events.clear();
        trace.info.device_present = true;
        trace.reconnect = true;
        // A cool GPU cannot replace the mandatory fresh CPU reading.
        trace.sample.gpu_temp_c = Some(40.0);
    }
    let recovered = core.sample();
    assert!(recovered.status_changed);
    assert!(core.status(&PeripheralSnapshot::default()).device_present);
    assert_eq!(
        trace.lock().unwrap().events,
        vec![RecoveryEvent::Apply(desired.clone())]
    );
    assert_eq!(recovered.fan_target_rpm, Some(5000));
    assert_eq!(
        recovered.thermal_override_reason,
        Some(ThermalOverrideReason::SensorUnavailable)
    );
    assert!(!core.sample().status_changed);
    trace.lock().unwrap().sample.cpu_temp_c = Some(55.0);
    let fresh = core.sample();
    assert!(fresh.thermal_sensor_ok);
    assert!(!fresh.thermal_override_active);
    assert_eq!(fresh.fan_target_rpm, Some(2800));
    assert_eq!(
        trace.lock().unwrap().events.last(),
        Some(&RecoveryEvent::Target(2800))
    );
}

#[test]
fn loss_and_recovery_publish_status_and_discard_cached_cool_cpu_readings() {
    let desired = AppliedState {
        fan: FanMode::Manual { rpm: 3000 },
        ..AppliedState::default()
    };
    let (mut core, trace, _file) = recovery_core(desired.clone(), true);
    core.reapply();
    trace.lock().unwrap().sample.cpu_temp_c = Some(60.0);
    assert_eq!(core.sample().fan_target_rpm, Some(3000));
    {
        let mut trace = trace.lock().unwrap();
        trace.events.clear();
        trace.info.device_present = false;
        trace.sample.cpu_temp_c = None;
    }
    let lost = core.sample();
    assert!(lost.status_changed);
    assert_eq!(lost.fan_target_rpm, None);
    assert!(!core.status(&PeripheralSnapshot::default()).device_present);
    assert!(!core.sample().status_changed);
    assert_eq!(core.state, desired);
    {
        let mut trace = trace.lock().unwrap();
        trace.info.device_present = true;
        trace.reconnect = true;
    }
    let recovered = core.sample();
    assert!(recovered.status_changed);
    assert!(!recovered.thermal_sensor_ok);
    assert_eq!(recovered.fan_target_rpm, Some(5000));
    assert_eq!(
        trace.lock().unwrap().events,
        vec![RecoveryEvent::Apply(desired)]
    );
}

#[test]
fn recovered_model_capabilities_sanitize_preferences_before_the_full_apply() {
    let desired = AppliedState {
        cpu_boost: Boost::Boost,
        bho_enabled: true,
        fan: FanMode::Curve {
            points: CURVE.to_vec(),
        },
        fan_curve: CURVE.to_vec(),
        ac_fan: FanMode::Manual { rpm: 4900 },
        battery_fan: FanMode::Manual { rpm: 2200 },
        ..AppliedState::default()
    };
    let (mut core, trace, file) = recovery_core(desired, false);
    {
        let mut trace = trace.lock().unwrap();
        trace.info.device_present = true;
        trace.info.fan_rpm_min = 2500;
        trace.info.fan_rpm_max = 4000;
        trace.info.has_cpu_boost_oc = false;
        trace.info.has_bho = false;
        trace.reconnect = true;
    }
    let recovered = core.sample();
    assert!(recovered.status_changed);
    assert_eq!(core.state.cpu_boost, Boost::High);
    assert!(!core.state.bho_enabled);
    assert_eq!(core.state.fan_curve[0].rpm, 2500);
    assert_eq!(core.state.fan_curve[2].rpm, 4000);
    assert_eq!(core.state.ac_fan, FanMode::Manual { rpm: 4000 });
    assert_eq!(core.state.battery_fan, FanMode::Manual { rpm: 2500 });
    assert_eq!(
        trace.lock().unwrap().events,
        vec![RecoveryEvent::Apply(core.state.clone())]
    );
    assert_eq!(recovered.fan_target_rpm, Some(4000));
    assert_eq!(AppliedState::load(&file.0), core.state);
}

#[test]
fn failed_reconnect_apply_blocks_software_control_until_a_bounded_full_retry() {
    let desired = AppliedState {
        fan: FanMode::Manual { rpm: 3000 },
        ..AppliedState::default()
    };
    let (mut core, trace, _file) = recovery_core(desired.clone(), false);
    {
        let mut trace = trace.lock().unwrap();
        trace.info.device_present = true;
        trace.reconnect = true;
        trace.fail_applies = 1;
        trace.sample.cpu_temp_c = Some(60.0);
    }
    let failed = core.sample();
    assert!(failed.status_changed);
    assert!(!core.hardware_state_applied);
    assert_eq!(failed.fan_target_rpm, None);
    let retry_at = core.hardware_retry_at.unwrap();
    core.sample_at(retry_at - Duration::from_millis(1));
    assert_eq!(
        trace.lock().unwrap().events,
        vec![RecoveryEvent::Apply(desired.clone()), RecoveryEvent::Auto]
    );
    let retried = core.sample_at(retry_at);
    assert!(core.hardware_state_applied);
    assert_eq!(retried.fan_target_rpm, Some(3000));
    assert_eq!(
        trace.lock().unwrap().events,
        vec![
            RecoveryEvent::Apply(desired.clone()),
            RecoveryEvent::Auto,
            RecoveryEvent::Apply(desired),
            RecoveryEvent::Target(3000),
        ]
    );
}
