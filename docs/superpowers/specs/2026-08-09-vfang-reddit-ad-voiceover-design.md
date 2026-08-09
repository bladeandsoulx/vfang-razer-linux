# VFang Reddit Advertisement Voice-over Design

## Goal

Add a professional English voice-over to the existing 20-second VFang Reddit advertisement without changing its visual structure or weakening its muted-autoplay readability.

## Chosen Direction

Use one restrained, confident tech-documentary narrator with a low-to-mid register, clear diction, and deliberate pauses. The delivery should sound technically credible rather than like an exaggerated gaming commercial.

Two alternatives were considered and rejected:

- A short slogan-only read would leave the product-proof and local-first scenes unexplained.
- A synthetic terminal or radio voice would fit the interface aesthetic but risk sounding gimmicky and reduce intelligibility.

## Narration Script and Timing

The narration follows the five existing scene boundaries:

| Time | Narration |
| --- | --- |
| 0.0–3.2s | “Your Blade. Your Linux.” |
| 3.2–6.4s | “Synapse stops at Windows. VFang starts on Linux.” |
| 6.4–12.2s | “Take control of live telemetry, performance modes, and safe fan curves—right on your Razer Blade.” |
| 12.2–16.3s | “No account. No cloud required. No ads. Just open-source control that works offline.” |
| 16.3–20.0s | “VFang. Take back your Blade.” |

The complete read is 46 words. Pauses between sentences should align with mechanical transition covers. If synthesis runs long, timing is corrected through delivery pacing or bounded audio processing rather than by changing the 20-second visual edit.

## Audio Integration

- Generate one frozen local narration asset and record it in the project media ledger.
- Mount it as a framework-owned timed audio clip from 0.0 to 20.0 seconds.
- Preserve the current silent visual master as `vfang-reddit-ad.mp4` and render the voiced version as `vfang-reddit-ad-voiceover.mp4`.
- Do not add music or sound effects in this change; the narrator should remain clear on phone speakers.
- Apply a short leading pad and a gentle final fade so words do not collide with the first or last frame.

## Verification

- Confirm the audio duration fits the 20-second composition and does not clip.
- Run HyperFrames lint and full runtime/layout/motion/contrast checks.
- Render the high-quality master and probe for one H.264 video stream and one audio stream.
- Confirm 1920×1080, 30 fps, 600 video frames, and 20.0-second duration.
- Re-run the repository’s Rust and UI tests before integration.
