// Four frames of the Ultimate of each initial (launch, spread, peak, fade) to review the animation.
//   node tools/browser-bench/ultimates.mjs --out <dir>
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'ultimates';
mkdirSync(outDir, { recursive: true });
const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
await build({ logLevel: 'error' });
const server = await preview({ preview: { port: 4180, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless: true });
try {
  for (const starter of ['charmander', 'squirtle', 'bulbasaur', 'pikachu']) {
    const page = await browser.newPage({ viewport: { width: 540, height: 820 } });
    await page.goto(
      `http://127.0.0.1:4180/?debug&starter=${starter}&ballLevel=3&charge=30&wave=3&seed=9`,
    );
    await page.waitForFunction(() => typeof window.__debug === 'function');
    // Let the enemies come down into the middle of the field before throwing it.
    await page.waitForTimeout(9000);
    await page.keyboard.press('1');
    let at = 0;
    for (const t of [60, 220, 400, 700]) {
      await page.waitForTimeout(t - at);
      at = t;
      await page.screenshot({ path: join(outDir, `${starter}-${t}.png`) });
    }
    await page.close();
  }
  console.log(`ultimates in ${outDir}`);
} finally {
  await browser.close();
  server.httpServer.close();
}
