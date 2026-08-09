# VFang Reddit Advertisement Voice-over Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a professional, scene-synchronized English narration track to the existing 20-second VFang Reddit advertisement and render a separate voiced master.

**Architecture:** Generate five short clips with HyperFrames’ local Kokoro TTS engine, align them to the existing scene boundaries, and mix them into one deterministic 20-second WAV asset. Mount that asset as a framework-owned timed audio clip in the root composition, leaving every visual scene unchanged.

**Tech Stack:** HyperFrames 0.7.103, Kokoro-82M local TTS, HTML timed media, FFmpeg/FFprobe, GSAP, Rust and Node test suites.

## Global Constraints

- Keep the composition exactly 20.0 seconds at 1920×1080 and 30 fps.
- Use the `am_michael` English voice with a restrained, confident tech-documentary delivery.
- Preserve the current silent master at `vfang-reddit-ad/renders/vfang-reddit-ad.mp4`.
- Render the voiced master to `vfang-reddit-ad/renders/vfang-reddit-ad-voiceover.mp4`.
- Add no music or sound effects.
- Keep the existing muted-autoplay copy and all visual timing unchanged.
- The final file must contain one H.264 video stream and one audio stream.

---

### Task 1: Generate the scene-synchronized narration asset

**Files:**
- Create: `vfang-reddit-ad/voiceover-script.txt`
- Create: `vfang-reddit-ad/assets/vfang-voiceover.wav`
- Modify: `vfang-reddit-ad/.media/manifest.jsonl`
- Modify: `vfang-reddit-ad/.media/index.md`

**Interfaces:**
- Consumes: The five narration lines and scene boundaries from the approved design.
- Produces: A mono or stereo WAV at `assets/vfang-voiceover.wav`, exactly 20.0 seconds long, ready for an HTML `<audio>` element.

- [ ] **Step 1: Record the exact source script**

Create `voiceover-script.txt` with five lines:

```text
Your Blade. Your Linux.
Synapse stops at Windows. VFang starts on Linux.
Take control of live telemetry, performance modes, and safe fan curves—right on your Razer Blade.
No account. No cloud required. No ads. Just open-source control that works offline.
VFang. Take back your Blade.
```

- [ ] **Step 2: Generate one TTS clip per scene**

Create a temporary directory and run the pinned local TTS engine for each line. Start at speed `1.10`; increase only a segment that exceeds its scene’s available narration window.

```bash
npx --yes hyperframes@0.7.103 tts "Your Blade. Your Linux." --voice am_michael --speed 1.10 --output /tmp/vfang-voiceover/scene-1.wav
npx --yes hyperframes@0.7.103 tts "Synapse stops at Windows. VFang starts on Linux." --voice am_michael --speed 1.10 --output /tmp/vfang-voiceover/scene-2.wav
npx --yes hyperframes@0.7.103 tts "Take control of live telemetry, performance modes, and safe fan curves—right on your Razer Blade." --voice am_michael --speed 1.10 --output /tmp/vfang-voiceover/scene-3.wav
npx --yes hyperframes@0.7.103 tts "No account. No cloud required. No ads. Just open-source control that works offline." --voice am_michael --speed 1.10 --output /tmp/vfang-voiceover/scene-4.wav
npx --yes hyperframes@0.7.103 tts "VFang. Take back your Blade." --voice am_michael --speed 1.10 --output /tmp/vfang-voiceover/scene-5.wav
```

- [ ] **Step 3: Probe segment durations**

Run:

```bash
ffprobe -v error -show_entries format=filename,duration -of csv=p=0 /tmp/vfang-voiceover/scene-*.wav
```

Expected maximum durations: scene 1 ≤ 2.8s, scene 2 ≤ 2.8s, scene 3 ≤ 5.3s, scene 4 ≤ 3.6s, scene 5 ≤ 2.9s. Regenerate an overlong scene at `--speed 1.15`, then `1.20` if needed.

- [ ] **Step 4: Mix the clips onto the 20-second scene timeline**

Delay each segment to 0.20s, 3.35s, 6.55s, 12.35s, and 16.45s. Mix without normalization, trim to 20.0 seconds, and apply a 300ms final fade:

```bash
ffmpeg -y \
  -i /tmp/vfang-voiceover/scene-1.wav \
  -i /tmp/vfang-voiceover/scene-2.wav \
  -i /tmp/vfang-voiceover/scene-3.wav \
  -i /tmp/vfang-voiceover/scene-4.wav \
  -i /tmp/vfang-voiceover/scene-5.wav \
  -filter_complex "[0:a]adelay=200|200[a0];[1:a]adelay=3350|3350[a1];[2:a]adelay=6550|6550[a2];[3:a]adelay=12350|12350[a3];[4:a]adelay=16450|16450[a4];[a0][a1][a2][a3][a4]amix=inputs=5:normalize=0,atrim=0:20,apad=whole_dur=20,afade=t=out:st=19.7:d=0.3[a]" \
  -map "[a]" -ar 48000 -ac 2 assets/vfang-voiceover.wav
```

- [ ] **Step 5: Verify and adopt the audio asset**

Run:

```bash
ffprobe -v error -show_entries stream=codec_name,sample_rate,channels:format=duration -of json assets/vfang-voiceover.wav
node /home/home/.agents/skills/media-use/scripts/resolve.mjs --adopt --project .
```

Expected: WAV, 48 kHz, two channels, 20.000 seconds. Confirm `.media/manifest.jsonl` and `.media/index.md` contain `assets/vfang-voiceover.wav`.

- [ ] **Step 6: Commit the narration asset**

```bash
git add vfang-reddit-ad/voiceover-script.txt vfang-reddit-ad/assets/vfang-voiceover.wav vfang-reddit-ad/.media
git commit -m "feat: add VFang advertisement narration"
```

### Task 2: Mount narration in the HyperFrames composition

**Files:**
- Modify: `vfang-reddit-ad/index.html`
- Modify: `vfang-reddit-ad/BRIEF.md`
- Modify: `vfang-reddit-ad/STORYBOARD.md`

**Interfaces:**
- Consumes: `assets/vfang-voiceover.wav` from Task 1.
- Produces: A root composition with one framework-owned, 20-second narration clip.

- [ ] **Step 1: Add the timed audio element**

Insert this direct child inside `#vfang-reddit-ad`, before the scene slots:

```html
<audio
  id="vfang-voiceover"
  class="clip"
  data-start="0"
  data-duration="20"
  data-track-index="0"
  src="assets/vfang-voiceover.wav"
  preload="auto"
></audio>
```

- [ ] **Step 2: Update the recorded creative intent**

Replace the BRIEF customization that declares deliberate silence with the chosen tech-documentary narrator direction. Add each scene’s exact narration line to its matching STORYBOARD frame so the source of timing truth remains explicit.

- [ ] **Step 3: Run the static gate**

Run:

```bash
npx --yes hyperframes@0.7.103 lint --json
```

Expected: `ok: true`, `errorCount: 0`, `warningCount: 0`.

- [ ] **Step 4: Run the full browser gate**

Run:

```bash
npx --yes hyperframes@0.7.103 check --samples 12 --at 1.8,4.8,8.2,10.4,14.1,18.4 --strict --json
```

Expected: runtime, layout, motion, and contrast each report zero errors and zero warnings.

- [ ] **Step 5: Commit the composition integration**

```bash
git add vfang-reddit-ad/index.html vfang-reddit-ad/BRIEF.md vfang-reddit-ad/STORYBOARD.md
git commit -m "feat: sync narration with VFang ad"
```

### Task 3: Render and verify the voiced master

**Files:**
- Create: `vfang-reddit-ad/renders/vfang-reddit-ad-voiceover.mp4`

**Interfaces:**
- Consumes: The validated composition and `assets/vfang-voiceover.wav`.
- Produces: A Reddit-ready 20-second MP4 with H.264 video and narration audio.

- [ ] **Step 1: Render the high-quality voiced master**

Run:

```bash
npx --yes hyperframes@0.7.103 render --output renders/vfang-reddit-ad-voiceover.mp4 --fps 30 --quality high --strict --skill general-video
```

Expected: render exit code 0 and a non-empty MP4 at the requested path.

- [ ] **Step 2: Probe the finished media**

Run:

```bash
ffprobe -v error -count_frames -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,sample_rate,channels:format=duration,size -of json renders/vfang-reddit-ad-voiceover.mp4
```

Expected: H.264 1920×1080 video, 30/1 fps, 600 frames; one audio stream; 20.000-second container duration.

- [ ] **Step 3: Run repository regression tests**

Run `cargo test --workspace` at the repository root and `npm test -- --run` under `app/`. Expected: 66 Rust tests and 5 UI suites pass with zero failures.

- [ ] **Step 4: Commit the final voiced master**

```bash
git add vfang-reddit-ad/renders/vfang-reddit-ad-voiceover.mp4
git commit -m "feat: render VFang voiced Reddit ad"
```

- [ ] **Step 5: Confirm repository state**

Run `git status --short` and `git log -3 --oneline`. Expected: clean worktree and the narration, composition, and render commits at the top of history.
