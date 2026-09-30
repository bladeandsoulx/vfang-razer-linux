# Contributing to VFang

## Review and build on Linux without opening VFang

Use the pinned Rust toolchain, Node.js 22 or later, and the native development
libraries listed in the Linux CI app job (`libudev-dev`, GTK 3, WebKitGTK 4.1,
and Ayatana AppIndicator on Ubuntu/Debian). From the repository root:

```sh
npm ci --prefix app --ignore-scripts
node app/scripts/version.mjs check
npm --prefix app test
npm --prefix app run build
node --test app/scripts/version.test.mjs packaging/installer/*.test.mjs packaging/release/*.test.mjs packaging/deb/*.test.mjs packaging/rpm/*.test.mjs packaging/arch/*.test.mjs
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo build --workspace --locked
cargo fmt --manifest-path app/src-tauri/Cargo.toml --check
cargo clippy --manifest-path app/src-tauri/Cargo.toml --bin fang --all-targets --locked -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml --bin fang --locked
cargo build --manifest-path app/src-tauri/Cargo.toml --bin fang --locked
cargo test --manifest-path app/src-tauri/vendor-tests/glib-regression/Cargo.toml --release --locked
shellcheck install.sh packaging/install-from-source.sh packaging/installer/check-os-release.sh packaging/arch/build.sh packaging/arch/verify.sh packaging/rpm/build.sh packaging/rpm/verify.sh packaging/deb/verify.sh packaging/release/publish.sh
```

These tests use simulated hardware, temporary files and mocked package/service
commands. They do not install VFang, start its hardware service, or open the UI.
Linux additionally checks real-backend compilation, process groups, Unix socket
ownership and display-helper deadlines. Physical EC behavior and interactive
desktop behavior require separate validation in [HARDWARE_TESTING.md](HARDWARE_TESTING.md).

When moving a working tree from Windows to Linux, ensure tracked shell scripts
retain the executable modes recorded in Git. A normal Linux checkout preserves
them; some archive extraction tools do not.

RPM and Arch build scripts require an output directory with no existing package
artifacts of that family. Choose a fresh directory for each build; existing
packages are preserved instead of deleted. Both generated package identities
are validated before either artifact is copied to the output directory.

The source installer builds both packages using the lockfiles and stages a
complete pair before one apt install transaction. Build failures therefore
cannot start a newly installed daemon. Installing build dependencies still
changes the system, and an apt/dpkg failure is not an atomic rollback guarantee.

The GTK 3 graph uses a local GLib 0.18.5 copy with the exact upstream
`VariantStrIter` out-pointer correction for RUSTSEC-2024-0429. Its source,
license, archive checksum and maintenance instructions are recorded in
[VFANG-BACKPORT.txt](app/src-tauri/vendor/glib/VFANG-BACKPORT.txt). The separate
optimized regression requires GLib development libraries and opens no window.
Version-only advisory scans may continue to flag the upstream 0.18.5 number;
verify the backport instead of suppressing all GLib advisories. Other transitive
maintenance advisories are still tracked. Compiler warnings in the unchanged
upstream binding are not application Clippy failures.

## Review and build on Windows without opening VFang

Windows 11 is sufficient for source review, frontend builds, protocol tests and
mock daemon tests. Install Git, Node.js 22 or later, and Rust through rustup. Rust
uses the version pinned in `rust-toolchain.toml`. Native Rust/Tauri builds also
need Visual Studio Build Tools with **Desktop development with C++** and a
Windows SDK. A WebView2 runtime is needed when running the desktop app; the
commands below do not open it.

From PowerShell at the repository root:

```powershell
npm.cmd ci --prefix app --ignore-scripts
node app/scripts/version.mjs check
node --test app/scripts/version.test.mjs packaging/rpm/metadata.test.mjs packaging/arch/metadata.test.mjs packaging/release/release-contract.test.mjs
npm.cmd --prefix app test
npm.cmd --prefix app run build
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo build --workspace --locked
cargo fmt --manifest-path app/src-tauri/Cargo.toml --check
cargo clippy --manifest-path app/src-tauri/Cargo.toml --bin fang --all-targets --locked -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml --bin fang --locked
cargo build --manifest-path app/src-tauri/Cargo.toml --bin fang --locked
```

`npm.cmd` avoids PowerShell execution-policy restrictions on `npm.ps1`.
Dependency installation here skips npm lifecycle scripts. The workspace
integration tests temporarily start `fangd --mock` on loopback TCP and remove
their temporary state; they cannot exercise real Razer hardware. Tauri Rust
tests use the test harness rather than starting the application's main loop.
Neither command installs or enables the hardware service.

The Windows CI job runs these checks. POSIX executable fixtures in the release
contract suite are explicitly skipped on Windows; the pure metadata, checksum
and release-staging tests still run. Linux-only syscalls, desktop integrations,
shell fixtures and DEB/RPM/Pacman lifecycle checks require the Linux CI jobs.
The package lifecycle verifiers install and remove packages and belong in
disposable containers. Do not run `install.sh`, `packaging/install-from-source.sh`
or package lifecycle verifiers on a host used only for review/builds.

WSL2 or a Linux VM can cover more Linux build and shell checks. Physical
hardware behavior still requires booting a supported Linux distribution on a
Razer Blade and following [HARDWARE_TESTING.md](HARDWARE_TESTING.md).

## GPU telemetry checks

The shared telemetry types and runtime-PM snapshot/policy fixtures compile and
run on Windows. The Dashboard tests render the real Svelte component entirely
in memory; they open no window, browser or server. Missing optional fields keep
the older dashboard layout, and power-only samples display **Uncore power
(iGPU proxy)** without inventing an activity percentage.

The real collector leaves Xe activity/frequency unavailable. `cur_freq`,
`act_freq` and idle-residency sysfs reads acquire runtime-PM references;
`cur_freq` also force-wakes the GT. A user-space state check cannot make those
reads passive. Keep them disabled until a non-waking source is validated.
RAPL uncore watts are a proxy and must not be described as GPU-only power.

Windows tests do not compile the Linux NVML/hardware implementation. Linux CI
must build that implementation; physical runtime-PM and power accuracy tests
still belong in the hardware guide. These checks do not require replacing your
Windows installation to continue development.

## Development setup — no Razer hardware needed

Everything runs against a simulated Blade 18 on any OS (Linux, Windows, macOS):

```sh
# terminal 1 — daemon with simulated hardware
cargo run -p fangd -- --mock --tcp 127.0.0.1:7331

# terminal 2 — the app
cd app && npm install && npm run tauri dev
```

UI-only (browser simulator, no daemon or Rust toolchain):

```sh
cd app && npm run dev     # http://localhost:1420, screens deep-link via #fan etc.
```

## Tests

```sh
cargo test --workspace                       # protocol + daemon (incl. e2e mock test)
cd app/src-tauri && cargo test --bin fang    # xrandr/kscreen/colormgr parsers
```

CI also enforces `cargo fmt` and `cargo clippy -- -D warnings`.

Before cutting a release, run `node app/scripts/version.mjs set X.Y.Z`, update
the newest CHANGELOG entry, then run `node app/scripts/version.mjs check`.
CI rejects mismatched Cargo, npm, Tauri, lockfile or changelog versions.

For installer-enabled releases, a repository administrator must first enable
immutable releases under **Settings → Releases**. Add an
`IMMUTABLE_RELEASES_TOKEN` Actions secret backed by a fine-grained token with
read-only **Administration** repository permission. The ordinary workflow
token retains only `contents: write` for draft creation and publication.

The tag workflow refuses an existing release, stages exactly `install.sh`,
`SHA256SUMS`, two DEBs, two RPMs, and two Pacman packages—exactly eight assets
total—validates remote sizes and SHA-256 digests, then publishes once and
confirms the result is immutable and latest. If validation fails after draft
creation, inspect and manually remove that unpublished draft before retrying;
automation never overwrites it.

## Adding support for your Blade

1. Run through [HARDWARE_TESTING.md](HARDWARE_TESTING.md) on your machine.
2. Add one entry to `crates/fang-protocol/src/models.rs` with your USB PID and
   fan limits (crosscheck razer-laptop-control's `laptops.json` for the
   limits Razer uses on your model).
3. Open a PR including your `lsusb -d 1532:` output and a short journal
   snippet showing the daemon driving the device — or just file a
   "Laptop model report" issue with the same info and we'll do the rest.

## EC protocol changes

A watt-based TDP control is separate from the EC power levels already used by
Custom. Read [TDP control research](docs/tdp-control-research.md) before adding
such controls; unverified limits must not be exposed as supported hardware.

Anything touching `fang-protocol::packet` needs a unit test asserting the
exact wire bytes (see the existing tests), and a pointer to where the bytes
were verified (razer-laptop-control / OpenRazer source, or a USB capture).

## License

GPL-2.0 — contributions are accepted under the same license.
