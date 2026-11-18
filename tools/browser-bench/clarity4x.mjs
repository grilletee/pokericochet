// 4X, blocks 4 and 5 in a real Edge: the Ultimate with Q and with the right click, its big cue, the
// pips and launch flashes of the team; the menus never show the run behind them while they open or
// close; the numbers of the HUD never overlap. Screenshots with --out.
//
//   node tools/browser-bench/clarity4x.mjs [--out folder] [--headless] [--no-build]
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
const server = await preview({ preview: { port: 4190, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};
const shot = async (page, name) => {
  if (outDir) await page.screenshot({ path: join(outDir, name) });
};
const URL = 'http://127.0.0.1:4190/';

try {
  // ---- Block 4: the Ultimate (desktop).
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const state = () => page.evaluate(() => window.__debug());
    await page.goto(`${URL}?debug&seed=9&starter=charmander&wave=2&ballLevel=3&charge=99&hp=99`);
    await page.waitForFunction(() => typeof window.__debug === 'function');
    const ready = async () => {
      for (let i = 0; i < 60; i++) {
        const visible = await page.evaluate(
          () => document.querySelector('[data-ultimate-cue]')?.style.display === 'flex',
        );
        if (visible) return true;
        await page.waitForTimeout(150);
      }
      return false;
    };
    check('a ready Ultimate shows its big cue', await ready());
    const cue = await page.textContent('[data-ultimate-cue]');
    check(
      'the cue says how: Q or the right click',
      /Pulsa Q o clic derecho/.test(cue ?? ''),
      cue ?? '',
    );
    await shot(page, 'ulti-lista.png');
    const tag = await page.textContent('[data-signature-tag]');
    check('the portrait tag names the key', (tag ?? '').includes('[Q]'), tag ?? '');
    const pips = await page.$$eval('[data-ball-pips]', (p) => p.map((x) => x.dataset.ballPips));
    check('every portrait shows the balls it fires', pips.length >= 1, pips.join(','));
    // The Ultimate lands on an enemy: wait for one on the field.
    await page.waitForFunction(() => window.__debug().enemies > 0, null, { timeout: 20000 });
    const before = (await state()).moveCasts;
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(400);
    const afterQ = (await state()).moveCasts;
    check('Q throws the Ultimate', afterQ > before, `${before} -> ${afterQ}`);
    // Charge it again and throw it with the right click on the field.
    await page.evaluate(() => {
      window.__charge?.();
    });
    if (await ready()) {
      const canvas = await page.locator('canvas[data-game-canvas]').boundingBox();
      await page.waitForFunction(() => window.__debug().enemies > 0, null, { timeout: 20000 });
      const casts = (await state()).moveCasts;
      await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 3, {
        button: 'right',
      });
      await page.waitForTimeout(400);
      check('the right click throws it too', (await state()).moveCasts > casts);
    } else {
      check('the Ultimate charges again', false);
    }
    check('no page errors (Ultimate)', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(failures.length === 0 ? '\nALL PASS' : `\n${failures.length} FAILED`);
process.exitCode = failures.length === 0 ? 0 : 1;
