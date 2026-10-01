export const TELEMETRY_STALE_AFTER_MS = 5000;

// Re-evaluate against a clock, not just when a sample arrives: a stopped
// stream cannot notify the UI that its last reading has become stale.
export function telemetryFreshness(sample, now = Date.now()) {
  if (!sample) return { stale: false, message: 'Waiting for live telemetry…' };
  if (!Number.isFinite(sample.ts_ms) || sample.ts_ms <= 0) {
    return { stale: true, message: 'Telemetry age unavailable. Readings may be stale.' };
  }
  const age = now - sample.ts_ms;
  if (age < -TELEMETRY_STALE_AFTER_MS) {
    return { stale: true, message: 'Telemetry timestamp is ahead of the app clock. Readings may be stale.' };
  }
  if (age < TELEMETRY_STALE_AFTER_MS) return { stale: false, message: '' };
  return {
    stale: true,
    message: `Telemetry is stale · last sample ${Math.floor(age / 1000)} s ago. Readings are not live.`
  };
}
