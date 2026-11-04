// Measures the game in a real browser: builds the app, serves it, opens it with ?bench (40 balls,
// 150 enemies) and prints the numbers the game publishes in window.__benchResult.
//
//   pnpm bench:browser                    headed Edge (real GPU path)
//   pnpm bench:browser -- --real          the real peak load (24 balls, 30 enemies) instead of the stress scene
//   pnpm bench:browser -- --headless      headless
//   pnpm bench:browser -- --out result.json
//
// Env: BROWSER_PATH overrides the browser executable.
import { existsSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const headless = args.includes('--headless');
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
// Extra query flags for the game, e.g. --query norender to measure without drawing.
const queryIndex = args.indexOf('--query');
const extraQuery = queryIndex >= 0 ? `&${args[queryIndex + 1]}` : '';

const candidates = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) throw new Error('No browser found. Set BROWSER_PATH.');

await build({ logLevel: 'warn' });
// Cross-origin isolation lifts the browser's timer coarsening (0.1 ms -> a few microseconds),
// which matters because one domain tick costs well under 0.1 ms.
const server = await preview({
  preview: {
    port: 4173,
    strictPort: true,
    host: '127.0.0.1',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
const benchParam = args.includes('--real') ? 'bench=real' : 'bench';
const url = `http://127.0.0.1:4173/?${benchParam}${extraQuery}`;

const browser = await chromium.launch({
  executablePath,
  headless,
  args: [
    '--enable-precise-memory-info',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--window-size=900,860',
  ],
});

try {
  const page = await browser.newPage({ viewport: { width: 800, height: 760 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('[console.error]', m.text());
  });
  await page.goto(url);
  await page.bringToFront();
  await page.waitForFunction(() => window.__benchResult !== undefined, null, {
    timeout: 120_000,
    polling: 500,
  });
  const result = await page.evaluate(() => window.__benchResult);
  const isolated = await page.evaluate(() => window.crossOriginIsolated);
  const report = { browser: browser.version(), headless, query: extraQuery, isolated, ...result };
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (outFile) writeFileSync(outFile, `${json}\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
