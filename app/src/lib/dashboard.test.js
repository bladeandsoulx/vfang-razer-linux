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
      import { telemetry } from './src/lib/stores.js';
      import { render } from 'svelte/server';
      export function renderDashboard(sample) {
        telemetry.set(sample);
        return render(Dashboard).body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
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
const { renderDashboard } = await import(
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
