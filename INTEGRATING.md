# Integrating demo-video-kit with Your App

This guide walks an AI agent or human engineer through adding `demo-video-kit` to any web application to create finished vertical (9:16) videos for TikTok, Reels, and Shorts.

---

## 1. Prerequisites

Before writing code, ensure your system has the required tooling installed:

- **ffmpeg** with `--enable-libass` on your system PATH (`ffmpeg -version`).
- **Python 3.10+** with `faster-whisper` (`pip install faster-whisper`).
- **Playwright Chromium** (`npx playwright install chromium`).
- A valid **GEMINI_API_KEY** in your app's root `.env` file (used by Gemini TTS).

You can verify all requirements at any time using:
```bash
npx demo-video doctor
```

---

## 2. Installation & Scripts

Add `demo-video-kit` and your preferred AI/schema libraries to `devDependencies`:

```bash
npm install -D github:amrixahmad/demo-video-kit#v0.1.1 zod @playwright/test
```
*(Plus your project's chosen AI SDK provider, e.g. `@ai-sdk/google` and `ai`).*

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

## 3. CLI Commands & Workflow

The CLI operates in sequential steps, saving state to `.demo-video/out/<slug>-<timestamp>/`:

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ demo-video      │  ──>  │ demo-video      │  ──>  │ demo-video      │
│ record <target> │       │ script [folder] │       │ produce [folder]│
└─────────────────┘       └─────────────────┘       └─────────────────┘
  raw.webm                  script.json               video.mp4
  timeline.json                                       caption.txt
  answer.txt                                          voice/
  final.mp4
```

| Command | Usage Example | Key Flags | Description |
|---|---|---|---|
| `doctor` | `demo-video doctor` | none | Validates ffmpeg, Python `faster-whisper`, Playwright Chromium, Gemini API key, dev server availability, and auth session. |
| `login` | `demo-video login` | none | Opens a visible browser, navigates to `auth.loginPath`, waits for sign-in, and saves browser state to `.demo-video/.auth/state.json`. |
| `record` | `demo-video record <target>` | `--keep`, `--headed` | Runs off-camera setup, records 9:16 viewport interaction, scrolls answer, upscales to 1080x1920, and saves `raw.webm`, `timeline.json`, and `answer.txt`. `--keep` skips cleanup. |
| `script` | `demo-video script [folder]` | none | Reads `answer.txt`, sends it to the app's AI model via the template prompt & schema, and writes `script.json`. Uses newest recording if folder is omitted. |
| `produce` | `demo-video produce [folder]` | none | Voices lines via Gemini TTS, transcribes & checks clips with Whisper, fits working stretch to voice length, burns in captions & hook sticker, and renders `video.mp4`. |
| `edit` | `demo-video edit [folder]` | `--speed <n>` | Speeds up the working stretch without voiceover or captions (default speed: 6x). |

---

## 4. Video Timeline & Mark State Machine

The kit uses timeline marks emitted by your adapter's `run(page, mark)` function to re-time and stitch the video footage to fit the voiceover:

```
Video Timeline:
[0.0s] ────────── [mark('sent')] ─────────────── [mark('answer_done')] ─────────── [End]
  │                     │                               │                            │
  ▼                     ▼                               ▼                            ▼
intro                working                         answer                        outro
(Held on initial     (Sped up dynamically            (Result container             (Held on final
frame until intro    to exactly match voice          scrolled; held if             frame until
voiceover ends)      clip duration, up to 12x)       voice needs extra time)       outro finishes)
```

- **`mark('sent')`**: Must be called immediately when the user action or background query begins.
- **`mark('answer_done')`**: Must be called when the final result or answer finishes rendering.
- If your app has zero wait time between user click and result render, call `mark('sent')` and `mark('answer_done')` around the action; the kit will assign minimal frames to the working stretch.

---

## 5. Viewport & Resolution Contract

- **Recording Viewport**: 540x960 (9:16 aspect ratio).
- **Output Video**: 1080x1920 (upscaled via ffmpeg Lanczos filter).
- Playwright's `recordVideo` pads videos larger than the viewport with black borders instead of scaling. The kit records at viewport size (540x960) and scales cleanly with ffmpeg afterwards.
- **Tip**: Ensure your application UI is responsive and renders cleanly at 540px width.

---

## 6. Configuration Reference (`demo-video.config.ts`)

Create `demo-video.config.ts` in your project root. Use TypeScript generics `defineConfig<TSlots, TSetupData>`:

```typescript
import { defineConfig } from 'demo-video-kit';
import { z } from 'zod';

export default defineConfig<TSlots, TSetupData>({
  app: { ... },
  auth: { ... },      // optional
  recorder: { ... },  // required
  script: { ... },    // required
  style: { ... },     // optional
  voice: { ... },     // optional
});
```

### Section A: `app`
- `baseUrl`: The URL where the local dev server is running. Defaults to `process.env.DEMO_BASE_URL || 'http://localhost:3000'`.
- `outDir`: Path where recordings, audio cache, and finished videos are stored (default: `.demo-video/out`).
- `authDir`: Path where browser session storage states are saved (default: `.demo-video/.auth`).
- `hideDevCss`: Extra CSS rules injected into the page during recording to hide development overlays (e.g. debug buttons, dev banners).

### Section B: `auth` (Optional)
For apps behind a login:
- `loginPath`: Path to the login screen (default: `/login`).
- `isSignedIn`: `(context: BrowserContext) => Promise<boolean>`. If omitted, checks for default session cookies (`__session` or `__client_uat`).
- `refresh`: `(context: BrowserContext) => Promise<void>`. Called before API calls or recording to ensure session tokens are actively refreshed.

### Section C: `recorder`
- `setup(context, target)`: Runs **off-camera** before recording begins. Sets up required entities (e.g. creating test resources, seeding domain data, warming dev server compilation).
  - `target`: The string passed via CLI: `demo-video record <target>`.
  - Returns `{ url: string, data?: TSetupData }` where `url` is the page to navigate to on camera, and `data` is passed to `cleanup`.
- `run(page, mark)`: Drives the app on camera.
  - Calls `mark('sent')` when the user action or background task starts.
  - Drives interactions (clicks starter buttons, fills inputs).
  - Waits for completion (API response, status indicator, completion marker).
  - Calls `mark('answer_done')` when the final result is rendered.
  - Returns the text of the result (saved to `answer.txt`).
- `cleanup(context, data)` (Optional): Runs **off-camera** after recording ends (unless `--keep` was passed). Always executes even if `run()` failed.

### Section D: `script`
- `model`: An AI SDK `LanguageModel` instance (e.g. `getGeminiModel()` or `google('gemini-2.0-flash')`).
- `providerOptions`: Optional provider-specific options passed to `generateText`.
- `schema`: A Zod schema defining the structured slots extracted from `answer.txt`.
- `prompt(target, answer)`: Builds the prompt requesting the structured slot data from the model. `answer` is the content of `answer.txt`.
- `sticker`: String or `(slots, target) => string` defining the hook card shown at the top of the video during the intro.
- `lines(slots, target)`: Returns an ordered array of `ScriptLine` objects:
  ```typescript
  type ScriptLine = {
    id: string;
    segment: 'intro' | 'working' | 'answer' | 'outro';
    text: string;
  };
  ```
  > **TTS Reliability Tip**: Phrase lines as factual declarative statements rather than commands (e.g. "It should include..." instead of "Expand the heading..."). Commands cause TTS models to ad-lib and drift from the transcript.
- `postCaption(slots)`: Returns the text for the social media caption.
- `hashtags(slots)`: Returns an array of hashtag strings.
- `saveSlots(slots)` (Optional): Custom slot fields to save into `script.json` (e.g. full issue lists, ratings, entity IDs) alongside the standard fields (`site`, `onScreen`, `lines`, `postCaption`, `hashtags`).

### Section E: `style` (Optional)
- `brandAss`: Subtitle highlight color in ASS format (`&HAABBGGRR`). Default: `&H00FFFFFF` (white).
- `captionBoxAss`: Subtitle background box color. Default: `&H00111111` (dark grey/black).
- `hookFont`, `hookFontSize`: Font name and size for top sticker (default Arial, 76).
- `captionFont`, `captionFontSize`: Font name and size for captions (default Arial, 70).

### Section F: `voice` (Optional)
- `model`: Gemini TTS model (default: `gemini-3.8-flash-tts`).
- `voice`: Voice name (default: `Puck`).
- `style`: Director's style prompt passed to Gemini TTS.
- `apiKey`: Optional custom API key getter. Defaults to reading `GEMINI_API_KEY` from `.env`.

---

## 7. Worked Example: Unauthenticated App ("DentistDirectory")

Here is a complete adapter for a directory or search tool (`/search?city=kl`):

```typescript
// demo-video.config.ts
import { defineConfig } from 'demo-video-kit';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const ClinicFindingsSchema = z.object({
  city: z.string(),
  clinics: z.array(z.object({
    name: z.string(),
    rating: z.string(),
    address: z.string(),
    feature: z.string(),
  })).length(3),
  summary: z.string(),
  postCaption: z.string(),
  hashtags: z.array(z.string()).min(3).max(6),
});

type ClinicSlots = z.infer<typeof ClinicFindingsSchema>;

interface DentistSetupData {
  city: string;
}

export default defineConfig<ClinicSlots, DentistSetupData>({
  app: {
    baseUrl: process.env.DEMO_BASE_URL || 'http://localhost:3000',
    outDir: '.demo-video/out',
  },

  recorder: {
    setup: async (_context, target) => {
      const city = target?.trim() || 'kl';
      return {
        url: `/search?city=${encodeURIComponent(city)}`,
        data: { city },
      };
    },

    run: async (page, mark) => {
      const findButton = page.getByRole('button', { name: /find clinics/i });
      await findButton.waitFor({ timeout: 15_000 });
      await findButton.click();
      mark('sent');

      const resultsContainer = page.locator('[data-testid="clinic-results"]');
      await resultsContainer.waitFor({ timeout: 30_000 });
      mark('answer_done');

      return await resultsContainer.innerText();
    },
  },

  script: {
    model: google('gemini-2.0-flash', {
      apiKey: process.env.GEMINI_API_KEY,
    }),
    schema: ClinicFindingsSchema,
    prompt: (target, answer) => `
You write engaging voiceover scripts for vertical short-form video (TikTok).
The app is DentistDirectory. Target city: "${target}".
Extract 3 featured clinics, ratings, and standout features.

Clinic Results:
"""
${answer}
"""`,
    sticker: (slots, target) => `Best Dentists in ${(target || slots.city || 'KL').toUpperCase()}?`,

    lines: (slots, target) => [
      { id: 'hook', segment: 'intro', text: `Looking for top-rated dental clinics in ${target}? Let's check the directory.` },
      { id: 'searching', segment: 'working', text: 'The directory queries verified patient reviews, ratings, and operating locations.' },
      { id: 'c1', segment: 'answer', text: `First is ${slots.clinics[0].name} in ${slots.clinics[0].address}. ${slots.clinics[0].feature}` },
      { id: 'c2', segment: 'answer', text: `Next is ${slots.clinics[1].name} in ${slots.clinics[1].address}. ${slots.clinics[1].feature}` },
      { id: 'c3', segment: 'answer', text: `Finally, ${slots.clinics[2].name} has ${slots.clinics[2].rating}. ${slots.clinics[2].feature}` },
      { id: 'outro', segment: 'outro', text: slots.summary },
    ],

    postCaption: (slots) => slots.postCaption,
    hashtags: (slots) => slots.hashtags,
    saveSlots: (slots) => ({ clinics: slots.clinics }),
  },
});
```

---

## 8. Worked Example: Authenticated App with Custom Setup (SapuSEO)

For full reference of an authenticated enterprise adapter, review SapuSEO's configuration at `demo-video.config.ts`:
- **`auth.refresh`**: Navigates to `/domains`, waits for Clerk session tokens, and polls `/api/domains` until the cookie is accepted.
- **`recorder.setup`**: Calls `/api/domains` off-camera to add the domain, and pre-warms the Next.js Copilot page before the camera starts.
- **`recorder.run`**: Clicks the admin-only `data-testid="site-audit-starter"` chip, calls `mark('sent')`, races the `/api/chat` network response against error banners, calls `mark('answer_done')`, and captures the Copilot response text.
- **`recorder.cleanup`**: Deletes the created conversation and domain off-camera.
- **`script`**: Fills structured findings (Ministry name, 3 wrong/should pairs, total issues count, and outro punchline).
