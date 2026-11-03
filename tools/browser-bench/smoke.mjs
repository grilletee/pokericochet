// Plays the game in a real browser for a few seconds: keyboard, pointer, spawning, rendering.
// Fails on any page error. Saves a screenshot.
//
//   pnpm smoke -- --out screenshot.png [--headless]
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const headless = args.includes('--headless');
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? args[outIndex + 1] : 'smoke.png';

const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!executablePath) throw new Error('No browser found. Set BROWSER_PATH.');

await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4174, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

try {
  const page = await browser.newPage({ viewport: { width: 540, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('http://127.0.0.1:4174/?debug&seed=123');
  await page.bringToFront();
  await page.waitForFunction(() => typeof window.__debug === 'function');
  const state = () => page.evaluate(() => window.__debug());
  const hold = async (key, ms) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  };

  check('canvas is on the page', (await page.locator('canvas').count()) === 1);
  const s0 = await state();
  await hold('ArrowRight', 700);
  const s1 = await state();
  check(
    'ArrowRight moves the player right',
    s1.playerX > s0.playerX + 20,
    `${s0.playerX} -> ${s1.playerX}`,
  );
  await hold('KeyA', 700);
  const s2 = await state();
  check('A moves the player left', s2.playerX < s1.playerX - 20, `${s1.playerX} -> ${s2.playerX}`);

  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  const s3 = await state();
  await page.mouse.up();
  check(
    'holding the pointer on the right steers right',
    s3.playerX > s2.playerX + 20,
    `${s2.playerX} -> ${s3.playerX}`,
  );

  const t0 = Date.now();
  const before = await state();
  await page.waitForTimeout(6000);
  const after = await state();
  const seconds = (Date.now() - t0) / 1000;
  const rate = (after.tick - before.tick) / seconds;
  check('simulation runs at ~60 ticks/s', rate > 54 && rate < 66, `${rate.toFixed(1)} ticks/s`);
  check('enemies spawn and balls fly', after.enemies > 0 || after.balls > 0, JSON.stringify(after));
  check('no page or console errors', errors.length === 0, errors.join(' | '));

  await page.screenshot({ path: outFile });
  console.log(`screenshot: ${outFile}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
if (failures.length > 0) {
  console.error(`FAILED: ${failures.join(', ')}`);
  process.exit(1);
}
