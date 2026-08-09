# VFang Reddit Advertisement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and render a 20-second, muted-autoplay-friendly HyperFrames advertisement that presents VFang as the local-first Razer Blade control center for Linux.

**Architecture:** Create an isolated `vfang-reddit-ad/` HyperFrames project containing one standalone composition, local copies of VFang product captures, and a small Node contract test. Five non-overlapping scene clips live on the primary visual track; four transition clips bridge scene boundaries on an overlay track; one synchronous GSAP timeline registers all deterministic entrances and final-scene exit motion.

**Tech Stack:** HyperFrames CLI, HTML5, CSS, GSAP 3.14, Node.js built-in test runner, local PNG assets, FFmpeg-backed MP4 rendering.

## Global Constraints

- Duration is exactly 20 seconds at 1920×1080 and 30 fps.
- The ad must communicate fully during muted Reddit autoplay; there is no voiceover dependency.
- Use VFang's palette: `#0A0C0D`, `#131619`, `#181C20`, `#EAFBE6`, `#9AA6AE`, `#44D62C`, `#6FE55B`, and `#FFB454`.
- Use `JetBrains Mono` for data/display copy and `Inter` for explanatory copy, with system fallbacks.
- Exact competitive copy: `SYNAPSE STOPS AT WINDOWS.` followed by `VFANG STARTS ON LINUX.`
- Exact local-first copy: `NO ACCOUNT`, `CONTROLS WORK OFFLINE`, and `NO ADS`.
- Do not imply feature parity with Synapse for peripherals or macros.
- Do not use Razer's three-snake logo, unsupported performance statistics, runtime network requests, random values, infinite repeats, or remote media.
- Every scene element must have an entrance animation. Earlier scenes must not have exit animations; only the final scene may fade out.
- Every scene change must have a transition overlay.

---

### Task 1: Scaffold the Composition and Lock the Content Contract

**Files:**
- Create: `vfang-reddit-ad/index.html`
- Create: `vfang-reddit-ad/DESIGN.md`
- Create: `vfang-reddit-ad/assets/vfang-icon.png`
- Create: `vfang-reddit-ad/assets/dashboard.png`
- Create: `vfang-reddit-ad/assets/performance.png`
- Create: `vfang-reddit-ad/assets/fan-curve.png`

**Interfaces:**
- Consumes: source captures from `app/src-tauri/icons/icon.png` and `docs/screenshots/*.png`; approved copy and timings from `docs/superpowers/specs/2026-08-09-vfang-reddit-ad-design.md`.
- Produces: a standalone composition with `data-composition-id="vfang-reddit-ad"`, fixed dimensions, fixed duration, nine clip IDs (`scene-1` through `scene-5`, `transition-1` through `transition-4`), and local asset paths used by later animation and render tasks. HyperFrames itself is the consumer under test: lint checks the document contract, validate exercises the browser runtime and contrast, inspect samples the live layout, and render exercises the capture pipeline.

- [ ] **Step 1: Scaffold the project with the HyperFrames blank template**

Run:

```bash
npx hyperframes init vfang-reddit-ad --non-interactive
```

Expected: `vfang-reddit-ad/index.html` exists and `npx hyperframes compositions vfang-reddit-ad` can discover the project.

- [ ] **Step 2: Copy the four approved binary assets into the project**

Run:

```bash
mkdir -p vfang-reddit-ad/assets
cp app/src-tauri/icons/icon.png vfang-reddit-ad/assets/vfang-icon.png
cp docs/screenshots/dashboard.png vfang-reddit-ad/assets/dashboard.png
cp docs/screenshots/performance.png vfang-reddit-ad/assets/performance.png
cp docs/screenshots/fan-curve.png vfang-reddit-ad/assets/fan-curve.png
```

Expected: all four paths exist and are PNG files.

- [ ] **Step 3: Run HyperFrames lint against the blank scaffold**

Run:

```bash
npx hyperframes lint vfang-reddit-ad --verbose
```

Expected: the generated blank template is structurally valid. Record this as the generated-artifact baseline; the composition behavior is introduced only after the visual identity is fixed in Step 4.

- [ ] **Step 4: Define the project visual identity**

Create `vfang-reddit-ad/DESIGN.md` with these exact sections and decisions:

```markdown
# VFang Reddit Ad Visual Identity

## Style Prompt

A dark industrial instrument cluster brought to life: near-black carbon texture, precise technical rules, localized neon-green signal glow, large condensed data typography, restrained warning amber, and deliberate mechanical motion. The real VFang interface is always the proof point.

## Colors

- Canvas `#0A0C0D`
- Panel `#131619`
- Raised panel `#181C20`
- Primary ink `#EAFBE6`
- Secondary ink `#9AA6AE`
- Signal green `#44D62C`
- Soft green `#6FE55B`
- Warning amber `#FFB454`

## Typography

- Display and data: `JetBrains Mono`
- Supporting copy: `Inter`

## Motion

Mechanical reveals, signal scans, panel apertures, and short power-on glows. Entrances settle decisively; transitions preserve the outgoing hero frame until covered.

## What NOT to Do

- No generic blue SaaS gradients or pastel cards.
- No Razer three-snake logo or imitation branding.
- No photorealistic gaming lifestyle imagery.
- No unsupported performance statistics.
- No jump cuts, infinite loops, or random animation.
```

- [ ] **Step 5: Build the static hero layouts and clip timing**

Replace the scaffold body with one direct composition container and the following clip contract:

```html
<div data-composition-id="vfang-reddit-ad" data-width="1920" data-height="1080"
     data-start="0" data-duration="20" data-track-index="0">
  <section id="scene-1" class="scene ownership" data-start="0" data-duration="3.2" data-track-index="1">
    <div class="scene-content">
      <div class="system-rail">VFANG // LOCAL CONTROL SYSTEM</div>
      <img class="fang-mark" src="assets/vfang-icon.png" alt="">
      <p class="eyebrow">RAZER BLADE CONTROL CENTER</p>
      <h1>YOUR BLADE. YOUR LINUX.</h1>
      <p class="subline">Control should follow your operating system.</p>
    </div>
  </section>
  <section id="scene-2" class="scene contrast" data-start="3.2" data-duration="3.2" data-track-index="1">
    <div class="scene-content">
      <p class="eyebrow">THE OS DIVIDE</p>
      <h2 class="synapse-line">SYNAPSE STOPS AT WINDOWS.</h2>
      <div class="compare-grid">
        <div class="compare-card synapse-card"><span>SYNAPSE 4</span><strong>WINDOWS 10 / 11</strong></div>
        <div class="compare-card vfang-card"><span>VFANG</span><strong>BUILT FOR LINUX</strong></div>
      </div>
      <h2 class="vfang-line">VFANG STARTS ON LINUX.</h2>
      <p class="qualifier">Focused Razer Blade laptop control.</p>
    </div>
  </section>
  <section id="scene-3" class="scene proof" data-start="6.4" data-duration="5.8" data-track-index="1">
    <div class="scene-content">
      <p class="eyebrow">REAL CONTROL. ONE DASHBOARD.</p>
      <div class="product-frame">
        <img class="capture dashboard-capture" src="assets/dashboard.png" alt="VFang live dashboard">
        <img class="capture performance-capture" src="assets/performance.png" alt="VFang performance controls">
        <img class="capture fan-capture" src="assets/fan-curve.png" alt="VFang fan curve editor">
      </div>
      <div class="proof-tags">
        <span class="proof-tag telemetry-tag">LIVE TELEMETRY</span>
        <span class="proof-tag power-tag">POWER MODES</span>
        <span class="proof-tag fan-tag">SAFE FAN CURVES</span>
      </div>
      <div class="telemetry-rail">CPU · GPU · FAN · POWER · DISPLAY · LIGHTING</div>
    </div>
  </section>
  <section id="scene-4" class="scene local-first" data-start="12.2" data-duration="4.1" data-track-index="1">
    <div class="scene-content">
      <p class="eyebrow">LOCAL-FIRST BY DESIGN</p>
      <div class="benefit-row account-row"><span class="benefit-icon">01</span><strong>NO ACCOUNT</strong></div>
      <div class="benefit-row offline-row"><span class="benefit-icon">02</span><strong>CONTROLS WORK OFFLINE</strong></div>
      <div class="benefit-row ads-row"><span class="benefit-icon">03</span><strong>NO ADS</strong></div>
      <p class="support-line">Your settings stay between you and your Blade.</p>
      <span class="oss-badge">OPEN SOURCE · GPL-2.0</span>
    </div>
  </section>
  <section id="scene-5" class="scene action" data-start="16.3" data-duration="3.7" data-track-index="1">
    <div class="scene-content">
      <div class="brand-lockup"><img class="final-mark" src="assets/vfang-icon.png" alt=""><span class="wordmark">VFANG</span></div>
      <p class="eyebrow">RAZER BLADE CONTROL FOR LINUX</p>
      <h2 class="cta">TAKE BACK YOUR BLADE.</h2>
      <div class="install-bar"><span class="prompt">$</span><strong>COPY. PASTE. DONE.</strong><span>One-command install</span></div>
      <p class="repo-url">github.com/bladeandsoulx/vfang-razer-linux</p>
      <div class="final-badges"><span>48 MODELS</span><span>OPEN SOURCE</span><span>LINUX</span></div>
      <p class="legal">For supported Razer Blade laptops. VFang is not affiliated with Razer.</p>
    </div>
  </section>
  <div id="transition-1" class="transition scan-wipe" data-start="2.9" data-duration="0.4" data-track-index="2"><div class="scan"></div></div>
  <div id="transition-2" class="transition aperture" data-start="6.1" data-duration="0.5" data-track-index="2"><div class="aperture-left"></div><div class="aperture-right"></div></div>
  <div id="transition-3" class="transition bar-wipe" data-start="11.9" data-duration="0.5" data-track-index="2"><div class="wipe-bar"></div><div class="wipe-bar"></div><div class="wipe-bar"></div></div>
  <div id="transition-4" class="transition terminal-reveal" data-start="16" data-duration="0.5" data-track-index="2"><div class="cursor-line"></div></div>
</div>
```

Use `.scene-content { width: 100%; height: 100%; padding: 96px 120px; display: flex; flex-direction: column; box-sizing: border-box; }` as the layout base. Position decorative glows and grid lines absolutely, but keep all copy and panels in flex/grid flow. Include all exact claims from the test and all four local images.

- [ ] **Step 6: Run the static HyperFrames checks**

Run:

```bash
npx hyperframes lint vfang-reddit-ad
```

Expected: if lint reports the timeline as unregistered before Task 2, record that single expected failure; clip overlap, asset existence, composition structure, fixed dimensions, and timing checks must pass.

- [ ] **Step 7: Commit the static composition**

```bash
git add vfang-reddit-ad
git commit -m "feat: scaffold VFang Reddit ad"
```

---

### Task 2: Add Deterministic Choreography and Scene Transitions

**Files:**
- Modify: `vfang-reddit-ad/index.html`

**Interfaces:**
- Consumes: clip IDs, class names, asset references, and static hero layouts from Task 1.
- Produces: `window.__timelines['vfang-reddit-ad']`, entrance motion for every meaningful scene element, four complete transition animations, and one final-scene fade.

- [ ] **Step 1: Add the synchronous GSAP timeline**

At the end of `index.html`, load GSAP and register the timeline synchronously:

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script>
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });

  tl.from('#scene-1 .system-rail', { scaleX: 0, transformOrigin: 'left', duration: 0.5, ease: 'power3.out' }, 0.18)
    .from('#scene-1 .fang-mark', { scale: 0.72, opacity: 0, rotation: -8, duration: 0.55, ease: 'back.out(1.4)' }, 0.3)
    .from('#scene-1 .eyebrow', { x: -36, opacity: 0, duration: 0.44, ease: 'expo.out' }, 0.5)
    .from('#scene-1 h1', { y: 54, opacity: 0, duration: 0.62, ease: 'power3.out' }, 0.66)
    .from('#scene-1 .subline', { y: 24, opacity: 0, duration: 0.46, ease: 'power2.out' }, 0.94);

  tl.from('#scene-2 .eyebrow', { x: -32, opacity: 0, duration: 0.38, ease: 'expo.out' }, 3.34)
    .from('#scene-2 .synapse-line', { y: 32, opacity: 0, duration: 0.46, ease: 'power3.out' }, 3.46)
    .from('#scene-2 .synapse-card', { x: -46, opacity: 0, duration: 0.48, ease: 'power2.out' }, 3.6)
    .from('#scene-2 .vfang-card', { x: 46, opacity: 0, scale: 0.96, duration: 0.5, ease: 'back.out(1.4)' }, 3.72)
    .from('#scene-2 .vfang-line', { y: 34, opacity: 0, duration: 0.48, ease: 'expo.out' }, 4.04)
    .from('#scene-2 .qualifier', { opacity: 0, x: 22, duration: 0.36, ease: 'power2.out' }, 4.28);

  tl.from('#scene-3 .eyebrow', { x: -34, opacity: 0, duration: 0.42, ease: 'expo.out' }, 6.56)
    .from('#scene-3 .product-frame', { scale: 0.94, opacity: 0, y: 26, duration: 0.56, ease: 'back.out(1.4)' }, 6.7)
    .from('#scene-3 .dashboard-capture', { opacity: 0, x: 42, duration: 0.5, ease: 'power3.out' }, 6.84)
    .from('#scene-3 .telemetry-tag', { y: 26, opacity: 0, duration: 0.38, ease: 'power2.out' }, 7.08)
    .from('#scene-3 .performance-capture', { opacity: 0, x: 46, duration: 0.5, ease: 'expo.out' }, 8.04)
    .from('#scene-3 .power-tag', { scale: 0.86, opacity: 0, duration: 0.4, ease: 'back.out(1.4)' }, 8.3)
    .from('#scene-3 .fan-capture', { opacity: 0, x: 48, duration: 0.5, ease: 'power3.out' }, 9.48)
    .from('#scene-3 .fan-tag', { y: -24, opacity: 0, duration: 0.4, ease: 'expo.out' }, 9.74)
    .from('#scene-3 .telemetry-rail', { scaleX: 0, transformOrigin: 'left', duration: 0.48, ease: 'power2.out' }, 10.12);

  tl.from('#scene-4 .eyebrow', { x: -34, opacity: 0, duration: 0.4, ease: 'expo.out' }, 12.36)
    .from('#scene-4 .account-row', { x: -54, opacity: 0, duration: 0.46, ease: 'power3.out' }, 12.5)
    .from('#scene-4 .offline-row', { x: 54, opacity: 0, duration: 0.5, ease: 'back.out(1.4)' }, 12.7)
    .from('#scene-4 .ads-row', { y: 38, opacity: 0, duration: 0.44, ease: 'power2.out' }, 12.94)
    .from('#scene-4 .support-line', { opacity: 0, y: 22, duration: 0.4, ease: 'expo.out' }, 13.22)
    .from('#scene-4 .oss-badge', { scale: 0.84, opacity: 0, duration: 0.4, ease: 'back.out(1.4)' }, 13.46);

  tl.from('#scene-5 .final-mark', { rotation: -8, scale: 0.74, opacity: 0, duration: 0.5, ease: 'back.out(1.4)' }, 16.46)
    .from('#scene-5 .wordmark', { x: -30, opacity: 0, duration: 0.4, ease: 'expo.out' }, 16.58)
    .from('#scene-5 .eyebrow', { y: -22, opacity: 0, duration: 0.38, ease: 'power2.out' }, 16.72)
    .from('#scene-5 .cta', { y: 46, opacity: 0, duration: 0.54, ease: 'power3.out' }, 16.84)
    .from('#scene-5 .install-bar', { scaleX: 0.76, opacity: 0, transformOrigin: 'left', duration: 0.46, ease: 'expo.out' }, 17.12)
    .from('#scene-5 .repo-url', { x: 32, opacity: 0, duration: 0.42, ease: 'power2.out' }, 17.34)
    .from('#scene-5 .final-badges span', { y: 22, opacity: 0, stagger: 0.08, duration: 0.34, ease: 'back.out(1.4)' }, 17.56)
    .from('#scene-5 .legal', { opacity: 0, duration: 0.32, ease: 'power2.out' }, 17.9);

  window.__timelines['vfang-reddit-ad'] = tl;
</script>
```

Use the exact selectors and time positions above. Add the transition calls from Step 4 and only one scene exit: `tl.to('#scene-5 .scene-content', { opacity: 0, duration: 0.35, ease: 'power2.in' }, 19.55)`.

- [ ] **Step 2: Implement four transition overlays**

Animate the existing transition DOM without hiding the outgoing scene early:

```js
tl.from('#transition-1 .scan', { xPercent: -120, duration: 0.22, ease: 'power4.in' }, 2.94)
  .to('#transition-1 .scan', { xPercent: 120, duration: 0.22, ease: 'power4.out' }, 3.12)
  .from('#transition-2 .aperture-left', { xPercent: -105, duration: 0.24, ease: 'expo.in' }, 6.12)
  .from('#transition-2 .aperture-right', { xPercent: 105, duration: 0.24, ease: 'expo.in' }, 6.12)
  .to('#transition-2 .aperture-left', { xPercent: -105, duration: 0.24, ease: 'expo.out' }, 6.36)
  .to('#transition-2 .aperture-right', { xPercent: 105, duration: 0.24, ease: 'expo.out' }, 6.36)
  .from('#transition-3 .wipe-bar', { xPercent: -115, duration: 0.3, stagger: 0.055, ease: 'power3.inOut' }, 11.94)
  .to('#transition-3 .wipe-bar', { xPercent: 115, duration: 0.24, stagger: 0.04, ease: 'power3.inOut' }, 12.18)
  .from('#transition-4 .cursor-line', { scaleX: 0, transformOrigin: 'center', duration: 0.28, ease: 'expo.inOut' }, 16.04)
  .to('#transition-4 .cursor-line', { scaleY: 0, transformOrigin: 'center', duration: 0.2, ease: 'power2.in' }, 16.3);
```

The paired `to()` calls above remove every opaque overlay before its transition clip ends.

- [ ] **Step 3: Run lint and validate against the browser runtime**

Run:

```bash
npx hyperframes lint vfang-reddit-ad
npx hyperframes validate vfang-reddit-ad
```

Expected: all tests PASS; lint and validate report zero errors, and contrast produces no unresolved WCAG warnings.

- [ ] **Step 4: Generate and review the animation map**

Run:

```bash
node /home/home/.codex/plugins/cache/openai-curated-remote/hyperframes/0.1.2/skills/hyperframes/scripts/animation-map.mjs vfang-reddit-ad --out vfang-reddit-ad/.hyperframes/anim-map
```

Expected: every scene has entrance activity, only the closing scene has an exit, no tween is under 0.2 seconds, no element remains unexpectedly invisible, and every reported dead zone is an intentional reading hold under 1.5 seconds.

- [ ] **Step 5: Commit the animated composition**

```bash
git add vfang-reddit-ad/index.html
git commit -m "feat: animate VFang Reddit ad"
```

---

### Task 3: Visual QA and Final Render

**Files:**
- Modify: `vfang-reddit-ad/index.html` when visual QA identifies a concrete layout, contrast, or choreography defect
- Create: `vfang-reddit-ad/renders/vfang-reddit-ad.mp4`
- Create: `vfang-reddit-ad/.hyperframes/inspection/` diagnostic artifacts

**Interfaces:**
- Consumes: the validated composition and timeline from Task 2.
- Produces: a visually inspected, Reddit-ready 1920×1080 H.264 MP4 and evidence from representative frames.

- [ ] **Step 1: Run dense layout inspection at hero and transition frames**

Run:

```bash
npx hyperframes inspect vfang-reddit-ad --samples 15 --at 1.8,3.1,4.8,6.3,8.2,10.4,12.1,14.1,16.2,18.4 --json
```

Expected: no unmarked text overflow, canvas escape, clipping, or container collision. Fix sizing or padding instead of suppressing genuine findings.

- [ ] **Step 2: Render a draft MP4**

Run:

```bash
npx hyperframes render vfang-reddit-ad --output vfang-reddit-ad/renders/vfang-reddit-ad-draft.mp4 --fps 30 --quality draft --strict
```

Expected: a 20-second 1920×1080 MP4 renders successfully.

- [ ] **Step 3: Extract representative frames for manual inspection**

Run:

```bash
mkdir -p vfang-reddit-ad/.hyperframes/inspection
ffmpeg -y -i vfang-reddit-ad/renders/vfang-reddit-ad-draft.mp4 -vf "fps=1/2,scale=960:-1,tile=5x2" -frames:v 1 vfang-reddit-ad/.hyperframes/inspection/contact-sheet.png
```

Expected: one contact sheet showing ten evenly spaced frames. Inspect it for copy hierarchy, screenshot clarity, transition coverage, contrast, and unintended empty frames.

- [ ] **Step 4: Re-run the complete verification suite after any visual corrections**

Run:

```bash
npx hyperframes lint vfang-reddit-ad
npx hyperframes validate vfang-reddit-ad
npx hyperframes inspect vfang-reddit-ad --samples 15 --strict
```

Expected: all commands exit zero with no unresolved correctness, contrast, or layout findings.

- [ ] **Step 5: Render the final Reddit asset**

Run:

```bash
npx hyperframes render vfang-reddit-ad --output vfang-reddit-ad/renders/vfang-reddit-ad.mp4 --fps 30 --quality high --strict
```

Expected: `vfang-reddit-ad/renders/vfang-reddit-ad.mp4` is exactly 20 seconds, 1920×1080, 30 fps, and contains no required audio track.

- [ ] **Step 6: Verify final media metadata**

Run:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate -show_entries format=duration -of default=noprint_wrappers=1 vfang-reddit-ad/renders/vfang-reddit-ad.mp4
```

Expected: H.264-compatible codec, width `1920`, height `1080`, frame rate `30/1`, and duration `20.000000` within encoder tolerance.

- [ ] **Step 7: Commit the production source and final render**

```bash
git add vfang-reddit-ad
git commit -m "feat: deliver VFang Reddit advertisement"
```
