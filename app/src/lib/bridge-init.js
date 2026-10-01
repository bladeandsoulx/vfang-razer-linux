const INITIAL_COMMANDS = [
  ['daemon_connected', 'connected'],
  ['get_version_info', 'versionInfo'],
  ['get_ui_settings', 'uiSettings'],
  ['get_display', 'display'],
  ['get_panel', 'panel']
];

function messageFor(error) {
  return error instanceof Error ? error.message : String(error ?? 'Command failed');
}

/** Keep asynchronous snapshots and commands from replacing newer state. */
export function createSnapshotRevisionGuard() {
  const revisions = new Map();
  const observedRevisions = new Map();
  const confirmedCommands = new Map();
  let nextCommand = 0;

  function mark(key) {
    revisions.set(key, (revisions.get(key) ?? 0) + 1);
    observedRevisions.set(key, (observedRevisions.get(key) ?? 0) + 1);
  }

  return {
    capture() {
      return new Map(revisions);
    },
    mark,
    publishLocal(key, value, publishValue) {
      mark(key);
      publishValue(value);
    },
    captureCommand(key) {
      // Supersede startup snapshots already in flight, without publishing an
      // optimistic value. Responses are ordered separately from observed events
      // so an older command finishing first cannot suppress a newer response.
      revisions.set(key, (revisions.get(key) ?? 0) + 1);
      return { key, observed: observedRevisions.get(key) ?? 0, sequence: ++nextCommand };
    },
    publishCommand(captured, value, publishValue) {
      const { key, observed, sequence } = captured;
      if ((observedRevisions.get(key) ?? 0) !== observed ||
          sequence <= (confirmedCommands.get(key) ?? 0)) return false;
      confirmedCommands.set(key, sequence);
      revisions.set(key, (revisions.get(key) ?? 0) + 1);
      publishValue(value);
      return true;
    },
    publish(state, captured, publishValue) {
      for (const [key, value] of Object.entries(state)) {
        if ((revisions.get(key) ?? 0) === (captured.get(key) ?? 0)) {
          publishValue(key, value);
        }
      }
    }
  };
}

/** Load independent startup state without letting one failed call abort the rest. */
export async function loadBridgeSnapshot(invoke) {
  const results = await Promise.allSettled(
    INITIAL_COMMANDS.map(([command]) => Promise.resolve().then(() => invoke(command)))
  );
  const state = {};
  const issues = [];

  for (let index = 0; index < INITIAL_COMMANDS.length; index += 1) {
    const [command, key] = INITIAL_COMMANDS[index];
    const result = results[index];
    if (result.status === 'fulfilled') {
      state[key] = result.value;
    } else {
      issues.push({ command, message: messageFor(result.reason) });
    }
  }

  if (state.connected) {
    try {
      state.status = await invoke('get_status');
    } catch (error) {
      issues.push({ command: 'get_status', message: messageFor(error) });
    }
  }

  return { state, issues };
}

/** Load and publish startup state only when no newer event superseded it. */
export async function loadAndPublishBridgeSnapshot(invoke, revisions, publish) {
  const captured = revisions.capture();
  const result = await loadBridgeSnapshot(invoke);
  revisions.publish(result.state, captured, publish);
  return result;
}
