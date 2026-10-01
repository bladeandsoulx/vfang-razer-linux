# Changelog

All notable changes to VFang are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/).

## [1.0.1] — 2026-10-01 — Keyboard colors, resume safety and recovery

### Fixed

- Blade 16 (2024), USB PID `1532:02B7`, uses a solid-color 6x16 custom
  keyboard frame for Static instead of the firmware's ignored static effect
  command. Six rows are uploaded before the volatile frame is activated.
  This follows the hardware-tested workaround in
  [OpenRazer PR #2827](https://github.com/openrazer/openrazer/pull/2827),
  revision `2c03306a686203c2573daa3d28a5919aa47848ed`.
- Custom-frame commands make at most five attempts when Busy, with bounded
  waits. Invalid responses retain a single retry; transport loss, unsupported
  commands and other EC errors fail immediately. Errors identify the failed
  row or activation and use the existing state rollback and fan-safe recovery.
- Resume and full hardware reapply discard cached CPU/GPU temperatures before
  evaluating fan policy. Manual and Curve control hold the model maximum until
  a new CPU reading arrives, including when the first post-resume reads fail.
- Daemon preference commands report state-file save errors, retain the last
  published preferences, and restore the previous hardware state. Failed
  rollback falls back to EC Auto when possible and reports unconfirmed recovery.
- Power automation retries failed hardware or persistence changes every five
  seconds on the same source. Source changes and successful explicit profile,
  fan or automation choices supersede pending retries.
- Dashboard fan labels distinguish EC Auto, Manual requested targets and Custom
  Curve, and show thermal and missing-CPU-sensor overrides.
- Dashboard and Fan screens warn when telemetry is at least five seconds old,
  even if the stream stops producing events, and clear warnings on fresh data.
- Monitor-only startup retries recognized EC discovery. Lost HID handles are
  replaced without restarting sensors or NVML; recovered hardware receives a
  complete, model-normalized state before software fan control resumes. Fans
  remain at the model maximum until a fresh mandatory CPU reading permits a
  lower target. Availability changes are broadcast to the app.
- Delayed UI command responses cannot replace a newer automation/status event
  or a newer confirmed command. Independent display and panel updates remain
  independent, and command errors continue to surface.
- Tagged releases require the complete reusable application CI to succeed
  before publishing, alongside all existing installer and package gates.
  Reusable CI package artifacts use distinct names from release artifacts;
  package tests download the matching producer's packages, avoiding v4 upload
  conflicts in the shared release run.

### Notes

- Packet, daemon, frontend and release regressions use mock transports and
  isolated state files. The affected issue #7 laptop combines a 2023 motherboard
  and 2024 chassis and still needs a physical color retest before the issue is
  closed. Other model/effect encodings retain their existing behavior.
- Physical unplug/replug, suspend/resume and issue #8 charging-limit confirmation
  remain pending. TDP controls remain research only.

## [1.0.0] — 2026-09-30 — Reliability and hardware telemetry

### Added

- Custom profiles are selectable for AC and battery power automation (issue
  #9), using the saved CPU/GPU boost levels across power-source transitions.
- Fallible packet constructors reject oversized argument payloads without
  panicking, while existing fixed-size constructors keep their wire encoding.
- Blade 16 (2026), USB PID `1532:02e0`, in the supported-model table from
  PR #10. Its capabilities and fan limits follow the contributor's hardware
  report; no additional physical validation was performed in this review.
- Optional iGPU telemetry fields, mock transport coverage, and dashboard cards
  for available telemetry from PR #11.
- A Windows CI job and PowerShell contributor instructions for reviewing,
  building and testing components without opening VFang or installing its
  hardware service.

### Fixed

- Linux display helpers include descendants holding output pipes in their
  deadline and bound captured output, using the daemon's shared runner.
- Internal-panel brightness conversion uses widened arithmetic for the full
  sysfs `u32` range, preserving the existing nonzero brightness floor.
- Source installation builds and stages both packages before one install
  transaction; a failed app build no longer leaves a newly installed daemon.
- Linux strict Clippy accepts the platform-gated GPU query policy.
- Windows mock-backend compilation after PR #11: the shared iGPU reading type
  no longer depends on a Linux-only module.
- GPU sleep reporting now reflects an observed suspended runtime state.
  Skipping an NVML query no longer incorrectly labels an active GPU asleep.
- GPU boost commands reject the CPU-only Boost level; older persisted GPU
  Boost values are normalized to High.
- Missing daemon command-line option values are rejected before hardware
  initialization.
- External-monitor brightness parsing handles extreme values without overflow
  and rejects inconsistent current/maximum readings.
- Late startup snapshots no longer overwrite newer events or confirmed
  settings. Independent startup queries continue when another query fails,
  with a visible Retry action for failures.
- Performance, fan, GPU, lighting and settings controls show pending states
  and command failures, and prevent overlapping saves. Fan-curve editing is
  locked during Apply.
- Toggles retain keyboard focus, show focus feedback and display confirmed
  state. Battery optimizer failures are shown instead of leaving a misleading
  local ON state when the backend rejects the request.
- Keyboard-operated toggles recover focus after a pending save temporarily
  disables them, without taking focus from another control.
- Sidebar navigation follows browser history and marks the active page.
- Release-version updates validate every replacement before writing files, so
  malformed later inputs do not partially update component versions.
- Portable release checks handle Windows file URLs and explicitly skip
  executable fixtures that require POSIX.

### Changed

- RPM/Arch producers refuse occupied package output directories and validate
  both package identities before copying, preserving existing artifacts.
- Source builds use `npm ci`, a locked daemon build, and DEB-only app bundling.
- Removed real Xe activity/frequency polling introduced by PR #11 because
  those sysfs reads can wake GPU hardware. Unavailable readings remain absent;
  mock telemetry continues to provide activity and frequency values.
- Label optional RAPL readings as "Uncore power (iGPU proxy)" and show
  "Activity unavailable" when no activity reading exists. Older or unavailable
  telemetry keeps the existing dashboard layout.
- Clarify OLED/kernel guidance and distinguish Windows component checks from
  Linux integration and physical hardware validation in the documentation.
- GitHub release notes come from the dated changelog, including known
  limitations; publication refuses missing, undated or empty notes.

### Security

- Backport the exact upstream GLib `VariantStrIter` fix for
  [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)
  into the compatible 0.18.5 binding used throughout the GTK graph. The
  optimized regression crashed with unpatched upstream code and passes with
  the backport; the original source/license and provenance are retained.
- Bound daemon request size, client count and incomplete-request/write wait
  times while preserving healthy telemetry subscriptions and lag recovery.
- Bound daemon helper output and inherited-pipe completion by the helper
  deadline, retaining process ownership until cleanup.
- Allowlist installer manifest filenames and prevent package lifecycle
  verifiers from replacing an existing VFang installation.
- Update compatible devalue, nanoid, postcss and event-listener lockfile
  dependencies. The checked npm dependency audit reported no vulnerabilities;
  the Rust dependency audit still has the maintenance advisories listed below.

### Verification and known limitations

- Windows Rust workspace/Tauri tests, frontend tests, portable release
  contracts and parser checks passed in CI, alongside formatting, strict
  Clippy and component builds. POSIX-only fixtures were explicitly skipped on
  Windows. Package lifecycle checks passed on Ubuntu 22.04/24.04/26.04,
  Debian 12/13, Fedora 43/44, Arch Linux and CachyOS containers.
- Linux compilation, mock daemon tests, native Tauri test harnesses and POSIX
  installer/release fixtures are now validated on Zorin OS 18.1 (Ubuntu 24.04
  base). The Blade 18 (2024) upgraded from 0.9.9 to the 1.0.0 test packages
  with saved daemon/UI settings preserved, an active service and a connected
  native Wayland app. Browser-simulator and native-app/mock-daemon interaction
  checks cover navigation, Custom automation, lighting and battery-setting
  persistence; they are not physical hardware validation.
- Issue [#7](https://github.com/bladeandsoulx/vfang-razer-linux/issues/7):
  static RGB packet checks passed, but the modified Blade's green-only lighting
  remains unconfirmed on hardware; no hardware fix is claimed.
- Issue [#8](https://github.com/bladeandsoulx/vfang-razer-linux/issues/8):
  confirmed battery settings survived fresh screen renders and a mock-daemon
  restart. These checks and the improved error reporting do not establish a
  fix for the affected machine's firmware or physical charging behavior.
- Actual GPU power savings and physical fan/battery/lighting behavior remain
  unverified. AC unplug/replug and suspend/resume checks on the Blade still
  require user confirmation. Destructive package lifecycle checks run only in
  disposable validation environments.
- TDP sliders are not included. [Research notes](https://github.com/bladeandsoulx/vfang-razer-linux/blob/v1.0.0/docs/tdp-control-research.md)
  separate CPU/GPU capabilities and require validated limits before exposing
  watt controls; the observed host bounds do not establish a safe range.
- GLib retains its upstream 0.18.5 version for compatibility, so version-only
  scans may continue to report RUSTSEC-2024-0429 despite the source backport.
  Transitive maintenance advisories remain. Package installation is not an atomic
  multi-package rollback, even though both builds finish before it starts.

## [0.9.9] — 2026-08-08 — Arch-family packages

### Added

- First-party x86_64 Pacman packages for VFang and its daemon, installed through
  the same checksum- and metadata-verified one-command flow as DEB and RPM.
- Direct clean-container package coverage for Arch Linux and CachyOS, with
  compatible-family installation for distributions reporting `ID_LIKE=arch`.

### Changed

- Immutable releases now contain eight exact assets: the installer, checksum
  manifest, two DEBs, two RPMs, and two Pacman packages.
- Arch-family builds use baseline x86_64 so all supported Razer Blade CPU
  generations remain eligible.

## [0.9.8] — 2026-07-30 — Wayland window controls

### Fixed

- Native close, minimize, maximize, and resize controls remain responsive on
  GNOME Wayland, including after close-to-tray restoration and second-launch
  activation.

## [0.9.7] — 2026-07-30 — VFang rebrand and Fedora detection repair

### Changed

- The user-facing product is renamed to VFang. Package names, executables,
  service and IPC identities, repository links, and release filenames remain
  unchanged so existing installations upgrade in place.

### Fixed

- VFang installs on Fedora 43 and 44 again. Both releases were rejected before
  anything downloaded: Fedora ships an empty `VERSION_CODENAME`, which the
  installer treated as malformed, and Fedora 43 removed the `PLATFORM_ID` field
  the installer paired against, so every Fedora user saw an unsupported-release
  error. `CPE_NAME` now identifies the Fedora release. `PLATFORM_ID` remains a
  validated legacy parser key but no longer participates in release selection.

### Added

- Installer detection is now tested against the real `/etc/os-release` of every
  Ubuntu, Debian, and Fedora release VFang supports in the release test
  matrix, and each release check confirms those captured files still match the
  distribution they came from.

## [0.9.6] — 2026-07-30 — Ubuntu 26.04 LTS

### Added

- Ubuntu 26.04 LTS is a supported installation base, both as a direct match and
  through the compatible-family path used by derivatives such as Zorin OS, Linux
  Mint, Pop!_OS, and KDE neon.
- Clean-container package lifecycle checks now run on Ubuntu 26.04 before any
  release can be published.

### Fixed

- The from-source build script now reports that it supports Debian and Ubuntu
  only, and points at the RPM packages, instead of failing with a missing
  `apt-get` after asking for administrator access.

## [0.9.5] — 2026-07-23 — Neon Fang installer

### Changed

- The one-command installer now opens with the Neon Fang terminal banner.
- Installation guidance is shorter and more beginner-friendly while retaining
  inspect-first, checksum-verification, manual-package, and source-build paths.
- Release documentation checks protect historical release notes from changes
  that shipped only after their tag.

## [0.9.4] — 2026-07-23 — Immutable release installer

### Added

- A release-locked one-command installer for supported x86_64 Ubuntu, Debian,
  Fedora, and explicitly identified compatible-family distributions.
- Pre-elevation checksum, package metadata, installed-version, and downgrade
  validation for the matching desktop-app and daemon package pair.
- An inspect-first installation path and clean-container DEB lifecycle gates
  for every declared Ubuntu and Debian base.
- The Support screen now identifies BNB Smart Chain (BEP20) and Ethereum
  (ERC20) as accepted networks for USDT donations.

### Changed

- Releases are assembled as an exact six-asset draft, validated remotely,
  published once, and required to become immutable before being advertised.
- The source-build helper is named `packaging/install-from-source.sh`, leaving
  the repository-root `install.sh` for the release installer.

### Removed

- Removed the generic crypto-transfer warning and the instruction to confirm
  the USDT network with the Fang creator. The Support screen now states both
  accepted networks directly.

## [0.9.3] — 2026-07-18 — Fedora RPM support

### Added

- Native x86_64 RPM packages for Fedora 43 and Fedora 44.
- Fedora 43/44 package build, install, launch, dependency, and removal checks.
- `fangd --version` for package and diagnostic verification.

### Changed

- GitHub releases are created only after both DEBs and both RPMs pass their
  release gates.

## [0.9.2] — 2026-07-17 — Support Fang

### Added
- **Dedicated Support screen.** A new sidebar destination explains how
  contributions help fund Fang's development, hardware testing and future
  features while keeping the project independent and open source.
- **Fang creator wallets.** BTC, USDT and Solana addresses include one-click
  copying, responsible-donation guidance, and clear address, network and
  irreversible-transfer warnings.
- **Community-funded roadmap.** A planned Peripherals area covers external
  Razer mice, standalone keyboards, headsets, microphones, mouse docks,
  charging stations, RGB mats and controllers. The screen also highlights
  broader laptop support, possible native Fedora/RHEL packages and a Windows 11
  edition that works fully offline without required accounts, cloud services,
  ads or bundled bloatware. These are future directions, not promises.

## [0.9.1] — 2026-07-17 — Safety, reliability & dependency hardening

### Added
- **Failure-injection safety coverage.** New tests exercise every EC state
  application failure boundary, failed rollback, partial two-fan updates,
  startup recovery, and shutdown restoration without touching real hardware.
- **Protocol and process regression coverage.** Tests now reject malformed,
  stale, truncated and oversized HID replies; prove single-daemon socket
  behavior; and cover helper-process timeouts.
- **Desktop and power fixtures.** Multi-monitor KDE/X11 fixtures verify primary
  output selection, power-supply fixtures cover multiple barrel and USB-C/PD
  adapters, and Rust/JavaScript tests cover transactional autostart failures.
- **Unknown-model bring-up documentation.** README and hardware-testing docs
  explain the exact-PID opt-in, conservative limits, verification workflow and
  how to remove the systemd override after adding a proper model profile.

### Changed
- **Strict EC response validation.** HID replies must now have the exact report
  length, valid framing and checksum, and match the request's transaction,
  command and data size. Malformed or stale replies are retried once and never
  accepted as successful hardware writes.
- **One hardware controller at a time.** A process-wide lock is acquired before
  opening HID or applying state, including for alternate socket paths and the
  automatic-fan restore helper. Live sockets and unrelated filesystem entries
  are never removed during startup or shutdown.
- **Unknown hardware is monitor-only by default.** An unlisted Razer PID is no
  longer selected just because it exposes a vendor usage page. Bring-up now
  requires an exact `FANGD_ALLOW_UNVERIFIED_PID` opt-in; known model PIDs are
  unaffected.
- **Active primary display selection.** KDE and X11 now target the primary
  enabled output instead of hardcoding an `eDP` panel, with active-output
  fallback for layouts without a declared primary. Display helpers have hard
  timeouts and run off the Tauri UI thread.
- **Patched frontend toolchain.** Svelte, Vite, and the Svelte Vite plugin were
  upgraded together to 5.56.5, 6.4.3, and 5.1.1 respectively. Ambiguous
  self-closing HTML markup was updated for a warning-free Svelte 5 build.
- **Complete 0.9.1 package synchronization.** Workspace crates, the Tauri app,
  npm metadata, both lockfiles and the desktop package dependency bounds now
  agree on the 0.9.1 release line.

### Fixed
- **Svelte 5 desktop startup.** The frontend now mounts its root component with
  Svelte 5's `mount()` API instead of the removed class-constructor API, fixing
  an empty black desktop window after the dependency upgrade.
- **Correct Razer HID checksum boundaries.** The checksum now covers the full
  Razer payload after the HID, status and transaction headers, including the
  final argument byte. This matches the Blade EC's real wire responses.
- **Transactional fan recovery.** Failed state changes restore the previous
  complete state; if that also fails, both fan zones are returned to EC Auto.
  Partial two-zone RPM updates are recovered at the model's safe maximum and
  target-only writes stay disabled until a complete state application succeeds.
- **Multiple power adapters.** AC detection now checks all barrel, USB,
  USB-C/PD, wireless, and compatible external supplies. An offline adapter can
  no longer hide a later online one.
- **Transactional autostart settings.** The OS entry is changed before an
  atomic settings-file replacement, failed writes roll the OS state back, and
  the frontend publishes only backend-confirmed settings. Startup also
  reconciles legacy saved state with the actual OS entry; failures are shown in
  Settings and the toggle returns to its last confirmed value.

### Security
- Enabled a restrictive production and development Tauri CSP, allowing only
  bundled assets, Tauri IPC, and Fang's GitHub release-check API request.
- Updated the Tauri `plist` chain to 1.10.0 and `quick-xml` to 0.41.0, resolving
  RUSTSEC-2026-0194 and RUSTSEC-2026-0195. Full and production-only npm audits
  now report zero advisories.

## [0.9.0] — 2026-07-15 — In-app update checker

### Added
- **Check for updates button.** Settings now compares the installed Fang
  version with the latest stable release published on GitHub.
- When a newer version is available, Fang links directly to its release page
  so the matching app and daemon packages can be downloaded together.

## [0.8.2] — 2026-07-13 — Single-instance desktop app

### Added
- **Single-instance protection.** Launching Fang while it is already running
  now restores and focuses the existing window instead of opening a second app
  instance.
- A native information dialog clearly explains that Fang is already open when
  a second launch is attempted.

## [0.8.1] — 2026-07-13 — External-monitor recovery

### Added
- **One-click DDC/CI rescan.** The Lighting screen can immediately search again
  for a connected external monitor without restarting `fangd`.

### Changed
- While no DDC/CI monitor is available, the daemon retries discovery every 15
  seconds. It does no periodic helper work after a monitor has been found.
- The app/daemon socket API is now version 2, adding the explicit DDC rescan
  command. The 0.8.1 desktop package requires `fangd` 0.8.1 or newer.

### Fixed
- DDC/CI discovery no longer caches an early-boot failure until the daemon is
  restarted, so monitors connected after startup recover automatically.
- Failed monitor brightness or color writes now invalidate stale monitor state
  and allow automatic rediscovery to begin.

## [0.8.0] — 2026-07-12 — Fan curves & safety hardening

### Added
- **Custom fan curves.** Define 2–8 temperature/RPM points; the daemon uses the
  hotter CPU/GPU sensor and linearly interpolates the target between points.
- **Mandatory thermal override.** Manual and Curve modes are forced to the
  model's maximum fan target at CPU ≥95 °C or GPU ≥87 °C. The guard cannot be
  disabled and uses hysteresis before releasing.
- **Sensor-loss watchdog.** Manual and Curve start at maximum RPM and only
  relax after a fresh CPU reading. A stale, missing or implausible CPU sensor
  forces maximum fans, with automatic hwmon rediscovery.
- **App/daemon API handshake.** Read-only status remains available across
  versions, but hardware writes are rejected unless both packages use the same
  socket API.

### Changed
- TCP is now strictly a development transport: it requires mock mode and a
  numeric loopback address.
- DDC and GPU helper programs now run outside the thermal-control lock with
  hard timeouts, so a slow helper cannot delay the 1 Hz fan guard.
- Stopping or crashing the service restores EC automatic fan control. systemd
  runs a second restore helper after shutdown as a fallback.

### Fixed
- All Cargo, npm, Tauri and lockfile versions now agree on 0.8.0. The desktop
  package requires a compatible 0.8.x fangd package, and CI checks version
  synchronization.

### Removed
- **Creator mode** has been removed from the protocol, daemon, tray and UI.

## [0.7.0] — 2026-07-07 — Power-source automation

### Added
- **Power-source automation** on the Performance screen: automatically apply a
  performance profile when AC power is connected or removed. Each source
  (AC / battery) maps to a profile — Silent / Balanced / Creator / Gaming — plus
  an independent fan choice: follow the mode's own curve, or pin the fans quiet.
  The daemon reads the AC adapter from `/sys/class/power_supply` (matching the
  `Mains` supply type, so USB-C PD and the battery are ignored) and applies the
  mapped profile on each transition, including at startup. The live source is
  shown with a "now" badge. Off by default.

## [0.6.0] — 2026-07-06 — External-monitor brightness

### Added
- **External-monitor brightness over DDC/CI.** A luminance slider for the
  external display (VCP feature 0x10), scaled to the monitor's own range and
  sent through the daemon (`SetMonitorBrightness`). Shares the "External
  monitor" card with the color presets; hidden when the monitor doesn't report
  the feature.
- **In-app Changelog screen** between Lighting and Settings, so release notes
  are readable without leaving the app.

### Changed
- **Lighting layout** is now two masonry-style columns: the internal
  laptop-panel brightness card sits directly beneath the lid-logo card, instead
  of landing diagonally opposite it in the old auto-flow grid.

### Fixed
- **Creator mode re-enabled on the Blade 18** (2023/2024). Creator is EC power
  mode 2 — a standard Razer mode, not an undefined one — so the earlier
  per-model gate wrongly hid it.
- **Honest fan-speed labels.** Razer laptops expose no live tachometer, so the
  fan figure is the EC's target setpoint, not a live measurement. The readout
  and its hint now say so, instead of implying a static number is a live
  reading.

## [0.5.0] — 2026-07-05 — Display color & brightness

### Added
- **External-monitor color control over DDC/CI.** The external monitor's own
  hardware color-temperature presets (Warm / sRGB·D65 6500K / Neutral / Cool /
  Custom) are now switchable from the app. Handled by the daemon (which owns
  i2c access) via `ddcutil` (VCP feature 0x14), with a `SetColorPreset` command
  and the presets a monitor advertises exposed on the status.
- **Internal laptop-panel brightness.** A brightness slider for the built-in
  screen, read from `/sys/class/backlight` and applied through logind's
  `SetBrightness` (no root, works on Wayland; clamped to 5–100 %).

### Changed
- The old "Color profile" feature (colord ICC assignment) was **inert on GNOME
  Wayland** — the standard colorspace profiles carry no VCGT and GNOME never
  applies gamut mapping, so switching did nothing. It has been replaced by the
  DDC/CI path above. True Synapse-style gamut clamp of the internal wide-gamut
  panel has no app-reachable mechanism on GNOME Wayland; this is documented in
  the UI.
- Panel brightness and monitor color moved onto the **Lighting** screen,
  alongside keyboard and logo lighting.

## [0.4.0] — 2026-07-05 — Refresh-rate switching on GNOME

### Added
- **GNOME Mutter refresh-rate backend** (`org.gnome.Mutter.DisplayConfig`),
  tried ahead of `kscreen-doctor` and `xrandr`. It drives the primary monitor —
  external displays included — reconstructing the full logical-monitor layout
  and swapping a single monitor's mode.

### Fixed
- Refresh-rate switching no longer reports "no supported tool" on GNOME Wayland,
  where `xrandr` runs under XWayland and never sees the real outputs.

### Credits
- Attribution added (README + in-app About) for
  [Razer-Control](https://github.com/Rintastic247/Razer-Control) by Rintastic247
  (GPL-2.0), the source of much of Fang's hardware knowledge, with a link to the
  author's donation page.

## [0.3.0] — 2026-07-04 — Lighting & power telemetry

### Added
- **Lighting control** (EC class 0x03): keyboard backlight brightness, hardware
  effects (Off / Static RGB / Spectrum / Wave), and the lid logo LED
  (Off / Static / Breathing), gated on the per-model "logo" feature. New
  Lighting screen; state persists and re-applies on boot and resume.
- **Power-draw telemetry** on the dashboard: CPU package watts via RAPL and GPU
  watts via NVML (behind the runtime-PM gate), shown under the temperature
  gauges.

## [0.2.0] — 2026-07-04 — Hardware support & battery

### Added
- **Battery Health Optimizer** — Synapse-style charge limiter (50–80 %) over the
  EC (class 0x07), gated on the per-model "bho" feature and re-applied after
  reboot/resume. Exposed as a Battery card in Settings.
- **48-model device table** imported from Razer-Control's `laptops.json`
  (GPL-2.0): per-model fan limits and feature flags (CPU overclock boost,
  battery limiter, Creator mode) for Blades from 2015–2025.
- **Verified profile for the Razer Blade 18 2024**, unlocking
  the CPU overclock boost level and dropping the "unverified" badge.

### Fixed
- **Creator mode** (EC power mode 2) is now gated on a per-model flag — it's
  defined on only six 2019–2020 models. On everything else it was an undefined
  EC mode (the same failsafe trap as Silent), so the daemon rejects it and the
  UI hides the card.

## [0.1.1] — 2026-07-04 — First-hardware fixes

### Fixed
- **"Daemon offline" on every launch.** The Tauri v2 app shipped with no
  capability file, so the UI was denied all core APIs and its connection-event
  listener was rejected before init finished. Added a `core:default` capability.
- **Daemon hang shown as a stuck "searching…".** The telemetry loop cycled
  `nvmlInit`/`nvmlShutdown` every second, which could livelock the NVIDIA driver
  and wedge the core loop. NVML now holds one session for the daemon's lifetime,
  and each GPU query is gated on the card's sysfs runtime-PM state — so sampling
  never wakes a sleeping dGPU or blocks RTD3.
- **Idle dashboard pinned the GPU** (~30 % on the iGPU). The fan rotor ran an
  unthrottled `requestAnimationFrame` loop and two infinite CSS `box-shadow`
  animations forced constant re-rasterization. Throttled to ~30 fps (paused when
  hidden) and made the glows static — measured render-engine use dropped from
  5.7 % to 0.8 %.
- **Silent mode was the loudest mode.** It was mapped to EC power mode 3, which
  the Razer EC doesn't define; the EC answered it with a max-fan
  failsafe. Silent now rides on the EC's Custom mode with both boosts pinned to
  Low.

## [0.1.0] — Initial release

- Performance modes (Silent / Balanced / Creator / Gaming / Custom) and CPU/GPU
  boost over the Razer EC.
- Fan control: automatic EC curve or manual RPM, clamped to per-model limits.
- Live dashboard: CPU/GPU temperature gauges, fan RPM, sparkline history.
- GPU mode switching (`prime-select` / `envycontrol`) and system tray + autostart.
- Privileged `fangd` daemon + unprivileged Tauri/Svelte app over a Unix socket;
  settings persist and re-apply after reboot and suspend/resume.

[0.9.8]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.9.8
[0.9.7]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.9.7
[0.9.6]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.9.6
[0.9.5]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.9.5
[0.9.4]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.9.4
[0.9.3]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.9.3
[0.9.2]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.9.2
[0.9.1]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.9.1
[0.9.0]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.9.0
[0.8.2]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.8.2
[0.8.1]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.8.1
[0.8.0]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.8.0
[0.7.0]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.7.0
[0.6.0]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.6.0
[0.5.0]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.5.0
[0.4.0]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.4.0
[0.3.0]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.3.0
[0.2.0]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.2.0
[0.1.1]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.1.1
[0.1.0]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.1.0
