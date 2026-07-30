# VFang User-Facing Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present release 0.9.7 as VFang everywhere users encounter the current product while preserving every existing package, executable, service, IPC, repository, and release-asset identity.

**Architecture:** Treat the rename as a presentation layer over the stable `fang`/`fangd` technical contract. Update the app, native shell, installers, packaging metadata, and current documentation in three independently testable slices; use a custom Tauri DEB desktop template so its launcher can say VFang without changing Tauri's artifact-producing `productName`.

**Tech Stack:** Svelte 5, JavaScript `node:test`, Rust/Tauri 2, Bash, RPM spec and freedesktop desktop metadata, Markdown

## Global Constraints

- The exact prose brand is `VFang`; all-uppercase wordmarks use `VFANG`.
- Release version remains `0.9.7`.
- Tauri `productName` remains `Fang` so the DEB stays `Fang_0.9.7_amd64.deb`.
- Keep packages and executables `fang` and `fangd`.
- Keep `fangd.service`, `/run/fangd.sock`, `/run/fangd.lock`, group `fang`, identifier `dev.fang.app`, `FANG_*` variables, Cargo names, `fang.desktop`, and icon `fang`.
- Keep repository URLs under `bladeandsoulx/fang-razer-linux`.
- Keep the six release asset names unchanged.
- Keep pre-0.9.7 changelog entries and archived plan/spec documents historically accurate.
- Do not change daemon behavior, hardware behavior, protocol, IPC, or package-manager logic.

---

### Task 1: Desktop application and native-shell branding

**Files:**
- Create: `app/src/lib/branding-content.test.js`
- Modify: `app/index.html:6`
- Modify: `app/src/App.svelte:42,83`
- Modify: `app/src/screens/Settings.svelte:66,90,168-173,206-217`
- Modify: `app/src/screens/Support.svelte:103-184`
- Modify: `app/src/screens/Disconnected.svelte:7`
- Modify: `app/src/screens/Lighting.svelte:206`
- Modify: `app/src/main.js:11`
- Modify: `app/src/lib/updater.js:10`
- Modify: `app/src/lib/updater.test.js:45`
- Modify: `app/src-tauri/tauri.conf.json:15`
- Modify: `app/src-tauri/Cargo.toml:3`
- Modify: `app/src-tauri/src/client.rs:47-51`
- Modify: `app/src-tauri/src/main.rs:317-345,462`

**Interfaces:**
- Consumes: the stable Tauri configuration keys `productName` and `identifier`, plus the existing Svelte and native application strings.
- Produces: visible app brand `VFang`, navigation wordmark `VFANG`, and a regression test automatically discovered by `npm test`.

- [ ] **Step 1: Write the failing branding contract**

Create `app/src/lib/branding-content.test.js`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('current desktop application surfaces present VFang', () => {
  const currentUi = [
    'app/index.html',
    'app/src/App.svelte',
    'app/src/screens/Settings.svelte',
    'app/src/screens/Support.svelte',
    'app/src/screens/Disconnected.svelte',
    'app/src/screens/Lighting.svelte'
  ];

  assert.match(read('app/index.html'), /<title>VFang<\/title>/);
  assert.match(read('app/src/App.svelte'), /<span class="word">VFANG<\/span>/);
  for (const file of currentUi) {
    assert.doesNotMatch(read(file), /\bFang\b/, file);
  }

  const main = read('app/src-tauri/src/main.rs');
  for (const phrase of [
    'VFang is already running',
    'VFang is already open',
    'Open VFang',
    'Quit VFang',
    '.tooltip("VFang")',
    'error while running VFang'
  ]) {
    assert.ok(main.includes(phrase), phrase);
  }

  const client = read('app/src-tauri/src/client.rs');
  assert.match(client, /update\/restart both VFang packages/);
  assert.match(client, /incompatible VFang API/);
  assert.match(read('app/src-tauri/Cargo.toml'), /^description = "VFang —/m);
  assert.match(read('app/src/main.js'), /VFang application root is missing/);
  assert.match(read('app/src/lib/updater.js'), /invalid VFang version/);
});

test('desktop rebrand leaves Tauri and executable identity stable', () => {
  const config = JSON.parse(read('app/src-tauri/tauri.conf.json'));
  assert.equal(config.productName, 'Fang');
  assert.equal(config.identifier, 'dev.fang.app');
  assert.equal(config.app.windows[0].title, 'VFang');

  const manifest = read('app/src-tauri/Cargo.toml');
  assert.match(manifest, /^name = "fang"$/m);
  assert.match(manifest, /fang-protocol =/);
});
```

- [ ] **Step 2: Run the new test and verify the red state**

Run:

```bash
npm --prefix app test
```

Expected: FAIL in `current desktop application surfaces present VFang`, first reporting `<title>Fang</title>` instead of `<title>VFang</title>`.

- [ ] **Step 3: Apply the minimal visible-string changes**

Use these exact mappings in current UI and native output:

| Existing text | Replacement |
|---|---|
| `FANG` navigation wordmark | `VFANG` |
| `Fang` in current Svelte and HTML copy | `VFang` |
| `Fang is already running` | `VFang is already running` |
| `Fang is already open` | `VFang is already open` |
| `Open Fang` / `Quit Fang` | `Open VFang` / `Quit VFang` |
| tray tooltip `Fang` | `VFang` |
| `both Fang packages` | `both VFang packages` |
| `incompatible Fang API` | `incompatible VFang API` |
| `Fang application root is missing` | `VFang application root is missing` |
| `invalid Fang version` | `invalid VFang version` |
| Cargo description prefix `Fang —` | `VFang —` |
| Tauri window title `Fang` | `VFang` |

Keep `productName: "Fang"`, `identifier: "dev.fang.app"`, event names such as
`fang://status`, crate names, commands, service names, and lowercase technical
identifiers unchanged. Update the existing updater test expectation to:

```js
/invalid VFang version/
```

Leave historical `app/src/screens/Changelog.svelte` entries for Task 3.

- [ ] **Step 4: Run app tests and verify the green state**

Run:

```bash
npm --prefix app test
```

Expected: all app JavaScript tests PASS, including `branding-content.test.js`
and the updated updater error assertion.

- [ ] **Step 5: Verify the frontend and native shell still build and test**

Run:

```bash
npm ci --prefix app
npm --prefix app run build
cargo test --manifest-path app/src-tauri/Cargo.toml
```

Expected: Vite build succeeds and all standalone Tauri Rust tests PASS.

- [ ] **Step 6: Commit the desktop application slice**

```bash
git add app/index.html app/src app/src-tauri/tauri.conf.json app/src-tauri/Cargo.toml app/src-tauri/src
git commit -m "feat(app): present the VFang brand"
```

---

### Task 2: Linux packaging, installer, and release-tool branding

**Files:**
- Create: `app/src-tauri/vfang.desktop`
- Modify: `app/src-tauri/tauri.conf.json:49-55`
- Modify: `packaging/rpm/metadata.test.mjs:31-40`
- Modify: `packaging/rpm/fang.desktop:3`
- Modify: `packaging/rpm/fangd.spec:6`
- Modify: `packaging/fangd.service:2`
- Modify: `packaging/installer/installer.test.mjs:660-686`
- Modify: `install.sh:595-662`
- Modify: `packaging/install-from-source.sh:192-207`
- Modify: `packaging/release/release-contract.test.mjs:39-50,204-228`
- Modify: `packaging/release/release-contract.mjs:180`
- Modify: `packaging/release/publish.test.mjs:140-170`
- Modify: `packaging/release/publish.sh:189`
- Modify: `app/scripts/version.test.mjs:44-53`
- Modify: `app/scripts/version.mjs:129-157`

**Interfaces:**
- Consumes: Tauri DEB `desktopTemplate` with Handlebars variables
  `categories`, optional `comment`, `exec`, `icon`, `name`, and optional
  `mime_type`; the existing installer behavioral harness; `releaseNames()`.
- Produces: `Name=VFang` in both DEB and RPM launchers, VFang descriptions and
  command output, while package and artifact contracts remain byte-for-byte
  named as before.

- [ ] **Step 1: Add failing packaging and installer assertions**

Extend `packaging/rpm/metadata.test.mjs`:

```js
test('packaging presents VFang while retaining every technical identity', () => {
  const config = JSON.parse(read('app/src-tauri/tauri.conf.json'));
  assert.equal(config.productName, 'Fang');
  assert.equal(config.identifier, 'dev.fang.app');
  assert.equal(config.bundle.linux.deb.desktopTemplate, 'vfang.desktop');
  assert.deepEqual(config.bundle.linux.deb.depends, [
    'fangd (>= 0.9.7)',
    'fangd (<< 0.10.0)'
  ]);

  const debDesktop = read('app/src-tauri/vfang.desktop');
  assert.match(debDesktop, /^Name=VFang$/m);
  assert.match(debDesktop, /^Exec=\{\{exec\}\}$/m);
  assert.match(debDesktop, /^Icon=\{\{icon\}\}$/m);

  const rpmDesktop = read('packaging/rpm/fang.desktop');
  assert.match(rpmDesktop, /^Name=VFang$/m);
  assert.match(rpmDesktop, /^Exec=fang$/m);
  assert.match(rpmDesktop, /^Icon=fang$/m);

  const appSpec = read('packaging/rpm/fang.spec');
  const daemonSpec = read('packaging/rpm/fangd.spec');
  assert.match(appSpec, /^Name:\s*fang$/m);
  assert.match(daemonSpec, /^Name:\s*fangd$/m);
  assert.match(daemonSpec, /^Summary:.*VFang$/m);
  assert.match(read('packaging/fangd.service'), /^Description=VFang daemon/m);
});
```

Add this behavioral test to `packaging/installer/installer.test.mjs` after the
service/group reconciliation test:

```js
test('successful install presents VFang while downloading stable asset names', () => {
  const fixture = makeFixture({
    osRelease: 'ID=ubuntu\nVERSION_ID="24.04"\nVERSION_CODENAME=noble\n'
  });
  const result = fixture.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(`Downloading VFang ${version.replaceAll('.', '\\.')} packages`));
  assert.match(result.stdout, new RegExp(`Downloaded VFang ${version.replaceAll('.', '\\.')} package pair`));
  assert.match(result.stdout, new RegExp(`Installed VFang ${version.replaceAll('.', '\\.')}`));
  assert.match(fixture.commands(), new RegExp(`Fang_${version.replaceAll('.', '\\.')}_amd64\\.deb`));
  assert.match(fixture.commands(), new RegExp(`fangd_${version.replaceAll('.', '\\.')}-1_amd64\\.deb`));
  fixture.cleanup();
});
```

Add to `packaging/release/release-contract.test.mjs`:

```js
test('0.9.7 rebrand preserves the exact six release assets', () => {
  assert.deepEqual(releaseNames('0.9.7'), [
    'install.sh',
    'SHA256SUMS',
    'Fang_0.9.7_amd64.deb',
    'fangd_0.9.7-1_amd64.deb',
    'fang-0.9.7-1.x86_64.rpm',
    'fangd-0.9.7-1.x86_64.rpm'
  ]);
  assert.match(read('packaging/install-from-source.sh'), /building the VFang app/);
  assert.match(read('packaging/install-from-source.sh'), /Launch 'VFang'/);
  assert.match(read('packaging/install-from-source.sh'), /Fang_\$\{VERSION\}_amd64\.deb/);
  assert.match(read('packaging/release/release-contract.mjs'), /Staged immutable VFang/);
});
```

The release-contract test currently defines local file reads inside individual
tests. Add this module-level helper beside `sourceInstaller`:

```js
const read = (name) => fs.readFileSync(path.join(repositoryRoot, name), 'utf8');
```

Add to `app/scripts/version.test.mjs`:

```js
test('check reports the VFang brand without changing the release version', () => {
  const dir = fixture();
  const result = run(dir, 'check');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(`VFang version sync OK: ${fixtureVersion.replaceAll('.', '\\.')}`));
  fs.rmSync(dir, { recursive: true });
});
```

In the successful publication test in `packaging/release/publish.test.mjs`,
add:

```js
assert.match(result.stdout, new RegExp(`Published immutable VFang v${version.replaceAll('.', '\\.')} release`));
```

- [ ] **Step 2: Run the focused tests and verify the red state**

Run:

```bash
node --test app/scripts/version.test.mjs \
  packaging/installer/installer.test.mjs \
  packaging/release/release-contract.test.mjs \
  packaging/release/publish.test.mjs \
  packaging/rpm/metadata.test.mjs
```

Expected: FAIL on missing `vfang.desktop`, RPM `Name=Fang`, installer output
`Downloading Fang`, and current release-tool output using Fang.

- [ ] **Step 3: Add the custom DEB desktop template**

Create `app/src-tauri/vfang.desktop`:

```desktop
[Desktop Entry]
Categories={{categories}}
{{#if comment}}
Comment={{comment}}
{{/if}}
Exec={{exec}}
StartupWMClass={{exec}}
Icon={{icon}}
Name=VFang
Terminal=false
Type=Application
{{#if mime_type}}
MimeType={{mime_type}}
{{/if}}
```

Set the DEB configuration in `app/src-tauri/tauri.conf.json` to:

```json
"deb": {
  "depends": [
    "fangd (>= 0.9.7)",
    "fangd (<< 0.10.0)"
  ],
  "desktopTemplate": "vfang.desktop"
}
```

Do not change `productName`, because Tauri derives both the DEB package and
`Fang_0.9.7_amd64.deb` filename from it.

- [ ] **Step 4: Update packaging and command-line presentation**

Apply these exact presentation changes:

```text
packaging/rpm/fang.desktop: Name=VFang
packaging/rpm/fangd.spec: Summary: Privileged hardware-control daemon for VFang
packaging/fangd.service: Description=VFang daemon — performance and fan control for Razer Blade laptops
install.sh: launch/install/already-installed/architecture/download messages use VFang
packaging/install-from-source.sh: build and launch messages use VFang
packaging/release/release-contract.mjs: Staged immutable VFang
packaging/release/publish.sh: Published immutable VFang
app/scripts/version.mjs: VFang release versions / VFang RPM / VFang version sync OK
```

Keep `Fang_${VERSION}_amd64.deb`, `DEB_FANG`, `RPM_FANG`, package transaction
commands, service/group names, repository slug, and environment variable names
unchanged.

- [ ] **Step 5: Run focused tests and shell lint**

Run:

```bash
node --test app/scripts/version.test.mjs \
  packaging/installer/installer.test.mjs \
  packaging/release/release-contract.test.mjs \
  packaging/release/publish.test.mjs \
  packaging/rpm/metadata.test.mjs
shellcheck install.sh packaging/install-from-source.sh \
  packaging/release/publish.sh
```

Expected: all focused tests PASS and ShellCheck emits no findings.

- [ ] **Step 6: Build and inspect the real DEB launcher**

Run:

```bash
npm --prefix app run tauri -- build --bundles deb
```

Then inspect without installing:

```bash
test -f app/src-tauri/target/release/bundle/deb/Fang_0.9.7_amd64.deb
dpkg-deb -f app/src-tauri/target/release/bundle/deb/Fang_0.9.7_amd64.deb Package Version Architecture
VFANG_DEB_INSPECT=$(mktemp -d /tmp/vfang-deb-inspect.XXXXXX)
trap 'rm -rf -- "$VFANG_DEB_INSPECT"' EXIT
dpkg-deb -x app/src-tauri/target/release/bundle/deb/Fang_0.9.7_amd64.deb "$VFANG_DEB_INSPECT"
grep -Fx 'Name=VFang' "$VFANG_DEB_INSPECT/usr/share/applications/Fang.desktop"
grep -Fx 'Exec=fang' "$VFANG_DEB_INSPECT/usr/share/applications/Fang.desktop"
grep -Fx 'Icon=fang' "$VFANG_DEB_INSPECT/usr/share/applications/Fang.desktop"
```

Expected: artifact name remains `Fang_0.9.7_amd64.deb`, metadata reports
`fang`, `0.9.7`, `amd64`, and the packaged `Fang.desktop` visibly names VFang
while launching `fang` with icon `fang`.

- [ ] **Step 7: Commit the Linux packaging and tooling slice**

```bash
git add app/scripts app/src-tauri/tauri.conf.json app/src-tauri/vfang.desktop \
  install.sh packaging
git commit -m "feat(packaging): brand release 0.9.7 as VFang"
```

---

### Task 3: Current documentation and v0.9.7 release history

**Files:**
- Modify: `app/src/lib/changelog-content.test.js:24-45`
- Modify: `app/src/screens/Changelog.svelte:4-21`
- Modify: `packaging/release/release-contract.test.mjs:204-228`
- Modify: `README.md:1-211`
- Modify: `CONTRIBUTING.md:1`
- Modify: `HARDWARE_TESTING.md:3-170`
- Modify: `CHANGELOG.md:3-25`

**Interfaces:**
- Consumes: current product prose and the existing boundaries between v0.9.7
  and v0.9.6 in both changelog representations.
- Produces: current documentation consistently naming VFang, with an explicit
  v0.9.7 rebrand record and unchanged pre-0.9.7 history.

- [ ] **Step 1: Extend release-note and documentation tests**

Replace the v0.9.7 changelog test name with
`v0.9.7 records the VFang rebrand and Fedora detection repair`, retain its
existing Fedora assertions, and add:

```js
assert.match(v097Panel, /user-facing product is renamed to VFang/i);
assert.match(v097Changelog, /user-facing product is renamed to VFang/i);
assert.doesNotMatch(v097Panel, /\bFang\b/);
assert.doesNotMatch(v097Changelog, /\bFang\b/);
```

Use the unambiguous release wording `The user-facing product is renamed to
VFang` so both regexes match. Keep the v0.9.5 `Neon Fang` assertions unchanged
to protect historical accuracy.

In the documentation contract test in
`packaging/release/release-contract.test.mjs`, change the launcher assertion to:

```js
assert.match(readme, /open \*\*VFang\*\* from your app menu/i);
```

Then add:

```js
for (const [name, content] of [
  ['README.md', readme],
  ['CONTRIBUTING.md', contributing],
  ['HARDWARE_TESTING.md', hardware]
]) {
  assert.match(content, /\bVFang\b/, name);
  assert.doesNotMatch(content, /\bFang\b/, name);
}
assert.match(readme, /Fang_0\.9\.7_amd64\.deb/);
assert.match(readme, /bladeandsoulx\/fang-razer-linux/);
```

- [ ] **Step 2: Run documentation tests and verify the red state**

Run:

```bash
node --test app/src/lib/changelog-content.test.js \
  packaging/release/release-contract.test.mjs
```

Expected: FAIL because current docs and v0.9.7 notes still say Fang and do not
record the user-facing rename.

- [ ] **Step 3: Update current documentation without rewriting history**

In `README.md`, `CONTRIBUTING.md`, and `HARDWARE_TESTING.md`, replace every
standalone current prose use of `Fang` with `VFang`, including headings,
screenshot alt text, possessives, instructions, support copy, and the
non-affiliation statement.

Keep all exact technical strings unchanged:

```text
bladeandsoulx/fang-razer-linux
fang
fangd
fangd.service
Fang_0.9.7_amd64.deb
fangd_0.9.7-1_amd64.deb
fang-0.9.7-1.x86_64.rpm
fangd-0.9.7-1.x86_64.rpm
FANGD_ALLOW_UNVERIFIED_PID
/run/fangd.sock
```

In `CHANGELOG.md`, change only the introduction and v0.9.7 section:

```markdown
All notable changes to VFang are documented here.

## [0.9.7] — 2026-07-30 — VFang rebrand and Fedora detection repair

### Changed

- The user-facing product is renamed to VFang. Package names, executables,
  service and IPC identities, repository links, and release filenames remain
  unchanged so existing installations upgrade in place.
```

Change the two existing v0.9.7 bullets from Fang to VFang. Do not alter the
v0.9.6 or older sections.

Mirror the v0.9.7 title, `Changed` group, exact rebrand sentence, and VFang
spelling in `app/src/screens/Changelog.svelte`. Do not alter older release
objects.

- [ ] **Step 4: Run tests and audit historical boundaries**

Run:

```bash
node --test app/src/lib/changelog-content.test.js \
  packaging/release/release-contract.test.mjs
rg -n '\bFang\b' README.md CONTRIBUTING.md HARDWARE_TESTING.md
rg -n '\bFang\b' CHANGELOG.md app/src/screens/Changelog.svelte
```

Expected: tests PASS; the first `rg` returns no matches; the second returns
matches only in v0.9.6-and-older historical entries. The v0.9.7 slices contain
VFang and no standalone Fang.

- [ ] **Step 5: Commit the documentation slice**

```bash
git add README.md CONTRIBUTING.md HARDWARE_TESTING.md CHANGELOG.md \
  app/src/screens/Changelog.svelte app/src/lib/changelog-content.test.js \
  packaging/release/release-contract.test.mjs
git commit -m "docs: announce the VFang rebrand"
```

---

### Task 4: Full release verification and compatibility audit

**Files:**
- Verify only: all files changed by Tasks 1-3

**Interfaces:**
- Consumes: the completed VFang presentation layer and the stable 0.9.7
  release contract.
- Produces: evidence that the rebrand is complete, historical records remain
  accurate, and the existing release can still be built and shipped.

- [ ] **Step 1: Run version, JavaScript, frontend, shell, and Rust gates**

Run:

```bash
node app/scripts/version.mjs check
node --test app/scripts/version.test.mjs \
  app/src/lib/branding-content.test.js \
  app/src/lib/changelog-content.test.js \
  packaging/installer/check-os-release.test.mjs \
  packaging/installer/installer.test.mjs \
  packaging/release/release-contract.test.mjs \
  packaging/release/publish.test.mjs \
  packaging/deb/verify.test.mjs \
  packaging/rpm/build-script.test.mjs \
  packaging/rpm/metadata.test.mjs
shellcheck install.sh packaging/install-from-source.sh \
  packaging/installer/check-os-release.sh packaging/deb/verify.sh \
  packaging/rpm/build.sh packaging/rpm/verify.sh \
  packaging/release/publish.sh
npm --prefix app test
npm --prefix app run build
cargo test --workspace
cargo test --manifest-path app/src-tauri/Cargo.toml
```

Expected: version check reports `VFang version sync OK: 0.9.7`; every test,
build, ShellCheck invocation, and Rust suite succeeds.

- [ ] **Step 2: Audit visible and stable identity surfaces**

Run:

```bash
rg -n '\bFang\b|\bFANG\b' \
  README.md CONTRIBUTING.md HARDWARE_TESTING.md install.sh packaging app \
  --glob '!app/src/screens/Changelog.svelte' \
  --glob '!app/src/lib/changelog-content.test.js' \
  --glob '!app/src/lib/branding-content.test.js'
rg -n 'productName|identifier|desktopTemplate|Name=|Exec=|Icon=' \
  app/src-tauri/tauri.conf.json app/src-tauri/vfang.desktop \
  packaging/rpm/fang.desktop
node -e "import('./packaging/release/release-contract.mjs').then(({releaseNames}) => console.log(releaseNames('0.9.7').join('\\n')))"
git diff --check
git status --short
```

Expected: remaining capitalized Fang matches are limited to explicitly
preserved technical artifact names, source comments/internal fixture names,
and tested historical content; current visible surfaces say VFang/VFANG.
Configuration shows `productName: Fang`, `identifier: dev.fang.app`,
`desktopTemplate: vfang.desktop`, and both launchers use visible `Name=VFang`
with stable executable/icon values. The release helper prints exactly six
unchanged assets. `git diff --check` is clean and status contains no
uncommitted task changes.

- [ ] **Step 3: Review commits and hand off for merge**

Run:

```bash
git log --oneline --decorate -8
git diff --stat HEAD~3..HEAD
```

Expected: three focused rebrand commits follow the approved design commit,
with no unrelated changes. Invoke `superpowers:requesting-code-review`, address
any findings, rerun affected verification, then use
`superpowers:finishing-a-development-branch` for the merge decision.
