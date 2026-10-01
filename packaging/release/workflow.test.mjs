import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name) => readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');
const ci = read('ci.yml');
const release = read('release.yml');

// Read job blocks without a third-party parser so the release contract also
// runs before frontend dependencies are installed. actionlint validates YAML.
function job(workflow, name) {
  const match = workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [\\w-]+:|$(?![\\s\\S]))`, 'm'));
  assert.ok(match, `missing job ${name}`);
  return match[1];
}

function artifacts(workflow, action) {
  const steps = [...workflow.matchAll(/^      - uses: actions\/(upload|download)-artifact@v4\n        with:\n((?:          .*\n)+)/gm)];
  return steps.filter(([, kind]) => kind === action).map(([, , options]) => {
    const name = options.match(/^          name: (\S+)\s*$/m)?.[1];
    assert.ok(name, 'every package artifact must have an explicit name');
    return name;
  });
}

test('release uploads and called CI uploads have unique names in the shared run', () => {
  const uploads = [...artifacts(ci, 'upload'), ...artifacts(release, 'upload')];
  assert.equal(uploads.length, 6, 'both workflows must upload all three package formats');
  assert.equal(new Set(uploads).size, uploads.length, 'upload-artifact v4 cannot share names between jobs');
});

test('package tests and publishing download their own matching producer artifacts', () => {
  for (const [source, producers] of [
    [ci, [['deb-build', 'deb-test'], ['rpm-build', 'rpm-test'], ['arch-build', 'arch-test']]],
    [release, [['debs', 'deb-test'], ['rpms', 'rpm-test'], ['arch-packages', 'arch-test']]]
  ]) {
    for (const [producer, consumer] of producers) {
      const uploads = artifacts(job(source, producer), 'upload');
      assert.equal(uploads.length, 1, `${producer} must upload its package pair`);
      assert.deepEqual(artifacts(job(source, consumer), 'download'), uploads,
                       `${consumer} must use its own producer's packages`);
    }
  }
  assert.deepEqual(artifacts(job(release, 'publish'), 'download').sort(),
                   artifacts(release, 'upload').sort());
});

test('tags run the complete reusable application CI from the same commit', () => {
  assert.match(ci, /^  workflow_call:\s*$/m);
  const tests = job(release, 'application-tests');
  assert.match(tests, /^    uses: \.\/\.github\/workflows\/ci\.yml\s*$/m);
  assert.doesNotMatch(tests, /^    if:|continue-on-error:/m);
  for (const required of ['windows', 'daemon', 'app', 'contracts']) {
    assert.doesNotMatch(job(ci, required), /^    if:|continue-on-error:/m);
  }
  assert.match(job(ci, 'daemon'), /cargo test --workspace/);
  assert.match(job(ci, 'app'), /npm test/);
  assert.match(job(ci, 'app'), /xvfb-run -a cargo test --bin fang/);
  assert.match(job(ci, 'windows'), /cargo test --workspace --locked/);
});

test('publishing requires successful application CI and every package gate', () => {
  const publish = job(release, 'publish');
  const needs = publish.match(/^    needs: \[([^\]]+)\]\s*$/m);
  assert.ok(needs, 'publish needs must enumerate all gates');
  assert.deepEqual(needs[1].split(',').map((name) => name.trim()).sort(), [
    'application-tests', 'release-checks', 'debs', 'deb-test', 'rpms', 'rpm-test', 'arch-packages', 'arch-test'
  ].sort());
  // success() rejects failed/cancelled dependencies; the result comparison
  // also explicitly rejects skipped application CI.
  assert.match(publish, /^    if: \$\{\{ success\(\) && needs\.application-tests\.result == 'success' \}\}\s*$/m);
  assert.doesNotMatch(publish, /always\(\)|continue-on-error:/);
});

test('release and application CI enforce the workflow regression', () => {
  for (const checks of [job(ci, 'contracts'), job(release, 'release-checks')]) {
    assert.match(checks, /node --test packaging\/release\/workflow\.test\.mjs/);
  }
});
