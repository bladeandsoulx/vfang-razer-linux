import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const panel = fs.readFileSync(path.join(root, 'app/src/screens/Changelog.svelte'), 'utf8');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');

test('the in-app changelog contains the latest releases in descending order', () => {
  const v097 = panel.indexOf("version: '0.9.7'");
  const v096 = panel.indexOf("version: '0.9.6'");
  const v095 = panel.indexOf("version: '0.9.5'");
  const v094 = panel.indexOf("version: '0.9.4'");
  const v093 = panel.indexOf("version: '0.9.3'");
  const v092 = panel.indexOf("version: '0.9.2'");

  assert.ok(v097 >= 0, 'v0.9.7 must be present');
  assert.ok(v096 > v097, 'v0.9.6 must follow v0.9.7');
  assert.ok(v095 > v096, 'v0.9.5 must follow v0.9.6');
  assert.ok(v094 > v095, 'v0.9.4 must follow v0.9.5');
  assert.ok(v093 > v094, 'v0.9.3 must follow v0.9.4');
  assert.ok(v092 > v093, 'v0.9.2 must follow v0.9.3');
});

test('v0.9.7 records the VFang rebrand and Fedora detection repair', () => {
  const v097Start = panel.indexOf("version: '0.9.7'");
  const v096Start = panel.indexOf("version: '0.9.6'");
  const v097Panel = panel.slice(v097Start, v096Start);
  const v097Changelog = changelog.slice(
    changelog.indexOf('## [0.9.7]'),
    changelog.indexOf('## [0.9.6]')
  );

  assert.ok(v097Start >= 0, 'v0.9.7 must be present');
  assert.ok(v096Start > v097Start, 'v0.9.6 must follow v0.9.7');
  assert.match(v097Panel, /Fedora 43 and 44 again/i);
  assert.match(v097Panel, /real system identity/i);
  assert.match(v097Panel, /user-facing product is renamed to VFang/i);
  assert.match(v097Changelog, /user-facing product is renamed to VFang/i);
  assert.doesNotMatch(v097Panel, /\bFang\b/);
  assert.doesNotMatch(v097Changelog, /\bFang\b/);
  assert.match(v097Changelog, /## \[0\.9\.7\].*Fedora detection repair/);
  assert.match(v097Changelog, /CPE_NAME/);
  assert.match(v097Changelog, /PLATFORM_ID/);
  assert.match(v097Changelog, /VERSION_CODENAME/);
});

test('v0.9.6 records the Ubuntu 26.04 release', () => {
  const v096Start = panel.indexOf("version: '0.9.6'");
  const v095Start = panel.indexOf("version: '0.9.5'");
  const v096Panel = panel.slice(v096Start, v095Start);
  const v096Changelog = changelog.slice(
    changelog.indexOf('## [0.9.6]'),
    changelog.indexOf('## [0.9.5]')
  );

  assert.ok(v096Start >= 0, 'v0.9.6 must be present');
  assert.ok(v095Start > v096Start, 'v0.9.5 must follow v0.9.6');
  assert.match(v096Panel, /Ubuntu 26\.04 LTS is a supported installation base/i);
  assert.match(v096Panel, /Debian and Ubuntu only/i);
  assert.match(v096Changelog, /## \[0\.9\.6\].*Ubuntu 26\.04 LTS/);
  assert.match(v096Changelog, /compatible-family path/i);
  assert.match(v096Changelog, /apt-get/);
});

test('v0.9.5 records the focused Neon Fang release', () => {
  const v095Start = panel.indexOf("version: '0.9.5'");
  const v094Start = panel.indexOf("version: '0.9.4'");
  const v095Panel = panel.slice(v095Start, v094Start);
  const v095Changelog = changelog.slice(
    changelog.indexOf('## [0.9.5]'),
    changelog.indexOf('## [0.9.4]')
  );

  assert.ok(v095Start >= 0, 'v0.9.5 must be present');
  assert.ok(v094Start > v095Start, 'v0.9.4 must follow v0.9.5');
  assert.match(v095Panel, /Neon Fang terminal banner/i);
  assert.match(v095Panel, /shorter and more beginner-friendly/i);
  assert.match(v095Panel, /historical release notes/i);
  assert.match(v095Changelog, /## \[0\.9\.5\].*Neon Fang installer/);
  assert.match(v095Changelog, /Neon Fang terminal banner/i);
  assert.match(v095Changelog, /historical release notes/i);
});

test('v0.9.4 records its immutable release details', () => {
  const v094Start = panel.indexOf("version: '0.9.4'");
  const v093Start = panel.indexOf("version: '0.9.3'");
  const v094Panel = panel.slice(v094Start, v093Start);
  const v094Changelog = changelog.slice(
    changelog.indexOf('## [0.9.4]'),
    changelog.indexOf('## [0.9.3]')
  );

  assert.ok(v094Start >= 0, 'v0.9.4 must be present');
  assert.ok(v093Start > v094Start, 'v0.9.3 must follow v0.9.4');
  assert.match(v094Panel, /release-locked one-command installer/i);
  assert.match(v094Panel, /BNB Smart Chain \(BEP20\).*Ethereum \(ERC20\)/);
  assert.match(
    v094Panel,
    /immutable six-asset set containing the installer, checksum manifest, two DEBs and two RPMs/i
  );
  assert.match(v094Panel, /generic crypto-transfer warning.*were removed/i);
  assert.match(
    v094Changelog,
    /## \[0\.9\.4\][\s\S]*?### Removed[\s\S]*?generic crypto-transfer warning/i
  );
});
