<script>
  import Gauge from '../lib/components/Gauge.svelte';
  import Sparkline from '../lib/components/Sparkline.svelte';
  import FanSpinner from '../lib/components/FanSpinner.svelte';
  import TelemetryNotice from '../lib/components/TelemetryNotice.svelte';
  import { telemetry, status, cpuHistory, rpmHistory, avgRpm } from '../lib/stores.js';

  const MODE_LABEL = {
    silent: 'Silent',
    balanced: 'Balanced',
    gaming: 'Gaming',
    custom: 'Custom'
  };

  const watts = (w) => (w == null ? null : `${w.toFixed(1)} W`);
  const joined = (...parts) => parts.filter((p) => p != null).join(' · ') || null;

  // Hybrid laptops also report the integrated GPU; older daemons omit it.
  $: hasIgpu = $telemetry?.igpu_active_pct != null || $telemetry?.igpu_power_w != null || $telemetry?.igpu_freq_mhz != null;
  $: igpuSub = joined(
    $telemetry?.igpu_power_w == null ? null : `Uncore power (iGPU proxy): ${watts($telemetry.igpu_power_w)}`,
    $telemetry?.igpu_freq_mhz == null ? null : `${$telemetry.igpu_freq_mhz} MHz`
  );
</script>

<TelemetryNotice />
<div class="grid" class:four={hasIgpu}>
  <Gauge value={$telemetry?.cpu_temp_c} label="CPU package" sub={watts($telemetry?.cpu_power_w)} />
  <Gauge
    value={$telemetry?.gpu_temp_c}
    label={hasIgpu ? 'dGPU core' : 'GPU core'}
    sub={$telemetry?.gpu_asleep ? 'asleep' : watts($telemetry?.gpu_power_w)}
  />
  {#if hasIgpu}
    {#if $telemetry?.igpu_active_pct != null}
      <Gauge
        value={$telemetry.igpu_active_pct}
        label="iGPU awake"
        unit="%"
        min={0}
        max={100}
        warn={101}
        danger={101}
        sub={igpuSub}
      />
    {:else}
      <div class="igpu card rise">
        <span class="card-label">{$telemetry?.igpu_power_w != null ? 'Uncore power (iGPU proxy)' : 'iGPU frequency'}</span>
        <span class="big mono">{$telemetry?.igpu_power_w != null ? watts($telemetry.igpu_power_w) : `${$telemetry.igpu_freq_mhz} MHz`}</span>
        <span class="unavailable">Activity unavailable</span>
        {#if $telemetry?.igpu_power_w != null && $telemetry?.igpu_freq_mhz != null}
          <span class="unavailable mono">{$telemetry.igpu_freq_mhz} MHz</span>
        {/if}
      </div>
    {/if}
  {/if}

  <div class="fan card rise" style="animation-delay:80ms">
    <FanSpinner rpm={$avgRpm ?? 0} size={124} />
    <div class="rpm">
      <span class="big mono">{$avgRpm ?? '--'}</span>
      <span class="card-label">RPM</span>
    </div>
    <div class="fans mono">
      {#if $telemetry?.fan_rpm?.length}
        {#each $telemetry.fan_rpm as r, i}
          <span>FAN{i + 1} <em>{r}</em></span>
        {/each}
      {:else}
        <span>NO FAN DATA</span>
      {/if}
    </div>
  </div>

  <div class="wide">
    <Sparkline data={$cpuHistory} label="CPU temperature — 90 s" unit="°C" min={35} max={95} />
  </div>
  <div class="wide2">
    <Sparkline data={$rpmHistory} label="Fan speed — 90 s" unit="rpm" min={1800} max={5200} />
  </div>

  <div class="modebar card rise" style="animation-delay:140ms">
    <span class="card-label">Active profile</span>
    <span class="mode mono">{MODE_LABEL[$status?.perf_mode] ?? '--'}</span>
    <span class="sub">
      {#if $status?.fan?.mode === 'manual'}
        requested fan target: {$status.fan.rpm} rpm
      {:else if $status?.fan?.mode === 'curve'}
        fan curve: custom
        {#if $telemetry?.fan_target_rpm != null}· target {$telemetry.fan_target_rpm} rpm{/if}
      {:else if $status?.fan?.mode === 'auto'}
        fan control: EC automatic
      {:else}
        fan mode unavailable
      {/if}
    </span>
    {#if $telemetry?.thermal_override_active}
      <span class="override" role="status">
        {#if $telemetry.thermal_override_reason === 'sensor_unavailable'}CPU temperature sensor unavailable · {/if}
        Thermal override active · target {$telemetry.fan_target_rpm ?? $status?.fan_rpm_max ?? '--'} RPM
      </span>
    {/if}
  </div>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 14px;
  }

  .grid.four {
    grid-template-columns: repeat(4, 1fr);
  }

  .igpu {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 18px 16px;
    text-align: center;
  }

  .unavailable {
    color: var(--ink-dim);
    font-size: 12px;
  }

  .fan {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px;
  }

  .rpm {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .big {
    font-size: 30px;
    color: var(--green-soft);
  }

  .fans {
    display: flex;
    gap: 14px;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    color: var(--ink-dim);
  }

  .fans em {
    font-style: normal;
    color: var(--ink);
  }

  .wide {
    grid-column: 1 / span 2;
  }

  .wide2 {
    grid-column: 3;
  }

  .four .wide2 {
    grid-column: 3 / span 2;
  }

  .modebar {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 16px;
    padding: 14px 18px;
  }

  .mode {
    font-size: 20px;
    color: var(--green);
    text-shadow: 0 0 12px var(--green-glow);
  }

  .sub {
    font-size: 12px;
    color: var(--ink-dim);
    margin-left: auto;
  }

  .override {
    flex-basis: 100%;
    color: var(--amber);
    font-size: 12px;
  }
</style>
