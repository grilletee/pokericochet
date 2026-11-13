// Captures the feedback of the 4G-G in a real Edge: the shots of the enemies (4G-H: aimed, in bursts,
// by type) and the moment a hit lands (red flash, number).
//
//   pnpm exec node tools/browser-bench/feel.mjs --out folder [--mobile] [--seed 9]
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? args[outIndex + 1] : '.';
const mobile = args.includes('--mobile');
const seedIndex = args.indexOf('--seed');
const seed = seedIndex >= 0 ? args[seedIndex + 1] : '9';
mkdirSync(outDir, { recursive: true });
const tag = mobile ? 'movil' : 'escritorio';

const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!executablePath) throw new Error('No browser found. Set BROWSER_PATH.');

await build({ logLevel: 'error' });
const server = await preview({ preview: { port: 4179, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless: false });
try {
  const context = await browser.newContext(
    mobile
      ? {
          viewport: { width: 390, height: 760 },
          deviceScaleFactor: 2,
          hasTouch: true,
          isMobile: true,
        }
      : { viewport: { width: 540, height: 820 } },
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A fire-type starter at a late wave: many enemies, several types, many shots.
  await page.goto(
    `http://127.0.0.1:4179/?debug&seed=${seed}&starter=charmander&wave=5&ballLevel=3&hp=99&controls=smart`,
  );
  await page.bringToFront();
  await page.waitForFunction(() => typeof window.__debug === 'function');
  const state = () => page.evaluate(() => window.__debug());
  let threat = false;
  let hurt = false;
  let lastHp = (await state()).hp;
  for (let i = 0; i < 400 && !(threat && hurt); i++) {
    await page.waitForTimeout(150);
    const s = await state();
    if (!threat && s.enemyShots >= 2) {
      await page.waitForTimeout(700);
      await page.screenshot({ path: join(outDir, `disparos-${tag}.png`) });
      threat = true;
    }
    if (!hurt && s.hp < lastHp) {
      await page.screenshot({ path: join(outDir, `dano-${tag}.png`) });
      hurt = true;
    }
    lastHp = s.hp;
    // Walk a little so the field is not frozen.
    await page.keyboard.down(i % 20 < 10 ? 'ArrowLeft' : 'ArrowRight');
    await page.waitForTimeout(40);
    await page.keyboard.up(i % 20 < 10 ? 'ArrowLeft' : 'ArrowRight');
  }
  console.log(`shots captured: ${threat}, hurt captured: ${hurt}, errors: ${errors.length}`);
  if (errors.length > 0) console.error(errors.slice(0, 3).join('\n'));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
