#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function releaseNames(version) {
  return [
    'install.sh',
    'SHA256SUMS',
    `Fang_${version}_amd64.deb`,
    `fangd_${version}-1_amd64.deb`,
    `fang-${version}-1.x86_64.rpm`,
    `fangd-${version}-1.x86_64.rpm`,
    `fang-${version}-1-x86_64.pkg.tar.zst`,
    `fangd-${version}-1-x86_64.pkg.tar.zst`
  ];
}

export function checksumNames(version) {
  return releaseNames(version).filter((name) => name !== 'SHA256SUMS');
}

function assertExactNames(actual, expected, label = 'inventory') {
  if (actual.length !== new Set(actual).size) {
    throw new Error(`${label} contains duplicate filenames`);
  }
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (
    sortedActual.length !== sortedExpected.length ||
    sortedActual.some((name, index) => name !== sortedExpected[index])
  ) {
    throw new Error(
      `${label} mismatch: expected ${sortedExpected.join(', ')}, got ${sortedActual.join(', ')}`
    );
  }
}

export function validateManifest(text, expectedNames) {
  if (!text.endsWith('\n') || text.endsWith('\n\n')) {
    throw new Error('checksum manifest must have exactly one final newline');
  }
  const names = text
    .slice(0, -1)
    .split('\n')
    .map((line) => {
      const match = line.match(/^([a-f0-9]{64})  ([^/]+)$/);
      if (!match) throw new Error(`malformed checksum line: ${line}`);
      return match[2];
    });
  assertExactNames(names, expectedNames, 'checksum manifest');
}

function commandFields(command, args) {
  return commandValue(command, args).split('\n');
}

function commandRaw(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' });
}

function commandValue(command, args) {
  return commandRaw(command, args).trimEnd();
}

export function inspectDeb(file, runCommand = commandValue) {
  const field = (name) => runCommand('dpkg-deb', ['-f', file, name]);
  return {
    name: field('Package'),
    version: field('Version'),
    arch: field('Architecture')
  };
}

const inspectDebDefault = inspectDeb;

export function parsePacmanPkgInfo(text) {
  const scalars = new Map();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([a-z][a-z0-9_]*) = ([\x20-\x7e]*)$/);
    if (!match) throw new Error(`malformed Pacman metadata line: ${line}`);
    const [, key, value] = match;
    if (['pkgname', 'pkgver', 'arch'].includes(key)) {
      if (value !== value.trim()) throw new Error(`malformed Pacman metadata line: ${line}`);
      if (scalars.has(key)) throw new Error(`duplicate Pacman metadata field: ${key}`);
      scalars.set(key, value);
    }
  }
  for (const key of ['pkgname', 'pkgver', 'arch']) {
    if (!scalars.has(key)) throw new Error(`missing Pacman metadata field: ${key}`);
  }
  return {
    name: scalars.get('pkgname'),
    version: scalars.get('pkgver'),
    arch: scalars.get('arch')
  };
}

export function inspectPacman(file, runCommand = commandValue) {
  const members = runCommand('bsdtar', ['-tf', file]).split('\n');
  if (members.filter((name) => name === '.PKGINFO').length !== 1) {
    throw new Error(`${path.basename(file)} must contain exactly one .PKGINFO member`);
  }
  const extract = runCommand === commandValue ? commandRaw : runCommand;
  return parsePacmanPkgInfo(extract('bsdtar', ['-xOf', file, '.PKGINFO']));
}

const inspectPacmanDefault = inspectPacman;

function inspectRpmDefault(file) {
  const [name, epoch, version, release, arch] = commandFields('rpm', [
    '-qp',
    '--queryformat',
    '%{NAME}\n%{EPOCH}\n%{VERSION}\n%{RELEASE}\n%{ARCH}\n',
    file
  ]);
  return { name, epoch, version, release, arch };
}

function assertMetadata(actual, expected, file) {
  for (const [field, value] of Object.entries(expected)) {
    const accepted =
      field === 'epoch' && value === '0'
        ? actual[field] === '0' || actual[field] === '(none)' || actual[field] === ''
        : actual[field] === value;
    if (!accepted) {
      throw new Error(
        `${path.basename(file)} metadata ${field}: expected ${value}, got ${actual[field]}`
      );
    }
  }
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

export function stageRelease({
  version,
  debDir,
  rpmDir,
  archDir,
  outputDir,
  installer,
  inspectDeb = inspectDebDefault,
  inspectRpm = inspectRpmDefault,
  inspectPacman = inspectPacmanDefault
}) {
  const names = releaseNames(version);
  const packageNames = names.slice(2);
  const expectedDebs = packageNames.filter((name) => name.endsWith('.deb'));
  const expectedRpms = packageNames.filter((name) => name.endsWith('.rpm'));
  const expectedPacman = packageNames.filter((name) => name.endsWith('.pkg.tar.zst'));
  assertExactNames(
    fs.readdirSync(debDir).filter((name) => name.endsWith('.deb')),
    expectedDebs,
    'DEB artifact directory'
  );
  assertExactNames(
    fs.readdirSync(rpmDir).filter((name) => name.endsWith('.rpm')),
    expectedRpms,
    'RPM artifact directory'
  );
  assertExactNames(
    fs.readdirSync(archDir).filter((name) => name.endsWith('.pkg.tar.zst')),
    expectedPacman,
    'Pacman artifact directory'
  );

  const fangDeb = path.join(debDir, expectedDebs[0]);
  const fangdDeb = path.join(debDir, expectedDebs[1]);
  const fangRpm = path.join(rpmDir, expectedRpms[0]);
  const fangdRpm = path.join(rpmDir, expectedRpms[1]);
  const fangPacman = path.join(archDir, expectedPacman[0]);
  const fangdPacman = path.join(archDir, expectedPacman[1]);
  assertMetadata(inspectDeb(fangDeb), { name: 'fang', version, arch: 'amd64' }, fangDeb);
  assertMetadata(
    inspectDeb(fangdDeb),
    { name: 'fangd', version: `${version}-1`, arch: 'amd64' },
    fangdDeb
  );
  assertMetadata(
    inspectRpm(fangRpm),
    { name: 'fang', epoch: '0', version, release: '1', arch: 'x86_64' },
    fangRpm
  );
  assertMetadata(
    inspectRpm(fangdRpm),
    { name: 'fangd', epoch: '0', version, release: '1', arch: 'x86_64' },
    fangdRpm
  );
  assertMetadata(
    inspectPacman(fangPacman),
    { name: 'fang', version: `${version}-1`, arch: 'x86_64' },
    fangPacman
  );
  assertMetadata(
    inspectPacman(fangdPacman),
    { name: 'fangd', version: `${version}-1`, arch: 'x86_64' },
    fangdPacman
  );
  if (!fs.statSync(installer).isFile()) throw new Error('installer is not a regular file');

  if (fs.existsSync(outputDir)) {
    throw new Error(`release output already exists: ${outputDir}`);
  }
  fs.mkdirSync(outputDir, { recursive: false, mode: 0o700 });
  const sources = new Map([
    ['install.sh', installer],
    [path.basename(fangDeb), fangDeb],
    [path.basename(fangdDeb), fangdDeb],
    [path.basename(fangRpm), fangRpm],
    [path.basename(fangdRpm), fangdRpm],
    [path.basename(fangPacman), fangPacman],
    [path.basename(fangdPacman), fangdPacman]
  ]);
  for (const name of checksumNames(version)) {
    fs.copyFileSync(sources.get(name), path.join(outputDir, name));
  }
  const manifest = checksumNames(version)
    .map((name) => `${sha256(path.join(outputDir, name))}  ${name}\n`)
    .join('');
  validateManifest(manifest, checksumNames(version));
  fs.writeFileSync(path.join(outputDir, 'SHA256SUMS'), manifest, { mode: 0o600 });
  assertExactNames(fs.readdirSync(outputDir), names, 'staged release');
}

function main(args) {
  if (args.length !== 7 || args[0] !== 'stage') {
    throw new Error(
      'usage: release-contract.mjs stage VERSION DEB_DIR RPM_DIR ARCH_DIR OUTPUT_DIR INSTALLER'
    );
  }
  const [, version, debDir, rpmDir, archDir, outputDir, installer] = args;
  stageRelease({ version, debDir, rpmDir, archDir, outputDir, installer });
  console.log(`Staged immutable VFang v${version} release in ${outputDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
