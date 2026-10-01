import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { compile } from 'svelte/compiler';

// Render the real component entirely in memory: no browser or app is opened.
const appRoot = fileURLToPath(new URL('../..', import.meta.url));
const compiled = await build({
  stdin: {
    contents: String.raw`import Dashboard from './src/screens/Dashboard.svelte';
      import FanScreen from './src/screens/FanScreen.svelte';
      import { telemetry, status } from './src/lib/stores.js';
      import { render } from 'svelte/server';
      export function renderDashboard(sample, state = null) {
        telemetry.set(sample);
        status.set(state);
        return render(Dashboard).body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      }
      export function renderFan(sample, state) {
        telemetry.set(sample);
        status.set(state);
        return render(FanScreen).body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      }`,
    resolveDir: appRoot,
    sourcefile: 'dashboard-test-entry.js'
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  plugins: [{
    name: 'svelte-server-components',
    setup(builder) {
      builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
        contents: compile(await readFile(path, 'utf8'), {
          filename: path,
          generate: 'server'
        }).js.code,
        loader: 'js'
      }));
    }
  }]
});
const { renderDashboard, renderFan } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
);

test('legacy telemetry keeps the three-card dashboard', () => {
  const html = renderDashboard({ cpu_temp_c: 50, gpu_temp_c: 45 });
  assert.doesNotMatch(html, /iGPU|Uncore power/);
  assert.match(html, /GPU core/);
});

test('power-only telemetry identifies the uncore proxy without an activity gauge', () => {
  const html = renderDashboard({ igpu_power_w: 3.2 });
  assert.match(html, /Uncore power \(iGPU proxy\)/);
  assert.match(html, /3\.2 W/);
  assert.match(html, /Activity unavailable/);
  assert.doesNotMatch(html, /iGPU awake|iGPU active/);
});

test('mock activity remains visible with accurately labeled uncore power', () => {
  const html = renderDashboard({ igpu_active_pct: 22, igpu_power_w: 3.1, igpu_freq_mhz: 1600 });
  assert.match(html, /iGPU awake/);
  assert.match(html, /Uncore power \(iGPU proxy\)/);
  assert.match(html, /1600 MHz/);
});

test('frequency-only optional telemetry is displayed', () => {
  const html = renderDashboard({ igpu_freq_mhz: 1450 });
  assert.match(html, /1450 MHz/);
  assert.match(html, /Activity unavailable/);
});

test('missing iGPU data does not create a misleading card', () => {
  const html = renderDashboard({ igpu_active_pct: null, igpu_power_w: null, igpu_freq_mhz: null });
  assert.doesNotMatch(html, /iGPU|Uncore power|Activity unavailable/);
});

test('the discrete GPU sleep state remains explicit', () => {
  assert.match(renderDashboard({ gpu_asleep: true }), /asleep/);
  assert.doesNotMatch(renderDashboard({ gpu_asleep: false }), /asleep/);
});

const stateWithFan = (fan) => ({ perf_mode: 'balanced', fan, fan_rpm_min: 2200, fan_rpm_max: 5000 });

test('dashboard labels EC Auto, Manual requests and Custom Curve distinctly', () => {
  assert.match(renderDashboard({}, stateWithFan({ mode: 'auto' })), /fan control: EC automatic/);
  const manual = renderDashboard({}, stateWithFan({ mode: 'manual', rpm: 3000 }));
  assert.match(manual, /requested fan target: 3000 rpm/);
  assert.doesNotMatch(manual, /pinned|automatic/);
  const curve = renderDashboard({ fan_target_rpm: 3400 }, stateWithFan({ mode: 'curve', points: [] }));
  assert.match(curve, /fan curve: custom · target 3400 rpm/);
  assert.doesNotMatch(curve, /automatic/);
  assert.match(renderDashboard({}), /fan mode unavailable/);
});

test('thermal override shows the effective target alongside the requested manual target', () => {
  const html = renderDashboard({
    thermal_override_active: true, thermal_override_reason: 'temperature', fan_target_rpm: 5000
  }, stateWithFan({ mode: 'manual', rpm: 3000 }));
  assert.match(html, /requested fan target: 3000 rpm/);
  assert.match(html, /Thermal override active · target 5000 RPM/);
  assert.doesNotMatch(html, /sensor unavailable/);
});

test('sensor-loss override states the missing CPU sensor and the maximum target', () => {
  const html = renderDashboard({
    thermal_override_active: true, thermal_override_reason: 'sensor_unavailable'
  }, stateWithFan({ mode: 'curve', points: [] }));
  assert.match(html, /CPU temperature sensor unavailable/);
  assert.match(html, /Thermal override active · target 5000 RPM/);
});

test('dashboard and Fan screen warn on stale samples and recover with a fresh sample', () => {
  const state = stateWithFan({ mode: 'auto' });
  for (const renderScreen of [renderDashboard, renderFan]) {
    assert.match(renderScreen({ ts_ms: Date.now() - 60_000 }, state), /Telemetry is stale/);
    assert.doesNotMatch(renderScreen({ ts_ms: Date.now() }, state), /Telemetry is stale/);
    assert.match(renderScreen({}, state), /Telemetry age unavailable/);
    assert.match(renderScreen(null, state), /Waiting for live telemetry/);
  }
});
