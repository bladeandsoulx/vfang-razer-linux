# Ubuntu 26.04 LTS Support Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept Ubuntu 26.04 LTS (`resolute`) as a supported installation base,
validate the existing DEBs on it in CI, guard the Debian/Ubuntu-only source
installer, and ship all of it as release v0.9.6.

**Architecture:** `detect_platform()` in `install.sh` gains one direct entry
(`26.04:resolute`) and one derivative entry (`resolute`), mirroring how `noble`
is already handled in both tiers. The `deb-test` matrix in both workflows gains
`ubuntu:26.04`, so the existing `packaging/deb/verify.sh` lifecycle check runs on
the new base against the same artifacts. No package is rebuilt or re-specced.

**Tech Stack:** Bash, Node 22 `node:test`, GitHub Actions, Ubuntu 26.04
containers.

## Global Constraints

- Support Ubuntu 26.04 LTS on x86_64 only.
- Keep the `VERSION_ID:VERSION_CODENAME` pairing in the direct detection tier.
  Never match `VERSION_ID` alone.
- Keep building DEBs on the `ubuntu-22.04` runner. That runner sets
  `libc6 (>= 2.35)`, which is what keeps Ubuntu 22.04 and Debian 12 installable.
- Do not modify the DEB or RPM specs, dependencies, or build scripts.
- Do not modify daemon, EC, or protocol code. This release changes no hardware
  behavior.
- Preserve the executable mode bit on `packaging/install-from-source.sh`;
  `release-contract.test.mjs` asserts it.
- Ship as v0.9.6 with `app/scripts/version.mjs set` as the version authority.
- Stop before tagging or pushing a release.

## File Structure

### Create

- `docs/superpowers/specs/2026-07-30-ubuntu-2604-support-design.md` — approved design.
- `docs/superpowers/plans/2026-07-30-ubuntu-2604-support.md` — this plan.

### Modify

- `install.sh` — direct and derivative detection entries for Ubuntu 26.04.
- `packaging/installer/installer.test.mjs` — direct platform, derivative, and
  mismatched-codename cases.
- `.github/workflows/ci.yml` — `ubuntu:26.04` in the `deb-test` matrix.
- `.github/workflows/release.yml` — `ubuntu:26.04` in the `deb-test` matrix.
- `packaging/install-from-source.sh` — Debian/Ubuntu family guard.
- `packaging/release/release-contract.test.mjs` — pinned-version assertions.
- `app/src/screens/Changelog.svelte` — v0.9.6 in-app entry.
- `app/src/lib/changelog-content.test.js` — v0.9.6 ordering assertion.
- `README.md` — tested bases list, pinned-release block, manual-install commands.
- `.github/ISSUE_TEMPLATE/bug_report.yml` — current system example.
- `Cargo.toml`, `Cargo.lock`, `app/package.json`, `app/package-lock.json`,
  `app/src-tauri/Cargo.toml`, `app/src-tauri/Cargo.lock`,
  `app/src-tauri/tauri.conf.json`, `packaging/installer/banner.txt`, both RPM
  specs, `CHANGELOG.md` — release v0.9.6 synchronization.

---

### Task 1: Widen the installer platform gate

**Files:**
- Modify: `packaging/installer/installer.test.mjs`
- Modify: `install.sh`

**Interfaces:**
- Consumes: `/etc/os-release` `ID`, `VERSION_ID`, `VERSION_CODENAME`,
  `ID_LIKE`, `UBUNTU_CODENAME`.
- Produces: `PACKAGE_FAMILY=deb` and `PLATFORM_LABEL='Ubuntu 26.04'` for
  `ID=ubuntu` with `26.04`/`resolute`, and for `resolute` derivatives with the
  existing derivative warning.

- [ ] **Step 1: Add the failing detection tests**

In `packaging/installer/installer.test.mjs`, add to `directPlatforms`:

```js
['Ubuntu 26.04', 'ID=ubuntu\nVERSION_ID="26.04"\nVERSION_CODENAME=resolute\n', 'DEB'],
```

Add to `derivatives`:

```js
[
  'zorin resolute',
  'Ubuntu 26.04',
  'ID=zorin\nID_LIKE="ubuntu debian"\nVERSION_ID="19"\nUBUNTU_CODENAME=resolute\n'
],
```

Add a negative case asserting a 26.04 `VERSION_ID` with a wrong codename still
fails, so the pairing cannot regress to a version-only match.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test packaging/installer/installer.test.mjs
```

Expected: the three new cases fail with `Unsupported Ubuntu release: 26.04.`

- [ ] **Step 3: Add the detection entries**

In the direct `ubuntu)` case, after the `24.04:noble` arm:

```bash
26.04:resolute) PACKAGE_FAMILY=deb; PLATFORM_LABEL='Ubuntu 26.04' ;;
```

In the derivative `OS_UBUNTU_CODENAME` case, after the `noble)` arm:

```bash
resolute) PACKAGE_FAMILY=deb; PLATFORM_LABEL='Ubuntu 26.04' ;;
```

- [ ] **Step 4: Confirm the whole installer suite passes**

```bash
node --test packaging/installer/installer.test.mjs
```

Expected: PASS, including the pre-existing rejection and spoofing cases.

---

### Task 2: Validate the DEBs on Ubuntu 26.04 in CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: the `fang-debs` artifact built on `ubuntu-22.04`.
- Produces: a `test DEBs (ubuntu:26.04)` job gating both CI and release.

- [ ] **Step 1: Extend both matrices**

Add `ubuntu:26.04` to the `deb-test` matrix `image` list in each workflow. Leave
the `debs` build job on `ubuntu-22.04`.

- [ ] **Step 2: Confirm no other job pins a base list**

```bash
grep -rn "ubuntu:2\|debian:1\|fedora:4" .github/workflows/
```

Expected: only the two `deb-test` matrices and the Fedora RPM jobs.

---

### Task 3: Guard the from-source installer

**Files:**
- Modify: `packaging/install-from-source.sh`

**Interfaces:**
- Consumes: `/etc/os-release` `ID` and `ID_LIKE`.
- Produces: exit status 1 with an RPM-path pointer on non-Debian-family systems;
  unchanged behavior on Debian and Ubuntu.

- [ ] **Step 1: Add the family check**

After the root check and before `apt-get update`, source-free-read
`/etc/os-release` and exit unless `ID` or `ID_LIKE` names `ubuntu` or `debian`.
Keep it minimal — no codename pinning, no family-conflict logic.

- [ ] **Step 2: Verify the guard both ways**

Run the script with a stubbed non-Debian `os-release` and confirm it exits before
any `apt-get` call, then confirm the real host still passes the check.

- [ ] **Step 3: Confirm the mode bit survived**

```bash
node --test packaging/release/release-contract.test.mjs
```

---

### Task 4: Synchronize release v0.9.6

**Files:**
- Modify: `CHANGELOG.md`, `app/src/screens/Changelog.svelte`,
  `app/src/lib/changelog-content.test.js`,
  `packaging/release/release-contract.test.mjs`, `README.md`, plus every file
  owned by `version.mjs`.

- [ ] **Step 1: Bump the version**

```bash
node app/scripts/version.mjs set 0.9.6
```

- [ ] **Step 2: Write the changelog entry**

Add `## [0.9.6] — 2026-07-30 — Ubuntu 26.04 LTS` to `CHANGELOG.md`.
`version.mjs check` asserts this header matches the bumped version.

- [ ] **Step 3: Update the in-app changelog and its test**

Add the `version: '0.9.6'` entry to `Changelog.svelte` and extend the
descending-order assertions in `changelog-content.test.js`.

- [ ] **Step 4: Update pinned-version assertions and README examples**

Update the three hard-coded `v0.9.5` assertions in
`release-contract.test.mjs` and the matching README pinned-release and
manual-install blocks.

- [ ] **Step 5: Verify version synchronization**

```bash
node app/scripts/version.mjs check
```

---

### Task 5: Document the widened support list

**Files:**
- Modify: `README.md`
- Modify: `.github/ISSUE_TEMPLATE/bug_report.yml`

- [ ] **Step 1: Add Ubuntu 26.04 to the tested bases list**

Leave the derivative paragraph unchanged; it remains accurate.

- [ ] **Step 2: Refresh the bug report placeholder**

- [ ] **Step 3: Run the full local suite**

```bash
node app/scripts/version.mjs check
node --test packaging/installer/installer.test.mjs
node --test packaging/release/release-contract.test.mjs \
            app/src/lib/changelog-content.test.js \
            app/scripts/version.test.mjs
cargo test --workspace
```

---

### Task 6: Validate on a real Ubuntu 26.04 userland

- [ ] **Step 1: Run the CI lifecycle check in a container**

With DEBs staged in `target/deb-dist`:

```bash
podman run --rm -v "$PWD:/w" -w /w ubuntu:26.04 bash -c \
  'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
     git ca-certificates systemd python3 desktop-file-utils procps && \
   packaging/deb/verify.sh target/deb-dist'
```

Expected: both packages install, `fangd --version` matches, the unit verifies,
the mock smoke test passes, and `ldd /usr/bin/fang` reports no missing objects.

- [ ] **Step 2: Report which validation actually ran**

State plainly whether the container check ran against freshly built v0.9.6 DEBs,
against older staged DEBs, or was deferred to CI.
