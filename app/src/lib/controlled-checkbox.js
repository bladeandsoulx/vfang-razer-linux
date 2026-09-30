/** Capture a native checkbox's requested value and restore its controlled value. */
export function captureAndRestoreCheckbox(event, confirmedValue) {
  const input = event.currentTarget;
  const requestedValue = input.checked;
  input.checked = Boolean(confirmedValue);
  return requestedValue;
}

/** Recover focus after a pending save disabled this input, without stealing it. */
export function restoreCheckboxFocus(input, wasFocused) {
  if (
    wasFocused && input?.isConnected && !input.disabled &&
    input.ownerDocument.activeElement === input.ownerDocument.body
  ) {
    input.focus({ preventScroll: true });
  }
}
