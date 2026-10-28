import { existsSync, readFileSync } from 'fs';
import createJiti from 'jiti';
import { join, resolve } from 'path';
import type { DemoVideoConfig, ResolvedStyleConfig } from './types';

export function defineConfig<TSlots = any, TSetupData = any>(
  config: DemoVideoConfig<TSlots, TSetupData>
): DemoVideoConfig<TSlots, TSetupData> {
  return config;
}

export interface ResolvedConfig extends DemoVideoConfig {
  app: Required<NonNullable<DemoVideoConfig['app']>>;
  auth?: NonNullable<DemoVideoConfig['auth']>;
  style: ResolvedStyleConfig;
  voice: Required<NonNullable<DemoVideoConfig['voice']>>;
}

/**
 * Resolves GEMINI_API_KEY with lesson #6: .env must win over the shell.
 */
export function resolveGeminiApiKey(cwd: string = process.cwd()): string {
  const envPath = join(cwd, '.env');
  let envFileKey: string | undefined;
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
    const line = lines.find((l) => l.startsWith('GEMINI_API_KEY='));
    if (line) {
      envFileKey = line
        .slice('GEMINI_API_KEY='.length)
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }

  const key = envFileKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set in .env or the environment.');
  }
  return key;
}

export function loadConfig(cwd: string = process.cwd()): ResolvedConfig {
  const possibleNames = [
    'demo-video.config.ts',
    'demo-video.config.js',
    'demo-video.config.mjs',
    'demo-video.config.cjs',
  ];

  let configPath: string | null = null;
  for (const name of possibleNames) {
    const full = resolve(cwd, name);
    if (existsSync(full)) {
      configPath = full;
      break;
    }
  }

  if (!configPath) {
    throw new Error(
      `Could not find demo-video.config.ts (or .js) in ${cwd}. Please create one.`
    );
  }

  let rawExport: any;
  if (configPath.endsWith('.ts')) {
    try {
      require('sucrase/register/ts');
      rawExport = require(configPath);
    } catch {
      const jiti = createJiti(cwd, { interopDefault: true });
      rawExport = jiti(configPath);
    }
  } else {
    try {
      rawExport = require(configPath);
    } catch {
      const jiti = createJiti(cwd, { interopDefault: true });
      rawExport = jiti(configPath);
    }
  }
  const userConfig: DemoVideoConfig = rawExport?.default || rawExport;

  if (!userConfig || !userConfig.recorder || !userConfig.script) {
    throw new Error(
      `Invalid config in ${configPath}. Both "recorder" and "script" adapters must be defined.`
    );
  }

  const outDir = userConfig.app?.outDir || join('.demo-video', 'out');
  const authDir = userConfig.app?.authDir || join('.demo-video', '.auth');

  const resolved: ResolvedConfig = {
    ...userConfig,
    app: {
      baseUrl:
        process.env.DEMO_BASE_URL ||
        userConfig.app?.baseUrl ||
        'http://localhost:3000',
      outDir: resolve(cwd, outDir),
      authDir: resolve(cwd, authDir),
      hideDevCss: userConfig.app?.hideDevCss || '',
      siteShot: userConfig.app?.siteShot ?? 0,
    },
    auth: userConfig.auth
      ? {
          loginPath: userConfig.auth.loginPath || '/login',
          isSignedIn: userConfig.auth.isSignedIn,
          refresh: userConfig.auth.refresh,
        }
      : undefined,
    style: {
      brandAss: userConfig.style?.brandAss || undefined,
      captionBoxAss: userConfig.style?.captionBoxAss || '&H00111111',
      hookBoxAss: userConfig.style?.hookBoxAss || '&H00FFFFFF',
      hookFont: userConfig.style?.hookFont || 'Arial',
      hookFontSize: userConfig.style?.hookFontSize || 76,
      captionFont: userConfig.style?.captionFont || 'Arial',
      captionFontSize: userConfig.style?.captionFontSize || 70,
      viewportWidth: userConfig.style?.viewportWidth || 540,
      viewportHeight: userConfig.style?.viewportHeight || 960,
      videoWidth: userConfig.style?.videoWidth || 1080,
      videoHeight: userConfig.style?.videoHeight || 1920,
    },
    voice: {
      model: userConfig.voice?.model || 'gemini-3.8-flash-tts',
      voice: userConfig.voice?.voice || 'Puck', // Neutral voice
      style:
        userConfig.voice?.style ||
        'Clear, articulate, and engaging, speaking at a natural, brisk pace.',
      apiKey:
        userConfig.voice?.apiKey ||
        (() => resolveGeminiApiKey(cwd)),
    },
  };

  return resolved;
}
