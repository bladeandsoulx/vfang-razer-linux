<script>
  import { onMount } from 'svelte';
  import { telemetry } from '../stores.js';
  import { telemetryFreshness } from '../telemetry-freshness.js';

  let now = Date.now();
  $: health = telemetryFreshness($telemetry, now);

  onMount(() => {
    const timer = setInterval(() => { now = Date.now(); }, 1000);
    return () => clearInterval(timer);
  });
</script>

{#if health.message}
  <div class="notice" class:stale={health.stale} role={health.stale ? 'alert' : 'status'}>
    {health.message}
  </div>
{/if}

<style>
  .notice {
    padding: 12px 16px;
    margin-bottom: 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--ink-dim);
    font-size: 12px;
  }

  .stale {
    border-color: var(--amber);
    color: var(--amber);
    background: rgba(255, 180, 84, 0.06);
  }
</style>
