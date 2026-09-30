import assert from 'node:assert/strict';
import test from 'node:test';
import { captureAndRestoreCheckbox } from './controlled-checkbox.js';

test('captures the requested checkbox value and immediately restores confirmed state', () => {
  const input = { checked: true };
  const event = { currentTarget: input };

  const requested = captureAndRestoreCheckbox(event, false);

  assert.equal(requested, true);
  assert.equal(input.checked, false);
});
