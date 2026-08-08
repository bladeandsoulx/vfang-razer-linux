import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = fs.readFileSync(path.join(root, 'packaging/arch/build.sh'), 'utf8');

test('Arch producer builds once and delegates only packaging to makepkg', () => {
  assert.match(script, /node app\/scripts\/version\.mjs check/);
  assert.match(script, /cargo build --release --locked -p fangd/);
  assert.match(script, /npm ci/);
  assert.match(script, /npm run tauri build -- --no-bundle/);
  assert.match(script, /makepkg --clean --cleanbuild --force --noconfirm/);
  assert.doesNotMatch(script, /--bundles (deb|rpm)|makepkg .*--nodeps/);
});

test('Arch producer refuses root and requires exactly one fang and fangd package', () => {
  assert.match(script, /EUID.*0/);
  assert.match(script, /expected two Pacman packages/);
  assert.match(script, /duplicate Pacman package/);
  assert.match(script, /unexpected Pacman package/);
});
