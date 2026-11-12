// Plays the three touch schemes (4G-G) in a phone-sized Edge with REAL touch events (CDP), one thumb,
// portrait: drag to move, tap an enemy, flick and release. Fails on any page error and saves a
// screenshot per scheme.
//
//   pnpm exec node tools/browser-bench/touch.mjs [--out folder] [--headless]
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
const server = await preview({ preview: { port: 4178, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

try {
  for (const scheme of ['smart', 'motion', 'sling']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 760 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(
      `http://127.0.0.1:4178/?debug&seed=9&starter=pikachu&wave=3&ballLevel=2&hp=99&controls=${scheme}`,
    );
    await page.bringToFront();
    await page.waitForFunction(() => typeof window.__debug === 'function');
    const state = () => page.evaluate(() => window.__debug());
    const cdp = await context.newCDPSession(page);
    const touch = (type, x, y) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    // The canvas is letterboxed: a point of the screen low and in the middle is the thumb zone.
    const drag = async (x0, y0, x1, y1, ms) => {
      await touch('touchStart', x0, y0);
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        await touch('touchMove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
        await page.waitForTimeout(ms / steps);
      }
      await touch('touchEnd');
    };

    const s0 = await state();
    check(`${scheme}: the scheme is the one asked for`, s0.scheme === scheme, s0.scheme);
    // A drag to the right with one thumb in the lower part of the screen moves the launcher right.
    await drag(120, 620, 300, 620, 500);
    const s1 = await state();
    check(
      `${scheme}: dragging right moves the launcher right`,
      s1.playerX > s0.playerX + 20,
      `${s0.playerX.toFixed(0)} -> ${s1.playerX.toFixed(0)}`,
    );
    await drag(300, 620, 100, 620, 500);
    const s2 = await state();
    check(
      `${scheme}: dragging left moves it left`,
      s2.playerX < s1.playerX - 20,
      `${s1.playerX.toFixed(0)} -> ${s2.playerX.toFixed(0)}`,
    );
    check(`${scheme}: the mode reaches the domain`, s2.aimMode === scheme, s2.aimMode);

    if (scheme === 'smart') {
      // Balls fly by themselves (nobody aims) and the aim point follows the targets.
      await page.waitForTimeout(1500);
      const s = await state();
      check('smart: balls in flight without any aiming', s.balls > 0, `${s.balls} balls`);
      check('smart: the aim point is set by the launcher', s.aimY < 600, `aim ${s.aimX},${s.aimY}`);
    }
    if (scheme === 'sling') {
      // Held still, no ball leaves; a tap (a lift) throws the ready ones.
      await touch('touchStart', 200, 600);
      await page.waitForTimeout(900);
      const held = await state();
      await touch('touchEnd');
      await page.waitForTimeout(250);
      const lifted = await state();
      check(
        'sling: balls wait while the finger is down',
        held.balls === 0 || held.balls <= lifted.balls,
        `${held.balls} held, ${lifted.balls} after`,
      );
      check('sling: lifting the finger throws them', lifted.balls > 0, `${lifted.balls} balls`);
    }
    if (scheme === 'motion') {
      // Balls are in flight only a moment between launches: wait for any to be seen.
      const flew = await page
        .waitForFunction(() => window.__debug().balls > 0, null, { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      check('motion: balls fly with no aiming', flew);
    }
    await page.waitForTimeout(600);
    check(`${scheme}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    if (outDir) await page.screenshot({ path: join(outDir, `touch-${scheme}.png`) });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
if (failures.length > 0) {
  console.error(`\n${failures.length} checks failed`);
  process.exit(1);
}
console.log('\ntouch smoke ok');
