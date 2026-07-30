import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('current desktop application surfaces present VFang', () => {
  const currentUi = [
    'app/index.html',
    'app/src/App.svelte',
    'app/src/screens/Settings.svelte',
    'app/src/screens/Support.svelte',
    'app/src/screens/Disconnected.svelte',
    'app/src/screens/Lighting.svelte'
  ];

  assert.match(read('app/index.html'), /<title>VFang<\/title>/);
  assert.match(read('app/src/App.svelte'), /<span class="word">VFANG<\/span>/);
  for (const file of currentUi) {
    assert.doesNotMatch(read(file), /\bFang\b/, file);
  }

  const main = read('app/src-tauri/src/main.rs');
  for (const phrase of [
    'VFang is already running',
    'VFang is already open',
    'Open VFang',
    'Quit VFang',
    '.tooltip("VFang")',
    'error while running VFang'
  ]) {
    assert.ok(main.includes(phrase), phrase);
  }

  const client = read('app/src-tauri/src/client.rs');
  assert.match(client, /update\/restart both VFang packages/);
  assert.match(client, /incompatible VFang API/);
  assert.match(read('app/src-tauri/Cargo.toml'), /^description = "VFang —/m);
  assert.match(read('app/src/main.js'), /VFang application root is missing/);
  assert.match(read('app/src/lib/updater.js'), /invalid VFang version/);
});

test('desktop rebrand leaves Tauri and executable identity stable', () => {
  const config = JSON.parse(read('app/src-tauri/tauri.conf.json'));
  assert.equal(config.productName, 'Fang');
  assert.equal(config.identifier, 'dev.fang.app');
  assert.equal(config.app.windows[0].title, 'VFang');

  const manifest = read('app/src-tauri/Cargo.toml');
  assert.match(manifest, /^name = "fang"$/m);
  assert.match(manifest, /fang-protocol =/);
});
