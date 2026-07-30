# VFang 0.9.8 Wayland Window Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release VFang 0.9.8 with native close, minimize, maximize, and resize controls that remain responsive on GNOME Wayland.

**Architecture:** Add a small Linux-only GTK compatibility helper that lowers TAO's affected title-bar `GtkEventBox` below its child. Invoke the idempotent helper when the main window is created and whenever it is restored, and run its real-widget regression test under Xvfb in CI.

**Tech Stack:** Rust 2021, Tauri 2.11, TAO 0.35, GTK 3 (`gtk` 0.18), GitHub Actions, Xvfb

## Global Constraints

- Preserve native desktop decorations; do not add a custom HTML title bar.
- Preserve the existing close-to-tray setting and tray behavior.
- Do not force Linux users through XWayland.
- Do not depend on unreleased Tauri code or a third-party TAO fork.
- The correction must be Linux-only, structurally guarded, idempotent, and a no-op when the affected `GtkEventBox` is absent.
- Apply the correction during setup and after every existing-window restore.
- Keep Windows, macOS, and unaffected Linux window behavior unchanged.
- Link the temporary compatibility code to `tauri-apps/tao#1218` and make its removal condition explicit.
- Test a real GTK widget rather than source text or a mock.
- Keep all independently packaged app and daemon components synchronized at
  version 0.9.8.
- Prepare reviewable 0.9.8 source and package metadata only; do not create a
  tag or publish a GitHub release without a separate explicit request.

---

### Task 1: Repair the native GTK title-bar event layer

**Files:**
- Create: `app/src-tauri/src/window.rs`
- Modify: `app/src-tauri/src/main.rs:1-5`
- Modify: `app/src-tauri/src/main.rs:306-312`
- Modify: `app/src-tauri/src/main.rs:415-424`
- Modify: `app/src-tauri/Cargo.toml:27-30`
- Modify: `app/src-tauri/Cargo.lock`

**Interfaces:**
- Consumes: `tauri::WebviewWindow::gtk_window`, `tauri::WebviewWindow::run_on_main_thread`, and GTK 3's native title-bar widget.
- Produces: `window::repair_csd_titlebar_input(window: &tauri::WebviewWindow) -> ()`.
- Produces on Linux: `lower_titlebar_event_box(titlebar: &gtk::Widget) -> bool`, returning `true` only when it corrected an affected `gtk::EventBox`.

- [ ] **Step 1: Add the Linux GTK test dependency and write the failing real-widget test**

Add GTK beside the existing Linux-only `zbus` dependency:

```toml
[target.'cfg(target_os = "linux")'.dependencies]
gtk = "0.18"
zbus = "4"
```

Declare the module near the other modules in `app/src-tauri/src/main.rs`:

```rust
mod client;
mod display;
mod panel;
mod window;
```

Create `app/src-tauri/src/window.rs` with the test first:

```rust
#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::linux::lower_titlebar_event_box;
    use gtk::prelude::*;

    #[test]
    fn changes_only_the_affected_event_box_input_order() {
        gtk::init().expect("GTK test display");

        let event_box = gtk::EventBox::new();
        event_box.set_above_child(true);
        let event_box_widget = event_box.clone().upcast::<gtk::Widget>();

        assert!(lower_titlebar_event_box(&event_box_widget));
        assert!(!event_box.is_above_child());

        let label = gtk::Label::new(Some("ordinary title"));
        let label_widget = label.upcast::<gtk::Widget>();
        assert!(!lower_titlebar_event_box(&label_widget));
    }
}
```

Refresh the standalone Tauri lockfile without upgrading unrelated packages:

```bash
cargo check --manifest-path app/src-tauri/Cargo.toml --locked
```

If `--locked` reports that the lockfile must change, run:

```bash
cargo check --manifest-path app/src-tauri/Cargo.toml
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from a graphical Linux session:

```bash
cargo test --manifest-path app/src-tauri/Cargo.toml \
  window::tests::changes_only_the_affected_event_box_input_order \
  -- --exact --nocapture --test-threads=1
```

Expected: compilation fails because `linux::lower_titlebar_event_box` does not exist. This proves the test names the missing production boundary before the workaround is implemented.

- [ ] **Step 3: Implement the minimal Linux correction and cross-platform entry point**

Place this production code above the test module in `app/src-tauri/src/window.rs`:

```rust
use tauri::WebviewWindow;

pub(crate) fn repair_csd_titlebar_input(window: &WebviewWindow) {
    #[cfg(target_os = "linux")]
    linux::repair_csd_titlebar_input(window);

    #[cfg(not(target_os = "linux"))]
    let _ = window;
}

#[cfg(target_os = "linux")]
mod linux {
    use gtk::prelude::*;
    use tauri::WebviewWindow;

    pub(super) fn repair_csd_titlebar_input(window: &WebviewWindow) {
        let handle = window.clone();
        if let Err(error) = window.run_on_main_thread(move || {
            let Ok(gtk_window) = handle.gtk_window() else {
                log::debug!("native GTK window is unavailable; skipping CSD input repair");
                return;
            };
            let Some(titlebar) = gtk_window.titlebar() else {
                log::debug!("native GTK title bar is unavailable; skipping CSD input repair");
                return;
            };

            if lower_titlebar_event_box(&titlebar) {
                log::debug!("repaired native Wayland title-bar input ordering");
            }
        }) {
            log::debug!("could not schedule native title-bar input repair: {error}");
        }
    }

    // Temporary compatibility fix for tauri-apps/tao#1218. Remove this
    // helper and the direct GTK dependency after Tauri resolves TAO >= 0.36.
    pub(super) fn lower_titlebar_event_box(titlebar: &gtk::Widget) -> bool {
        let Some(event_box) = titlebar.downcast_ref::<gtk::EventBox>() else {
            return false;
        };
        event_box.set_above_child(false);
        true
    }
}
```

- [ ] **Step 4: Apply the correction at initial setup and every restore**

Update `show_main_window` in `app/src-tauri/src/main.rs`:

```rust
fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        window::repair_csd_titlebar_input(&w);
    }
}
```

Apply it once during setup, immediately after the tray is built and before the
optional minimized-start hide:

```rust
build_tray(&handle)?;
if let Some(window) = app.get_webview_window("main") {
    window::repair_csd_titlebar_input(&window);
}
if std::env::args().any(|a| a == "--minimized") {
```

- [ ] **Step 5: Run the focused test and verify GREEN**

```bash
cargo fmt --manifest-path app/src-tauri/Cargo.toml
cargo test --manifest-path app/src-tauri/Cargo.toml \
  window::tests::changes_only_the_affected_event_box_input_order \
  -- --exact --nocapture --test-threads=1
```

Expected: the GTK test passes, proving the production helper clears
`above_child` on a real `gtk::EventBox` and ignores an unrelated widget.

- [ ] **Step 6: Verify the complete Tauri shell before committing**

```bash
cargo fmt --manifest-path app/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path app/src-tauri/Cargo.toml \
  --bin fang --all-targets -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml \
  --bin fang -- --test-threads=1
```

Expected: formatting, Clippy, and every Tauri Rust test pass.

- [ ] **Step 7: Commit the tested window repair**

```bash
git add app/src-tauri/src/window.rs app/src-tauri/src/main.rs \
  app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock
git commit -m "fix(app): restore Wayland window controls"
```

---

### Task 2: Run the GTK regression in CI

**Files:**
- Modify: `.github/workflows/ci.yml:61-79`

**Interfaces:**
- Consumes: the Linux-only GTK regression from Task 1.
- Produces: a CI environment with an X display for the real-widget regression.

- [ ] **Step 1: Give the Tauri CI job a virtual GTK display**

Extend the app job's package installation in `.github/workflows/ci.yml`:

```yaml
      - run: >
          sudo apt-get update && sudo apt-get install -y --no-install-recommends
          libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev
          libayatana-appindicator3-dev libudev-dev xvfb xauth
```

Replace only the Tauri test command:

```yaml
      - run: xvfb-run -a cargo test --bin fang -- --test-threads=1
        working-directory: app/src-tauri
```

Do not put formatting, Clippy, frontend tests, or frontend builds under Xvfb.

- [ ] **Step 2: Check the workflow change**

```bash
git diff --check
git diff -- .github/workflows/ci.yml
```

Expected: no whitespace errors; the workflow changes only the app job's GTK
packages and Rust test command.

- [ ] **Step 3: Re-run the affected application gates**

Run the GTK test against the current graphical session:

```bash
cargo test --manifest-path app/src-tauri/Cargo.toml \
  window::tests::changes_only_the_affected_event_box_input_order \
  -- --exact --nocapture --test-threads=1
```

Then run the frontend gates:

```bash
npm --prefix app test
npm --prefix app run build
```

Expected: the GTK regression, all frontend tests, and the Vite production build
pass.

- [ ] **Step 4: Commit the CI integration**

```bash
git add .github/workflows/ci.yml
git commit -m "test(app): exercise GTK controls under Xvfb"
```

---

### Task 3: Prepare the synchronized VFang 0.9.8 release

**Files:**
- Modify through the version setter: `Cargo.toml`
- Modify through the version setter: `Cargo.lock`
- Modify through the version setter: `app/package.json`
- Modify through the version setter: `app/package-lock.json`
- Modify through the version setter: `app/src-tauri/Cargo.toml`
- Modify through the version setter: `app/src-tauri/Cargo.lock`
- Modify through the version setter: `app/src-tauri/tauri.conf.json`
- Modify through the version setter: `install.sh`
- Modify through the version setter: `packaging/installer/banner.txt`
- Modify through the version setter: `packaging/rpm/fang.spec`
- Modify through the version setter: `packaging/rpm/fangd.spec`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `app/src/screens/Changelog.svelte`
- Modify: `app/src/lib/changelog-content.test.js`
- Modify: `packaging/release/release-contract.test.mjs`

**Interfaces:**
- Consumes: `node app/scripts/version.mjs set 0.9.8`.
- Produces: synchronized 0.9.8 app/daemon manifests, package constraints,
  installer identity, release notes, and install examples.
- Preserves: historical release entries and the runtime package/binary names
  `fang`, `fangd`, and `Fang`.

- [ ] **Step 1: Write failing 0.9.8 changelog and documentation expectations**

Update `app/src/lib/changelog-content.test.js` before its production data:

```js
test('the in-app changelog contains the latest releases in descending order', () => {
  const v098 = panel.indexOf("version: '0.9.8'");
  const v097 = panel.indexOf("version: '0.9.7'");
  const v096 = panel.indexOf("version: '0.9.6'");
  const v095 = panel.indexOf("version: '0.9.5'");
  const v094 = panel.indexOf("version: '0.9.4'");
  const v093 = panel.indexOf("version: '0.9.3'");
  const v092 = panel.indexOf("version: '0.9.2'");

  assert.ok(v098 >= 0, 'v0.9.8 must be present');
  assert.ok(v097 > v098, 'v0.9.7 must follow v0.9.8');
  assert.ok(v096 > v097, 'v0.9.6 must follow v0.9.7');
  assert.ok(v095 > v096, 'v0.9.5 must follow v0.9.6');
  assert.ok(v094 > v095, 'v0.9.4 must follow v0.9.5');
  assert.ok(v093 > v094, 'v0.9.3 must follow v0.9.4');
  assert.ok(v092 > v093, 'v0.9.2 must follow v0.9.3');
});

test('v0.9.8 records the Wayland window-controls repair', () => {
  const v098Start = panel.indexOf("version: '0.9.8'");
  const v097Start = panel.indexOf("version: '0.9.7'");
  const v098Panel = panel.slice(v098Start, v097Start);
  const v098Changelog = changelog.slice(
    changelog.indexOf('## [0.9.8]'),
    changelog.indexOf('## [0.9.7]')
  );

  assert.ok(v098Start >= 0, 'v0.9.8 must be present');
  assert.ok(v097Start > v098Start, 'v0.9.7 must follow v0.9.8');
  assert.match(v098Panel, /GNOME Wayland/i);
  assert.match(v098Panel, /close.*minimize.*maximize.*resize/i);
  assert.match(v098Changelog, /## \[0\.9\.8\].*Wayland window controls/);
  assert.match(v098Changelog, /close-to-tray/i);
  assert.match(v098Changelog, /second-launch/i);
});
```

Change only the three pinned-release expectations in
`packaging/release/release-contract.test.mjs` from 0.9.7 to 0.9.8:

```js
assert.match(readme, /releases\/download\/v0\.9\.8\/\{install\.sh,SHA256SUMS\}/);
assert.match(
  readme,
  /sudo apt install \.\/fangd_0\.9\.8-1_amd64\.deb \.\/Fang_0\.9\.8_amd64\.deb/
);
assert.match(
  readme,
  /sudo dnf install \.\/fangd-0\.9\.8-1\.x86_64\.rpm \.\/fang-0\.9\.8-1\.x86_64\.rpm/
);
```

- [ ] **Step 2: Run the release-facing tests and verify RED**

```bash
node --test app/src/lib/changelog-content.test.js
node packaging/release/release-contract.test.mjs
```

Expected: the changelog test fails because 0.9.8 is absent from the panel and
top-level changelog; the release-contract test fails because README still pins
0.9.7.

- [ ] **Step 3: Synchronize every packaged component at 0.9.8**

Use the repository's single version-writing boundary:

```bash
node app/scripts/version.mjs set 0.9.8
```

This updates Cargo, npm, Tauri, DEB/RPM, release-installer, banner, and lockfile
versions together. Do not hand-edit files owned by this command.

Add the new top entry to `CHANGELOG.md`:

```markdown
## [0.9.8] — 2026-07-30 — Wayland window controls

### Fixed

- Native close, minimize, maximize, and resize controls remain responsive on
  GNOME Wayland, including after close-to-tray restoration and second-launch
  activation.
```

Add this link before the 0.9.7 link at the end:

```markdown
[0.9.8]: https://github.com/bladeandsoulx/vfang-razer-linux/releases/tag/v0.9.8
```

Add the matching newest entry in `app/src/screens/Changelog.svelte`:

```js
{
  version: '0.9.8',
  date: '2026-07-30',
  title: 'Wayland window controls',
  groups: [
    {
      kind: 'Fixed',
      items: [
        'Native close, minimize, maximize, and resize controls remain responsive on GNOME Wayland, including after close-to-tray restoration and second-launch activation.'
      ]
    }
  ]
},
```

Update only the pinned release prose and package examples in `README.md` from
0.9.7 to 0.9.8. Keep the `releases/latest` commands unchanged.

- [ ] **Step 4: Verify GREEN and inspect the release delta**

```bash
node app/scripts/version.mjs check
node --test app/scripts/version.test.mjs
node --test app/src/lib/changelog-content.test.js
node packaging/release/release-contract.test.mjs
git diff --check
git diff --stat
git diff -- Cargo.toml Cargo.lock app/package.json app/package-lock.json \
  app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock \
  app/src-tauri/tauri.conf.json install.sh packaging/installer/banner.txt \
  packaging/rpm/fang.spec packaging/rpm/fangd.spec CHANGELOG.md README.md \
  app/src/screens/Changelog.svelte app/src/lib/changelog-content.test.js \
  packaging/release/release-contract.test.mjs
```

Expected: every version source reports 0.9.8; the app and daemon remain a
matched pair; README and both changelog surfaces describe the new release; no
unrelated dependency or historical changelog changes appear.

- [ ] **Step 5: Commit the 0.9.8 release preparation**

```bash
git add Cargo.toml Cargo.lock app/package.json app/package-lock.json \
  app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock \
  app/src-tauri/tauri.conf.json install.sh packaging/installer/banner.txt \
  packaging/rpm/fang.spec packaging/rpm/fangd.spec CHANGELOG.md README.md \
  app/src/screens/Changelog.svelte app/src/lib/changelog-content.test.js \
  packaging/release/release-contract.test.mjs
git commit -m "build: prepare VFang 0.9.8"
```

---

### Task 4: Complete repository and GNOME Wayland verification

**Files:**
- Verify only; no source files change.

**Interfaces:**
- Consumes: the complete implementation and release preparation from Tasks
  1–3.
- Produces: automated and interactive evidence that the fix works without regressing packaging or close-to-tray behavior.

- [ ] **Step 1: Run every local automated gate**

```bash
node app/scripts/version.mjs check
node --test app/scripts/version.test.mjs
node packaging/installer/installer.test.mjs
node packaging/release/release-contract.test.mjs
node packaging/release/publish.test.mjs
node packaging/deb/verify.test.mjs
node --test packaging/rpm/build-script.test.mjs packaging/rpm/metadata.test.mjs
shellcheck install.sh packaging/install-from-source.sh packaging/rpm/build.sh \
  packaging/rpm/verify.sh packaging/deb/verify.sh packaging/release/publish.sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm --prefix app test
npm --prefix app run build
cargo fmt --manifest-path app/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path app/src-tauri/Cargo.toml \
  --bin fang --all-targets -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml \
  --bin fang -- --test-threads=1
git diff --check
```

Expected: every command exits zero with no test failures or lint errors, and
the version check reports 0.9.8.

- [ ] **Step 2: Build the corrected desktop binary**

```bash
npm --prefix app run tauri -- build --no-bundle
```

Expected: `app/src-tauri/target/release/fang` is produced successfully.

- [ ] **Step 3: Smoke-test the native controls on GNOME Wayland**

Ensure no installed or development VFang process is running, then launch:

```bash
app/src-tauri/target/release/fang
```

On the native GNOME Wayland window, verify in order:

1. resize from a window edge immediately after launch;
2. minimize and restore;
3. maximize and restore;
4. press close with close-to-tray enabled, then restore from the tray;
5. repeat resize, minimize, maximize, and close after restoration;
6. start `app/src-tauri/target/release/fang` a second time, dismiss the
   already-running notice, and repeat the controls once more.

Expected: every native control responds on the first interaction; no
double-click workaround is needed; close-to-tray and single-instance behavior
remain intact.

- [ ] **Step 4: Inspect final repository state**

```bash
git status --short --branch
git log --oneline -5
git diff origin/main...HEAD --stat
```

Expected: the worktree is clean and the branch contains only the design, plan,
tested window repair, CI integration, and 0.9.8 release-preparation commits.

- [ ] **Step 5: Stop before publication**

Do not create `v0.9.8`, push a tag, or run the release workflow in this plan.
Hand off the verified branch for review. Publishing the immutable six-asset
release requires a separate explicit user instruction after the branch is
merged.
