import test from 'node:test';
import assert from 'node:assert/strict';
import { telemetryFreshness, TELEMETRY_STALE_AFTER_MS } from './telemetry-freshness.js';

const now = 100_000;

test('telemetry becomes stale at the five-second boundary even without a new sample', () => {
  const sample = { ts_ms: now };
  assert.deepEqual(telemetryFreshness(sample, now + TELEMETRY_STALE_AFTER_MS - 1), { stale: false, message: '' });
  const stale = telemetryFreshness(sample, now + TELEMETRY_STALE_AFTER_MS);
  assert.equal(stale.stale, true);
  assert.match(stale.message, /last sample 5 s ago/);
  assert.match(telemetryFreshness(sample, now + 60_000).message, /last sample 60 s ago/);
});

test('no sample shows waiting and invalid or absent timestamps warn', () => {
  assert.deepEqual(telemetryFreshness(null, now), { stale: false, message: 'Waiting for live telemetry…' });
  for (const ts_ms of [undefined, null, 0, -1, NaN, Infinity, '100000']) {
    const health = telemetryFreshness({ ts_ms }, now);
    assert.equal(health.stale, true);
    assert.match(health.message, /age unavailable/);
  }
});

test('small clock skew is tolerated and larger future timestamps warn', () => {
  assert.equal(telemetryFreshness({ ts_ms: now + 4999 }, now).stale, false);
  assert.equal(telemetryFreshness({ ts_ms: now + 5000 }, now).stale, false);
  const health = telemetryFreshness({ ts_ms: now + 5001 }, now);
  assert.equal(health.stale, true);
  assert.match(health.message, /ahead of the app clock/);
});

test('a fresh sample clears an older stale warning', () => {
  assert.equal(telemetryFreshness({ ts_ms: now - 10_000 }, now).stale, true);
  assert.deepEqual(telemetryFreshness({ ts_ms: now }, now), { stale: false, message: '' });
});
