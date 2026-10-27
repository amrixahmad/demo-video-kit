# Integrating demo-video-kit with Your App

This guide walks an AI agent or human engineer through adding `demo-video-kit` to any web application.

---

## 1. Prerequisites

Before writing code, ensure your system has the required tooling installed:

- **ffmpeg** with `--enable-libass` on your system PATH (`ffmpeg -version`).
- **Python 3.10+** with `faster-whisper` (`pip install faster-whisper`).
- **Playwright Chromium** (`npx playwright install chromium`).
- A valid **GEMINI_API_KEY** in your app's root `.env` file.

You can verify all requirements at any time using:
```bash
npx demo-video doctor
```

---

## 2. Installation

Add `demo-video-kit` to your app's `devDependencies`, pinned to a specific tag:

```json
{
  "devDependencies": {
    "demo-video-kit": "github:amrixahmad/demo-video-kit#v0.1.0"
  }
}
```

Then install dependencies with `npm install`.

Add helper scripts to your `package.json`:
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

Add `.demo-video/` to your `.gitignore`:
```
.demo-video/
```

---

## 3. Configuration Overview

Every application configures the kit by creating `demo-video.config.ts` (or `.js`) in its root directory. Use `defineConfig` to ensure type safety:

```typescript
import { defineConfig } from 'demo-video-kit';

export default defineConfig({
  app: { ... },
  auth: { ... },      // optional (for authenticated apps)
  recorder: { ... },  // required
  script: { ... },    // required
  style: { ... },     // optional
  voice: { ... },     // optional
});
```

The configuration is divided into 6 modular sections:

### Section A: `app`
- `baseUrl`: The URL where the local dev server is running. Defaults to `process.env.DEMO_BASE_URL || 'http://localhost:3000'`.
- `outDir`: Where recordings, raw video, audio clips, and finished videos are saved. Default: `.demo-video/out`.
- `authDir`: Where browser session storage states are saved. Default: `.demo-video/.auth`.
- `hideDevCss`: Optional extra CSS rules injected into the page during recording to hide development overlays (e.g. debug buttons, dev banners).

### Section B: `auth` (Optional)
For applications behind authentication:
- `loginPath`: Path to the login screen (default: `/login`).
- `isSignedIn`: Function `(context: BrowserContext) => Promise<boolean>`. If omitted, checks for standard session cookies (`__session` or `__client_uat`).
- `refresh`: Hook `(context: BrowserContext) => Promise<void>`. Called before API requests or recording to ensure session tokens and cookies are actively refreshed.

### Section C: `recorder`
The adapter that drives the browser through the recording workflow:
- `setup(context, target)`: Runs **off-camera** before recording begins. Sets up required entities (e.g. creating a test project, seeding domain data, warming dev server compilation). Returns `{ url: string, data?: any }` where `url` is the page to navigate to on camera, and `data` is passed to `cleanup`.
- `run(page, mark)`: Drives the app on camera.
  - Must call `mark('sent')` when the user action or background task starts.
  - Drives interactions (clicks starter buttons, fills inputs).
  - Waits for completion (API response, DOM status indicator, completion marker).
  - Must call `mark('answer_done')` when the final result is rendered.
  - Returns the text of the result (saved to `answer.txt`).
- `stepCount(page)` (Optional): Custom function returning the number of completed intermediate steps (e.g. completed tool executions). Defaults to counting `✓` characters in `document.body`.
- `scroll(page, mark)` (Optional): Custom scroll-through behavior over the result container. If omitted, uses the kit's built-in container scroller.
- `cleanup(context, data)` (Optional): Runs **off-camera** after recording ends (unless `--keep` was passed). Deletes test projects, reset state, etc.

### Section D: `script`
Defines how the voiceover script is generated:
- `model`: An AI SDK `LanguageModel` instance (e.g. `getGeminiModel()`). The kit does not provide an LLM of its own, honoring your project's AI SDK conventions.
- `providerOptions`: Optional provider-specific options for the model.
- `schema`: A Zod schema defining the structured slots extracted from `answer.txt`.
- `prompt(target, answer)`: Builds the prompt requesting the structured slot data from the model.
- `sticker`: String or `(slots, target) => string` defining the hook card shown at the top of the video during the intro.
- `lines(slots, target)`: Returns an ordered array of `ScriptLine` objects:
  ```typescript
  type ScriptLine = {
    id: string;
    segment: 'intro' | 'working' | 'answer' | 'outro';
    text: string;
  };
  ```
  - `intro`: Spoken over the idle starting page, held still until intro lines finish.
  - `working`: Spoken while the tool/agent operates. The footage is automatically sped up to match the voice clip length!
  - `answer`: Spoken while the result is displayed and scrolled. The footage is slowed down or held at the bottom to fit.
  - `outro`: Spoken following the findings, held on the final frame.
  > **Tip for TTS Reliability**: Write lines as statements rather than commands (e.g. "It should include..." instead of "Expand the heading..."). Commands cause TTS models to ad-lib and drift from the transcript.
- `postCaption(slots)`: Returns the text for the social media post.
- `hashtags(slots)`: Returns an array of hashtag strings.
- `saveSlots(slots)` (Optional): Additional slot fields to save into `script.json`.

### Section E: `style` (Optional)
- `brandAss`: Subtitle highlight color in ASS format (`&HAABBGGRR`). Default: `&H00E5464F`.
- `captionBoxAss`: Subtitle background box color. Default: `&H00111111`.
- `hookFont`, `hookFontSize`: Font name and size for top sticker (default Arial, 76).
- `captionFont`, `captionFontSize`: Font name and size for captions (default Arial, 70).

### Section F: `voice` (Optional)
- `model`: Gemini TTS model (default: `gemini-3.8-flash-tts`).
- `voice`: Voice name (default: `Ludo`).
- `style`: Director's style prompt passed to Gemini TTS.
- `apiKey`: Optional custom API key getter. Defaults to reading `GEMINI_API_KEY` from `.env`.

---

## 4. Worked Example: Simple Unauthenticated App

Here is a complete, minimal adapter for an unauthenticated site auditor or summary tool:

```typescript
// demo-video.config.ts
import { defineConfig } from 'demo-video-kit';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const Schema = z.object({
  summary: z.string().describe('Short 1-sentence summary of the page.'),
  threeHighlights: z.array(z.string()).length(3),
  postCaption: z.string(),
  hashtags: z.array(z.string()),
});

export default defineConfig({
  app: {
    baseUrl: 'http://localhost:3000',
    outDir: '.demo-video/out',
  },
  recorder: {
    setup: async (context, target) => {
      // Nothing off-camera needed; navigate directly to the target audit page
      return { url: `/audit?url=${encodeURIComponent(target)}` };
    },
    run: async (page, mark) => {
      // Click start
      const startButton = page.getByRole('button', { name: /start audit/i });
      await startButton.waitFor({ timeout: 15_000 });
      await startButton.click();
      mark('sent');

      // Wait for completion indicator
      await page.waitForSelector('[data-testid="audit-complete"]', { timeout: 60_000 });
      mark('answer_done');

      // Extract result text
      const resultText = await page.innerText('[data-testid="audit-result"]');
      return resultText;
    },
  },
  script: {
    model: google('gemini-2.0-flash'),
    schema: Schema,
    prompt: (target, answer) => `
Analyze this audit result for ${target} and extract 3 highlights:
${answer}
`,
    sticker: 'What does this website do?',
    lines: (slots, target) => [
      { id: 'hook', segment: 'intro', text: `Let's inspect ${target}.` },
      { id: 'work', segment: 'working', text: 'Our AI auditor is analyzing performance and security.' },
      { id: 'h1', segment: 'answer', text: slots.threeHighlights[0] },
      { id: 'h2', segment: 'answer', text: slots.threeHighlights[1] },
      { id: 'h3', segment: 'answer', text: slots.threeHighlights[2] },
      { id: 'outro', segment: 'outro', text: slots.summary },
    ],
    postCaption: (slots) => slots.postCaption,
    hashtags: (slots) => slots.hashtags,
  },
});
```

---

## 5. Worked Example: Authenticated App with Custom Setup (SapuSEO)

For full reference, review SapuSEO's adapter at `demo-video.config.ts` in the SapuSEO repository:
- `auth.refresh`: Navigates to `/domains`, waits for `window.Clerk.loaded`, requests a fresh token, and polls the API until the session cookie is active.
- `recorder.setup`: Calls `/api/domains` to create the domain entry and warms up `/domain/copilot/[slug]`.
- `recorder.run`: Clicks `data-testid="site-audit-starter"`, calls `mark('sent')`, races the `/api/chat` network response against on-screen error banners, calls `mark('answer_done')`, and captures the Copilot response text.
- `recorder.cleanup`: Deletes the created conversations and domain off-camera.
- `script`: Uses the government website SEO structure (hook, Ministry name, SapuSEO value proposition, 3 wrong/should pairs, issue count, and outro punchline).

---

## 6. Verification and Troubleshooting

- **Check prerequisites**: Always run `npm run demo:doctor` first if a new environment or machine fails.
- **Transcribe mismatch**: If `produce` warns that a line was spoken differently, review `script.json` and ensure lines are phrased as simple, factual declarative statements.
- **Timing issues**: If the working stretch finishes too quickly or slowly, ensure `mark('sent')` is called immediately when processing starts and `mark('answer_done')` is called right when the result finishes rendering.
