# VFang 0.9.8 Wayland Window Controls Fix

**Date:** 2026-07-30

## Problem

On GNOME Wayland, VFang's native close, minimize, maximize, and resize
controls can intermittently stop receiving pointer input. Double-clicking the
native title bar temporarily restores the controls.

The failure matches
[`tauri-apps/tauri#13440`](https://github.com/tauri-apps/tauri/issues/13440).
VFang currently resolves Tauri 2.11.5 and TAO 0.35.3. In that TAO release, the
Wayland client-side decoration title bar is wrapped in a `GtkEventBox` whose
above-child input window can intercept events intended for the native title-bar
buttons. A maximize/restore cycle re-stacks the GTK input windows, which
explains the observed double-click workaround.

The upstream correction was merged in
[`tauri-apps/tao#1218`](https://github.com/tauri-apps/tao/pull/1218) for TAO
0.36.0. Tauri 2.11's runtime dependency still requires TAO `^0.35`, so VFang
cannot consume TAO 0.36 without an unreleased or forked Tauri runtime.

## Goals

- Keep the native desktop title bar and its close, minimize, maximize, and
  resize behavior responsive on Linux Wayland.
- Preserve the existing close-to-tray behavior.
- Make restoration from the tray or a second launch safe if GTK recreates or
  re-stacks the title bar.
- Avoid changing window behavior on Windows, macOS, or Linux desktops whose
  native title bar does not use the affected GTK structure.
- Keep the workaround small and easy to remove after Tauri adopts TAO 0.36 or
  newer.

## Non-goals

- Replacing the native title bar with custom HTML controls.
- Forcing all Linux users through XWayland.
- Changing VFang's default window dimensions or minimum dimensions.
- Changing the close-to-tray preference or tray menu behavior.
- Depending on an unreleased Tauri branch or a third-party TAO fork.
- Creating, tagging, or publishing the GitHub release as part of the code
  change. Publication remains a separate explicit action after review.

## Release Scope

Ship the correction as VFang 0.9.8. The repository's version setter will move
the desktop app, daemon, Cargo/npm/Tauri manifests and lockfiles, DEB/RPM
metadata, release installer, and installer banner to 0.9.8 as one synchronized
release line. The daemon is rebuilt at 0.9.8 even though its behavior is
unchanged, because VFang's release contract distributes and installs a matched
app/daemon package pair.

The top-level and in-app changelogs will add a 0.9.8 “Wayland window controls”
entry. Pinned README install examples and their documentation contract will
also move to v0.9.8. Historical release notes remain unchanged.

## Design

### Linux compatibility helper

Add a Linux-only helper in the Tauri application. On GTK's main thread, it
will:

1. obtain VFang's native GTK window from the Tauri `WebviewWindow`;
2. obtain the current native title-bar widget;
3. act only when that widget is a `gtk::EventBox`; and
4. set `above_child` to `false`.

The structural `EventBox` check is the platform guard used by existing fixes
for the same upstream bug. On X11 or on a future GTK/TAO layout where the
title bar is not the affected event box, the helper is a no-op. The helper is
idempotent.

The Linux target will declare the same GTK 3 crate line already used by Tauri,
so VFang can access the native widget API without adding GTK to non-Linux
builds.

### Lifecycle integration

Apply the helper:

- during Tauri setup after the main window exists; and
- after `show_main_window` restores and focuses an existing window.

The second application covers tray restoration and the single-instance
activation path. Reapplying the same property is harmless and protects against
GTK replacing or re-stacking the title-bar widget while the window is hidden.

Failures to obtain the GTK window or title bar will remain non-fatal. VFang
will log a debug message and continue rather than preventing the control center
from starting.

### Upstream removal

The helper will carry a comment linking the upstream TAO fix. When VFang can
upgrade to a Tauri runtime that resolves TAO 0.36 or newer, the compatibility
helper, direct GTK dependency, and its dedicated regression test can be
removed together after a Wayland smoke test.

## Testing

Add a Linux-only GTK test around the production helper's core operation. The
test will create a real `gtk::EventBox`, set `above_child` to `true`, run the
helper, and assert that the real widget property becomes `false`. It will also
verify that a non-`EventBox` widget is left alone.

The Tauri CI job will install Xvfb and run the Rust application tests under
`xvfb-run`, giving GTK a real display without requiring an interactive desktop.
This tests VFang's widget correction rather than checking source text or a
mock.

Verification will include:

- the focused GTK regression test;
- all Tauri Rust tests under Xvfb;
- Rust formatting and Clippy with warnings denied;
- frontend tests and production build;
- the repository's existing daemon, installer, DEB, and RPM contract suites;
  and
- a manual GNOME Wayland smoke test covering initial launch, minimize,
  maximize/restore, close-to-tray, tray restore, and second-launch activation.

## Acceptance Criteria

- Native title-bar buttons work immediately after VFang opens on GNOME
  Wayland.
- The buttons continue working after close-to-tray and tray restoration.
- Launching VFang while it is already running brings the existing window
  forward without leaving its controls unresponsive.
- Close-to-tray still hides the window when enabled.
- X11 and non-Linux builds retain their existing behavior.
- Every independently packaged component and installer reference reports
  version 0.9.8, and the app requires the matching 0.9.x daemon release line.
- The README and both changelog surfaces describe 0.9.8.
- The complete automated test suite remains green.
