# RPM family portability — repair Fedora, add openSUSE Leap 16

Date: 2026-07-30
Status: design

## Goal

Make the RPM package family actually installable on the distributions Fang
advertises, then extend it to openSUSE Leap 16.0 without growing the release
asset set.

Two problems share one root cause: the installer's platform gate and the RPM
build both encode assumptions about a single distribution (Fedora) that are not
true of the RPM ecosystem generally.

## Problem 1 — Fang cannot install on Fedora 43 or 44 (regression)

`install.sh` in the shipped v0.9.5 and in the staged v0.9.6 fails on **both**
supported Fedora releases, before downloading anything. Reproduced by running
the real installer against the real `/etc/os-release` from the
`registry.fedoraproject.org/fedora:44` image:

| Input | Result |
|---|---|
| Real Fedora 44 os-release, verbatim | `✗ Invalid os-release value for VERSION_CODENAME.` |
| Same, with the empty `VERSION_CODENAME` line removed | `✗ Unsupported Fedora release: 44.` |
| Same, with a synthetic `PLATFORM_ID` added back | passes detection |

Two independent defects:

**1a. Empty `VERSION_CODENAME` is rejected.** Fedora ships the literal line
`VERSION_CODENAME=""`. `valid_os_value` (install.sh:139) validates codename keys
with `^[a-z0-9._+-]+$`; the `+` quantifier requires at least one character, so
the empty value is treated as malformed and the installer aborts during parsing —
before `detect_platform` is ever reached.

**1b. `PLATFORM_ID` no longer exists.** The Fedora gate (install.sh:224) matches
the pair `$OS_VERSION_ID:$OS_PLATFORM_ID` against `43:platform:f43` /
`44:platform:f44`. **Fedora 43 deliberately removed `PLATFORM_ID`** — it existed
only for Modularity, and Modularity was retired. The field is absent from
`fedora-release-common` in both 43 and 44, and present in no os-release variant
file. The pair therefore evaluates to `44:` and matches nothing.

### Why the test suite did not catch it

Every Fedora fixture in `packaging/installer/installer.test.mjs` (lines 300, 301,
346, 392, 445, 497, 553) hand-writes a `PLATFORM_ID` that reality no longer
contains, and none reproduces the empty `VERSION_CODENAME`. The fixtures encode
Fedora ≤ 42. CI's `rpm-test` job runs only `packaging/rpm/verify.sh` against the
built packages; nothing in CI executes `install.sh`'s detection against a real
distribution's os-release.

This is a fixture-drift failure mode, not a logic failure. The same class of bug
was avoided for Ubuntu 26.04 only because detection was diffed against the real
image's os-release by hand. The structural fix is to make that comparison
automatic — see "Real-file detection check" below.

## Problem 2 — the RPM's glibc floor is set by the build container

`fangd` and `fang` reference glibc symbol versions up to the build host's glibc:
binaries built here on glibc 2.39 reference `GLIBC_2.39`. The RPM build job runs
in `fedora:43`, which ships **glibc 2.42**.

openSUSE Leap 16.0 ships **glibc 2.40**. An RPM built on Fedora 43 therefore
carries auto-generated requirements Leap 16 cannot satisfy.

This mirrors the DEB discipline exactly: DEBs are built on the `ubuntu-22.04`
runner specifically so `libc6 (>= 2.35)` keeps the oldest supported base
installable. The RPM side never needed that discipline while Fedora was the only
RPM target. Adding openSUSE makes it necessary.

## Compatibility evidence

All verified in containers against live package databases, not documentation.

| Fact | Fedora 43 / 44 | openSUSE Leap 16.0 |
|---|---|---|
| glibc | 2.42 | **2.40** ← new floor |
| `libwebkit2gtk-4.1.so.0()(64bit)` | present | `libwebkit2gtk-4_1-0` |
| `libayatana-appindicator3.so.1()(64bit)` | `libayatana-appindicator-gtk3` | `libayatana-appindicator3-1` |
| Package manager | `dnf` | `zypper` (**no `dnf`**) |
| Pinnable pair | `VERSION_ID` + `CPE_NAME` | `VERSION_ID="16.0"` + `CPE_NAME` |

Leap 16.0 os-release: `ID="opensuse-leap"`, `ID_LIKE="suse opensuse"`,
`VERSION_ID="16.0"`, `CPE_NAME="cpe:/o:opensuse:leap:16.0"`.

Leap 16.0 can host the build; dependency names differ from Fedora's:
`webkit2gtk3-devel` (provides `pkgconfig(webkit2gtk-4.1)`), `librsvg-devel`,
`libopenssl-devel`, `libayatana-appindicator3-devel`, `nodejs22`, `rpm-build`.

### Why openSUSE needs no new release assets

`fang` **links** webkit, so RPM auto-dependency generation records it as a
soname — which is distribution-neutral, because openSUSE's differently-*named*
package provides the same soname. `fang` **dlopens** appindicator (the binary
contains `libayatana-appindicator3.so.1`, `libappindicator3.so.1`), which is why
`fang.spec` carries an explicit `Requires`. That explicit Fedora package name is
the **only** distribution-specific string in either spec.

Both distributions provide `libayatana-appindicator3.so.1()(64bit)`. Requiring
the soname instead of the Fedora package name makes one RPM pair valid on both,
so `releaseNames()` stays at six assets, `parse_manifest`'s five-name list is
untouched, and no new build job or release-contract change is needed.

## Detection design

Keep the deliberate pair-matching posture: two independent fields must agree, so
a truncated or forged os-release fails closed. Only the second field changes for
RPM distributions, because `PLATFORM_ID` is gone.

- **Ubuntu / Debian** — unchanged, `VERSION_ID:VERSION_CODENAME`.
- **Fedora** — `VERSION_ID:CPE_NAME`, e.g. `44:cpe:/o:fedoraproject:fedora:44`.
- **openSUSE Leap** — `VERSION_ID:CPE_NAME`, e.g. `16.0:cpe:/o:opensuse:leap:16.0`.

`CPE_NAME` is a good pairing partner: it independently encodes vendor, product
and version, so a forger must keep two lines mutually consistent — the same
strength the codename pairing provided. It has shipped in Fedora for years and
is present in Leap.

Parser changes: add `CPE_NAME` to the key allowlist (install.sh:167) and to
`valid_os_value`, whose pattern must additionally permit `/`. Allow codename keys
to be empty so Fedora's `VERSION_CODENAME=""` parses; an empty codename then
matches no Ubuntu or Debian gate, which is the correct fail-closed outcome.

Derivative handling gains a `suse_like` peer alongside `ubuntu_like`,
`debian_like` and `fedora_like`, and the existing family-conflict check extends
to reject files claiming both a SUSE and a non-SUSE family.

## Package-manager axis

`PACKAGE_FAMILY` currently doubles as the package-manager selector: the `rpm`
branch hardcodes `dnf` in `require_commands` (install.sh:289) and in
`install_selected_packages` (install.sh:543). Leap has `rpm` but no `dnf`.

Introduce `PACKAGE_MANAGER` (`apt`/`dnf`/`zypper`) set alongside
`PACKAGE_FAMILY`. Everything else on the RPM path is already portable:
`rpm_state` uses `rpm -q` and `rpm.vercmp`, and `verify_rpm_metadata` uses
`rpm -qp`.

Open question to settle empirically during implementation: Fang's RPMs are
unsigned, and `zypper install` on a local unsigned RPM may refuse or prompt.
Expect to need `zypper --non-interactive --no-gpg-checks install`. This must be
proven in a Leap container, not assumed — and `--no-gpg-checks` must be scoped to
the local-file install only, never to repository operations.

## Real-file detection check

The structural fix for the fixture drift that hid Problem 1. Add a CI step that,
inside each `deb-test` / `rpm-test` matrix container, runs `install.sh`'s
detection against **that container's own `/etc/os-release`** using the existing
`FANG_INSTALLER_TESTING=1` + `FANG_OS_RELEASE_FILE` harness, and asserts the
expected platform label.

This turns "our fixtures match reality" from an assumption into a tested
property. It would have failed the moment Fedora 43 entered the matrix, and it
is cheap — the harness already exists and the containers are already being
started.

## Release design

Three shipments. v0.9.6 is already staged, reviewed and green in PR #2, so it
ships as-is; the RPM work follows in two further releases, because the two
problems have very different risk profiles.

**v0.9.6 — Ubuntu 26.04, unchanged.** Merges and tags as reviewed. It neither
causes nor fixes the Fedora regression, so holding it back would delay shipped
value without helping a single Fedora user.

**v0.9.7 — Fedora repair.** Problem 1 is a regression against advertised
support, and `install.sh` is release-locked and served from
`releases/latest/download`, so the fix reaches nobody until a tag ships. This is
the release that matters for Fedora users and should be cut promptly after
0.9.6. Scope: parser and gate fixes, Fedora fixtures rebuilt from real
os-release content, the real-file detection check, and a full version bump. No
packaging or CI-container changes.

**v0.9.8 — openSUSE Leap 16.0.** Requires migrating the RPM build container from
`fedora:43` to `opensuse/leap:16.0` to lower the glibc floor — a genuine risk,
since the whole Tauri release build must be reproduced on a new distribution
with different dependency names. Keeping it out of 0.9.7 means a regression fix
never waits on a build-system migration.

Fallback if the Leap build proves unworkable: keep building on Fedora and ship a
separate Leap-built RPM pair. That grows the release to eight assets and forfeits
the zero-new-assets property, so it is a last resort.

## Out of scope

- **openSUSE Tumbleweed** — `VERSION_ID` is a rolling date snapshot
  (`20260728`) with no `PLATFORM_ID`, so there is nothing stable to pin. Would
  need a documented exception to the pairing design.
- **Arch / Manjaro** — all runtime deps are in `extra` (`webkit2gtk-4.1`,
  `libayatana-appindicator`), so it is feasible, but it needs a third package
  family and a reworked release contract: `releaseNames()` is a hardcoded
  six-item list, `stageRelease` takes exactly `debDir`/`rpmDir` positionally, and
  `parse_manifest` hardcodes five names. Arch is also rolling
  (`VERSION_ID=20260726.0.562117`), so pinning needs new thinking. Its own
  project.
- **Retiring Fedora 43** — supported to 2026-12-02; it is also currently the RPM
  build base.
