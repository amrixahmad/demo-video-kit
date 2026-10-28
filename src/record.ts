import { chromium, type Browser } from '@playwright/test';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ResolvedConfig } from './config';
import type { TimelineEvent } from './types';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const normaliseDomain = (raw: string): string =>
  raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^\/+|\/+$/g, '');

const timestamp = () =>
  new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

const DEFAULT_HIDE_DEV_CSS = `
  nextjs-portal, button[aria-label*="React Query"], .tsqd-open-btn-container { display: none !important; }
`;

/**
 * A plain desktop Chrome user agent. Some government sites answer Playwright's default
 * headless UA with a WAF block page, so the shot (and its status) would be worthless.
 */
const desktopUserAgent = (version: string): string => {
  const platform =
    process.platform === 'win32'
      ? 'Windows NT 10.0; Win64; x64'
      : process.platform === 'darwin'
        ? 'Macintosh; Intel Mac OS X 10_15_7'
        : 'X11; Linux x86_64';
  const major = version.split('.')[0] || '140';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
};

/**
 * Grabs a still of the target site itself for the cold open (config.app.siteShot).
 * Runs off-camera in its own unauthenticated context; a failure only costs the still.
 */
const captureSiteShot = async (
  browser: Browser,
  domain: string,
  outDir: string,
  shotSize: { width: number; height: number }
): Promise<void> => {
  const shotPath = join(outDir, 'site.png');
  for (const url of [`https://${domain}`, `http://${domain}`]) {
    // Laying the site out at the video's own pixel size keeps a desktop page complete
    // instead of clipping a fixed-width layout to the app's narrow viewport.
    const context = await browser.newContext({
      viewport: shotSize,
      deviceScaleFactor: 1,
      colorScheme: 'light',
      locale: 'en-MY',
      userAgent: desktopUserAgent(browser.version()),
    });
    // Sites that block automation usually check navigator.webdriver first.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    try {
      const page = await context.newPage();
      const response = await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
      if (!response || response.status() >= 400) {
        throw new Error(`HTTP ${response ? response.status() : 'no response'}`);
      }
      await sleep(1500);
      await page.screenshot({ path: shotPath, animations: 'disabled' });
      console.log(`  captured the site shot from ${url}`);
      return;
    } catch (err: any) {
      console.warn(`  could not capture the site shot from ${url}: ${err.message}`);
    } finally {
      await context.close().catch(() => {});
    }
  }
  console.warn('  no site shot captured; the video will start on the app.');
};

export interface RecordOptions {
  keep?: boolean;
  headed?: boolean;
}

export async function runRecord(
  config: ResolvedConfig,
  rawTarget: string,
  options: RecordOptions = {}
): Promise<string> {
  if (!rawTarget) {
    throw new Error('Usage: demo-video record <target> [--keep] [--headed]');
  }

  const authFile = join(config.app.authDir, 'state.json');
  if (config.auth && !existsSync(authFile)) {
    throw new Error(`No saved session found in ${authFile}. Run "demo-video login" first.`);
  }

  // Ensure app is answering
  try {
    const res = await fetch(config.app.baseUrl, { redirect: 'manual' });
    if (res.status >= 500) throw new Error(`Status ${res.status}`);
  } catch (err: any) {
    throw new Error(
      `The app is not reachable at ${config.app.baseUrl}. Start it first. (${err.message})`
    );
  }

  const domainName = normaliseDomain(rawTarget);
  const slug = domainName.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-');
  const outDir = join(config.app.outDir, `${slug}-${timestamp()}`);
  mkdirSync(outDir, { recursive: true });

  const viewport = {
    width: config.style.viewportWidth,
    height: config.style.viewportHeight,
  };
  const videoSize = {
    width: config.style.videoWidth,
    height: config.style.videoHeight,
  };

  const browser = await chromium.launch({ headless: !options.headed });

  // Off-camera setup context
  const setupContext = await browser.newContext({
    baseURL: config.app.baseUrl,
    storageState: config.auth && existsSync(authFile) ? authFile : undefined,
    viewport,
    colorScheme: 'light',
  });

  if (config.auth?.refresh) {
    await config.auth.refresh(setupContext);
  }

  console.log(`Setting up target "${domainName}" off-camera...`);
  const setupResult = await config.recorder.setup(setupContext, domainName);
  const targetUrl = setupResult.url;
  const setupData = setupResult.data;

  if (config.app.siteShot > 0) {
    await captureSiteShot(browser, domainName, outDir, videoSize);
  }

  // Refresh auth again if needed right before camera starts
  if (config.auth?.refresh) {
    await config.auth.refresh(setupContext);
  }

  // Lesson #4: Playwright's recordVideo pads a size larger than viewport instead of scaling.
  // Record at the viewport size and scale with ffmpeg afterwards.
  const recordContext = await browser.newContext({
    baseURL: config.app.baseUrl,
    storageState: await setupContext.storageState(),
    viewport,
    colorScheme: 'light',
    recordVideo: { dir: outDir, size: viewport },
  });

  const hideCss = [DEFAULT_HIDE_DEV_CSS, config.app.hideDevCss || ''].join('\n');
  await recordContext.addInitScript((css) => {
    const apply = () => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    };
    if (document.head) apply();
    else document.addEventListener('DOMContentLoaded', apply);
  }, hideCss);

  const events: TimelineEvent[] = [];
  const startedAt = Date.now();
  const mark = (type: string, detail?: string | number) => {
    const t = Math.round(((Date.now() - startedAt) / 1000) * 100) / 100;
    events.push({ t, type, detail });
    console.log(
      `  ${String(t).padStart(6)}s  ${type}${detail !== undefined ? `  ${detail}` : ''}`
    );
  };

  let answer = '';
  let failure = '';
  const progress = { steps: 0, watching: false };

  const page = await recordContext.newPage();

  try {
    console.log(`Navigating to ${targetUrl}...`);
    await page.goto(targetUrl);
    mark('page_ready');
    await sleep(1500);

    // Watch tool steps while app works
    progress.watching = true;
    const watcher = (async () => {
      while (progress.watching) {
        let count = progress.steps;
        if (config.recorder.stepCount) {
          count = await config.recorder.stepCount(page).catch(() => progress.steps);
        } else {
          // Default: look for ✓ in body
          count = await page
            .evaluate(() => (document.body.innerText.match(/✓/g) || []).length)
            .catch(() => progress.steps);
        }
        if (count > progress.steps) {
          progress.steps = count;
          mark('step_done', count);
        }
        await sleep(400);
      }
    })();

    // Run app on camera
    answer = await config.recorder.run(page, mark);
    progress.watching = false;
    await watcher;

    // Scroll through result
    if (config.recorder.scroll) {
      await config.recorder.scroll(page, mark);
    } else {
      // Default scrolling behaviour
      mark('answer_scroll_start');
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')].filter((b) =>
          (b.textContent || '').includes('View result')
        );
        if (buttons.length) {
          buttons[buttons.length - 1].scrollIntoView({
            block: 'start',
            behavior: 'instant' as ScrollBehavior,
          });
        }
      }).catch(() => {});

      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      for (let i = 0; i < 30; i += 1) {
        await sleep(1000);
        const atBottom = await page.evaluate(() => {
          const scrollable = [...document.querySelectorAll<HTMLElement>('*')]
            .filter(
              (el) =>
                el.scrollHeight > el.clientHeight + 20 &&
                /(auto|scroll)/.test(getComputedStyle(el).overflowY)
            )
            .sort((a, b) => b.clientHeight - a.clientHeight)[0];
          return (
            !scrollable ||
            scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 4
          );
        }).catch(() => true);
        if (atBottom) break;
        await page.mouse.wheel(0, 240);
      }
      mark('answer_scroll_end');
      await sleep(1500);
      mark('end');
    }
  } catch (err: any) {
    failure = err.message || String(err);
    mark('failure', failure);
    console.error(`Recording error: ${failure}`);
  } finally {
    progress.watching = false;
  }

  const video = page.video();
  await recordContext.close();

  if (video) {
    const rawPath = join(outDir, 'raw.webm');
    renameSync(await video.path(), rawPath);

    // Upscale to final.mp4
    const scaled = spawnSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-i',
        rawPath,
        '-vf',
        `scale=${videoSize.width}:${videoSize.height}:flags=lanczos,unsharp=5:5:0.6`,
        '-c:v',
        'libx264',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-r',
        '30',
        join(outDir, 'final.mp4'),
      ],
      { encoding: 'utf8' }
    );
    if (scaled.status !== 0) {
      console.warn(`ffmpeg could not produce final.mp4: ${scaled.stderr || 'ffmpeg error'}`);
    }
  }

  const duration = events.length ? events[events.length - 1].t : 0;
  writeFileSync(
    join(outDir, 'timeline.json'),
    JSON.stringify(
      {
        site: domainName,
        slug,
        viewport,
        videoSize,
        duration,
        failure,
        events,
      },
      null,
      2
    )
  );

  if (answer) {
    writeFileSync(join(outDir, 'answer.txt'), answer);
  }

  // Cleanup
  if (!options.keep && config.recorder.cleanup) {
    console.log('Cleaning up target off-camera...');
    if (config.auth?.refresh) {
      await config.auth.refresh(setupContext).catch(() => {});
    }
    await config.recorder
      .cleanup(setupContext, setupData)
      .catch((err) => console.warn(`Clean-up failed: ${err.message}`));
  }

  await setupContext.close();
  await browser.close();

  console.log(`\n${failure ? 'FAILED' : 'Done'}: ${outDir}`);
  if (failure) {
    throw new Error(`Recording failed: ${failure}`);
  }

  return outDir;
}
