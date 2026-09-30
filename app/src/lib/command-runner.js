function errorText(error) {
  return error instanceof Error ? error.message : String(error ?? 'Command failed');
}

/**
 * Guard a screen's hardware command and expose its pending/error state. The
 * runner deliberately ignores overlapping actions so a second full-state
 * command cannot race a still-pending first command.
 */
export function createCommandRunner(onState = () => {}) {
  let busy = false;
  let error = '';

  function publish() {
    onState({ busy, error });
  }

  return {
    get busy() {
      return busy;
    },
    get error() {
      return error;
    },
    async run(action) {
      if (busy) return { ok: false, skipped: true };

      busy = true;
      error = '';
      publish();

      try {
        return { ok: true, value: await action() };
      } catch (reason) {
        error = errorText(reason);
        return { ok: false, error };
      } finally {
        busy = false;
        publish();
      }
    }
  };
}
