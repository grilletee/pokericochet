// Plays the two-thumb scheme (4G-H) in a phone-sized Edge held in LANDSCAPE with REAL multitouch
// (CDP): the left thumb drags and the launcher follows it 1:1, the right thumb aims at the same
// time, the ULTI button throws the Ultimate while the left thumb is still down, the HUD and the team
// are in the side panels (never over the field), and upright the phone is asked to turn. Fails on any
// page error and saves screenshots.
//
//   pnpm exec node tools/browser-bench/twin.mjs [--out folder] [--headless]
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

await build({ logLevel: 'error' });
const server = await preview({ preview: { port: 4185, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

try {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // No ?controls=: a touch screen must start with the two thumbs by itself.
  await page.goto(
    'http://127.0.0.1:4185/?debug&seed=9&starter=charmander&wave=3&ballLevel=3&hp=99&charge=99',
  );
  await page.bringToFront();
  await page.waitForFunction(() => typeof window.__debug === 'function');
  const state = () => page.evaluate(() => window.__debug());
  const cdp = await context.newCDPSession(page);
  const points = new Map();
  const send = (type) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [...points.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id })),
    });
  const down = async (id, x, y) => {
    points.set(id, { x, y });
    await send('touchStart');
  };
  const move = async (id, x, y) => {
    points.set(id, { x, y });
    await send('touchMove');
  };
  const up = async (id) => {
    points.delete(id);
    await send('touchEnd');
  };

  const s0 = await state();
  check('a touch screen starts with the two thumbs', s0.scheme === 'twin', s0.scheme);

  // The side panels: the HUD and the team bar are outside the field.
  const boxes = await page.evaluate(() => {
    const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const canvas = document.querySelector('canvas')?.getBoundingClientRect();
    return {
      hud: rect('[data-hud]'),
      team: rect('[data-team-bar]'),
      boss: rect('[data-boss-bar]'),
      ulti: rect('[data-ulti-button]'),
      width: canvas?.width ?? 0,
    };
  });
  const fieldW = (390 / 760) * 480;
  const fieldLeft = (844 - fieldW) / 2;
  const fieldRight = fieldLeft + fieldW;
  const outside = (r) => r !== null && (r.right <= fieldLeft + 1 || r.left >= fieldRight - 1);
  check('the HUD is in the left panel', outside(boxes.hud), JSON.stringify(boxes.hud));
  check('the team is in a side panel', outside(boxes.team), JSON.stringify(boxes.team));
  check(
    'the ULTI button is in the right panel',
    outside(boxes.ulti) && boxes.ulti.left >= fieldRight - 1,
  );

  // 1. The left thumb alone: drag right in the left panel, the launcher follows at once.
  await down(1, 60, 300);
  for (let i = 1; i <= 10; i++) {
    await move(1, 60 + i * 16, 300);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(60);
  const s1 = await state();
  check(
    'the left thumb drags the launcher with it, fast',
    s1.playerX > s0.playerX + 150,
    `${s0.playerX.toFixed(0)} -> ${s1.playerX.toFixed(0)}`,
  );
  // 2. The right thumb at the same time (on the right half of the screen, over the field and away
  // from the ULTI button): aim to the left while the left thumb holds and moves back.
  const aim0 = { x: s1.aimX, y: s1.aimY };
  await down(2, 500, 150);
  for (let i = 1; i <= 8; i++) {
    await move(2, 500 - i * 12, 150 + i * 6);
    await move(1, 220 - i * 10, 300);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(80);
  const s2 = await state();
  check(
    'both thumbs at once: the aim moves while the launcher moves',
    s2.aimX < aim0.x - 30 && s2.playerX < s1.playerX - 40,
    `aim ${aim0.x}->${s2.aimX}, launcher ${s1.playerX.toFixed(0)}->${s2.playerX.toFixed(0)}`,
  );
  if (outDir) await page.screenshot({ path: join(outDir, 'dos-pulgares.png') });
  await up(2);
  // 3. The ULTI while the left thumb is still down (it needs a ready Ultimate: wait for one).
  await page.waitForTimeout(400);
  let cast = false;
  const castsBefore = (await state()).moveCasts;
  for (let i = 0; i < 80 && !cast; i++) {
    const ulti = await page.evaluate(() => {
      const b = document.querySelector('[data-ulti-button]');
      const r = b?.getBoundingClientRect();
      return r
        ? { x: r.left + r.width / 2, y: r.top + r.height / 2, on: b.style.opacity === '1' }
        : null;
    });
    if (ulti?.on) {
      await down(3, ulti.x, ulti.y);
      await page.waitForTimeout(50);
      await up(3);
      await page.waitForTimeout(200);
      cast = (await state()).moveCasts > castsBefore;
      if (outDir && cast) await page.screenshot({ path: join(outDir, 'ulti.png') });
    } else {
      await page.waitForTimeout(250);
    }
  }
  check('the ULTI throws the Ultimate with the other thumb down', cast);
  await up(1);
  const s3 = await state();
  check('the game ran (ticks advanced)', s3.tick > s0.tick + 60, `${s0.tick} -> ${s3.tick}`);

  // 4. Upright: the game asks to turn the phone and waits.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const t0 = (await state()).tick;
  await page.waitForTimeout(600);
  const t1 = (await state()).tick;
  const notice = await page.evaluate(
    () => document.querySelector('[data-rotate-notice]')?.style.display ?? 'none',
  );
  check(
    'upright: "gira el móvil" and the game waits',
    notice === 'flex' && t1 === t0,
    `${notice}, ${t0}->${t1}`,
  );
  if (outDir) await page.screenshot({ path: join(outDir, 'gira.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  const t2 = await state();
  await page.waitForTimeout(500);
  const t3 = await state();
  const hidden = await page.evaluate(
    () => document.querySelector('[data-rotate-notice]')?.style.display ?? 'none',
  );
  // It runs again (or it is on a card, which waits for the player anyway).
  check(
    'turned back: the notice goes and the game goes on',
    hidden === 'none' && (t3.tick > t2.tick || t3.phase !== 'playing'),
    `${hidden}, ${t2.tick}->${t3.tick} ${t3.phase}`,
  );
  if (outDir) await page.screenshot({ path: join(outDir, 'horizontal.png') });
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(failures.length === 0 ? '\nALL PASS' : `\n${failures.length} FAILED`);
process.exitCode = failures.length === 0 ? 0 : 1;
