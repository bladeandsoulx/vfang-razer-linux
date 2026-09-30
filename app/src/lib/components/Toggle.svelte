<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { captureAndRestoreCheckbox, restoreCheckboxFocus } from '../controlled-checkbox.js';

  export let checked = false;
  export let disabled = false;
  export let label = '';
  export let hint = '';

  const dispatch = createEventDispatcher();
  let input;
  let restoreFocus = false;
  let wasDisabled = false;

  $: if (disabled) wasDisabled = true;
  $: if (!disabled && wasDisabled) {
    wasDisabled = false;
    const wasFocused = restoreFocus;
    restoreFocus = false;
    void tick().then(() => restoreCheckboxFocus(input, wasFocused));
  }

  function change(event) {
    restoreFocus = event.currentTarget.ownerDocument.activeElement === event.currentTarget;
    const requested = captureAndRestoreCheckbox(event, checked);
    dispatch('change', { checked: requested });
  }
</script>

<label class="row">
  <span class="text">
    <span class="label">{label}</span>
    {#if hint}<span class="hint">{hint}</span>{/if}
  </span>
  <input bind:this={input} type="checkbox" {checked} {disabled} on:change={change} />
  <span class="pill"><span class="knob"></span></span>
</label>

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 16px;
    cursor: pointer;
    padding: 14px 2px;
  }

  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .label {
    font-size: 13.5px;
    font-weight: 500;
  }

  .hint {
    font-size: 11.5px;
    color: var(--ink-dim);
  }

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  input:focus-visible + .pill {
    outline: 2px solid var(--green-soft);
    outline-offset: 3px;
  }

  input:disabled ~ .pill {
    opacity: 0.55;
  }

  .row:has(input:disabled) {
    cursor: default;
  }

  .pill {
    width: 40px;
    height: 22px;
    border-radius: 11px;
    background: #22282c;
    border: 1px solid #2c3439;
    position: relative;
    transition: background 0.2s ease, border-color 0.2s ease;
    flex-shrink: 0;
  }

  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #5a656d;
    transition: transform 0.18s cubic-bezier(0.3, 0.9, 0.4, 1.2), background 0.2s ease;
  }

  input:checked + .pill {
    background: rgba(68, 214, 44, 0.18);
    border-color: var(--green-dim);
  }

  input:checked + .pill .knob {
    transform: translateX(18px);
    background: var(--green);
    box-shadow: 0 0 8px var(--green-glow);
  }
</style>
