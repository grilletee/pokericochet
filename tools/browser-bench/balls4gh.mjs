// Captures the balls of the 4G-H in a real Edge: in flight (upright Pokémon, trail of its type),
// waiting on the floor and captured (the same sphere and size as in flight), and the team bar.
//   node tools/browser-bench/balls4gh.mjs --out <dir> [--query "<game query>"]
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const argOf = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = argOf('--out', 'balls-4gh');
const query = argOf(
  '--query',
  'seed=11&starter=charmander&wave=3&hp=99&team=charizard,blastoise,venusaur,pikachu,gengar,machamp',
);
mkdirSync(outDir, { recursive: true });
const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!executablePath) throw new Error('No browser found. Set BROWSER_PATH.');
await build({ logLevel: 'error' });
const server = await preview({ preview: { port: 4184, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:4184/?debug&${query}`);
  await page.waitForFunction(() => typeof window.__debug === 'function');
  let floor = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(250);
    // Aim across the field so the balls fly at an angle.
    await page.mouse.move(80 + ((i * 53) % 380), 200 + ((i * 31) % 200));
    const s = await page.evaluate(() => window.__debug());
    if (i === 12) await page.screenshot({ path: join(outDir, 'vuelo.png') });
    if (!floor && s.pickups > 0) {
      await page.screenshot({ path: join(outDir, 'suelo.png') });
      floor = true;
    }
    if (floor && i > 14) break;
  }
  console.log(`floor captured: ${floor}, errors: ${errors.length}`);
  if (errors.length > 0) console.error(errors.slice(0, 3).join('\n'));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
