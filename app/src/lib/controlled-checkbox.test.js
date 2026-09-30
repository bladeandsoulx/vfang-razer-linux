import assert from 'node:assert/strict';
import test from 'node:test';
import { captureAndRestoreCheckbox, restoreCheckboxFocus } from './controlled-checkbox.js';

test('captures the requested checkbox value and immediately restores confirmed state', () => {
  const input = { checked: true };
  const event = { currentTarget: input };

  const requested = captureAndRestoreCheckbox(event, false);

  assert.equal(requested, true);
  assert.equal(input.checked, false);
});

function focusFixture() {
  let calls = 0;
  const body = {};
  const input = {
    isConnected: true,
    disabled: false,
    ownerDocument: { body, activeElement: body },
    focus(options) {
      assert.deepEqual(options, { preventScroll: true });
      calls++;
    }
  };
  return { input, calls: () => calls };
}

test('restores keyboard focus after a pending checkbox save', () => {
  const fixture = focusFixture();
  restoreCheckboxFocus(fixture.input, true);
  assert.equal(fixture.calls(), 1);
});

test('does not steal focus when the user moved to another control', () => {
  const fixture = focusFixture();
  fixture.input.ownerDocument.activeElement = {};
  restoreCheckboxFocus(fixture.input, true);
  assert.equal(fixture.calls(), 0);
});

test('does not focus removed, disabled or previously unfocused checkboxes', () => {
  const fixture = focusFixture();
  restoreCheckboxFocus(fixture.input, false);
  fixture.input.disabled = true;
  restoreCheckboxFocus(fixture.input, true);
  fixture.input.disabled = false;
  fixture.input.isConnected = false;
  restoreCheckboxFocus(fixture.input, true);
  assert.equal(fixture.calls(), 0);
});
