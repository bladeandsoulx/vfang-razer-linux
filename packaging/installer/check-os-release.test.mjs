import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helper = path.join(root, 'packaging/installer/check-os-release.sh');
const captures = path.join(root, 'packaging/installer/os-release');

test('real-file probe rejects an incorrect expected platform label', () => {
  const name = `.check-os-release-test-${process.pid}`;
  const capture = path.join(captures, name);
  const projection = spawnSync(
    'grep',
    ['-E', '^(ID|ID_LIKE|VERSION_ID|VERSION_CODENAME|UBUNTU_CODENAME|PLATFORM_ID|CPE_NAME)=', '/etc/os-release'],
    { encoding: 'utf8' }
  );
  assert.equal(projection.status, 0, projection.stderr);
  fs.writeFileSync(capture, projection.stdout);

  try {
    const result = spawnSync('bash', [helper, name, 'Incorrect Platform'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /installer detected/i);
  } finally {
    fs.rmSync(capture, { force: true });
  }
});
