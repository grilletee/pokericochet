// Captures the boss looks of the 4G-H in a real Edge: the attacks of bosses of several types (their
// own look over the one language of danger), the arena of several legendaries, and the death of a
// legendary frame by frame (the summary must only come after it).
//   node tools/browser-bench/bosses4gh.mjs --out <dir> [--seeds 3,5,8]
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const argOf = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = argOf('--out', 'bosses-4gh');
const seeds = argOf('--seeds', '3,5,8,13,21').split(',').map(Number);
// Legendaries forced with ?legend= so every family of look is seen (fire, water, rock, ghost...).
const legends = argOf('--legends', 'entei,kyogre,regirock,giratina-altered,zapdos,celebi')
  .split(',')
  .filter(Boolean);
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
const server = await preview({ preview: { port: 4183, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless: false });
const report = [];
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = () => page.evaluate(() => window.__debug());
  const team = 'charizard,blastoise,venusaur,pikachu,gengar,machamp';
  // 1. The arenas and the attacks of the legendaries of several seeds, and of the forced ones.
  const visits = [
    ...seeds.map((seed) => ({ seed, extra: '' })),
    ...legends.map((legend) => ({ seed: 7, extra: `&legend=${legend}` })),
  ];
  for (const { seed, extra } of visits) {
    await page.goto(
      `http://127.0.0.1:4183/?debug&seed=${seed}&starter=charmander&wave=7&hp=99&team=${team}${extra}`,
    );
    await page.waitForFunction(() => typeof window.__debug === 'function');
    await page.waitForFunction(() => window.__debug().bossMaxHp > 0, undefined, {
      timeout: 60000,
    });
    const s = await state();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(outDir, `arena-${s.bossSpecies}.png`) });
    // Wait for something to strike (a hazard past its warning) and take two frames of it.
    let striking = 0;
    for (let i = 0; i < 160 && striking < 2; i++) {
      await page.waitForTimeout(100);
      const now = await state();
      if (now.striking > 0) {
        await page.screenshot({ path: join(outDir, `attack-${s.bossSpecies}-${striking}.png`) });
        striking += 1;
        await page.waitForTimeout(700);
      }
    }
    report.push(`${seed}: ${s.bossSpecies}`);
  }
  // 2. The death of a legendary, frame by frame, and when the summary comes.
  await page.goto(
    `http://127.0.0.1:4183/?debug&seed=${seeds[0]}&starter=charmander&wave=7&hp=99&bossHp=0.01&team=${team}`,
  );
  await page.waitForFunction(() => typeof window.__debug === 'function');
  await page.waitForFunction(() => window.__debug().bossMaxHp > 0, undefined, { timeout: 60000 });
  await page.waitForFunction(() => window.__debug().phase === 'won', undefined, {
    timeout: 120000,
  });
  const t0 = Date.now();
  const timeline = [];
  for (let i = 0; i < 9; i++) {
    const s = await state();
    timeline.push(`${Date.now() - t0} ms: screen ${s.screen}, dying ${s.dying}`);
    await page.screenshot({ path: join(outDir, `death-${i}.png`) });
    await page.waitForTimeout(420);
  }
  report.push(...timeline);
  report.push(`errors: ${errors.length}`);
  if (errors.length > 0) report.push(...errors.slice(0, 3));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(report.join('\n'));
