<script>
  // Mirrors CHANGELOG.md, condensed for the panel. Newest first.
  const RELEASES = [
    {
      version: '1.0.1',
      date: '2026-10-01',
      title: 'Keyboard colors, resume safety and recovery',
      groups: [
        {
          kind: 'Fixed',
          items: [
            'Blade 16 (2024), USB PID 1532:02B7, uses a solid-color 6x16 keyboard frame for Static, following the workaround tested by the contributor to OpenRazer PR #2827.',
            'Six rows upload before the frame is activated. Busy frame commands have at most five attempts; row and activation errors use settings rollback and fan-safe recovery.',
            'Resume discards cached CPU/GPU temperatures. Manual and Curve fans hold the model maximum until a new CPU reading arrives, including after failed sensor reads.',
            'Failed daemon preference saves report an error and retain the previous settings. Hardware rollback failures use EC Auto when possible and report unconfirmed recovery.',
            'Power automation retries failed changes every five seconds. New power sources and confirmed profile, fan or automation choices supersede pending retries.',
            'Dashboard labels distinguish EC Auto, Manual requested targets and Custom Curve, and show thermal and CPU sensor-loss overrides.',
            'Dashboard and Fan screens warn when telemetry is five seconds old, including when the stream stops, and clear the warning on fresh data.',
            'Missing EC devices and lost HID handles are rediscovered without restarting sensors or NVML. Recovery reapplies all settings for the model and keeps software fans at maximum until a fresh CPU reading permits a lower target.',
            'Delayed command responses cannot replace newer automation events or confirmed settings. Display and panel updates remain independent, and errors still surface.',
            'Tagged releases require the full application CI and every existing package gate. Reusable CI and release artifacts have distinct names and matching downloads, preventing upload conflicts.'
          ]
        },
        {
          kind: 'Notes',
          items: [
            'Verified with packet, daemon, frontend and release regressions using mock transports and isolated state files. The issue #7 laptop with a 2023 motherboard and 2024 chassis still needs a physical color retest.',
            'Physical unplug/replug, suspend/resume and issue #8 charging-limit confirmation remain pending. TDP controls remain research only.'
          ]
        }
      ]
    },
    {
      version: '1.0.0',
      date: '2026-09-30',
      title: 'Reliability and hardware telemetry',
      groups: [
        {
          kind: 'Added',
          items: [
            'Blade 16 (2026), USB PID 1532:02e0, joins the model table from PR #10; its capabilities follow the contributor hardware report.',
            'Optional iGPU telemetry and dashboard cards from PR #11, plus Windows build/test CI and contributor instructions.',
            'Custom profiles can be selected for AC and battery power automation using your saved CPU and GPU power levels.',
            'Fallible packet constructors reject oversized arguments without panicking and preserve the existing hardware wire encoding.'
          ]
        },
        {
          kind: 'Fixed',
          items: [
            'The shared iGPU reading type no longer depends on a Linux-only module, restoring Windows and macOS mock-backend compilation.',
            'GPU sleep reporting reflects an observed suspended runtime state; skipping a GPU query no longer incorrectly labels an active GPU asleep.',
            'GPU commands reject CPU-only Boost levels; stale GPU Boost preferences normalize to High. Missing daemon option values fail before hardware initialization.',
            'Extreme or inconsistent external-monitor brightness readings are handled safely.',
            'Late startup snapshots cannot overwrite newer confirmed state. Independent startup queries continue after failures and offer Retry.',
            'Hardware controls show pending states and errors, prevent overlapping saves and lock fan-curve editing during Apply. Battery optimizer failures no longer leave a misleading local ON toggle.',
            'Toggles retain keyboard focus, navigation follows browser history, and release-version inputs are validated before files are written.',
            'Keyboard-operated toggles recover focus after a pending save temporarily disables them, without taking focus from another control.',
            'Linux display helpers bound output and include inherited pipes in their deadline. Internal-panel brightness handles large sysfs ranges safely.',
            'Source installation finishes both builds before installing the package pair; package build outputs preserve existing artifacts.'
          ]
        },
        {
          kind: 'Changed',
          items: [
            'Removed real Xe activity/frequency reads that can wake hardware. Unavailable readings stay absent; mock activity and frequency remain supported.',
            'RAPL readings are labeled Uncore power (iGPU proxy), with Activity unavailable when needed. Older telemetry retains the existing dashboard layout.',
            'Documentation clarifies OLED/kernel guidance and which checks need Linux or physical hardware.',
            'Published GitHub release notes include the dated changelog and its known limitations.'
          ]
        },
        {
          kind: 'Security',
          items: [
            'Daemon request sizes, client counts and waits are bounded; healthy telemetry subscriptions and lag recovery are preserved.',
            'Daemon helper output and inherited-pipe waits are bounded, installer manifest filenames are allowlisted, and lifecycle verifiers protect existing installations.',
            'Compatible dependency updates clear the checked npm audit.',
            'The upstream GLib string-iterator crash fix is backported for GTK compatibility and covered by an optimized regression test.'
          ]
        },
        {
          kind: 'Notes',
          items: [
            'Linux native builds and automated regression checks passed on Zorin OS 18.1 (Ubuntu 24.04 base). The 0.9.9-to-1.0.0 test-package upgrade preserved settings and the native Wayland app connected. Browser and native mock interactions passed; physical GPU/fan/battery/lighting validation remain pending.',
            'Issue #7: static RGB packet checks passed; the modified Blade lighting problem remains unconfirmed on hardware.',
            'Issue #8: confirmed battery settings survived fresh screen renders and a mock restart; the affected firmware and physical charge limit still need confirmation.',
            'GLib retains its compatible upstream version, so version-only scans may still flag the GLib advisory despite the source backport. Other transitive maintenance advisories remain.',
            'AC unplug/replug and suspend/resume checks still need user confirmation. TDP sliders are not included; capability and safe-limit research is separate.',
            'Package installation does not guarantee atomic rollback; keep the previous matching app/daemon pair available.'
          ]
        }
      ]
    },
    {
      version: '0.9.9',
      date: '2026-08-08',
      title: 'Arch-family packages',
      groups: [
        {
          kind: 'Added',
          items: [
            'First-party Pacman packages for x86_64 now support Arch Linux and CachyOS through the checksum- and metadata-verified one-command installer, including compatible distributions reporting ID_LIKE=arch.'
          ]
        },
        {
          kind: 'Changed',
          items: [
            'Immutable releases now contain eight exact assets: the installer, checksum manifest, two DEBs, two RPMs, and two Pacman packages. Arch-family builds use baseline x86_64 so every supported Razer Blade CPU generation remains eligible.'
          ]
        }
      ]
    },
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
    {
      version: '0.9.7',
      date: '2026-07-30',
      title: 'VFang rebrand and Fedora detection repair',
      groups: [
        {
          kind: 'Changed',
          items: [
            'The user-facing product is renamed to VFang. Package names, executables, service and IPC identities, repository links, and release filenames remain unchanged so existing installations upgrade in place.'
          ]
        },
        {
          kind: 'Fixed',
          items: [
            'VFang installs on Fedora 43 and 44 again; both were rejected before anything downloaded because Fedora removed the release field the installer checked.'
          ]
        },
        {
          kind: 'Added',
          items: [
            'Installer detection is tested against the real system identity of every Ubuntu, Debian, and Fedora release VFang supports.'
          ]
        }
      ]
    },
    {
      version: '0.9.6',
      date: '2026-07-30',
      title: 'Ubuntu 26.04 LTS',
      groups: [
        {
          kind: 'Added',
          items: [
            'Ubuntu 26.04 LTS is a supported installation base, directly and through compatible-family derivatives.'
          ]
        },
        {
          kind: 'Fixed',
          items: [
            'The from-source build script now explains that it supports Debian and Ubuntu only, instead of failing part way through on other distributions.'
          ]
        }
      ]
    },
    {
      version: '0.9.5',
      date: '2026-07-23',
      title: 'Neon Fang installer',
      groups: [
        {
          kind: 'Changed',
          items: [
            'The one-command installer now opens with the Neon Fang terminal banner.',
            'Installation guidance is shorter and more beginner-friendly while keeping advanced verification and manual-install options.',
            'Release-documentation checks keep historical release notes aligned with the code that actually shipped.'
          ]
        }
      ]
    },
    {
      version: '0.9.4',
      date: '2026-07-23',
      title: 'Immutable release installer',
      groups: [
        {
          kind: 'Added',
          items: [
            'A release-locked one-command installer selects and validates the matching Fang and fangd package pair before asking for sudo.',
            'USDT donations identify BNB Smart Chain (BEP20) and Ethereum (ERC20) as the accepted networks.'
          ]
        },
        {
          kind: 'Changed',
          items: [
            'Releases publish as an immutable six-asset set containing the installer, checksum manifest, two DEBs and two RPMs.'
          ]
        },
        {
          kind: 'Removed',
          items: [
            'The previous generic crypto-transfer warning and instruction to confirm the USDT network with the creator were removed.'
          ]
        }
      ]
    },
    {
      version: '0.9.3',
      date: '2026-07-18',
      title: 'Fedora RPM support',
      groups: [
        {
          kind: 'Added',
          items: [
            'Native x86_64 RPM packages support Fedora 43 and Fedora 44.',
            'Fedora package gates cover build, installation, launch, dependencies and removal.'
          ]
        },
        {
          kind: 'Changed',
          items: [
            'GitHub releases are created only after both DEBs and both RPMs pass their release gates.'
          ]
        }
      ]
    },
    {
      version: '0.9.2',
      date: '2026-07-17',
      title: 'Support Fang',
      groups: [
        {
          kind: 'Added',
          items: [
            'A dedicated Support screen explains how contributions fund development, testing and future features.',
            'Fang creator BTC, USDT and Solana wallets include one-click copying, responsible-donation guidance and transfer-safety warnings.',
            'A planned Peripherals area covers Razer mice, keyboards, headsets, microphones, docks, charging stations, RGB mats and controllers.',
            'Other future directions include broader laptop support, native Fedora/RHEL packages and an offline, bloatware-free Windows 11 edition.'
          ]
        }
      ]
    },
    {
      version: '0.9.1',
      date: '2026-07-17',
      title: 'Safety, reliability & dependency hardening',
      groups: [
        {
          kind: 'Added',
          items: [
            'Failure-injection tests cover EC rollback, partial two-fan updates, startup recovery and shutdown restoration without touching real hardware.',
            'Protocol and process tests reject malformed, stale, truncated and oversized HID replies and verify single-daemon socket behavior and helper timeouts.',
            'Multi-monitor, power-supply and transactional-autostart fixtures were added alongside unknown-model bring-up documentation.'
          ]
        },
        {
          kind: 'Changed',
          items: [
            'EC replies now require exact framing, length, checksum, transaction, command and data-size matches; invalid replies are retried once.',
            'A process-wide hardware lock prevents multiple controllers, and live sockets or unrelated filesystem entries are never removed.',
            'Unknown Razer product IDs default to monitor-only mode unless explicitly approved with an exact PID opt-in.',
            'KDE and X11 target the primary active display; display helpers now run off the UI thread with hard timeouts.',
            'Svelte, Vite and the Svelte Vite plugin were upgraded together, and all 0.9.1 package metadata was synchronized.'
          ]
        },
        {
          kind: 'Fixed',
          items: [
            'Svelte 5 now mounts the desktop root with mount(), fixing the empty black application window.',
            'Razer HID checksums cover the complete payload, matching real Blade EC responses.',
            'Failed fan changes restore the complete previous state or safely return both fan zones to EC Auto.',
            'AC detection checks every barrel, USB, USB-C/PD, wireless and compatible external power supply.',
            'Autostart changes are transactional across the operating system, settings file and frontend state.'
          ]
        },
        {
          kind: 'Security',
          items: [
            'A restrictive Tauri CSP now permits only bundled assets, Tauri IPC and Fang\'s GitHub release check.',
            'The plist and quick-xml dependency chain was updated to resolve both tracked RustSec advisories; npm audits are clean.'
          ]
        }
      ]
    },
    {
      version: '0.9.0',
      date: '2026-07-15',
      title: 'In-app update checker',
      groups: [
        {
          kind: 'Added',
          items: [
            'A new Check for updates button in Settings compares the installed version with the latest stable GitHub release.',
            'When an update is available, Fang opens the release with matching app and daemon packages.'
          ]
        }
      ]
    },
    {
      version: '0.8.2',
      date: '2026-07-13',
      title: 'Single-instance desktop app',
      groups: [
        {
          kind: 'Added',
          items: [
            'Opening Fang again restores and focuses the existing window instead of starting a duplicate.',
            'A native message explains that Fang is already running.'
          ]
        }
      ]
    },
    {
      version: '0.8.1',
      date: '2026-07-13',
      title: 'External-monitor recovery',
      groups: [
        {
          kind: 'Added',
          items: ['One-click DDC/CI rescan on the Lighting screen.']
        },
        {
          kind: 'Changed',
          items: [
            'While no monitor is available, fangd retries discovery every 15 seconds.',
            'App/daemon API v2 adds the explicit DDC rescan command.'
          ]
        },
        {
          kind: 'Fixed',
          items: [
            'External monitors now recover after early boot or hot-plug without restarting fangd.',
            'Failed brightness or color writes clear stale monitor state and trigger rediscovery.'
          ]
        }
      ]
    },
    {
      version: '0.8.0',
      date: '2026-07-12',
      title: 'Fan curves & safety hardening',
      groups: [
        {
          kind: 'Added',
          items: [
            'Editable custom fan curves using the hotter CPU/GPU temperature.',
            'Mandatory max-fan override at CPU ≥95 °C or GPU ≥87 °C.',
            'Sensor-loss watchdog: software fan control stays at max until CPU telemetry is fresh.',
            'App/daemon API handshake blocks writes when package versions are incompatible.'
          ]
        },
        {
          kind: 'Changed',
          items: [
            'TCP is now mock-only and loopback-only.',
            'DDC/GPU helpers are isolated from thermal control and have hard timeouts.',
            'Stopping or crashing fangd restores the EC automatic fan policy.'
          ]
        },
        {
          kind: 'Fixed',
          items: ['All release manifests are 0.8.0 and the app requires a compatible fangd package.']
        },
        {
          kind: 'Removed',
          items: ['Creator performance mode.']
        }
      ]
    },
    {
      version: '0.7.0',
      date: '2026-07-07',
      title: 'Power-source automation',
      groups: [
        {
          kind: 'Added',
          items: [
            'Auto-switch the performance profile when you plug in or unplug (AC ↔ battery).',
            "A profile per source, plus an independent fan choice — the mode's curve, or pinned quiet.",
            'Reads the AC adapter from sysfs; live source shown with a "now" badge. Off by default.'
          ]
        }
      ]
    },
    {
      version: '0.6.0',
      date: '2026-07-06',
      title: 'External-monitor brightness',
      groups: [
        {
          kind: 'Added',
          items: [
            'External-monitor brightness over DDC/CI (VCP 0x10), on the External monitor card.',
            'In-app Changelog screen between Lighting and Settings.'
          ]
        },
        {
          kind: 'Changed',
          items: [
            'Lighting layout: internal-panel brightness now sits under the lid-logo card (two columns).'
          ]
        },
        {
          kind: 'Fixed',
          items: [
            'Creator mode re-enabled on the Blade 18 — it is a standard EC mode, not an undefined one.',
            'Honest fan labels: the figure is the EC setpoint, not a live tachometer reading.'
          ]
        }
      ]
    },
    {
      version: '0.5.0',
      date: '2026-07-05',
      title: 'Display color & brightness',
      groups: [
        {
          kind: 'Added',
          items: [
            'External-monitor color temperature over DDC/CI (Warm / sRGB 6500K / Neutral / Cool / Custom).',
            "Internal laptop-panel brightness via logind's SetBrightness."
          ]
        },
        {
          kind: 'Changed',
          items: [
            'Replaced the inert colord "Color profile" (did nothing on GNOME Wayland) with the DDC/CI path.',
            'Panel brightness and monitor color moved onto the Lighting screen.'
          ]
        }
      ]
    },
    {
      version: '0.4.0',
      date: '2026-07-05',
      title: 'Refresh-rate switching on GNOME',
      groups: [
        {
          kind: 'Added',
          items: [
            'GNOME Mutter refresh-rate backend — works on Wayland and Xorg, drives the primary monitor.'
          ]
        },
        {
          kind: 'Fixed',
          items: ['No more "no supported tool" on GNOME Wayland (xrandr under XWayland is blind to outputs).']
        },
        {
          kind: 'Credits',
          items: ["Attribution + donation link for Rintastic247's Razer-Control (GPL-2.0)."]
        }
      ]
    },
    {
      version: '0.3.0',
      date: '2026-07-04',
      title: 'Lighting & power telemetry',
      groups: [
        {
          kind: 'Added',
          items: [
            'Keyboard backlight brightness and effects (Static / Spectrum / Wave) + lid logo LED.',
            'CPU and GPU power draw (watts) on the dashboard, under the temperature gauges.'
          ]
        }
      ]
    },
    {
      version: '0.2.0',
      date: '2026-07-04',
      title: 'Hardware support & battery',
      groups: [
        {
          kind: 'Added',
          items: [
            'Battery Health Optimizer — charge limiter (50–80%).',
            "48-model device table imported from Razer-Control's laptops.json.",
            'Verified profile for the Razer Blade 18 2024.'
          ]
        },
        {
          kind: 'Fixed',
          items: ['Creator mode gated per-model — it was an undefined EC mode on most Blades.']
        }
      ]
    },
    {
      version: '0.1.1',
      date: '2026-07-04',
      title: 'First-hardware fixes',
      groups: [
        {
          kind: 'Fixed',
          items: [
            '"Daemon offline" on every launch — added the missing Tauri v2 capability.',
            'Daemon hang shown as a stuck "searching…" — NVML no longer cycled every second.',
            'Idle dashboard pinned the GPU — throttled the fan rotor and made glows static (5.7% → 0.8%).',
            'Silent was the loudest mode — it was sending an undefined EC power mode.'
          ]
        }
      ]
    },
    {
      version: '0.1.0',
      date: '',
      title: 'Initial release',
      groups: [
        {
          kind: 'Added',
          items: [
            'Performance modes and CPU/GPU boost, fan control, live dashboard, GPU mode switching, tray + autostart.'
          ]
        }
      ]
    }
  ];

  const TONE = {
    Added: 'add',
    Fixed: 'fix',
    Changed: 'chg',
    Removed: 'remove',
    Credits: 'cred',
    Security: 'security',
    Notes: 'chg'
  };
</script>

<div class="log">
  {#each RELEASES as r, i}
    <div class="rel card rise" style="animation-delay:{i * 45}ms">
      <div class="head">
        <span class="ver mono">{r.version}</span>
        <span class="title">{r.title}</span>
        {#if r.date}<span class="date mono">{r.date}</span>{/if}
      </div>
      {#each r.groups as g}
        <div class="group">
          <span class="kind {TONE[g.kind]}">{g.kind}</span>
          <ul>
            {#each g.items as it}
              <li>{it}</li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .log {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .rel {
    padding: 18px 20px;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--panel-edge);
  }

  .ver {
    font-size: 15px;
    font-weight: 600;
    color: var(--green);
    text-shadow: 0 0 10px var(--green-glow);
  }

  .title {
    font-size: 13.5px;
    color: var(--ink);
  }

  .date {
    margin-left: auto;
    font-size: 11px;
    color: var(--ink-faint);
  }

  .group {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 12px;
    margin-top: 12px;
  }

  .kind {
    font-family: var(--font-data);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 3px 0;
  }

  .kind.add {
    color: var(--green);
  }

  .kind.fix {
    color: var(--amber);
  }

  .kind.remove {
    color: var(--red);
  }

  .kind.chg {
    color: #6aa9ff;
  }

  .kind.cred {
    color: var(--green-soft);
  }

  .kind.security {
    color: #c792ea;
  }

  ul {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  li {
    position: relative;
    padding-left: 14px;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-dim);
  }

  li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 8px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--panel-edge-hi);
  }
</style>
