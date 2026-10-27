import { BrowserContext, Page } from '@playwright/test';
import { ZodType } from 'zod';

type Segment = 'intro' | 'working' | 'answer' | 'outro';
interface ScriptLine {
    id: string;
    segment: Segment;
    text: string;
}
interface Script {
    site: string;
    onScreen: string;
    lines: ScriptLine[];
    postCaption: string;
    hashtags: string[];
    [key: string]: unknown;
}
interface TimelineEvent {
    t: number;
    type: string;
    detail?: string | number;
}
interface Timeline {
    site: string;
    slug?: string;
    start?: string;
    viewport: {
        width: number;
        height: number;
    };
    videoSize: {
        width: number;
        height: number;
    };
    duration: number;
    failure?: string;
    events: TimelineEvent[];
    [key: string]: unknown;
}
interface AppConfig {
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
interface AuthConfig {
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
interface RecorderConfig<TSetupData = any> {
    /**
     * Runs off-camera before recording starts.
     * Returns the URL to navigate to on camera, and optional data to pass to cleanup.
     */
    setup: (context: BrowserContext, target: string) => Promise<{
        url: string;
        data?: TSetupData;
    }>;
    /**
     * Drives the app on camera.
     * Must call mark('sent') when work begins and mark('answer_done') when work finishes.
     * Returns the audit/answer text (saved to answer.txt).
     */
    run: (page: Page, mark: (type: string, detail?: string | number) => void) => Promise<string>;
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
interface ScriptConfig<TSlots = any> {
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
interface StyleConfig {
    brandAss?: string;
    captionBoxAss?: string;
    hookFont?: string;
    hookFontSize?: number;
    captionFont?: string;
    captionFontSize?: number;
    viewportWidth?: number;
    viewportHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
}
interface ResolvedStyleConfig {
    brandAss?: string;
    captionBoxAss: string;
    hookFont: string;
    hookFontSize: number;
    captionFont: string;
    captionFontSize: number;
    viewportWidth: number;
    viewportHeight: number;
    videoWidth: number;
    videoHeight: number;
}
interface VoiceConfig {
    model?: string;
    voice?: string;
    style?: string;
    apiKey?: string | (() => string);
}
interface DemoVideoConfig<TSlots = any, TSetupData = any> {
    app?: AppConfig;
    auth?: AuthConfig;
    recorder: RecorderConfig<TSetupData>;
    script: ScriptConfig<TSlots>;
    style?: StyleConfig;
    voice?: VoiceConfig;
}

interface HeardWord {
    word: string;
    start: number;
    end: number;
}
interface Voiced extends ScriptLine {
    seconds: number;
    file: string;
    words: HeardWord[] | null;
}
interface Placed extends Voiced {
    start: number;
}
interface TimedWord {
    text: string;
    start: number;
    end: number;
}
/**
 * Letters and digits only, small numbers as words, casual contractions expanded.
 * Lesson #3: Letters only, small numbers as words, "gonna" as "going to".
 */
declare const normalise: (text: string) => string;
/**
 * Levenshtein-based similarity metric (0 to 1).
 */
declare const similarity: (a: string, b: string) => number;
declare const clamp: (value: number, min: number, max: number) => number;
declare const round: (t: number) => number;
/**
 * Places a segment's lines one after another from `from`; returns them and when the last one ends.
 */
declare const placeSegment: (lines: Voiced[], from: number) => {
    placed: Placed[];
    end: number;
};
/**
 * Aligns script words with Whisper heard words (or letter-count distribution if no transcript).
 */
declare const timeWords: (line: Placed) => TimedWord[];
/**
 * Groups a line's words into short chunks (max 3 words, ~16 letters, or punctuation break).
 */
declare const chunkWords: (words: TimedWord[]) => TimedWord[][];
interface TimelineLayoutInput {
    sent: number;
    answerDone: number;
    end: number;
    voiced: Voiced[];
}
interface TimelineLayoutResult {
    total: number;
    introOut: number;
    introHold: number;
    workOut: number;
    workSpeed: number;
    answerStart: number;
    answerOut: number;
    answerSpeed: number;
    answerHold: number;
    placed: Placed[];
}
/**
 * Computes timeline layout and speed-fit parameters for produce.
 */
declare const layoutTimeline: (input: TimelineLayoutInput) => TimelineLayoutResult;
/**
 * Remaps an event time for video speed-up in demo:edit.
 */
declare const remapEventTime: (t: number, start: number, end: number, speed: number) => number;

/**
 * Checks if a color is white or near-white (channels close to 255).
 * Near-white colors cause caption highlights to be unreadable white-on-white.
 */
declare function isNearWhite(color?: string): boolean;
/**
 * Builds an Advanced SubStation Alpha (.ass) subtitle file.
 * libass draws BorderStyle 3 as a box behind each run of text.
 * - When style.brandAss is set: recolours the box behind the spoken word (\3c<brandAss>&).
 * - When style.brandAss is not set (default): inverts the spoken word with a white box
 *   and dark text (\3c&HFFFFFF&\1c&H111111&), then restores both (\3c<captionBox>&\1c&HFFFFFF&).
 */
declare const buildAss: (lines: Placed[], hookText: string, introEnd: number, style: ResolvedStyleConfig | StyleConfig) => string;

declare function defineConfig<TSlots = any, TSetupData = any>(config: DemoVideoConfig<TSlots, TSetupData>): DemoVideoConfig<TSlots, TSetupData>;
interface ResolvedConfig extends DemoVideoConfig {
    app: Required<NonNullable<DemoVideoConfig['app']>>;
    auth?: NonNullable<DemoVideoConfig['auth']>;
    style: ResolvedStyleConfig;
    voice: Required<NonNullable<DemoVideoConfig['voice']>>;
}
/**
 * Resolves GEMINI_API_KEY with lesson #6: .env must win over the shell.
 */
declare function resolveGeminiApiKey(cwd?: string): string;
declare function loadConfig(cwd?: string): ResolvedConfig;

declare function runDoctor(config: ResolvedConfig, cwd?: string): Promise<boolean>;

declare function runEdit(config: ResolvedConfig, folderArg?: string, speed?: number): string;

declare function runLogin(config: ResolvedConfig): Promise<void>;

declare const transcribe: (files: string[], pythonScript?: string) => Map<string, {
    text: string;
    words: HeardWord[];
}> | null;
declare function runProduce(config: ResolvedConfig, folderArg?: string): Promise<string>;

interface RecordOptions {
    keep?: boolean;
    headed?: boolean;
}
declare function runRecord(config: ResolvedConfig, rawTarget: string, options?: RecordOptions): Promise<string>;

declare const findNewestRecording: (outDir: string, requiredFile?: string) => string;

declare function runScript(config: ResolvedConfig, folderArg?: string): Promise<string>;

/**
 * Builds the director's notes prompt for Gemini TTS.
 * Lesson #2: A style prefix in front of the line was read aloud, and the TTS model rejects
 * system instructions. Keep the "director's notes, then transcript" prompt.
 */
declare const ttsPrompt: (text: string, style: string) => string;
/**
 * Lesson #1: The TTS API returns a complete WAV file. Reading it as raw PCM put static at every join.
 * Extract PCM extracts the pure 16-bit mono audio, discarding RIFF headers and extra chunks like LIST.
 * If raw PCM without a RIFF header is received, it returns the buffer as is.
 */
declare const extractPcm: (audio: Buffer, fallbackSampleRate?: number) => {
    pcm: Buffer;
    sampleRate: number;
};
declare const wavHeader: (dataLength: number, sampleRate: number) => Buffer;
interface SpeakOptions {
    model: string;
    voice: string;
    style: string;
    apiKey: string;
}
declare const speak: (text: string, outPath: string, options: SpeakOptions) => Promise<{
    seconds: number;
}>;

export { type AppConfig, type AuthConfig, type DemoVideoConfig, type HeardWord, type Placed, type RecorderConfig, type ResolvedConfig, type ResolvedStyleConfig, type Script, type ScriptConfig, type ScriptLine, type Segment, type StyleConfig, type TimedWord, type Timeline, type TimelineEvent, type TimelineLayoutInput, type TimelineLayoutResult, type VoiceConfig, type Voiced, buildAss, chunkWords, clamp, defineConfig, extractPcm, findNewestRecording, isNearWhite, layoutTimeline, loadConfig, normalise, placeSegment, remapEventTime, resolveGeminiApiKey, round, runDoctor, runEdit, runLogin, runProduce, runRecord, runScript, similarity, speak, timeWords, transcribe, ttsPrompt, wavHeader };
