import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const installer = fileURLToPath(new URL('../install-from-source.sh', import.meta.url));
const posix = process.platform !== 'win32';

// Source only the build/install function. All commands that build, install or
// contact a service are replaced; real file copies happen only in this fixture.
function runFixture({ fail = '', missing = '' } = {}) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'vfang-source-install-'));
  const root = path.join(fixture, 'source tree');
  const daemon = path.join(root, 'target/debian/fangd_0.9.9-1_amd64.deb');
  const app = path.join(root, 'app/src-tauri/target/release/bundle/deb/Fang_0.9.9_amd64.deb');
  for (const [kind, filename] of [['daemon', daemon], ['app', app]]) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    if (missing !== kind) fs.writeFileSync(filename, kind);
  }
  const events = path.join(fixture, 'events');
  try {
    const result = spawnSync('bash', ['-euo', 'pipefail', '-c', `
source "$1"
run_user() {
    local step
    case "$1" in
        node) step=version-check ;;
        cargo) step=daemon-build ;;
        npm)
            if [[ $2 == ci ]]; then step=npm-ci; else step=app-build; fi ;;
        *) return 99 ;;
    esac
    printf '%s\\n' "$step" >> "$EVENTS"
    [[ $step != "$FAIL_STEP" ]]
}
apt-get() {
    printf 'install' >> "$EVENTS"
    printf ' <%s>' "$@" >> "$EVENTS"
    printf '\\n' >> "$EVENTS"
    [[ $1 == install && $2 == -y && $# == 4 ]]
    [[ $(< "$3") == daemon && $(< "$4") == app ]]
    [[ $FAIL_STEP != install ]]
}
source_installer_build_and_install "$2" 0.9.9
`, 'fixture', installer, root], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, EVENTS: events, FAIL_STEP: fail }
    });
    return {
      ...result,
      events: fs.existsSync(events) ? fs.readFileSync(events, 'utf8').trim().split('\n') : []
    };
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

test('source install builds both components before one staged package transaction', { skip: !posix }, () => {
  const result = runFixture();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.events.slice(0, 4), ['version-check', 'daemon-build', 'npm-ci', 'app-build']);
  assert.equal(result.events.length, 5);
  assert.match(result.events[4], /^install <install> <-y> <\/.*\/fangd_0\.9\.9-1_amd64\.deb> <\/.*\/Fang_0\.9\.9_amd64\.deb>$/);
});

for (const step of ['version-check', 'daemon-build', 'npm-ci', 'app-build']) {
  test(`source install does not install stale packages after ${step} fails`, { skip: !posix }, () => {
    const result = runFixture({ fail: step });
    assert.notEqual(result.status, 0);
    assert.equal(result.events.at(-1), step);
    assert.ok(result.events.every((event) => !event.startsWith('install')));
  });
}

for (const missing of ['daemon', 'app']) {
  test(`source install refuses an incomplete pair with the ${missing} artifact missing`, { skip: !posix }, () => {
    const result = runFixture({ missing });
    assert.notEqual(result.status, 0);
    assert.ok(result.events.every((event) => !event.startsWith('install')));
  });
}

test('source install propagates a failed package transaction', { skip: !posix }, () => {
  const result = runFixture({ fail: 'install' });
  assert.notEqual(result.status, 0);
  assert.equal(result.events.length, 5);
});
