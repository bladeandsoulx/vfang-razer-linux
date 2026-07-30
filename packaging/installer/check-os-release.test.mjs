import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helper = path.join(root, 'packaging/installer/check-os-release.sh');

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
