# VFang user-facing rebrand

Date: 2026-07-30
Status: approved design

## Goal

Rename the product presented to users from **Fang** to **VFang** in v0.9.7
without breaking upgrades, package management, services, IPC, release assets,
or repository links.

The exact prose spelling is `VFang`. All-uppercase wordmarks use `VFANG`.

## Compatibility boundary

This is a presentation-layer rebrand, not a technical rename.

The following identifiers remain unchanged:

- application and daemon packages: `fang`, `fangd`;
- executable names: `fang`, `fangd`;
- DEB and RPM release filenames, including `Fang_0.9.7_amd64.deb`;
- systemd unit: `fangd.service`;
- Unix socket and lock paths: `/run/fangd.sock`, `/run/fangd.lock`;
- system group: `fang`;
- Tauri identifier: `dev.fang.app`;
- environment variables and internal constants beginning with `FANG_`;
- Cargo crate and package names;
- desktop file and icon identifiers such as `fang.desktop` and `fang`;
- repository name and URLs: `bladeandsoulx/fang-razer-linux`;
- the six-asset release contract.

Existing installations therefore upgrade in place. No package transition,
service migration, filesystem move, configuration migration, or compatibility
alias is needed.

## User-facing surfaces

Current product surfaces change to `VFang`:

- application navigation wordmark (`VFANG`);
- Tauri window title and HTML document title;
- current Settings, Support, disconnected-state, compatibility, update, and
  other visible application copy;
- installer success, progress, warning, and error messages that name the
  product;
- README, CONTRIBUTING, and HARDWARE_TESTING prose;
- RPM and DEB application-menu display names;
- systemd and package descriptions where the product name is displayed to
  users or administrators;
- the CHANGELOG introduction and the v0.9.7 release entry;
- the v0.9.7 in-app changelog entry.

Technical commands embedded in user-facing prose retain their technical names.
For example, documentation says “VFang” while commands continue to use
`fang`, `fangd`, `fangd.service`, and the existing release filenames.

The installer’s existing terminal artwork remains unchanged. Its green
V-shaped mark followed by the `FANG` wordmark already reads visually as
`VFANG`.

## Historical accuracy

Release history before v0.9.7 keeps the name used at the time:

- pre-0.9.7 CHANGELOG sections are not rewritten;
- pre-0.9.7 entries in the in-app changelog are not rewritten;
- archived design documents and implementation plans are not rewritten;
- historical release titles such as “Neon Fang installer” remain unchanged.

Source comments, test fixture variable names, and internal diagnostics are not
renamed merely for textual completeness. They change only when they directly
produce current user-visible branding.

## Linux packaging design

### Stable package identity

`app/src-tauri/tauri.conf.json` keeps:

```json
"productName": "Fang"
```

Tauri uses this value when naming the DEB artifact. Changing it would rename
`Fang_0.9.7_amd64.deb` and break the pinned release contract.

The Tauri window title changes to `VFang`.

### DEB launcher

Add a custom Tauri DEB desktop template and reference it through
`bundle.linux.deb.desktopTemplate`. The template hardcodes the visible
application name as `VFang` while using Tauri’s template variables for the
existing executable, icon, categories, and comment values.

The generated desktop filename and DEB artifact name remain unchanged.

### RPM launcher

`packaging/rpm/fang.desktop` changes only its visible `Name` field to
`VFang`. `Exec=fang`, `Icon=fang`, and the owned desktop path remain unchanged.

### Daemon and package descriptions

Human-readable descriptions may say “VFang daemon” or “VFang control center.”
The daemon package, service, executable, socket, group, and dependencies retain
their existing identifiers.

## Release documentation

The v0.9.7 CHANGELOG entry records the user-facing rename alongside the Fedora
detection repair. The in-app v0.9.7 entry mirrors that fact.

README installation and removal instructions use the VFang brand in prose but
retain the exact 0.9.7 package filenames and commands. Repository badges,
download URLs, clone commands, and issue links retain the current repository
slug.

The release version stays `0.9.7`; this work does not introduce another version
bump.

## Testing and release contracts

Tests must protect both halves of the design:

1. **Visible brand**
   - the application wordmark is `VFANG`;
   - window, document, and Linux launcher names are `VFang`;
   - current installer output and current documentation use `VFang`;
   - the v0.9.7 changelog entries record the rebrand.

2. **Stable technical identity**
   - Tauri `productName` remains `Fang`;
   - package names, daemon dependency bounds, executable names, service name,
     desktop/icon identifiers, repository URLs, and release filenames remain
     unchanged;
   - `releaseNames()` still returns the same six assets;
   - installer downloads and validates the same package pair.

Where an existing behavioral harness is available, tests assert rendered or
executed output rather than merely searching source text. Packaging contract
tests parse configuration and desktop metadata and assert the visible name and
stable identifiers together.

The full release verification remains:

```bash
node app/scripts/version.mjs check
node --test app/scripts/version.test.mjs \
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
cargo test --workspace
```

The application frontend should also pass its existing build or check command
after the visible strings and desktop-template configuration change.

## Success criteria

- A new user sees `VFang` in the app, launcher, installer, and current
  documentation.
- An existing v0.9.6 installation upgrades to v0.9.7 using the same package,
  service, group, executable, and IPC identities.
- The v0.9.7 release still contains exactly the existing six assets with the
  same filenames.
- Historical release records remain accurate.
- No daemon behavior, hardware behavior, protocol, IPC, or package-manager
  logic changes.
