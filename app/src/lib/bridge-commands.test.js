import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

// Exercise the actual bridge, replacing only native IPC and event registration.
// No daemon or physical hardware is opened. Node runs this file in its own worker.
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    const sources = {
      '@tauri-apps/api/core': 'export const invoke = (...args) => globalThis.testInvoke(...args);',
      '@tauri-apps/api/event': 'export const listen = (...args) => globalThis.testListen(...args);'
    };
    if (sources[specifier]) return {
      url: 'data:text/javascript,' + encodeURIComponent(sources[specifier]), shortCircuit: true
    };
    return nextResolve(specifier, context);
  }
`)}`, import.meta.url);

globalThis.window = { __TAURI_INTERNALS__: {} };
const listeners = new Map();
const pending = [];
globalThis.testListen = async (name, handler) => {
  listeners.set(name, handler);
  return () => listeners.delete(name);
};
globalThis.testInvoke = (command, args) => {
  const startup = {
    daemon_connected: true, get_version_info: { compatible: true },
    get_ui_settings: { autostart: false, close_to_tray: true },
    get_display: { current_hz: 60 }, get_panel: { brightness: 60 },
    get_status: { perf_mode: 'gaming' }
  };
  if (Object.hasOwn(startup, command)) return Promise.resolve(startup[command]);
  return new Promise((resolve, reject) => pending.push({ command, args, resolve, reject }));
};
const { get } = await import('svelte/store');
const stores = await import('./stores.js');
const bridge = await import('./bridge.js');
await bridge.retryBridgeInit();
const event = value => listeners.get('fang://status')({ payload: value });
const statusCommands = [
  () => bridge.setPerfMode('gaming'),
  () => bridge.setFan({ mode: 'auto' }),
  () => bridge.setGpuMode('hybrid'),
  () => bridge.setBho(true, 80),
  () => bridge.setLighting({ brightness: 50 }),
  () => bridge.setColorPreset(6500),
  () => bridge.setMonitorBrightness(50),
  () => bridge.rescanDdc(),
  () => bridge.setAutoPower(true, 'gaming', 'silent', { mode: 'auto' }, { mode: 'auto' })
];

test('every status command keeps a newer automation event when its response is delayed', async () => {
  for (const issue of statusCommands) {
    event({ perf_mode: 'gaming' });
    const request = issue();
    const command = pending.shift();
    const newer = { perf_mode: 'silent', fan: { mode: 'manual', rpm: 2200 } };
    event(newer);
    command.resolve({ perf_mode: 'gaming' });
    await request;
    assert.deepEqual(get(stores.status), newer, command.command);
  }
});

test('status, display and panel commands publish confirmed responses without a newer event', async () => {
  for (const [issue, store, value] of [
    ...statusCommands.map(issue => [issue, stores.status, { perf_mode: 'silent' }]),
    [() => bridge.setRefreshRate(240), stores.display, { current_hz: 240 }],
    [() => bridge.setPanelBrightness(75), stores.panel, { brightness: 75 }]
  ]) {
    const request = issue();
    pending.shift().resolve(value);
    await request;
    assert.deepEqual(get(store), value);
  }
});

test('an older response finishing after a newer confirmed command cannot replace it', async () => {
  for (const [issue, store, older, newer] of [
    [() => bridge.setPerfMode('gaming'), stores.status, { perf_mode: 'gaming' }, { perf_mode: 'silent' }],
    [() => bridge.setRefreshRate(240), stores.display, { current_hz: 60 }, { current_hz: 240 }],
    [() => bridge.setPanelBrightness(75), stores.panel, { brightness: 60 }, { brightness: 75 }]
  ]) {
    const first = issue();
    const earlier = pending.shift();
    const second = issue();
    const later = pending.shift();
    later.resolve(newer);
    await second;
    earlier.resolve(older);
    await first;
    assert.deepEqual(get(store), newer);
  }
});

test('a newer command can still publish when an older command completes first', async () => {
  const first = bridge.setPerfMode('gaming');
  const earlier = pending.shift();
  const second = bridge.setPerfMode('silent');
  const later = pending.shift();
  earlier.resolve({ perf_mode: 'gaming' });
  await first;
  assert.equal(get(stores.status).perf_mode, 'gaming');
  later.resolve({ perf_mode: 'silent' });
  await second;
  assert.equal(get(stores.status).perf_mode, 'silent');
});

test('a failed newer command reports its error and does not discard an earlier successful response', async () => {
  const first = bridge.setPerfMode('gaming');
  const earlier = pending.shift();
  const second = bridge.setPerfMode('silent');
  const later = pending.shift();
  later.reject(new Error('EC failed'));
  await assert.rejects(second, /EC failed/);
  earlier.resolve({ perf_mode: 'gaming' });
  await first;
  assert.equal(get(stores.status).perf_mode, 'gaming');
});

test('command failure after an automation event preserves the event and reports the error', async () => {
  const request = bridge.setPerfMode('gaming');
  const command = pending.shift();
  event({ perf_mode: 'silent' });
  command.reject(new Error('persistence failed'));
  await assert.rejects(request, /persistence failed/);
  assert.equal(get(stores.status).perf_mode, 'silent');
});

test('status events do not suppress independent display or panel command responses', async () => {
  const display = bridge.setRefreshRate(240);
  const displayCommand = pending.shift();
  const panel = bridge.setPanelBrightness(75);
  const panelCommand = pending.shift();
  event({ perf_mode: 'silent' });
  displayCommand.resolve({ current_hz: 240 });
  panelCommand.resolve({ brightness: 75 });
  await Promise.all([display, panel]);
  assert.equal(get(stores.display).current_hz, 240);
  assert.equal(get(stores.panel).brightness, 75);
  assert.equal(get(stores.status).perf_mode, 'silent');
});
