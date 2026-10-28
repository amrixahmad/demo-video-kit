# demo-video-kit

A reusable kit that records web applications in action and produces finished vertical (9:16) videos for TikTok, Reels, and Shorts. It handles screen recording via Playwright, AI voiceovers via Gemini TTS, speech verification via faster-whisper, dynamic speed-fitting of working stretches, sticker hooks, and karaoke-style box captions timed to speech.

The kit contains no app-specific routes, auth methods, colors, or copy. Every app provides its own configuration and adapter via `demo-video.config.ts`.

---

## Installation

Add `demo-video-kit` as a git dependency in your app's `package.json`, pinned to a tag:

```json
{
  "devDependencies": {
    "demo-video-kit": "github:amrixahmad/demo-video-kit#v0.1.0"
  }
}
```

The kit ships compiled JavaScript in `dist/` and runs a `prepare` build on install, so consuming apps do not require `sucrase` or custom TypeScript tooling to execute the CLI.

---

## Quick Start

1. Run the prerequisite check:
   ```bash
   npx demo-video doctor
   ```
2. Create `demo-video.config.ts` in your repository root (see [INTEGRATING.md](./INTEGRATING.md)).
3. Add helper scripts to your `package.json`:
   ```json
   {
     "scripts": {
       "demo:doctor": "demo-video doctor",
       "demo:login": "demo-video login",
       "demo:record": "demo-video record",
       "demo:script": "demo-video script",
       "demo:produce": "demo-video produce",
       "demo:edit": "demo-video edit"
     }
   }
   ```
4. Authenticate once:
   ```bash
   npm run demo:login
   ```
5. Record and produce a video:
   ```bash
   npm run demo:record -- mysite.com
   npm run demo:script
   npm run demo:produce
   ```

---

## CLI Commands

| Command | Usage | Description |
|---|---|---|
| `doctor` | `demo-video doctor` | Validates ffmpeg (libass), Python (faster-whisper), Playwright Chromium, Gemini API key, app availability, and auth session. Explains how to fix any issues. |
| `login` | `demo-video login` | Opens a visible browser window, navigates to the login page, waits for sign-in, and saves browser storage state to `.auth/state.json`. |
| `record` | `demo-video record <target> [--keep] [--headed]` | Sets up the target off-camera, launches 9:16 viewport recording, executes `recorder.run`, scrolls the result, scales to 1080x1920 with ffmpeg, and writes `raw.webm`, `timeline.json`, and `answer.txt`. |
| `script` | `demo-video script [folder]` | Reads `answer.txt`, queries the app's AI model using the template schema & prompt, and writes `script.json`. |
| `produce` | `demo-video produce [folder]` | Voices each line with Gemini TTS, checks audio fidelity with Whisper, fits working stretch to voice length, burns in sticker & captions, and renders `video.mp4`. |
| `edit` | `demo-video edit [folder] [--speed 6]` | Standalone speed-up of the working stretch without voiceover or captions, writing `edited.mp4`. |

---

## File Contracts

A recording folder (default `.demo-video/out/<slug>-<timestamp>/`) contains:

| File | Produced by | Description |
|---|---|---|
| `raw.webm` | `record` | Raw screen recording captured at viewport size (540x960). |
| `final.mp4` | `record` | Clean upscaled video (1080x1920) before audio and captions. |
| `timeline.json` | `record` | Timestamps of lifecycle events (`page_ready`, `sent`, `step_done`, `answer_done`, `end`). |
| `answer.txt` | `record` | Text output captured from the tool/agent run. |
| `site.png` | `record` | Still of the target site for the cold open, when `app.siteShot` is set. |
| `script.json` | `script` | JSON containing `site`, `onScreen`, `lines` (`id`, `segment`, `text`), `postCaption`, `hashtags`, and custom slot data. |
| `captions.ass` | `produce` | Generated Advanced SubStation Alpha subtitles with word highlights. |
| `voice/` | `produce` | Cached individual audio clips (`.wav`) for each script line. |
| `produce.json` | `produce` | Final layout timings, segment durations, speeds, and holds. |
| `video.mp4` | `produce` | Finished video ready for posting. |
| `caption.txt` | `produce` | Ready-to-copy post caption with hashtags. |

---

## Lessons Built In

Each of these represents a hard-won fix from production debugging:

1. **WAV Unpacking**: Gemini TTS returns complete RIFF WAVE containers. Treating them as raw PCM introduced static bursts at clip joins. The kit unpacks RIFF containers and skips non-audio chunks (e.g. `LIST`).
2. **TTS Prompt Engineering**: Placing style notes directly before the spoken line caused the model to read instructions aloud. Gemini TTS rejects system instructions, so the prompt uses labeled `### DIRECTOR'S NOTES` and `### TRANSCRIPT` sections.
3. **Speech Verification with Whisper**: Gemini TTS occasionally repeats words, drops words, or ad-libs commands. Each clip is transcribed with `faster-whisper` and compared to the script using Levenshtein distance on normalised text. Clips failing three attempts halt the build.
4. **Playwright Scaling**: Playwright's `recordVideo` pads videos larger than the viewport with black borders instead of scaling. The kit records at viewport resolution (540x960) and scales cleanly to 1080x1920 via ffmpeg Lanczos.
5. **Evaluate Transpilation**: Helper methods like `_optionalChain` injected by transpilers do not exist in the browser context. Compiling to modern targets (ES2022) ensures native browser support without polyfill crashes.
6. **Env Precedence**: Stale shell environment variables broke production builds. The kit enforces that `.env` overrides shell variables for `GEMINI_API_KEY`.
7. **libass Highlight Boxes**: `BorderStyle 3` in ASS draws an opaque background box behind text. Changing `\3c` mid-line recolors the box behind the spoken word, creating the word-by-word karaoke highlight.
8. **ffmpeg Working Directory**: Running ffmpeg with the recording directory as `cwd` avoids Windows backslash escaping issues with the ASS subtitle filter.
9. **Whisper Decoding**: `faster-whisper` decoded clip paths through PyAV's `av.open(metadata_errors=...)`, which newer PyAV releases dropped. Transcription then failed with a `TypeError`, `transcribe()` returned `null`, and the speech check quietly switched itself off — so a clip that read the director's notes aloud still shipped. The assets pipeline now decodes with ffmpeg and hands the model a float32 array, and a clip whose transcript disagrees is re-voiced (up to three attempts).

---

## License

MIT
