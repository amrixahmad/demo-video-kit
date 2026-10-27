import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';
import type { ResolvedConfig } from './config';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runLogin(config: ResolvedConfig): Promise<void> {
  const authFile = join(config.app.authDir, 'state.json');
  mkdirSync(config.app.authDir, { recursive: true });

  const loginPath = config.auth?.loginPath || '/login';
  console.log(`Launching browser for login at ${config.app.baseUrl}${loginPath}...`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    baseURL: config.app.baseUrl,
    viewport: { width: 1000, height: 800 },
  });
  const page = await context.newPage();
  await page.goto(loginPath);

  console.log('Sign in with your account in the browser window. Waiting up to 5 minutes...');

  const deadline = Date.now() + 5 * 60_000;
  let lastReport = 0;

  while (Date.now() < deadline) {
    let signedIn = false;
    if (config.auth?.isSignedIn) {
      signedIn = await config.auth.isSignedIn(context).catch(() => false);
    } else {
      const cookies = await context.cookies();
      signedIn = cookies.some(
        (c) =>
          c.name === '__session' ||
          (c.name.startsWith('__client_uat') && c.value !== '0')
      );
    }

    if (signedIn) {
      console.log('Sign-in detected. Waiting for cookies to settle...');
      await sleep(2500);
      await context.storageState({ path: authFile });
      console.log(`Session saved to ${authFile}`);
      await browser.close();
      return;
    }

    if (Date.now() - lastReport > 15_000) {
      lastReport = Date.now();
      const cookies = await context.cookies();
      console.log(
        `  still waiting... page is ${page.url()} (cookies: ${
          cookies.map((c) => c.name).join(', ') || 'none'
        })`
      );
    }

    await sleep(1000);
  }

  await browser.close();
  throw new Error('Timed out waiting for sign-in.');
}
