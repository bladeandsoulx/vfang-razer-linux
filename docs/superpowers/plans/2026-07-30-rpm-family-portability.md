# Plan — RPM family portability

Design: [`2026-07-30-rpm-family-portability-design.md`](../specs/2026-07-30-rpm-family-portability-design.md)

## Goal

Phase A: make Fang installable on Fedora 43 and 44 again, and ship it in v0.9.7.
Phase B: add openSUSE Leap 16.0 to the RPM family without growing the release
asset set, and ship it in v0.9.8.

v0.9.6 (Ubuntu 26.04) is already staged and reviewed in PR #2 and ships
unchanged. Phase A branches from `main` after that merges.

## Architecture

`install.sh` keeps its two-tier detection (direct `ID` match, then `ID_LIKE`
derivative fallback) and keeps pair-matching two independent os-release fields so
a truncated or forged file fails closed. The RPM distributions swap their second
field from the retired `PLATFORM_ID` to `CPE_NAME`.

A new `PACKAGE_MANAGER` variable separates "which package format" from "which
tool installs it", because Leap is RPM-based but has no `dnf`.

`fang.spec` requires the appindicator **soname** rather than Fedora's package
name, which makes one RPM pair valid on Fedora and openSUSE. The RPM build
container moves to the lowest-glibc supported RPM base so the binaries' glibc
floor stays satisfiable everywhere — the same discipline that keeps DEBs on the
`ubuntu-22.04` runner.

## Tech Stack

Bash (`install.sh`), Node's built-in test runner for the installer harness,
GitHub Actions matrices, RPM spec files, podman for local container verification.

## Global Constraints

- **Do not weaken the pair match.** Two independent fields must agree. Replacing
  `PLATFORM_ID` with `CPE_NAME` preserves that; accepting a bare `VERSION_ID`
  does not.
- **Do not raise either build floor.** DEBs stay on `ubuntu-22.04`
  (`libc6 (>= 2.35)`). RPMs move to the *lowest* supported RPM base, never a
  higher one.
- **Fixtures must mirror reality.** Any os-release fixture for a distribution in
  the CI matrix must match that distribution's real file. This is the bug being
  fixed; do not reintroduce it.
- `--no-gpg-checks` may scope to installing local unsigned files only, never to
  repository operations.
- Preserve the executable mode bit on `packaging/install-from-source.sh`
  (asserted by `release-contract.test.mjs`).
- No daemon, EC, or protocol code changes; hardware behavior is unaffected.

## File Structure

```
install.sh                                  parser + gate + PACKAGE_MANAGER
packaging/installer/installer.test.mjs      real-file fixtures, new gates
packaging/rpm/fang.spec                     soname Requires
.github/workflows/ci.yml                    rpm-build container, matrices
.github/workflows/release.yml               same, mirrored
README.md CHANGELOG.md                      documented bases
app/src/screens/Changelog.svelte            in-app notes
app/src/lib/changelog-content.test.js       in-app note assertions
```

---

## Phase A — Fedora repair (v0.9.7)

- [ ] **A1. Accept empty codename values.** In `valid_os_value`
      ([install.sh:139](../../../install.sh)), change the
      `VERSION_CODENAME|UBUNTU_CODENAME` pattern from `+` to `*` so Fedora's
      literal `VERSION_CODENAME=""` parses. An empty codename then matches no
      Ubuntu or Debian gate, which is the correct fail-closed outcome — assert
      that, do not special-case it.

- [ ] **A2. Add `CPE_NAME` to the parser.** Extend the key allowlist
      (install.sh:167), the `case` that assigns `OS_*` variables, and
      `valid_os_value` with a pattern permitting `/` as well as `:`
      (`^[A-Za-z0-9:._+/-]+$` — keep `-` last inside the bracket expression).
      Add `OS_CPE_NAME=` to the reset block so a second parse cannot inherit a
      stale value.

- [ ] **A3. Repoint the Fedora gate to `CPE_NAME`.** Both the direct `fedora)`
      case (install.sh:224) and the `fedora_like` derivative case
      (install.sh:254) match on `CPE_NAME` instead of `PLATFORM_ID`:
      `43:cpe:/o:fedoraproject:fedora:43` and
      `44:cpe:/o:fedoraproject:fedora:44`. Decide and document whether
      `PLATFORM_ID` stays accepted as a parsed key — Fedora ≤ 42 is not
      supported, so removing it is defensible and reduces surface, but the
      existing `hybrid` conflict-rejection fixture references it.

- [ ] **A4. Rebuild every Fedora fixture from the real file.** Replace the
      `PLATFORM_ID` fixtures at `installer.test.mjs` lines 300, 301, 346, 392,
      445, 497, 553 with the genuine Fedora 43/44 os-release shape: no
      `PLATFORM_ID`, `VERSION_CODENAME=""` present, `CPE_NAME` set. Capture the
      real files first:
      `podman run --rm registry.fedoraproject.org/fedora:44 cat /etc/os-release`.

- [ ] **A5. Add regression gates.** New rejection cases proving the pair did not
      loosen: Fedora `VERSION_ID` with no `CPE_NAME`; Fedora `VERSION_ID` paired
      with a *mismatched* `CPE_NAME` (e.g. `44` with
      `cpe:/o:fedoraproject:fedora:43`). Both must fail.

- [ ] **A6. Real-file detection check in CI.** In each `deb-test` and `rpm-test`
      matrix container, run the installer's detection against that container's
      own `/etc/os-release` via the existing harness
      (`FANG_INSTALLER_TESTING=1`, `FANG_OS_RELEASE_FILE=/etc/os-release`) and
      assert the expected platform label. This is the structural fix for the
      fixture drift that hid this bug; it needs no new machinery and would have
      failed the moment Fedora 43 entered the matrix.

- [ ] **A7. Bump to 0.9.7 and update every pinned reference.** Because the fix
      no longer rides an already-bumped release, this is a full version bump:
      `node app/scripts/version.mjs set 0.9.7`, then the hand edits that script
      does not cover —
      a new `## [0.9.7]` CHANGELOG section with a `### Fixed` entry
      (`version.mjs check` asserts the header matches);
      a `version: '0.9.7'` entry at the top of
      `app/src/screens/Changelog.svelte`;
      `v097` added to the descending-order test plus a new per-release test in
      `app/src/lib/changelog-content.test.js`;
      the **four** pinned assertions in `release-contract.test.mjs:168-178`
      (integrity block, both manual-install command lines, and the anchored
      README bases line); and README's pinned-release block and manual install
      commands. Grepping those test files for `0.9.7` will not find them — the
      source holds `0\.9\.7` with literal backslashes. Use Edit, never sed:
      they are dense with regex literals and a stray unescaped `/` silently
      terminates one.

### Phase A verification

```bash
node app/scripts/version.mjs check
node --test packaging/installer/installer.test.mjs \
            packaging/release/release-contract.test.mjs \
            app/src/lib/changelog-content.test.js \
            app/scripts/version.test.mjs
cargo test --workspace
```

Then the proof that actually matters — real files, all four RPM-family targets
plus a DEB control:

```bash
for IMG in registry.fedoraproject.org/fedora:43 \
           registry.fedoraproject.org/fedora:44 \
           ubuntu:26.04; do
  podman run --rm "$IMG" cat /etc/os-release > /tmp/real.os-release
  FANG_INSTALLER_TESTING=1 FANG_OS_RELEASE_FILE=/tmp/real.os-release bash install.sh
done
```

Fedora must reach package selection instead of `Unsupported Fedora release`.

---

## Phase B — openSUSE Leap 16.0 (v0.9.8)

Do not start B until Phase A has shipped. B changes the RPM build container,
which is the riskiest change in either phase, and it must not gate a regression
fix.

- [ ] **B1. Retire the glibc risk first, before any other B work.** Build the
      RPMs in `opensuse/leap:16.0` and confirm the pair installs on Leap 16.0
      *and* Fedora 44. Inspect the generated floor with
      `rpm -qp --requires` and look for `libc.so.6(GLIBC_…)`. If the Leap build
      cannot be made to work, stop and reconsider — the fallback (a separate
      Leap-built RPM pair, eight release assets) changes the whole plan's shape.
      Build deps on Leap, verified present but **differently named** from
      Fedora's: `webkit2gtk3-devel` (provides `pkgconfig(webkit2gtk-4.1)`),
      `librsvg-devel`, `libopenssl-devel`, `libayatana-appindicator3-devel`,
      `nodejs22`, `rpm-build`, `systemd-devel`, `gtk3-devel`.

- [ ] **B2. Make `fang.spec` distribution-neutral.** Replace
      `Requires: libayatana-appindicator-gtk3` with
      `Requires: libayatana-appindicator3.so.1()(64bit)`. Verified provided by
      Fedora's `libayatana-appindicator-gtk3` and openSUSE's
      `libayatana-appindicator3-1`. Webkit needs nothing — it is linked, so
      auto-dependency generation already records a portable soname.

- [ ] **B3. Introduce `PACKAGE_MANAGER`.** Set it beside `PACKAGE_FAMILY` in
      `detect_platform`. `require_commands` (install.sh:289) requires
      `rpm` + the selected manager rather than hardcoding `dnf`;
      `install_selected_packages` (install.sh:543) dispatches on it. Everything
      else on the RPM path is already portable (`rpm_state` uses `rpm -q` and
      `rpm.vercmp`; `verify_rpm_metadata` uses `rpm -qp`).

- [ ] **B4. Settle the zypper local-install invocation empirically.** Fang's
      RPMs are unsigned; `zypper install` on a local unsigned RPM may refuse or
      prompt. Expect `sudo zypper --non-interactive --no-gpg-checks install …`,
      but prove it in a Leap container and confirm it still fails closed on a
      genuinely corrupt package.

- [ ] **B5. Detect Leap.** Direct branch for `ID="opensuse-leap"` pairing
      `VERSION_ID:CPE_NAME` = `16.0:cpe:/o:opensuse:leap:16.0`. Add a
      `suse_like` peer to `ubuntu_like`/`debian_like`/`fedora_like`, extend the
      family-conflict check to reject files claiming SUSE *and* another family,
      and route SUSE derivatives through `DERIVATIVE_WARNING` as today.

- [ ] **B6. Move the RPM build and extend the test matrix.** `rpm-build`
      container `fedora:43` → `opensuse/leap:16.0` with openSUSE dependency
      names, in both `ci.yml` and `release.yml`. Add `opensuse/leap:16.0` to the
      `rpm-test` matrix alongside 43 and 44. Note `rpm-test` currently installs
      `libayatana-appindicator-gtk3` by name — that step needs per-image names.

- [ ] **B7. Docs and release.** README tested bases gain openSUSE Leap 16.0 —
      remember `release-contract.test.mjs` pins those lines with anchored
      regexes, including a `^- Fedora 43 and 44$` match. Update the manual `dnf`
      install block to mention `zypper`, the bug-report template, CHANGELOG, and
      the in-app changelog. Bump with `node app/scripts/version.mjs set 0.9.8`,
      then repeat the same pinned-reference sweep listed in task A7.

### Phase B verification

Run CI's real lifecycle check on Leap with genuine packages, as was done for
Ubuntu 26.04:

```bash
podman run --rm -v "/home/home/Desktop/fang-Fabel5:/w" -w /w opensuse/leap:16.0 \
  bash -c 'zypper --non-interactive install -y … && packaging/rpm/verify.sh target/rpm-dist'
```

`packaging/rpm/verify.sh` may itself assume `dnf`; check and parameterise it.

## Out of scope

openSUSE Tumbleweed (rolling date `VERSION_ID`, nothing to pin), Arch/Manjaro
(third package family, reworked release contract, also rolling), retiring
Fedora 43 (supported to 2026-12-02). See the design doc for detail.
