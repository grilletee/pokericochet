// The whole flow of Phase 5 v1 (4G-I) in a real Edge, desktop and phone in landscape, with a fresh
// profile: first time -> the professor offers the four classics -> run -> coins at the end -> gacha
// -> collection -> a new run with another starter (the one the gacha gave).
//   node tools/browser-bench/flow.mjs --out <dir>
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const argOf = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = argOf('--out', 'flow-4gi');
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
const server = await preview({ preview: { port: 4188, strictPort: true, host: '127.0.0.1' } });
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
    // A fresh profile, with coins for two draws (?debug&coins).
    await page.goto('http://127.0.0.1:4188/?debug&seed=6&coins=200');
    await page.waitForSelector('[data-screen="start"] [data-action="play"]');
    const tap = (selector) => (touch ? page.tap(selector) : page.click(selector));
    // 1. First time: the professor and the four classics.
    await tap('[data-screen="start"] [data-action="play"]');
    await page.waitForSelector('[data-professor]');
    const offered = await page.$$eval('[data-screen="starters"] [data-starter]', (bs) =>
      bs.map((b) => b.dataset.starter),
    );
    check(
      `${tag}: first time, the professor offers the four classics`,
      offered.length === 4,
      offered.join(','),
    );
    await page.screenshot({ path: join(outDir, `1-primera-vez-${tag}.png`) });
    await tap('[data-screen="starters"] [data-starter="squirtle"]');
    await page.waitForFunction(() => window.__debug().screen === 'playing');
    check(
      `${tag}: the run starts with the chosen classic`,
      (await page.evaluate(() => window.__debug().starter)) === 'squirtle',
    );
    // 2. The run ends: the coins of the run.
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__lose());
    await page.waitForSelector('[data-screen="results"] [data-reward]', { timeout: 15000 });
    const reward = await page.textContent('[data-reward]');
    check(`${tag}: the results say the coins earned`, /monedas/.test(reward ?? ''), reward ?? '');
    await page.screenshot({ path: join(outDir, `2-monedas-${tag}.png`) });
    const owned1 = await page.evaluate(() => Object.keys(window.__profile().owned));
    check(
      `${tag}: the classic is in the collection`,
      owned1.length === 1 && owned1[0] === 'squirtle',
      owned1.join(','),
    );
    // 3. The gacha: two draws.
    await page.keyboard.press('KeyM');
    await page.waitForSelector('[data-screen="start"] [data-action="gacha"]');
    await tap('[data-screen="start"] [data-action="gacha"]');
    await page.waitForSelector('[data-screen="gacha"] [data-action="draw"]');
    for (let i = 0; i < 2; i++) {
      await tap('[data-screen="gacha"] [data-action="draw"]');
      await page.waitForSelector('[data-reveal]');
    }
    await page.screenshot({ path: join(outDir, `3-gacha-${tag}.png`) });
    const owned2 = await page.evaluate(() => Object.keys(window.__profile().owned));
    check(`${tag}: the gacha adds to the collection`, owned2.length >= 2, owned2.join(','));
    // 4. The collection.
    await page.keyboard.press('KeyM');
    await tap('[data-screen="start"] [data-action="collection"]');
    await page.waitForSelector('[data-dex-counts]');
    const counts = await page.getAttribute('[data-dex-counts]', 'data-dex-counts');
    const ownedTiles = await page.$$eval('[data-dex-state="owned"]', (t) => t.length);
    check(
      `${tag}: the Pokédex shows what you have`,
      ownedTiles === owned2.length,
      `${counts}, ${ownedTiles} owned`,
    );
    await tap('[data-dex-state="owned"]');
    await page.waitForSelector('[data-dex-card]');
    await page.screenshot({ path: join(outDir, `4-coleccion-${tag}.png`) });
    // 5. A new run with another starter: only the collection is offered now.
    await page.keyboard.press('KeyM');
    await tap('[data-screen="start"] [data-action="play"]');
    await page.waitForSelector('[data-screen="starters"] [data-starter]');
    const choices = await page.$$eval('[data-screen="starters"] [data-starter]', (bs) =>
      bs.map((b) => b.dataset.starter),
    );
    check(
      `${tag}: after the first time, only the collection is offered`,
      choices.length === owned2.length && choices.every((c) => owned2.includes(c)),
      choices.join(','),
    );
    const other = choices.find((c) => c !== 'squirtle');
    await tap(`[data-screen="starters"] [data-starter="${other}"]`);
    await page.waitForFunction(() => window.__debug().screen === 'playing');
    const s = await page.evaluate(() => window.__debug());
    check(`${tag}: a new run with another starter (${other})`, s.starter === other, s.starter);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(outDir, `5-otra-run-${tag}.png`) });
    check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(failures.length === 0 ? '\nALL PASS' : `\n${failures.length} FAILED`);
process.exitCode = failures.length === 0 ? 0 : 1;
