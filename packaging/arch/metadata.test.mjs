import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const version = JSON.parse(read('app/package.json')).version;
const [major, minor] = version.split('.').map(Number);
const upper = `${major}.${minor + 1}.0`;
const pkgbuild = read('packaging/arch/PKGBUILD');

test('PKGBUILD defines one x86_64 split pair with synchronized versions', () => {
  assert.match(pkgbuild, /^pkgbase=vfang$/m);
  assert.match(pkgbuild, /^pkgname=\(fang fangd\)$/m);
  assert.match(pkgbuild, new RegExp(`^pkgver=${version.replaceAll('.', '\\.')}\\s*$`, 'm'));
  assert.match(pkgbuild, /^pkgrel=1$/m);
  assert.match(pkgbuild, /^arch=\(x86_64\)$/m);
  assert.match(pkgbuild, new RegExp(`^_fangd_upper=${upper.replaceAll('.', '\\.')}\\s*$`, 'm'));
  assert.match(pkgbuild, /^package_fang\(\)/m);
  assert.match(pkgbuild, /^package_fangd\(\)/m);
});

test('desktop package owns the strict daemon line and Arch runtimes', () => {
  for (const dependency of [
    'cairo', 'dbus', 'gdk-pixbuf2', 'glib2', 'glibc', 'gtk3',
    'hicolor-icon-theme', 'libayatana-appindicator', 'libgcc',
    'libsoup3', 'webkit2gtk-4.1'
  ]) {
    assert.match(pkgbuild, new RegExp(`['\"]?${dependency.replaceAll('.', '\\.')}['\"]?`));
  }
  assert.match(pkgbuild, /"fangd>=\$\{pkgver\}"/);
  assert.match(pkgbuild, /"fangd<\$\{_fangd_upper\}"/);
});

test('daemon package uses systemd sysusers and both packages ship licenses', () => {
  assert.match(pkgbuild, /usr\/lib\/sysusers\.d\/fang\.conf/);
  assert.match(pkgbuild, /usr\/lib\/systemd\/system\/fangd\.service/);
  assert.match(pkgbuild, /usr\/share\/licenses\/fangd\/LICENSE/);
  assert.match(pkgbuild, /usr\/share\/licenses\/fang\/LICENSE/);
  assert.doesNotMatch(pkgbuild, /groupadd|useradd/);
  assert.equal(read('packaging/fang.sysusers'), 'g fang - -\n');
  assert.match(read('packaging/fang.desktop'), /^Name=VFang$/m);
});

test('lifecycle verifier covers package integrity, smoke tests, and removal', () => {
  const verify = read('packaging/arch/verify.sh');
  assert.match(verify, /namcap/);
  assert.match(verify, /pacman -U --noconfirm/);
  assert.match(verify, /pacman -Qkk fang fangd/);
  assert.match(verify, /systemd-analyze verify/);
  assert.match(verify, /mock_smoke\.py/);
  assert.match(verify, /dbus-run-session/);
  assert.match(verify, /xvfb-run/);
  assert.match(verify, /pacman -Rns --noconfirm fang fangd/);
});

test('lifecycle verifier lets the non-root builder traverse its dummy package directory', () => {
  const verify = read('packaging/arch/verify.sh');
  assert.match(verify, /TMP="\$\(mktemp -d\)"\nchmod 0755 "\$TMP"/);
});
