import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  checksumNames,
  inspectDeb,
  inspectPacman,
  parsePacmanPkgInfo,
  releaseNames,
  stageRelease,
  validateManifest
} from './release-contract.mjs';

const repositoryRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const sourceInstaller = path.join(repositoryRoot, 'packaging/install-from-source.sh');
const read = (name) => fs.readFileSync(path.join(repositoryRoot, name), 'utf8');

function runSourceFamilyGuard(osRelease) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fang-source-installer-test-'));
  const osReleasePath = path.join(fixtureRoot, 'os-release');
  fs.writeFileSync(osReleasePath, osRelease);
  try {
    return spawnSync(
      'bash',
      [
        '-c',
        'source "$1"; source_installer_require_debian_family "$2"',
        'fang-source-installer-test',
        sourceInstaller,
        osReleasePath
      ],
      { encoding: 'utf8' }
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true });
  }
}

test('0.9.9 owns eight exact assets and seven checksum entries', () => {
  assert.deepEqual(releaseNames('0.9.9'), [
    'install.sh',
    'SHA256SUMS',
    'Fang_0.9.9_amd64.deb',
    'fangd_0.9.9-1_amd64.deb',
    'fang-0.9.9-1.x86_64.rpm',
    'fangd-0.9.9-1.x86_64.rpm',
    'fang-0.9.9-1-x86_64.pkg.tar.zst',
    'fangd-0.9.9-1-x86_64.pkg.tar.zst'
  ]);
  assert.equal(checksumNames('0.9.9').length, 7);
});

test('0.9.7 rebrand preserves its historical branding', () => {
  assert.match(read('packaging/install-from-source.sh'), /building the VFang app/);
  assert.match(read('packaging/install-from-source.sh'), /Launch 'VFang'/);
  assert.match(read('packaging/install-from-source.sh'), /Fang_\$\{VERSION\}_amd64\.deb/);
  assert.match(read('packaging/release/release-contract.mjs'), /Staged immutable VFang/);
});

test('manifest rejects missing, duplicate, malformed, path, and extra entries', () => {
  const expected = checksumNames('0.9.4');
  const valid = expected.map((name) => `${'a'.repeat(64)}  ${name}\n`).join('');
  assert.doesNotThrow(() => validateManifest(valid, expected));

  for (const malformed of [
    valid.replace(/^.*\n/, ''),
    valid + valid.split('\n')[0] + '\n',
    valid.replace(/[a-f0-9]{64}/, 'BAD'),
    valid.replace('install.sh', '../install.sh'),
    valid + `${'b'.repeat(64)}  seventh.asset\n`,
    valid.slice(0, -1)
  ]) {
    assert.throws(() => validateManifest(malformed, expected));
  }
});

test('DEB metadata inspection queries every field independently', () => {
  const calls = [];
  const values = new Map([
    ['Package', 'fang'],
    ['Version', '0.9.4'],
    ['Architecture', 'amd64']
  ]);

  const metadata = inspectDeb('Fang_0.9.4_amd64.deb', (command, args) => {
    calls.push([command, args]);
    return values.get(args.at(-1));
  });

  assert.deepEqual(metadata, { name: 'fang', version: '0.9.4', arch: 'amd64' });
  assert.deepEqual(calls, [
    ['dpkg-deb', ['-f', 'Fang_0.9.4_amd64.deb', 'Package']],
    ['dpkg-deb', ['-f', 'Fang_0.9.4_amd64.deb', 'Version']],
    ['dpkg-deb', ['-f', 'Fang_0.9.4_amd64.deb', 'Architecture']]
  ]);
});

test('Pacman metadata parser accepts the required scalar fields', () => {
  assert.deepEqual(
    parsePacmanPkgInfo('pkgname = fang\npkgver = 0.9.9-1\narch = x86_64\n'),
    { name: 'fang', version: '0.9.9-1', arch: 'x86_64' }
  );
});

test('Pacman metadata inspector requires exactly one .PKGINFO member', () => {
  for (const members of ['usr/bin/fang\n', '.PKGINFO\n.PKGINFO\n']) {
    assert.throws(
      () => inspectPacman('fang-0.9.9-1-x86_64.pkg.tar.zst', (_command, args) => {
        assert.deepEqual(args, ['-tf', 'fang-0.9.9-1-x86_64.pkg.tar.zst']);
        return members;
      }),
      /must contain exactly one \.PKGINFO member/
    );
  }
});

test('Pacman metadata inspector extracts the sole raw .PKGINFO member', () => {
  const calls = [];
  const runCommand = (command, args) => {
    calls.push([command, args]);
    if (args[0] === '-tf') return '.PKGINFO\nusr/bin/fang\n';
    return 'pkgname = fang\npkgver = 0.9.9-1\narch = x86_64\n';
  };
  const metadata = inspectPacman('fang-0.9.9-1-x86_64.pkg.tar.zst', runCommand);
  assert.deepEqual(metadata, { name: 'fang', version: '0.9.9-1', arch: 'x86_64' });
  assert.deepEqual(calls, [
    ['bsdtar', ['-tf', 'fang-0.9.9-1-x86_64.pkg.tar.zst']],
    ['bsdtar', ['-xOf', 'fang-0.9.9-1-x86_64.pkg.tar.zst', '.PKGINFO']]
  ]);
});

test('Pacman metadata inspector preserves raw trailing bytes from its default command path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fang-pacman-inspect-'));
  const bin = path.join(root, 'bin');
  const bsdtar = path.join(bin, 'bsdtar');
  const originalPath = process.env.PATH;
  const originalPkgInfo = process.env.FANG_TEST_PKGINFO;
  fs.mkdirSync(bin);
  fs.writeFileSync(
    bsdtar,
    `#!/usr/bin/env bash
case "$1" in
  -tf) printf '.PKGINFO\\n' ;;
  -xOf) printf '%s' "$FANG_TEST_PKGINFO" ;;
esac
`,
    { mode: 0o755 }
  );
  process.env.PATH = `${bin}:${originalPath}`;
  try {
    for (const metadata of [
      'pkgname = fang\npkgver = 0.9.9-1\narch = x86_64 \n',
      'pkgname = fang\npkgver = 0.9.9-1\narch = x86_64\r'
    ]) {
      process.env.FANG_TEST_PKGINFO = metadata;
      assert.throws(
        () => inspectPacman('fang-0.9.9-1-x86_64.pkg.tar.zst'),
        /malformed Pacman metadata line/
      );
    }
  } finally {
    process.env.PATH = originalPath;
    if (originalPkgInfo === undefined) delete process.env.FANG_TEST_PKGINFO;
    else process.env.FANG_TEST_PKGINFO = originalPkgInfo;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Pacman metadata parser rejects duplicate and missing scalar fields', () => {
  assert.throws(
    () => parsePacmanPkgInfo('pkgname = fang\npkgname = fangd\npkgver = 0.9.9-1\narch = x86_64\n'),
    /duplicate Pacman metadata field: pkgname/
  );
  assert.throws(
    () => parsePacmanPkgInfo('pkgname = fang\npkgver = 0.9.9-1\n'),
    /missing Pacman metadata field: arch/
  );
});

test('Pacman metadata parser rejects control bytes and malformed lines', () => {
  for (const text of [
    'pkgname = fang\npkgver = 0.9.9-1\narch = x86_64\x01\n',
    'pkgname=fang\npkgver = 0.9.9-1\narch = x86_64\n',
    'Pkgname = fang\npkgver = 0.9.9-1\narch = x86_64\n'
  ]) {
    assert.throws(() => parsePacmanPkgInfo(text), /malformed Pacman metadata line/);
  }
});

test('stageRelease creates a deterministic eight-asset directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fang-release-contract-'));
  const fixtureVersion = '0.9.9';
  const debDir = path.join(root, 'deb');
  const rpmDir = path.join(root, 'rpm');
  const archDir = path.join(root, 'arch');
  const outputDir = path.join(root, 'out');
  fs.mkdirSync(debDir);
  fs.mkdirSync(rpmDir);
  fs.mkdirSync(archDir);
  const installer = path.join(root, 'install.sh');
  fs.writeFileSync(installer, '#!/usr/bin/env bash\n');

  for (const name of releaseNames(fixtureVersion).slice(2)) {
    const dir = name.endsWith('.deb') ? debDir : name.endsWith('.rpm') ? rpmDir : archDir;
    fs.writeFileSync(path.join(dir, name), name);
  }

  stageRelease({
    version: fixtureVersion,
    debDir,
    rpmDir,
    archDir,
    outputDir,
    installer,
    inspectDeb(file) {
      return path.basename(file).startsWith('Fang_')
        ? { name: 'fang', version: fixtureVersion, arch: 'amd64' }
        : { name: 'fangd', version: `${fixtureVersion}-1`, arch: 'amd64' };
    },
    inspectRpm(file) {
      return path.basename(file).startsWith('fang-')
        ? { name: 'fang', epoch: '0', version: fixtureVersion, release: '1', arch: 'x86_64' }
        : { name: 'fangd', epoch: '(none)', version: fixtureVersion, release: '1', arch: 'x86_64' };
    },
    inspectPacman(file) {
      return path.basename(file).startsWith('fang-')
        ? { name: 'fang', version: `${fixtureVersion}-1`, arch: 'x86_64' }
        : { name: 'fangd', version: `${fixtureVersion}-1`, arch: 'x86_64' };
    }
  });

  assert.deepEqual(fs.readdirSync(outputDir).sort(), releaseNames(fixtureVersion).sort());
  const manifest = fs.readFileSync(path.join(outputDir, 'SHA256SUMS'), 'utf8');
  validateManifest(manifest, checksumNames(fixtureVersion));
  assert.deepEqual(
    manifest.trimEnd().split('\n').map((line) => line.slice(66)),
    checksumNames(fixtureVersion)
  );
  fs.rmSync(root, { recursive: true });
});

test('stageRelease rejects package metadata mismatches before staging', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fang-release-contract-bad-'));
  const fixtureVersion = '0.9.9';
  const debDir = path.join(root, 'deb');
  const rpmDir = path.join(root, 'rpm');
  const archDir = path.join(root, 'arch');
  const outputDir = path.join(root, 'out');
  fs.mkdirSync(debDir);
  fs.mkdirSync(rpmDir);
  fs.mkdirSync(archDir);
  const installer = path.join(root, 'install.sh');
  fs.writeFileSync(installer, '#!/usr/bin/env bash\n');
  for (const name of releaseNames(fixtureVersion).slice(2)) {
    const dir = name.endsWith('.deb') ? debDir : name.endsWith('.rpm') ? rpmDir : archDir;
    fs.writeFileSync(path.join(dir, name), name);
  }

  for (const inspectPacman of [
    () => ({ name: 'wrong', version: `${fixtureVersion}-1`, arch: 'x86_64' }),
    () => ({ name: 'fang', version: 'wrong', arch: 'x86_64' }),
    () => ({ name: 'fang', version: `${fixtureVersion}-1`, arch: 'wrong' })
  ]) {
    assert.throws(
      () =>
      stageRelease({
        version: fixtureVersion,
        debDir,
        rpmDir,
        archDir,
        outputDir,
        installer,
        inspectDeb: (file) =>
          path.basename(file).startsWith('Fang_')
            ? { name: 'fang', version: fixtureVersion, arch: 'amd64' }
            : { name: 'fangd', version: `${fixtureVersion}-1`, arch: 'amd64' },
        inspectRpm: (file) =>
          path.basename(file).startsWith('fang-')
            ? { name: 'fang', epoch: '0', version: fixtureVersion, release: '1', arch: 'x86_64' }
            : {
                name: 'fangd',
                epoch: '0',
                version: fixtureVersion,
                release: '1',
                arch: 'x86_64'
              },
        inspectPacman
      }),
      /metadata/
    );
  }
  assert.equal(fs.existsSync(outputDir), false);
  fs.rmSync(root, { recursive: true });
});

test('stage CLI accepts the Arch directory before the output directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fang-release-cli-'));
  const version = '0.9.9';
  const debDir = path.join(root, 'deb');
  const rpmDir = path.join(root, 'rpm');
  const archDir = path.join(root, 'arch');
  const outputDir = path.join(root, 'out');
  const installer = path.join(root, 'install.sh');
  fs.mkdirSync(debDir);
  fs.mkdirSync(rpmDir);
  fs.mkdirSync(archDir);
  fs.writeFileSync(installer, '#!/usr/bin/env bash\n');
  const result = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, 'packaging/release/release-contract.mjs'),
      'stage',
      version,
      debDir,
      rpmDir,
      archDir,
      outputDir,
      installer
    ],
    { encoding: 'utf8' }
  );
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /usage:/);
  assert.match(result.stderr, /DEB artifact directory mismatch/);
  fs.rmSync(root, { recursive: true });
});

test('source installer accepts valid direct and derived Debian-family os-release quoting', () => {
  for (const osRelease of [
    "ID='ubuntu'\n",
    'ID="debian"\n',
    "ID='zorin'\nID_LIKE='ubuntu debian'\n"
  ]) {
    const result = runSourceFamilyGuard(osRelease);
    assert.equal(result.status, 0, osRelease + result.stdout + result.stderr);
  }
});

test('source installer rejects malformed, duplicate, and unsupported family data', () => {
  const marker = path.join(os.tmpdir(), `fang-source-installer-injection-${process.pid}`);
  fs.rmSync(marker, { force: true });
  for (const osRelease of [
    'ID="ubuntu\n',
    'ID=ubuntu\nID=debian\n',
    'ID=notubuntu\n',
    `ID="$(touch ${marker})"\n`
  ]) {
    const result = runSourceFamilyGuard(osRelease);
    assert.notEqual(result.status, 0, osRelease);
  }
  assert.equal(fs.existsSync(marker), false);
});

test('documentation exposes release, review, integrity, manual, and source install paths', () => {
  const readme = fs.readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');
  const contributing = fs.readFileSync(path.join(repositoryRoot, 'CONTRIBUTING.md'), 'utf8');
  const hardware = fs.readFileSync(path.join(repositoryRoot, 'HARDWARE_TESTING.md'), 'utf8');

  assert.equal(fs.existsSync(path.join(repositoryRoot, 'packaging/install.sh')), false);
  assert.ok(fs.statSync(sourceInstaller).mode & 0o111);
  assert.match(readme, /## Install — one command/);
  assert.match(
    readme,
    /Open \*\*Terminal\*\*, paste this one line, and press \*\*Enter\*\*:/
  );
  assert.match(readme, /open \*\*VFang\*\* from your app menu/i);
  assert.match(
    readme,
    /curl -fsSL https:\/\/github\.com\/bladeandsoulx\/vfang-razer-linux\/releases\/latest\/download\/install\.sh \| bash/
  );
  assert.match(readme, /curl -fLO .*releases\/latest\/download\/install\.sh/);
  assert.match(readme, /less install\.sh\nbash install\.sh/);
  assert.match(readme, /releases\/download\/v0\.9\.8\/\{install\.sh,SHA256SUMS\}/);
  assert.match(
    readme,
    /sudo apt install \.\/fangd_0\.9\.8-1_amd64\.deb \.\/Fang_0\.9\.8_amd64\.deb/
  );
  assert.match(
    readme,
    /sudo dnf install \.\/fangd-0\.9\.8-1\.x86_64\.rpm \.\/fang-0\.9\.8-1\.x86_64\.rpm/
  );
  assert.match(readme, /sha256sum --check .*install\.sh/);
  assert.match(readme, /^- Ubuntu 22\.04, 24\.04, and 26\.04$/m);
  assert.match(readme, /^- Debian 12 and 13$/m);
  assert.match(readme, /^- Fedora 43 and 44$/m);
  assert.match(readme, /do not add `sudo`/);
  assert.match(readme, /refuses downgrades/i);
  assert.match(readme, /Install release packages manually/);
  assert.match(readme, /packaging\/install-from-source\.sh/);
  assert.match(contributing, /IMMUTABLE_RELEASES_TOKEN/);
  for (const [name, content] of [
    ['README.md', readme],
    ['CONTRIBUTING.md', contributing],
    ['HARDWARE_TESTING.md', hardware]
  ]) {
    assert.match(content, /\bVFang\b/, name);
    assert.doesNotMatch(content, /\bFang\b/, name);
  }
  assert.match(readme, /Fang_0\.9\.8_amd64\.deb/);
  assert.match(readme, /bladeandsoulx\/vfang-razer-linux/);
  assert.match(contributing, /read-only.*Administration|Administration.*read-only/is);
  assert.match(hardware, /packaging\/install-from-source\.sh/);
});

// core.fileMode is false here, so a lost exec bit is invisible locally: the file
// stays 775 on disk while the tree records 100644, and only a fresh checkout -
// CI - fails, with a bare "Permission denied" from whichever workflow step runs
// the script directly. Assert the recorded mode so it fails for whoever drops it.
test('every tracked shell script is recorded executable', () => {
  const listed = spawnSync('git', ['ls-files', '-s', '-z', '--', '*.sh'], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  });
  assert.equal(listed.status, 0, listed.stderr);

  const entries = listed.stdout
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const [meta, file] = record.split('\t');
      return { file, mode: meta.split(' ')[0] };
    });

  assert.ok(entries.length >= 7, `expected the packaging scripts, saw ${entries.length}`);
  assert.deepEqual(
    entries.filter(({ mode }) => mode !== '100755'),
    [],
    'these scripts are not recorded executable; fix with git update-index --chmod=+x'
  );
});
