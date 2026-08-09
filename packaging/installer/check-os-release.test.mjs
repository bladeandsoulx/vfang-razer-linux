import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helper = path.join(root, 'packaging/installer/check-os-release.sh');
const stoppedMarker = 'installer detection probe stopped before download';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function makeProbeFixture({
  name = 'fixture-os',
  identity = 'ID=debian\nVERSION_ID="12"\nVERSION_CODENAME=bookworm\n',
  capture = identity
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fang-os-release-probe-test-'));
  const installerDir = path.join(dir, 'packaging/installer');
  const captureDir = path.join(installerDir, 'os-release');
  const identityFile = path.join(dir, 'os-release');

  fs.mkdirSync(captureDir, { recursive: true, mode: 0o755 });
  for (const directory of [
    dir,
    path.join(dir, 'packaging'),
    installerDir,
    captureDir
  ]) {
    fs.chmodSync(directory, 0o755);
  }
  fs.writeFileSync(identityFile, identity, { mode: 0o644 });
  fs.writeFileSync(path.join(captureDir, name), capture, { mode: 0o644 });
  fs.copyFileSync(helper, path.join(installerDir, 'check-os-release.sh'));
  fs.chmodSync(path.join(installerDir, 'check-os-release.sh'), 0o755);
  fs.writeFileSync(
    path.join(dir, 'install.sh'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' 'Detected: linux (Fixture OS)'
case "\${FANG_FAKE_PROBE_MODE}" in
  curl) curl https://example.invalid ;;
  near-marker)
    printf '%s\\n' 'prefix: ${stoppedMarker}' >&2
    curl https://example.invalid 2>/dev/null
    ;;
  marker-only)
    printf '%s\\n' '${stoppedMarker}' >&2
    exit 1
    ;;
  mutation)
    curl https://example.invalid || :
    sudo true
    ;;
  *) exit 2 ;;
esac
`,
    { mode: 0o755 }
  );

  return {
    run(mode) {
      return spawnSync('bash', [path.join(installerDir, 'check-os-release.sh'), name, 'Fixture OS'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          FANG_OS_RELEASE_FILE: identityFile,
          FANG_FAKE_PROBE_MODE: mode
        }
      });
    },
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('real-file probe rejects an incorrect expected platform label', () => {
  const name = 'debian-12';
  const identityFile = path.join(root, 'packaging/installer/os-release', name);

  const result = spawnSync('bash', [helper, name, 'Incorrect Platform'], {
    encoding: 'utf8',
    env: { ...process.env, FANG_OS_RELEASE_FILE: identityFile }
  });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /installer detected/i);
});

for (const [name, expectedPlatform] of [
  ['arch-container', 'Arch Linux'],
  ['cachyos-container', 'CachyOS'],
  ['debian-12', 'Debian 12']
]) {
  test(`real-file probe accepts ${name} stopping at the curl sentinel`, () => {
    const identityFile = path.join(root, 'packaging/installer/os-release', name);

    const result = spawnSync('bash', [helper, name, expectedPlatform], {
      encoding: 'utf8',
      env: { ...process.env, FANG_OS_RELEASE_FILE: identityFile }
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, new RegExp(`^${stoppedMarker}$`, 'm'));
    assert.doesNotMatch(result.stdout + result.stderr, /blocked system mutation/);
  });
}

test('push and tag workflows gate Pacman packages on Arch and CachyOS', () => {
  for (const source of [read('.github/workflows/ci.yml'), read('.github/workflows/release.yml')]) {
    assert.match(source, /archlinux:base-devel/);
    assert.match(source, /cachyos\/cachyos:latest/);
    assert.match(source, /packaging\/arch\/build\.sh target\/arch-dist/);
    assert.match(source, /packaging\/arch\/verify\.sh target\/arch-dist fangtest/);
    assert.match(source, /name: fang-arch-packages/);
    assert.match(source, /arch-container/);
    assert.match(source, /cachyos-container/);
    assert.match(source, /capture: cachyos-container\n\s+platform: CachyOS/);
    assert.match(source, /name: Arch Linux[\s\S]*?disable_sandbox_network: false/);
    assert.match(source, /name: CachyOS[\s\S]*?disable_sandbox_network: true/);
    assert.match(source, /DISABLE_PACMAN_SANDBOX_NETWORK:.*disable_sandbox_network/);
    assert.match(source, /if \[\[ "\$DISABLE_PACMAN_SANDBOX_NETWORK" == true \]\]/);
    assert.ok(source.includes(
      "sed -i '/^\\[options\\]/a DisableSandboxNetwork' /etc/pacman.conf"
    ));
  }
});

test('real-file probe accepts only the curl stop sentinel', () => {
  const fixture = makeProbeFixture();
  const result = fixture.run('curl');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(stoppedMarker));
  fixture.cleanup();
});

test('rolling Arch projections ignore volatile VERSION_ID values', () => {
  const fixture = makeProbeFixture({
    name: 'arch-container',
    identity: 'ID=arch\nVERSION_ID=20260802.0.566770\n',
    capture: 'ID=arch\n'
  });
  const result = fixture.run('curl');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  fixture.cleanup();
});

test('non-rolling projections still reject VERSION_ID drift', () => {
  const fixture = makeProbeFixture({
    identity: 'ID=debian\nVERSION_ID="13"\nVERSION_CODENAME=bookworm\n',
    capture: 'ID=debian\nVERSION_ID="12"\nVERSION_CODENAME=bookworm\n'
  });
  const result = fixture.run('curl');
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /no longer matches/);
  fixture.cleanup();
});

for (const [mode, label, expectedError, expectedOutput] of [
  [
    'near-marker',
    'a near-match marker despite valid curl status',
    /did not emit the exact marker/,
    new RegExp(`^prefix: ${stoppedMarker}$`, 'm')
  ],
  [
    'marker-only',
    'the curl marker with the wrong status',
    /curl sentinel exited with unknown instead of 86/,
    new RegExp(`^${stoppedMarker}$`, 'm')
  ],
  [
    'mutation',
    'a blocked system mutation after valid curl evidence',
    /reached a blocked system mutation command/,
    /blocked system mutation/
  ]
]) {
  test(`real-file probe rejects ${label}`, () => {
    const fixture = makeProbeFixture();
    const result = fixture.run(mode);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, expectedError);
    assert.match(result.stdout, expectedOutput);
    if (mode === 'mutation') {
      assert.match(result.stdout, new RegExp(`^${stoppedMarker}$`, 'm'));
    }
    fixture.cleanup();
  });
}
