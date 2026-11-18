// 4X, block 1: the new capture in a real browser (Edge). A join encounter (three wild Pokémon, take
// one, its moment), letting one go (the usual cards), and the capture of a weakened boss (the ring,
// a throw inside it, the verdict). Fails on any page error; saves screenshots with --out.
//
//   pnpm exec node tools/browser-bench/capture4x.mjs [--out folder] [--headless] [--no-build]
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
const server = await preview({ preview: { port: 4186, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};
const shot = async (page, name) => {
  if (outDir) await page.screenshot({ path: join(outDir, name) });
};

const VIEWPORTS = [
  { name: 'escritorio', viewport: { width: 1280, height: 800 } },
  {
    name: 'movil-a',
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
  { name: 'tablet', viewport: { width: 1024, height: 768 }, hasTouch: true },
];

try {
  for (const device of VIEWPORTS) {
    const { name: tag, ...options } = device;
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const state = () => page.evaluate(() => window.__debug());

    // 1. A join encounter: three wild Pokémon, big; take the second one.
    await page.goto('http://127.0.0.1:4186/?debug&seed=8&starter=charmander&offers=join');
    await page.waitForFunction(() => typeof window.__debug === 'function');
    await page.waitForSelector('[data-join-option="2"]', { timeout: 8000 });
    const shown = await page.locator('[data-join-option]').count();
    check(`${tag}: a join encounter shows three wild Pokémon`, shown === 3, String(shown));
    const title = await page.locator('[data-join-title]').textContent();
    check(`${tag}: it says "quiere unirse"`, /quieren? unirse/.test(title ?? ''), title ?? '');
    const cardsHidden = await page.evaluate(
      () => document.querySelectorAll('button[data-card]').length === 0,
    );
    check(`${tag}: the usual cards are not mixed with them`, cardsHidden);
    await page.waitForTimeout(700);
    await shot(page, `${tag}-1-encuentro.png`);
    const before = (await state()).team;
    await page.locator('[data-join-option="1"]').click();
    await page.waitForTimeout(750);
    await shot(page, `${tag}-2-se-une.png`);
    const moment = await page.evaluate(
      () => document.querySelector('[data-boss-moment]')?.getAttribute('data-style') ?? '',
    );
    check(`${tag}: the one taken has its moment`, moment === 'join', moment);
    await page.waitForTimeout(900);
    const after = await state();
    check(`${tag}: it joined the team`, after.team === before + 1, `${before} -> ${after.team}`);
    check(`${tag}: the game goes on`, after.phase === 'playing', after.phase);

    // 2. Letting them go: the usual cards come.
    await page.goto('http://127.0.0.1:4186/?debug&seed=8&starter=charmander&offers=join');
    await page.waitForSelector('[data-join-skip]', { timeout: 8000 });
    await page.locator('[data-join-skip]').click();
    await page.waitForSelector('button[data-card="0"]', { timeout: 4000 }).catch(() => {});
    const cards = await page.locator('button[data-card]').count();
    check(`${tag}: "Ahora no" brings the usual cards`, cards > 0, String(cards));

    // 3. The capture of a weakened boss: the ring narrows, a click inside it throws.
    await page.goto('http://127.0.0.1:4186/?debug&seed=8&starter=charmander&catch=machoke');
    await page.waitForSelector('[data-catch-ring]', { state: 'attached', timeout: 8000 });
    await page.waitForTimeout(300);
    const s0 = await state();
    check(`${tag}: the capture waits (phase catch)`, s0.phase === 'catch', s0.phase);
    const chanceText = await page.locator('[data-catch-chance]').textContent();
    check(`${tag}: it shows the chance in %`, /\d+ %/.test(chanceText ?? ''), chanceText ?? '');
    await shot(page, `${tag}-3-captura-anillo.png`);
    // Wait for a narrow ring, then click on the boss.
    let thrown = false;
    for (let i = 0; i < 80 && !thrown; i++) {
      const view = await page.evaluate(() => {
        const ring = document.querySelector('[data-catch-ring]')?.getBoundingClientRect();
        const sprite = document.querySelector('[data-catch-sprite]')?.getBoundingClientRect();
        return ring && sprite
          ? {
              ring: ring.width,
              body: sprite.width,
              x: sprite.left + sprite.width / 2,
              y: sprite.top + sprite.height / 2,
            }
          : null;
      });
      // The sprite is drawn 2.2 body radii wide and the ring is 1 radius at its narrowest: 0.91.
      if (view !== null && view.ring < view.body * 1.05) {
        if (options.hasTouch) await page.touchscreen.tap(view.x, view.y);
        else await page.mouse.click(view.x, view.y);
        thrown = true;
      } else {
        await page.waitForTimeout(40);
      }
    }
    check(`${tag}: a narrow ring came and the sphere was thrown`, thrown);
    await page.waitForTimeout(700);
    await shot(page, `${tag}-4-lanzamiento.png`);
    const verdict = await page.evaluate(
      () => document.querySelector('[data-catch-throw]')?.getAttribute('data-catch-throw') ?? '',
    );
    check(
      `${tag}: the throw landed inside the ring`,
      verdict === 'caught' || verdict === 'broke',
      verdict,
    );
    await page.waitForTimeout(1300);
    await shot(page, `${tag}-5-veredicto.png`);
    const s1 = await state();
    check(
      `${tag}: after the throw the run goes on`,
      s1.phase === 'playing' || s1.phase === 'replace',
      s1.phase,
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
