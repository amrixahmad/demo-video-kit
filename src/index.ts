export { buildAss } from './ass';
export { defineConfig, loadConfig, resolveGeminiApiKey, type ResolvedConfig } from './config';
export { runDoctor } from './doctor';
export { runEdit } from './edit';
export {
  chunkWords,
  clamp,
  layoutTimeline,
  normalise,
  placeSegment,
  remapEventTime,
  round,
  similarity,
  timeWords,
  type HeardWord,
  type Placed,
  type TimelineLayoutInput,
  type TimelineLayoutResult,
  type TimedWord,
  type Voiced,
} from './layout';
export { runLogin } from './login';
export { runProduce, transcribe } from './produce';
export { runRecord } from './record';
export { findNewestRecording, runScript } from './script';
export { extractPcm, speak, ttsPrompt, wavHeader } from './tts';
export type {
  AppConfig,
  AuthConfig,
  DemoVideoConfig,
  RecorderConfig,
  Script,
  ScriptConfig,
  ScriptLine,
  Segment,
  StyleConfig,
  Timeline,
  TimelineEvent,
  VoiceConfig,
} from './types';
