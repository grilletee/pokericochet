// Records short videos of boss fights (intermediate and final) to review attack by attack, frame by
// frame, that each one can be understood BEFORE it strikes (4G-F, the one language of danger).
//
//   node tools/browser-bench/videos.mjs --out <dir> [--seconds 30]
// Then extract frames with the ffmpeg of Playwright (see the report) and look at them.
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const argOf = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = argOf('--out', 'videos');
const seconds = Number(argOf('--seconds', '30'));
mkdirSync(outDir, { recursive: true });
const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
await build({ logLevel: 'error' });
const server = await preview({ preview: { port: 4179, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless: true });
// name -> query. Intermediate bosses 1-3 (wave = the one after which they come) and finals.
const cases = {
  'inter1-seed9': 'starter=pikachu&wave=2&bossNo=1&ballLevel=3&seed=9',
  'inter2-seed9': 'starter=pikachu&wave=4&bossNo=2&ballLevel=4&seed=9',
  'inter3-seed12': 'starter=pikachu&wave=6&bossNo=3&ballLevel=5&seed=12',
  'final-kyogre': 'starter=pikachu&wave=7&ballLevel=6&seed=99',
  'final-zapdos': 'starter=pikachu&wave=7&ballLevel=6&seed=1',
};
const only = argOf('--only', '');
try {
  for (const [name, query] of Object.entries(cases)) {
    if (only && !name.includes(only)) continue;
    const dir = join(outDir, `_${name}`);
    const context = await browser.newContext({
      viewport: { width: 540, height: 820 },
      recordVideo: { dir, size: { width: 540, height: 820 } },
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4179/?debug&${query}`);
    await page.waitForFunction(() => typeof window.__debug === 'function');
    // Wave 7 jumps to the final boss; its entrance lasts a few seconds before the fight.
    await page.waitForTimeout(seconds * 1000);
    await context.close();
    const file = readdirSync(dir).find((f) => f.endsWith('.webm'));
    if (file) renameSync(join(dir, file), join(outDir, `${name}.webm`));
  }
  console.log(`videos in ${outDir}`);
} finally {
  await browser.close();
  server.httpServer.close();
}
