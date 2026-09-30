import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSnapshotRevisionGuard,
  loadBridgeSnapshot,
  loadAndPublishBridgeSnapshot
} from './bridge-init.js';

test('loads independent startup state even when the status request fails', async () => {
  const calls = [];
  const values = {
    daemon_connected: true,
    get_version_info: { app_version: '0.9.9', compatible: true },
    get_ui_settings: { autostart: true, close_to_tray: false },
    get_display: { supported: true, current_hz: 240 },
    get_panel: { supported: true, brightness: 70 }
  };

  const result = await loadBridgeSnapshot(async (command) => {
    calls.push(command);
    if (command === 'get_status') throw new Error('daemon disconnected');
    return values[command];
  });

  assert.deepEqual(calls, [
    'daemon_connected',
    'get_version_info',
    'get_ui_settings',
    'get_display',
    'get_panel',
    'get_status'
  ]);
  assert.deepEqual(result.state, {
    connected: true,
    versionInfo: values.get_version_info,
    uiSettings: values.get_ui_settings,
    display: values.get_display,
    panel: values.get_panel
  });
  assert.deepEqual(result.issues, [
    { command: 'get_status', message: 'daemon disconnected' }
  ]);
});

test('does not query status when the daemon is offline', async () => {
  const calls = [];
  const result = await loadBridgeSnapshot(async (command) => {
    calls.push(command);
    return command === 'daemon_connected' ? false : { ok: true };
  });

  assert.equal(calls.includes('get_status'), false);
  assert.equal(result.state.connected, false);
  assert.deepEqual(result.issues, []);
});

test('events received during a deferred offline snapshot beat its stale values', async () => {
  const revisions = createSnapshotRevisionGuard();
  const published = {};
  const snapshotValues = {
    daemon_connected: false,
    get_version_info: { app_version: '0.9.9', compatible: false },
    get_ui_settings: { autostart: false, close_to_tray: true },
    get_panel: { supported: true, brightness: 60 }
  };
  let finishDisplay;
  let signalDisplayStart;
  const displayStarted = new Promise((resolve) => {
    signalDisplayStart = resolve;
  });

  const loading = loadAndPublishBridgeSnapshot(
    async (command) => {
      if (command === 'get_display') {
        signalDisplayStart();
        await new Promise((resolve) => {
          finishDisplay = resolve;
        });
        return { supported: true, current_hz: 144 };
      }
      return snapshotValues[command];
    },
    revisions,
    (key, value) => (published[key] = value)
  );

  await displayStarted;
  revisions.mark('connected');
  published.connected = true;
  revisions.mark('versionInfo');
  published.versionInfo = { app_version: '0.9.9', compatible: true };
  revisions.mark('status');
  published.status = { model: 'Blade, connected' };
  finishDisplay();

  const result = await loading;
  assert.equal(published.connected, true);
  assert.deepEqual(published.versionInfo, { app_version: '0.9.9', compatible: true });
  assert.deepEqual(published.status, { model: 'Blade, connected' });
  assert.deepEqual(published.display, { supported: true, current_hz: 144 });
  assert.deepEqual(published.uiSettings, snapshotValues.get_ui_settings);
  assert.deepEqual(published.panel, snapshotValues.get_panel);
  assert.deepEqual(result.issues, []);
});

test('a status event received during startup wins over the later status response', async () => {
  const revisions = createSnapshotRevisionGuard();
  const published = {};
  let finishDisplay;
  let signalDisplayStart;
  const displayStarted = new Promise((resolve) => {
    signalDisplayStart = resolve;
  });

  const loading = loadAndPublishBridgeSnapshot(
    async (command) => {
      if (command === 'get_display') {
        signalDisplayStart();
        await new Promise((resolve) => {
          finishDisplay = resolve;
        });
        return { supported: true };
      }
      if (command === 'daemon_connected') return true;
      if (command === 'get_status') return { model: 'stale snapshot' };
      return { ok: true };
    },
    revisions,
    (key, value) => (published[key] = value)
  );

  await displayStarted;
  revisions.mark('status');
  published.status = { model: 'new event' };
  finishDisplay();

  await loading;
  assert.deepEqual(published.status, { model: 'new event' });
});

test('confirmed command results survive an older deferred retry snapshot', async () => {
  const revisions = createSnapshotRevisionGuard();
  const published = {};
  const oldValues = {
    daemon_connected: true,
    get_version_info: { app_version: '0.9.9', compatible: true },
    get_ui_settings: { autostart: false, close_to_tray: true },
    get_panel: { supported: true, brightness: 60 }
  };
  let finishDisplay;
  let signalDisplayStart;
  const displayStarted = new Promise((resolve) => {
    signalDisplayStart = resolve;
  });

  const loading = loadAndPublishBridgeSnapshot(
    async (command) => {
      if (command === 'get_display') {
        signalDisplayStart();
        await new Promise((resolve) => {
          finishDisplay = resolve;
        });
        return { supported: true, current_hz: 60 };
      }
      if (command === 'get_status') return { model: 'old status' };
      return oldValues[command];
    },
    revisions,
    (key, value) => (published[key] = value)
  );

  await displayStarted;
  const localResults = {
    status: { model: 'confirmed status' },
    uiSettings: { autostart: true, close_to_tray: true },
    display: { supported: true, current_hz: 240 },
    panel: { supported: true, brightness: 85 }
  };
  for (const [key, value] of Object.entries(localResults)) {
    revisions.publishLocal(key, value, (confirmed) => (published[key] = confirmed));
  }
  finishDisplay();

  const result = await loading;
  assert.deepEqual(published.status, localResults.status);
  assert.deepEqual(published.uiSettings, localResults.uiSettings);
  assert.deepEqual(published.display, localResults.display);
  assert.deepEqual(published.panel, localResults.panel);
  assert.deepEqual(result.issues, []);
});
