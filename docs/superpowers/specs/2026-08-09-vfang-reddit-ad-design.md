# VFang Reddit Advertisement Design

## Goal

Create a 20-second, 1920×1080 HyperFrames advertisement for Linux users who own Razer Blade laptops. The ad should make VFang feel like the native, focused alternative they expected: open source, local-first, account-free, and free of advertising.

The composition must work when Reddit autoplays it muted. Every claim therefore appears as concise, readable on-screen copy. No voiceover is required.

## Evidence and Claim Boundaries

- Razer's official Synapse 4 requirements list Windows 10 or 11, a Razer ID, a software download, and an internet connection for activation of full features and updates.
- VFang's repository and interface show native Linux laptop controls, no account flow, no advertising surface, and a local app-to-daemon architecture. Core hardware control does not require internet access; the optional update check is not part of control.
- The comparison will say **“Synapse stops at Windows. VFang starts on Linux.”** It will not claim that every Synapse feature has a VFang equivalent.
- The privacy card will say **“NO ACCOUNT / CONTROLS WORK OFFLINE / NO ADS.”** This is more precise than claiming VFang never performs any network request.
- VFang is not a complete Synapse replacement for Razer peripherals or macro creation. The video remains explicitly about Razer Blade laptop control.

## Creative Approaches Considered

### 1. Linux Freedom

Lead with the emotional satisfaction of owning the hardware and controlling it on the user's operating system. This is memorable, but provides too little evidence in a short ad.

### 2. Feature Barrage

Move rapidly through every VFang screen and feature. This proves breadth, but would make the video feel like a generic product slideshow and reduce copy legibility on Reddit.

### 3. Proof over Promises — Selected

Open with the Linux ownership statement, make one factual competitive contrast, then prove the product with real VFang interface captures. Close on three local-first benefits and a direct install action. This balances emotion, credibility, and product clarity.

## Narrative and Timing

### Scene 1 — Ownership, 0.0–3.2 seconds

A dark instrument-cluster canvas wakes up with the VFang fang mark, a fine technical grid, and the statement **“YOUR BLADE. YOUR LINUX.”** The subline reads **“Control should follow your operating system.”** Motion is deliberate and mechanical, not frenetic.

### Transition 1 — Scan wipe, 2.9–3.3 seconds

A neon-green vertical scan line wipes the first scene into the comparison scene while the outgoing hero remains fully visible.

### Scene 2 — Competitive contrast, 3.2–6.4 seconds

The left side presents **“SYNAPSE 4”** with **“WINDOWS 10 / 11”** in a restrained warning treatment. The right side resolves into **“VFANG”** and **“BUILT FOR LINUX.”** The headline reads **“SYNAPSE STOPS AT WINDOWS.”** The follow-up lands as **“VFANG STARTS ON LINUX.”** A small qualifier says **“Razer Blade laptop control.”**

### Transition 2 — Interface aperture, 6.1–6.6 seconds

Panels close and reopen as a framed product window, revealing the actual VFang UI.

### Scene 3 — Product proof, 6.4–12.2 seconds

Real repository screenshots animate through a controlled camera move rather than appearing as a slide deck:

1. Live dashboard and temperature telemetry.
2. Performance profiles and power automation.
3. Custom fan curve with thermal protection.

Short tags — **“LIVE TELEMETRY,” “POWER MODES,” “SAFE FAN CURVES”** — track each focus area. The UI remains large enough to be recognizable even if its small internal labels are not read.

### Transition 3 — Three-bar wipe, 11.9–12.4 seconds

Three green bars sweep across the frame and become the three local-first benefit rows.

### Scene 4 — Local-first proof, 12.2–16.3 seconds

Three statements enter with distinct icon motion:

- **NO ACCOUNT**
- **CONTROLS WORK OFFLINE**
- **NO ADS**

The supporting line is **“Your settings stay between you and your Blade.”** The GitHub/Open Source label appears as a fourth, smaller trust signal.

### Transition 4 — Terminal reveal, 16.0–16.5 seconds

A horizontal cursor line expands into a terminal-style install bar and reveals the closing frame.

### Scene 5 — Action, 16.3–20.0 seconds

The fang mark and VFang wordmark anchor the left. The call to action is **“TAKE BACK YOUR BLADE.”** The install proof reads **“COPY. PASTE. DONE.”** with the short command context **“One-command install.”** The destination is **“github.com/bladeandsoulx/vfang-razer-linux”** and the final badges read **“48 MODELS · OPEN SOURCE · LINUX.”**

A small final qualifier states **“For supported Razer Blade laptops. VFang is not affiliated with Razer.”**

## Visual Identity

The composition inherits VFang's existing industrial instrument-cluster design.

- Canvas: near-black `#0A0C0D`
- Panels: `#131619` and `#181C20`
- Primary text: `#EAFBE6`
- Secondary text: `#9AA6AE`
- Signal green: `#44D62C`
- Soft signal green: `#6FE55B`
- Warning accent: `#FFB454`
- Fonts: `JetBrains Mono` for data/display copy and `Inter` for explanatory copy

The background uses subtle carbon weave, scan lines, precise rules, and localized green glow. It must not use generic blue SaaS gradients, rounded pastel cards, photorealistic gaming imagery, Razer's three-snake logo, or unsupported performance statistics.

## Composition Architecture

The advertisement lives in a dedicated `vfang-reddit-ad/` HyperFrames project so it does not alter the product app. A standalone `index.html` contains five timed scene clips on a single visual track. Transition overlays occupy a separate track and bridge adjacent scenes. Repository screenshots and the VFang icon are copied into `assets/` so rendering is deterministic and self-contained.

Each scene owns its entrance timeline. Outgoing scenes do not animate away; transition layers provide every scene change. Only the last scene may fade at the end. The complete composition is fixed at 20 seconds and 30 frames per second.

## Data and Asset Flow

Static text and timing live in the composition HTML. CSS defines each scene's fully visible hero layout before GSAP entrances are applied. HyperFrames reads the clip timing attributes and registered GSAP timeline synchronously. No runtime API calls, random values, external video, or remote application data are used.

The screenshots remain unmodified evidence from VFang's built-in simulator. Cropping and transform animation may focus attention, but the interface content itself is not fabricated.

## Failure Handling

- Missing assets must fail lint/render rather than fall back to remote URLs.
- Text must be sized and wrapped for the 1920×1080 frame; no essential message depends on small screenshot text.
- Claims must remain legible on muted autoplay and survive Reddit recompression.
- If a supported font cannot be embedded, use the declared system fallbacks and re-run layout inspection.
- The composition has no network dependency at render or playback time.

## Verification

- Run `npx hyperframes lint` and resolve all errors and warnings relevant to correctness.
- Run `npx hyperframes validate` and clear contrast findings.
- Run `npx hyperframes inspect --samples 15` and resolve or explicitly justify every overflow finding.
- Generate and review the animation map for missing entrances, dead zones, conflicts, and accidental exits.
- Render a draft MP4 and inspect representative frames from every scene and transition.
- Render the final 1920×1080 MP4 at 30 fps after the draft passes.

