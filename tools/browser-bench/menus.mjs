// Captures the title screen and the menus of the 4G-I in a real Edge (desktop and phone landscape)
// and clicks through them: Jugar -> starters, Colección, Gacha, Ajustes, Créditos and back.
//   node tools/browser-bench/menus.mjs --out <dir>
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const argOf = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = argOf('--out', 'menus-4gi');
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
const server = await preview({ preview: { port: 4187, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless: false });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};
try {
  for (const [tag, viewport, touch] of [
    ['escritorio', { width: 540, height: 820 }, false],
    ['movil', { width: 844, height: 390 }, true],
  ]) {
    const context = await browser.newContext({
      viewport,
      ...(touch ? { deviceScaleFactor: 2, hasTouch: true, isMobile: true } : {}),
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:4187/?debug&seed=6`);
    await page.waitForSelector('[data-screen="start"] [data-action="play"]', { timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(outDir, `inicio-${tag}.png`) });
    const labels = await page.$$eval('[data-screen="start"] button', (bs) =>
      bs.map((b) => b.textContent?.trim()),
    );
    check(`${tag}: the menu has the five entries`, labels.length === 5, labels.join(' | '));
    for (const id of ['collection', 'gacha', 'settings', 'credits']) {
      await page.click(`[data-screen="start"] [data-action="${id}"]`);
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(outDir, `${id}-${tag}.png`) });
      await page.keyboard.press('KeyM');
      await page.waitForTimeout(300);
      const back = await page.isVisible('[data-screen="start"] [data-action="play"]');
      check(`${tag}: ${id} opens and M goes back to the title`, back);
    }
    await page.click('[data-screen="start"] [data-action="play"]');
    await page.waitForSelector('[data-screen="starters"] [data-starter]', { timeout: 5000 });
    await page.screenshot({ path: join(outDir, `iniciales-${tag}.png`) });
    await page.click('[data-screen="starters"] [data-starter]');
    await page.waitForTimeout(800);
    const s = await page.evaluate(() => window.__debug());
    check(`${tag}: Jugar -> pick a starter -> the run starts`, s.screen === 'playing', s.screen);
    check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(failures.length === 0 ? '\nALL PASS' : `\n${failures.length} FAILED`);
process.exitCode = failures.length === 0 ? 0 : 1;
