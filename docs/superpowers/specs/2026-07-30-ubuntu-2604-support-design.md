# Ubuntu 26.04 LTS support for Fang

**Date:** 2026-07-30
**Status:** Approved

## Goal

Accept Ubuntu 26.04 LTS ("Resolute Raccoon") as a supported installation base and
ship that acceptance to users as release v0.9.6.

Ubuntu 26.04 LTS released on 2026-04-23. Fang's installer gates on an explicit
list of supported bases, and its newest Ubuntu entry is 24.04, so a user on the
current LTS running the documented one-command install is rejected with
`Unsupported Ubuntu release: 26.04.` before any download happens. The same
rejection reaches Zorin, Linux Mint, and Pop!_OS users as those derivatives
rebase onto `resolute`.

## Scope

### In scope

- Ubuntu 26.04 LTS on x86_64, both as a direct `ID=ubuntu` match and via the
  `ID_LIKE`/`UBUNTU_CODENAME` derivative path.
- Clean-container DEB lifecycle validation on Ubuntu 26.04 in CI and release
  gating.
- A distribution guard for the Debian/Ubuntu-only from-source installer.
- Release v0.9.6 synchronization and documentation of the widened support list.

### Out of scope

- Arch, Manjaro, and other pacman distributions. These require a third package
  family and a restructured release asset contract.
- openSUSE and other zypper distributions.
- Ubuntu 25.10 or any non-LTS Ubuntu. Fang tracks Ubuntu LTS and Debian stable.
- Retiring Ubuntu 22.04. It is supported until April 2027 and sets the glibc
  floor for every released DEB.
- New package builds. The existing amd64 DEBs are the artifacts that ship.
- Real-hardware, enforcing-SELinux, or desktop-session validation from
  container-only CI.

## Compatibility evidence

No packaging change is required. Verified against the `resolute` archive before
committing to this design:

| Requirement | Status in Ubuntu 26.04 |
|---|---|
| `libwebkit2gtk-4.1-0` (desktop DEB dependency) | Present, 2.52.3-0ubuntu0.26.04.2 |
| `libayatana-appindicator3-1` (tray dependency) | Present, 0.5.94-1build1 |
| `libgtk-3-0` (desktop DEB dependency) | Present |
| `ubuntu:26.04` container image | Published on Docker Hub, amd64 |

The desktop DEB's hard dependency on WebKitGTK 4.1 was the one real risk: had
26.04 dropped the 4.1 soname in favour of a GTK4-era WebKitGTK, this change
would have required a Tauri-level migration rather than a gate widening. It did
not.

Both DEBs are built on the `ubuntu-22.04` GitHub runner, producing
`libc6 (>= 2.35)`. That floor installs cleanly on 26.04's newer glibc, so the
same artifacts serve all four Debian-family bases. The build runner must not be
raised; doing so would silently drop Ubuntu 22.04 and Debian 12.

## Detection design

`detect_platform()` in `install.sh` keeps its existing two-tier shape.

The direct tier matches `VERSION_ID` and `VERSION_CODENAME` as a pair
(`26.04:resolute`). This pairing is deliberate: it means a partially forged or
truncated `os-release` fails closed instead of selecting a package family. The
new entry preserves that property rather than matching `VERSION_ID` alone.

The derivative tier maps `UBUNTU_CODENAME=resolute` to the Ubuntu 26.04 label
and emits the existing `DERIVATIVE_WARNING`, so a rebased Zorin or Mint install
resolves to the correct DEBs while still being told it is not release-tested
directly.

No change is made to the family-conflict check, the architecture check, or the
checksum and metadata verification that follow detection.

## From-source installer guard

`packaging/install-from-source.sh` is documented as Debian/Ubuntu-only in both
`README.md` and `HARDWARE_TESTING.md`, and it calls `apt-get` unconditionally. A
Fedora user who runs it anyway currently sees a bare `apt-get: command not
found` after having already been prompted for root.

The script gains an early `os-release` family check that exits non-zero with a
message pointing at the RPM installation path. It stays intentionally simpler
than `install.sh`: it needs no codename pinning, no family-conflict handling, and
no architecture check, because it builds from source on the machine it runs on.

## Release design

The installer is release-locked: `install.sh` carries `readonly VERSION` and
`readonly RELEASE_TAG`, and users fetch it from `releases/latest/download`. A
widened gate therefore reaches nobody until a new tag exists. Ubuntu 26.04
support ships as patch release v0.9.6, following the precedent of v0.9.3, which
shipped Fedora support the same way.

`app/scripts/version.mjs set` remains the single source of version truth and
synchronizes every packaged component. Files it does not own — the changelog
prose, the in-app changelog panel, and the README's pinned-release examples —
are updated by hand and guarded by existing tests.
