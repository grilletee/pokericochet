// The gacha screen of the 4G-J in a real Edge (desktop, phone in landscape, tablet): the banners, the
// pity, a x1 and a x10 with their reveal, the tables, and a ★5 reveal (forced with many draws).
//   node tools/browser-bench/gacha.mjs --out <dir>
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const argOf = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = argOf('--out', 'gacha-4gj');
const skipBuild = args.includes('--no-build');
mkdirSync(outDir, { recursive: true });
const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!executablePath) throw new Error('No browser found. Set BROWSER_PATH.');
if (!skipBuild) await build({ logLevel: 'error' });
const server = await preview({ preview: { port: 4189, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless: false });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};
try {
  for (const [tag, viewport, touch] of [
    ['escritorio', { width: 1280, height: 800 }, false],
    ['movil', { width: 844, height: 390 }, true],
    ['tablet', { width: 1180, height: 820 }, true],
  ]) {
    const context = await browser.newContext({
      viewport,
      ...(touch ? { deviceScaleFactor: 2, hasTouch: true, isMobile: true } : {}),
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const t0 = Date.now();
    await page.goto('http://127.0.0.1:4189/?debug&seed=6&coins=20000');
    await page.waitForSelector('[data-screen="start"] [data-action="gacha"]');
    // 4G-J: the roster of nine generations loads ~900 sprites before the title.
    const bootMs = Date.now() - t0;
    check(`${tag}: the title is up in under 8 s`, bootMs < 8000, `${bootMs} ms`);
    const tap = (selector) => (touch ? page.tap(selector) : page.click(selector));
    await tap('[data-screen="start"] [data-action="gacha"]');
    await page.waitForSelector('[data-banner-art]');
    const banners = await page.$$eval('[data-gacha-tab]', (bs) =>
      bs.map((b) => b.dataset.gachaTab),
    );
    check(
      `${tag}: the standard banner and three limited ones`,
      banners.length === 4,
      banners.join(','),
    );
    await page.screenshot({ path: join(outDir, `banner-estandar-${tag}.png`) });
    await tap(`[data-gacha-tab="${banners[1]}"]`);
    await page.waitForSelector(`[data-banner-art="${banners[1]}"]`);
    const hero = await page.getAttribute('[data-hero]', 'data-hero');
    check(
      `${tag}: a limited banner shows its featured ★5 big`,
      typeof hero === 'string',
      hero ?? '',
    );
    await page.screenshot({ path: join(outDir, `banner-limitado-${tag}.png`) });
    // x1
    await tap('[data-draw="1"]');
    await page.waitForSelector('[data-reveal-card]', { timeout: 5000 });
    await page.screenshot({ path: join(outDir, `revelado-x1-${tag}.png`) });
    await tap('[data-action="revealDone"]');
    // x10
    await tap('[data-draw="10"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(outDir, `revelado-esfera-${tag}.png`) });
    await page.waitForSelector('[data-reveal-card]', { timeout: 5000 });
    await page.waitForTimeout(1200);
    const cards = await page.$$eval('[data-reveal-card]', (c) => c.map((n) => n.dataset.stars));
    check(`${tag}: a x10 reveals ten`, cards.length === 10, cards.join(''));
    check(
      `${tag}: a x10 has a ★4 or better`,
      cards.some((s) => Number(s) >= 4),
    );
    await page.screenshot({ path: join(outDir, `revelado-x10-${tag}.png`) });
    await tap('[data-action="revealDone"]');
    // Up to the first ★5 (the pity guarantees it within 80).
    let five = false;
    for (let i = 0; i < 9 && !five; i++) {
      await tap('[data-draw="10"]');
      await page.waitForSelector('[data-reveal-card]', { timeout: 5000 });
      await page.waitForTimeout(1300);
      five = (await page.$$('[data-reveal-card][data-stars="5"]')).length > 0;
      if (five) await page.screenshot({ path: join(outDir, `revelado-5-${tag}.png`) });
      await tap('[data-action="revealDone"]');
    }
    check(`${tag}: a ★5 within 100 draws`, five);
    for (const panel of ['rates', 'history', 'help']) {
      await tap(`[data-panel="${panel}"]`);
      await page.waitForSelector(`[data-gacha-panel="${panel}"]`);
      await page.screenshot({ path: join(outDir, `panel-${panel}-${tag}.png`), fullPage: true });
    }
    const profile = await page.evaluate(() => window.__profile());
    check(
      `${tag}: the history keeps the draws`,
      profile.gacha.history.length === Math.min(100, profile.gacha.draws),
      `${profile.gacha.draws} draws`,
    );
    check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(failures.length === 0 ? '\nALL PASS' : `\n${failures.length} FAILED`);
process.exitCode = failures.length === 0 ? 0 : 1;
