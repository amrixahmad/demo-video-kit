import { chromium } from '@playwright/test';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ResolvedConfig } from './config';

export interface DoctorCheckResult {
  name: string;
  passed: boolean;
  warning?: boolean;
  message: string;
  help?: string;
}

export async function runDoctor(config: ResolvedConfig, cwd: string = process.cwd()): Promise<boolean> {
  const results: DoctorCheckResult[] = [];
  console.log('Running demo-video doctor checks...\n');

  // 1. ffmpeg check
  try {
    const ff = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
    if (ff.status === 0) {
      const hasLibass = ff.stdout.includes('--enable-libass');
      if (hasLibass) {
        results.push({ name: 'ffmpeg', passed: true, message: 'ffmpeg is installed with libass support.' });
      } else {
        results.push({
          name: 'ffmpeg',
          passed: true,
          warning: true,
          message: 'ffmpeg is installed, but --enable-libass was not detected in build configuration.',
          help: 'Install an ffmpeg build that includes libass (e.g. from https://www.gyan.dev/ffmpeg/builds/).',
        });
      }
    } else {
      results.push({
        name: 'ffmpeg',
        passed: false,
        message: 'ffmpeg returned a non-zero exit code.',
        help: 'Verify your ffmpeg installation or install via "winget install Gyan.FFmpeg".',
      });
    }
  } catch (err: any) {
    results.push({
      name: 'ffmpeg',
      passed: false,
      message: `ffmpeg is not on PATH: ${err.message}`,
      help: 'Install ffmpeg and add it to your system PATH (e.g. "winget install Gyan.FFmpeg").',
    });
  }

  // 2. Python with faster-whisper
  try {
    const py = spawnSync('python', ['-c', 'import faster_whisper'], { encoding: 'utf8' });
    if (py.status === 0) {
      results.push({ name: 'faster-whisper', passed: true, message: 'Python with faster-whisper is available.' });
    } else {
      results.push({
        name: 'faster-whisper',
        passed: false,
        message: 'Python cannot import faster_whisper.',
        help: 'Run "pip install faster-whisper" in your Python environment.',
      });
    }
  } catch (err: any) {
    results.push({
      name: 'faster-whisper',
      passed: false,
      message: `Python is not available: ${err.message}`,
      help: 'Install Python 3.10+ and run "pip install faster-whisper".',
    });
  }

  // 3. Playwright browser
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    results.push({ name: 'Playwright Chromium', passed: true, message: 'Chromium browser launched successfully.' });
  } catch (err: any) {
    results.push({
      name: 'Playwright Chromium',
      passed: false,
      message: `Failed to launch Playwright browser: ${err.message}`,
      help: 'Run "npx playwright install chromium" to install browser binaries.',
    });
  }

  // 4. Gemini API Key & environment check
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
  const shellKey = process.env.GEMINI_API_KEY;

  if (envFileKey && shellKey && envFileKey !== shellKey) {
    console.warn(
      '  [WARNING] Shell GEMINI_API_KEY differs from .env. The kit will use the key from .env (Lesson #6).'
    );
  }

  const effectiveKey = envFileKey || shellKey;
  if (!effectiveKey) {
    results.push({
      name: 'Gemini API Key',
      passed: false,
      message: 'GEMINI_API_KEY is not set in .env or the environment.',
      help: 'Add GEMINI_API_KEY=... to your .env file.',
    });
  } else {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${effectiveKey}`
      );
      if (res.ok) {
        results.push({ name: 'Gemini API Key', passed: true, message: 'Gemini API key is valid and responsive.' });
      } else {
        const body = (await res.json().catch(() => ({}))) as any;
        results.push({
          name: 'Gemini API Key',
          passed: false,
          message: `Gemini API key test failed with status ${res.status}: ${JSON.stringify(body?.error?.message || body)}`,
          help: 'Check that your GEMINI_API_KEY is valid and has Gemini API enabled in Google Cloud Console.',
        });
      }
    } catch (err: any) {
      results.push({
        name: 'Gemini API Key',
        passed: false,
        message: `Network error contacting Gemini API: ${err.message}`,
        help: 'Ensure network connection to generativelanguage.googleapis.com is allowed.',
      });
    }
  }

  // 5. App answering at baseUrl
  try {
    const res = await fetch(config.app.baseUrl, { redirect: 'manual' });
    if (res.status < 500) {
      results.push({
        name: 'App at baseUrl',
        passed: true,
        message: `App is reachable at ${config.app.baseUrl} (HTTP ${res.status}).`,
      });
    } else {
      results.push({
        name: 'App at baseUrl',
        passed: false,
        message: `App at ${config.app.baseUrl} returned HTTP ${res.status}.`,
        help: 'Check server logs for errors.',
      });
    }
  } catch (err: any) {
    results.push({
      name: 'App at baseUrl',
      passed: false,
      message: `App is not reachable at ${config.app.baseUrl}: ${err.message}`,
      help: `Start the local app (e.g. "npm run dev") before running recordings.`,
    });
  }

  // 6. Saved session if auth is configured
  if (config.auth) {
    const authFile = join(config.app.authDir, 'state.json');
    if (existsSync(authFile)) {
      results.push({
        name: 'Auth Session',
        passed: true,
        message: `Saved session found at ${authFile}.`,
      });
    } else {
      results.push({
        name: 'Auth Session',
        passed: false,
        message: `No saved session found at ${authFile}.`,
        help: 'Run "demo-video login" to authenticate and save the session.',
      });
    }
  }

  // Print summary
  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? (r.warning ? 'WARN' : 'PASS') : 'FAIL';
    const symbol = r.passed ? (r.warning ? '!' : '✓') : '✗';
    console.log(`[${status}] ${symbol} ${r.name}: ${r.message}`);
    if (r.help) {
      console.log(`       Fix: ${r.help}`);
    }
    if (!r.passed) {
      allPassed = false;
    }
  }

  console.log(`\nDoctor check ${allPassed ? 'PASSED' : 'FAILED'}.\n`);
  return allPassed;
}
