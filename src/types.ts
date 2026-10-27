import type { BrowserContext, Page } from '@playwright/test';
import type { ZodType } from 'zod';

export type Segment = 'intro' | 'working' | 'answer' | 'outro';

export interface ScriptLine {
  id: string;
  segment: Segment;
  text: string;
}

export interface Script {
  site: string;
  onScreen: string;
  lines: ScriptLine[];
  postCaption: string;
  hashtags: string[];
  [key: string]: unknown;
}

export interface TimelineEvent {
  t: number;
  type: string;
  detail?: string | number;
}

export interface Timeline {
  site: string;
  slug?: string;
  start?: string;
  viewport: { width: number; height: number };
  videoSize: { width: number; height: number };
  duration: number;
  failure?: string;
  events: TimelineEvent[];
  [key: string]: unknown;
}

export interface AppConfig {
  /**
   * Base URL of the running application.
   * Defaults to DEMO_BASE_URL env or 'http://localhost:3000'.
   */
  baseUrl?: string;

  /**
   * Directory where video outputs, cached voice clips and recordings land.
   * Defaults to '.demo-video/out'.
   */
  outDir?: string;

  /**
   * Directory where auth credentials / storage state are kept.
   * Defaults to '.demo-video/.auth'.
   */
  authDir?: string;

  /**
   * Additional CSS injected into the page to hide dev tools / overlays on camera.
   */
  hideDevCss?: string;
}

export interface AuthConfig {
  /**
   * Path to the login page (default '/login').
   */
  loginPath?: string;

  /**
   * Custom check to determine if the user is signed in.
   * If omitted, checks for default session cookies (__session or non-zero __client_uat).
   */
  isSignedIn?: (context: BrowserContext) => Promise<boolean>;

  /**
   * Refresh hook run before any API call or recording (e.g. to ensure session tokens are fresh).
   */
  refresh?: (context: BrowserContext) => Promise<void>;
}

export interface RecorderConfig<TSetupData = any> {
  /**
   * Runs off-camera before recording starts.
   * Returns the URL to navigate to on camera, and optional data to pass to cleanup.
   */
  setup: (
    context: BrowserContext,
    target: string
  ) => Promise<{ url: string; data?: TSetupData }>;

  /**
   * Drives the app on camera.
   * Must call mark('sent') when work begins and mark('answer_done') when work finishes.
   * Returns the audit/answer text (saved to answer.txt).
   */
  run: (
    page: Page,
    mark: (type: string, detail?: string | number) => void
  ) => Promise<string>;

  /**
   * Optional custom step count detector during the working stretch.
   * If omitted, watches for '✓' characters in document.body.
   */
  stepCount?: (page: Page) => Promise<number>;

  /**
   * Optional custom scroll-through function for the result.
   * If omitted, uses default container scroll.
   */
  scroll?: (page: Page, mark: (type: string, detail?: string | number) => void) => Promise<void>;

  /**
   * Removes what setup created after recording finishes.
   */
  cleanup?: (context: BrowserContext, data?: TSetupData) => Promise<void>;
}

export interface ScriptConfig<TSlots = any> {
  /**
   * AI SDK LanguageModel instance (e.g. getGeminiModel()).
   */
  model: any;

  /**
   * Provider options passed to generateText.
   */
  providerOptions?: Record<string, any>;

  /**
   * Zod schema for slot data extracted from the answer.
   */
  schema: ZodType<TSlots> | any;

  /**
   * Prompt builder given the target and the answer text.
   */
  prompt: (target: string, answer: string) => string;

  /**
   * Sticker text displayed during the intro segment.
   */
  sticker: string | ((slots: TSlots, target: string) => string);

  /**
   * Voiceover lines builder.
   */
  lines: (slots: TSlots, target: string) => ScriptLine[];

  /**
   * Caption text for social post (e.g. TikTok caption).
   */
  postCaption: (slots: TSlots) => string;

  /**
   * Hashtags for the social post.
   */
  hashtags: (slots: TSlots) => string[];

  /**
   * Additional slot data to persist in script.json (e.g. allIssues, shortName).
   */
  saveSlots?: (slots: TSlots) => Record<string, unknown>;
}

export interface StyleConfig {
  brandAss?: string; // ASS colour format &HAABBGGRR (e.g. &H00E5464F)
  captionBoxAss?: string; // ASS colour format &HAABBGGRR (default &H00111111)
  hookFont?: string; // default Arial
  hookFontSize?: number; // default 76
  captionFont?: string; // default Arial
  captionFontSize?: number; // default 70
  viewportWidth?: number; // default 540
  viewportHeight?: number; // default 960
  videoWidth?: number; // default 1080
  videoHeight?: number; // default 1920
}

export interface VoiceConfig {
  model?: string; // default 'gemini-3.8-flash-tts'
  voice?: string; // default 'Ludo'
  style?: string; // default 'Friendly and educational...'
  apiKey?: string | (() => string);
}

export interface DemoVideoConfig<TSlots = any, TSetupData = any> {
  app?: AppConfig;
  auth?: AuthConfig;
  recorder: RecorderConfig<TSetupData>;
  script: ScriptConfig<TSlots>;
  style?: StyleConfig;
  voice?: VoiceConfig;
}
