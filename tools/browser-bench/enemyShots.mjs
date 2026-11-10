// Waits for an ordinary enemy to charge a shot and takes a frame every 0.35 s while it is warned,
// to check that the shot comes out of the enemy (it glows) and reads like every other attack.
//   node tools/browser-bench/enemyShots.mjs --out <dir> [--query "<game query>"]
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const argOf = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = argOf('--out', 'enemy-shots');
const query = argOf('--query', 'starter=pikachu&wave=4&ballLevel=2&hp=99&seed=9');
mkdirSync(outDir, { recursive: true });
const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
await build({ logLevel: 'error' });
const server = await preview({ preview: { port: 4182, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 820 } });
  await page.goto(`http://127.0.0.1:4182/?debug&${query}`);
  await page.waitForFunction(() => typeof window.__debug === 'function');
  await page.waitForFunction(() => window.__debug().hazards > 0, undefined, { timeout: 120000 });
  for (let i = 0; i < 8; i++) {
    await page.screenshot({ path: join(outDir, `shot-${i}.png`) });
    await page.waitForTimeout(350);
  }
  console.log(`frames in ${outDir}`);
} finally {
  await browser.close();
  server.httpServer.close();
}
