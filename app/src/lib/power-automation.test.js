import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { compile } from 'svelte/compiler';

const appRoot = fileURLToPath(new URL('../..', import.meta.url));
const compiled = await build({
  stdin: {
    contents: `import Performance from './src/screens/Performance.svelte';
      import { status } from './src/lib/stores.js';
      import { render } from 'svelte/server';
      export function renderPerformance(state) {
        status.set(state);
        return render(Performance).body;
      }`,
    resolveDir: appRoot,
    sourcefile: 'power-automation-test-entry.js'
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{
    name: 'svelte-server-components',
    setup(builder) {
      builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
        contents: compile(await readFile(path, 'utf8'), {
          filename: path, generate: 'server'
        }).js.code,
        loader: 'js'
      }));
    }
  }]
});
const { renderPerformance } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
);

for (const [source, field] of [['AC', 'ac_profile'], ['Battery', 'battery_profile']]) {
  test(`Custom automation is selectable and confirmed for ${source} power`, () => {
    const html = renderPerformance({ auto_power: true, [field]: 'custom' });
    const group = html.match(new RegExp(`aria-label="${source} power profile">([\\s\\S]*?)</div>`));
    assert.ok(group, `${source} power profile must be rendered`);
    assert.match(group[1], /aria-pressed="true"[^>]*>\s*Custom\s*</);
    assert.match(html, /Custom automation uses your saved CPU and GPU power levels/);
  });
}

test('legacy power profiles keep their confirmed selections', () => {
  const html = renderPerformance({ ac_profile: 'balanced', battery_profile: 'silent' });
  assert.match(html, /aria-pressed="true"[^>]*>\s*Balanced\s*</);
  assert.match(html, /aria-pressed="true"[^>]*>\s*Silent\s*</);
  assert.doesNotMatch(html, /Custom automation uses/);
});
