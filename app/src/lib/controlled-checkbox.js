/** Capture a native checkbox's requested value and restore its controlled value. */
export function captureAndRestoreCheckbox(event, confirmedValue) {
  const input = event.currentTarget;
  const requestedValue = input.checked;
  input.checked = Boolean(confirmedValue);
  return requestedValue;
}
