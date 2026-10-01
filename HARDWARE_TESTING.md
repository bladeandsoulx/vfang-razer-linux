# First run on real hardware (Razer Blade, Ubuntu, Fedora, Arch, or CachyOS)

VFang's EC packet layer is byte-verified against razer-laptop-control, but
this checklist is for the first boot on a physical Blade. Work through it in
order; each step has a rollback.

## 0. Baseline

```sh
lsusb -d 1532:            # note the product id (e.g. 1532:02a0)
sensors | head -30        # confirm coretemp is visible
cat /etc/os-release             # record distribution and version
echo "${XDG_SESSION_TYPE:-?}"   # record Wayland or X11
getenforce 2>/dev/null || true  # Fedora: record enforcing/permissive/disabled
```

VFang recognizes the PIDs in `crates/fang-protocol/src/models.rs`. An unknown
Razer PID is monitor-only by default, even when it exposes a vendor HID usage
page. Add the PID and verified limits to the model table before treating it as
supported. For controlled bring-up only, explicitly approve that exact PID:

```sh
sudo systemctl edit fangd
# Add these two lines, substituting the PID reported by lsusb:
# [Service]
# Environment=FANGD_ALLOW_UNVERIFIED_PID=02c1
sudo systemctl restart fangd
```

The opt-in applies conservative fan limits and the UI shows an “unverified”
warning. Remove the override after adding a verified model profile.

## 1. Install and check the daemon

Use the release installer on a supported x86_64 distribution. Run it as your
desktop user, not with `sudo`:

```sh
curl -fsSL https://github.com/bladeandsoulx/vfang-razer-linux/releases/latest/download/install.sh | bash
```

For an Ubuntu/Debian source build instead:

```sh
sudo ./packaging/install-from-source.sh
```

Then inspect the daemon:

```sh
journalctl -u fangd -b --no-pager | tail -20

# Arch-family package identity and integrity
pacman -Q fang fangd
pacman -Qkk fang fangd
```

Expect: `found Razer Blade 18 (2023)` (or your model) and
`listening on /run/fangd.sock`. If you see `no Razer laptop device`, the
daemon is monitor-only — check `lsusb` and that fangd runs as root.

## 2. Socket smoke test (no UI)

```sh
echo '{"id":1,"cmd":"get_status"}' | sudo socat - UNIX-CONNECT:/run/fangd.sock
```

Expect `"ok":true` with your model name, `"device_present":true`.

## 3. Telemetry sanity

```sh
printf '%s\n%s\n' '{"id":1,"cmd":"subscribe"}' '' \
  | sudo socat -t 5 - UNIX-CONNECT:/run/fangd.sock
```

Watch ~5 seconds of `telemetry` events: `cpu_temp_c` should match `sensors`
within a couple of °C; `fan_rpm` should be plausible (0 when fans are
parked at idle is normal).

## 4. Performance mode switch

In the **VFang** app (or via socket): switch Balanced → Gaming. Under a CPU load
(`stress-ng --cpu 8` for a minute), Gaming should hold noticeably higher
package power / clocks than Silent. Check `journalctl -u fangd` for EC
errors after each switch — there should be none.

## 5. Manual fan

Set fan to Manual at 3000 RPM. Within ~10 s the fans should be audible and
telemetry `fan_rpm` should report the EC's 3000 RPM target. Then switch back to
Auto and confirm the EC curve's target changes. Razer exposes a setpoint, not a
live tachometer, so this validates command/readback rather than measured speed.

Switch to Curve, adjust one point, and apply it. The active target should move
as the hotter CPU/GPU temperature crosses curve points. Manual and Curve modes
always force the model's maximum target at CPU ≥95 °C or GPU ≥87 °C; this guard
cannot be disabled. Do not deliberately overheat the laptop to test it.

## 6. Custom mode boosts

Custom + CPU High / GPU High, run a combined load, watch temps on the
dashboard. On the Blade 18, CPU "Boost" (overclock) is available — expect
temps near the high 90s °C under all-core load; that's Razer's intended
envelope, but back off if you're uncomfortable.

## 6b. GPU mode & refresh rate

- **GPU mode** (GPU & Display screen) needs `prime-select` (comes with
  Ubuntu's NVIDIA driver) or `envycontrol`. Switch Hybrid → Integrated, check
  `prime-select query` reflects it, reboot, confirm `nvidia-smi` fails (dGPU
  off) and battery drain drops. Switch back to Hybrid the same way. The UI
  shows an amber "staged" banner until the reboot.
- **Refresh rate** applies instantly to the active display. Switch 240 → 60 Hz
  and back; cursor motion makes the change obvious. Works on GNOME (Wayland or
  Xorg, via the Mutter DisplayConfig API), KDE (`kscreen-doctor`) and bare X11
  (`xrandr`) — the app picks whichever is present.

## 6c. Display color & brightness

These live on the **Lighting** screen and need `ddcutil` plus an external
monitor with DDC/CI enabled in its on-screen menu (laptop eDP panels don't
speak DDC/CI):

- **External-monitor color temperature** — switch between the presets the
  monitor advertises (Warm / sRGB·D65 / Neutral / Cool / Custom); the screen
  should visibly warm or cool. `ddcutil getvcp 14` reflects the change.
- **External-monitor brightness** — the luminance slider should dim/brighten
  the panel; `ddcutil getvcp 10` tracks it.
- **DDC/CI recovery** — start `fangd` with the monitor disconnected, then
  connect and wake it. The controls should appear automatically within 15–30
  seconds without restarting the daemon. The **Rescan** action should trigger
  the same recovery immediately.
- **Internal-panel brightness** — the laptop-panel slider changes the built-in
  screen's backlight instantly (through logind, no root); clamped to 5–100 %.
  On OLED panels driven by Intel `xe` (e.g. Blade 16 2026), if neither the
  slider nor the laptop's brightness keys change anything, boot with
  `xe.enable_dpcd_backlight=1` and retest. Note in your report whether it was
  needed.

The Blade's own wide-gamut panel has no color-managed gamut clamp on Linux, so
there's no internal "sRGB profile" to test — the UI says as much.

## 6c-2. Blade 16 (2024) static keyboard colors — issue #7

VFang 1.0.1 uses a solid-color 6x16 custom frame for USB PID `1532:02B7`,
following the hardware-tested workaround in
[OpenRazer PR #2827](https://github.com/openrazer/openrazer/pull/2827).
The regular static effect command is ignored on this model. The affected
2023-motherboard/2024-chassis laptop still needs its own retest; packet and mock
tests do not confirm its physical LEDs.

Record the installed version and device before testing:

```sh
fangd --version
dpkg-query -W -f='${Package} ${Version}\n' fang fangd  # Ubuntu/Debian
lsusb -d 1532:02b7
```

In **Lighting**, choose Static and try pure red (`#ff0000`), pure blue
(`#0000ff`) and a custom color (`#78ff8c`). Record the visible keyboard color
and any error in the app for each selection. Switch to Wave, then back to
Static, and check the requested color returns. Restarting the matching test
daemon should restore the saved color because custom frames are volatile.
Perform service restart or suspend tests only when prepared for that disruption.

Collect the log immediately afterward:

```sh
journalctl -u fangd --since '5 minutes ago' --no-pager
```

If a row or activation fails, the app should report it instead of confirming a
saved color. Include that error and the log in issue #7. Keep the issue open
until the reporter confirms the physical colors on the modified laptop.

## 6d. Battery Health Optimizer

On models with the "bho" feature (Settings shows a Battery card): enable
the optimizer at 80%. With AC plugged and the battery above the cap,
`cat /sys/class/power_supply/BAT*/status` should read `Not charging`
within a couple of minutes; `journalctl -u fangd` shows no EC errors.
Disable to resume normal charging to 100%.

## 6e. GPU telemetry and idle power

- Compare the dGPU label with its PCI `power/runtime_status`: **asleep** means
  exactly `suspended`. An active device with `runtime_usage=0` is not asleep,
  even when the daemon skips NVML to avoid keeping it active.
- **Uncore power (iGPU proxy)** comes from the Intel RAPL uncore domain. It is
  optional and includes components beyond the iGPU; do not interpret it as
  an isolated GPU power meter.
- Real Xe activity/frequency collection is disabled. The dashboard should show
  **Activity unavailable** when only proxy power exists and should omit the
  iGPU card when no optional reading exists. Simulated readings are not proof
  of real collection or measured power savings.
- Before enabling any future activity/frequency source, compare idle power,
  runtime-PM state and GT idleness with collection enabled and disabled. Verify
  that the source itself does not resume devices or force-wake the GT. Record
  the driver/kernel version and measurement method.

## 7. Persistence

- `sudo systemctl restart fangd` → previous mode/fan settings re-applied
  (journal: applying state line, UI reflects it).
- Put the fan in Manual mode, then `sudo systemctl stop fangd`. The journal
  should report `restored EC automatic fan control`; starting the service
  again safely reapplies the saved Manual preference.
- Suspend, wait 30 s, resume → journal shows
  `wall clock jump detected (resume from suspend); reapplying state`.

## 8. Rollback

```sh
sudo systemctl disable --now fangd     # stop controlling the EC
sudo dnf remove fang fangd             # Fedora RPM installs
sudo pacman -Rns fang fangd             # Arch/CachyOS Pacman installs
```

Stopping now restores EC automatic fan control; reboot still returns all EC
settings to firmware defaults. To remove everything:
`sudo apt remove fang fangd` (DEB installs), `sudo dnf remove fang fangd` (RPM
installs), or `sudo pacman -Rns fang fangd` (Pacman installs).

## Reporting results

Open an issue with: model + year, distribution + version, desktop + Wayland/X11
session, `lsusb -d 1532:` output, `journalctl -u fangd -b` snippet, and which
steps passed or failed. On Fedora, also include `getenforce` and any
VFang-related `ausearch -m AVC -ts recent` denials. On Arch-family systems,
include `pacman -Q fang fangd` output. This is enough to distinguish packaging,
SELinux, desktop-session, and hardware-profile failures.
