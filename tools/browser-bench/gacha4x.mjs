// 4X, block 3: the banner screen in a real Edge (desktop, phone held sideways, tablet). Every tab
// (standard, pseudo-legendary, starter, "con estilo", legendary): its splash, its live countdown and
// its rate-up line; a x10 and a key, with their reveal. Fails on any page error; screenshots with --out.
//
//   node tools/browser-bench/gacha4x.mjs [--out folder] [--headless] [--no-build]
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const headless = args.includes('--headless');
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? args[outIndex + 1] : null;
if (outDir) mkdirSync(outDir, { recursive: true });
const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!executablePath) throw new Error('No browser found. Set BROWSER_PATH.');
if (!args.includes('--no-build')) await build({ logLevel: 'error' });
const server = await preview({ preview: { port: 4189, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};
const shot = async (page, name) => {
  if (outDir) await page.screenshot({ path: join(outDir, name) });
};
const DEVICES = [
  ['escritorio', { viewport: { width: 1280, height: 800 } }],
  [
    'movil-a',
    {
      viewport: { width: 844, height: 390 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    },
  ],
  ['tablet', { viewport: { width: 1024, height: 768 }, hasTouch: true }],
];
try {
  for (const [tag, options] of DEVICES) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const touch = options.hasTouch === true;
    const tap = (selector) => (touch ? page.tap(selector) : page.click(selector));
    await page.goto('http://127.0.0.1:4189/?debug&seed=4&coins=20000&keys=2');
    await page.waitForSelector('[data-screen="start"] [data-action="gacha"]');
    await tap('[data-screen="start"] [data-action="gacha"]');
    await page.waitForSelector('[data-splash]');
    const tabs = await page.$$eval('[data-gacha-tab]', (bs) => bs.map((b) => b.dataset.gachaTab));
    const kinds = tabs.map((k) => k.split('@')[0]);
    check(
      `${tag}: five banners (standard, pseudo, starter, con estilo, legendary)`,
      kinds.join() === 'standard,pseudo,starter,showcase,legend',
      kinds.join(),
    );
    for (const key of tabs) {
      await tap(`[data-gacha-tab="${key}"]`);
      await page.waitForSelector(`[data-banner-art="${key}"]`);
      await page.waitForTimeout(1100);
      const kind = key.split('@')[0];
      await shot(page, `${tag}-banner-${kind}.png`);
      const info = await page.evaluate(() => {
        const art = document.querySelector('[data-splash]');
        const r = art?.getBoundingClientRect();
        return {
          heroes: art?.querySelectorAll('[data-hero]').length ?? 0,
          name: art?.querySelector('[data-splash-name]')?.textContent ?? '',
          rate: art?.querySelector('[data-splash-rate]')?.textContent ?? '',
          clock: art?.querySelector('[data-countdown]')?.textContent ?? '',
          height: r?.height ?? 0,
          width: r?.width ?? 0,
        };
      });
      check(
        `${tag} ${kind}: a splash with its heroes, its name and its promise`,
        info.heroes >= 1 && info.name !== '' && info.rate !== '' && info.height > 150,
        `${info.heroes} heroes, "${info.name}", ${Math.round(info.height)} px`,
      );
      if (kind !== 'standard') {
        // The countdown is live: it changes within two seconds.
        const before = info.clock;
        await page.waitForTimeout(1600);
        const after = await page.textContent('[data-countdown]');
        check(
          `${tag} ${kind}: the countdown of the week runs`,
          /\d\d:\d\d:\d\d/.test(after ?? '') && after !== before,
          `${before} -> ${after}`,
        );
      }
    }
    // The pseudo-legendary banner: a x10 with its reveal.
    await tap(`[data-gacha-tab="${tabs[1]}"]`);
    await page.waitForSelector('[data-draw="10"]');
    await tap('[data-draw="10"]');
    await page.waitForSelector('[data-gacha-reveal]', { state: 'visible' });
    await page.waitForTimeout(900);
    await shot(page, `${tag}-x10-esfera.png`);
    await page.waitForSelector('[data-reveal-card]', { timeout: 6000 });
    await page.waitForTimeout(2600);
    await shot(page, `${tag}-x10-cartas.png`);
    await page.waitForSelector('[data-action="revealDone"]', { state: 'visible', timeout: 20000 });
    await tap('[data-action="revealDone"]');
    // The legendary banner: a key.
    await tap(`[data-gacha-tab="${tabs[4]}"]`);
    await page.waitForSelector('[data-draw="key"]');
    await tap('[data-draw="key"]');
    await page.waitForSelector('[data-reveal-card]', { timeout: 6000 });
    await page.waitForTimeout(1400);
    await shot(page, `${tag}-llave.png`);
    await page.waitForSelector('[data-action="revealDone"]', { state: 'visible', timeout: 20000 });
    await tap('[data-action="revealDone"]');
    const p = await page.evaluate(() => window.__profile());
    check(`${tag}: ten draws and a key, kept`, p.gacha.draws === 10 && p.legend.draws === 1);
    check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(failures.length === 0 ? '\nALL PASS' : `\n${failures.length} FAILED`);
process.exitCode = failures.length === 0 ? 0 : 1;
