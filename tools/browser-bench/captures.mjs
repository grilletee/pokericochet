// Captures for the LinkedIn post (4G-D): the same screens of the game as PNG, plus a short video.
//
//   pnpm exec node tools/browser-bench/captures.mjs --out <dir> [--prefix despues] [--video]
//
// It builds the game, serves it and drives it with Playwright (Edge or Chrome). Nothing here touches
// the repository: the files go to --out.
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const outDir = argOf('--out', 'captures');
const prefix = argOf('--prefix', 'despues');
const wantVideo = args.includes('--video');
mkdirSync(outDir, { recursive: true });

const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!executablePath) throw new Error('No browser found. Set BROWSER_PATH.');

await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4175, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless: true });
const shot = (page, name) => page.screenshot({ path: join(outDir, `${prefix}-${name}.png`) });

const open = async (query, size = { width: 540, height: 820 }, context) => {
  const page = context ? await context.newPage() : await browser.newPage({ viewport: size });
  await page.goto(`http://127.0.0.1:4175/?debug&${query}`);
  await page.bringToFront();
  await page.waitForFunction(() => typeof window.__debug === 'function');
  return page;
};

try {
  // Title.
  const title = await open('seed=5');
  await title.waitForSelector('button[data-starter]');
  await title.waitForTimeout(400);
  await shot(title, 'title');
  await title.close();

  // The game, mid-wave.
  const game = await open('starter=charmander&wave=2&ballLevel=3&seed=9');
  await game.waitForTimeout(6000);
  await shot(game, 'game');
  await game.close();

  // The cards and the evolution moment.
  const evo = await open('starter=charmander&ballLevel=2&offers=growth&seed=9');
  await evo.waitForFunction(() => window.__debug().phase === 'levelup');
  await shot(evo, 'cards');
  await evo.locator('button[data-card="0"]').click();
  await evo.waitForFunction(
    () => document.querySelector('[data-evolution-moment]')?.textContent?.includes('Charmeleon'),
    undefined,
    { timeout: 4000 },
  );
  await shot(evo, 'moment');
  await evo.close();

  // The replace screen and the sheet.
  const full = 'charmander,squirtle,bulbasaur,pikachu,vulpix,psyduck';
  const rep = await open(`starter=charmander&team=${full}&capture=growlithe&seed=9`);
  await rep.waitForFunction(() => window.__debug().phase === 'replace', undefined, {
    timeout: 20000,
  });
  await rep.waitForTimeout(300);
  await shot(rep, 'replace');
  await rep.close();

  // The Ultimate of each initial, a moment after it is thrown.
  for (const starter of ['charmander', 'squirtle', 'bulbasaur', 'pikachu']) {
    const u = await open(`starter=${starter}&ballLevel=3&charge=30&wave=2&seed=9`);
    await u.waitForTimeout(1500);
    await u.keyboard.press('1');
    await u.waitForTimeout(170);
    await shot(u, `ultimate-${starter}`);
    await u.close();
  }

  // A boss fight per iconic legendary (seeds found with tools/browser-bench/finalSeeds.ts).
  const bosses = { kyogre: 99, groudon: 89, mewtwo: 100, dialga: 67, palkia: 260 };
  for (const [name, seed] of Object.entries(bosses)) {
    const p = await open(`starter=pikachu&wave=7&seed=${seed}&ballLevel=6`);
    await p.waitForFunction(() => window.__debug().bossMaxHp > 0);
    // Wait for something on the field, then a little more so the strike is on screen.
    await p
      .waitForFunction(() => window.__debug().hazards > 0, undefined, { timeout: 40000 })
      .catch(() => {});
    await p.waitForTimeout(1500);
    await shot(p, `boss-${name}`);
    await p.close();
  }
  const phone = await open('starter=pikachu&wave=7&seed=99&ballLevel=6', {
    width: 360,
    height: 640,
  });
  await phone.waitForFunction(() => window.__debug().bossMaxHp > 0);
  await phone
    .waitForFunction(() => window.__debug().hazards > 0, undefined, { timeout: 40000 })
    .catch(() => {});
  await phone.waitForTimeout(1500);
  await shot(phone, 'phone');
  await phone.close();

  // The video: from the title, a wave and then a boss; about 30 seconds.
  if (wantVideo) {
    const videoDir = join(outDir, '_video');
    const context = await browser.newContext({
      viewport: { width: 540, height: 820 },
      recordVideo: { dir: videoDir, size: { width: 540, height: 820 } },
    });
    const v = await open('seed=99', undefined, context);
    await v.waitForSelector('button[data-starter]');
    await v.waitForTimeout(1500);
    await v.keyboard.press('4');
    await v.waitForTimeout(6000);
    await v.close();
    const w = await open('starter=pikachu&wave=7&seed=99&ballLevel=6', undefined, context);
    await w.waitForTimeout(24000);
    await w.close();
    await context.close();
    const file = readdirSync(videoDir).find((f) => f.endsWith('.webm'));
    if (file) renameSync(join(videoDir, file), join(outDir, `${prefix}-partida.webm`));
  }
  console.log(`captures in ${outDir}`);
} finally {
  await browser.close();
  server.httpServer.close();
}
