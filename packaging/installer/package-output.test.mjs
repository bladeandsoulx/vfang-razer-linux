import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

for (const [family, names] of [
  ['rpm', ['unrelated.rpm', 'fangd-0.9.8-1.x86_64.rpm']],
  ['arch', ['fang-other-1.0-1-x86_64.pkg.tar.zst', 'fang-0.9.8-1-x86_64.pkg.tar.zst']]
]) {
  const script = fileURLToPath(new URL(`../${family}/build.sh`, import.meta.url));
  for (const filename of names) {
    test(`${family} build preserves an occupied output directory containing ${filename}`, {
      skip: process.platform === 'win32' || (family === 'arch' && process.getuid?.() === 0)
    }, () => {
      const output = fs.mkdtempSync(path.join(os.tmpdir(), 'vfang-package-output-'));
      const artifact = path.join(output, filename);
      const content = 'previous package: must survive';
      fs.writeFileSync(artifact, content);
      try {
        const result = spawnSync('bash', [script, output], {
          encoding: 'utf8', timeout: 5000,
          // An occupied destination must be rejected before any build helpers.
          env: { ...process.env, PATH: '/usr/bin:/bin' }
        });
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /package output directory already contains/);
        assert.equal(fs.readFileSync(artifact, 'utf8'), content);
        assert.deepEqual(fs.readdirSync(output), [filename]);
      } finally {
        fs.rmSync(output, { recursive: true, force: true });
      }
    });
  }
}
