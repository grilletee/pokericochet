// One capture of the playing field per biome (to check that the Pokémon stand out of the backdrop).
//   pnpm exec node tools/browser-bench/biomeShots.mjs --out <dir> [--size 540x820]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const argOf = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = argOf('--out', 'biomes');
const [w, h] = argOf('--size', '540x820').split('x').map(Number);
mkdirSync(outDir, { recursive: true });
const seeds = JSON.parse(
  execFileSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'tools/browser-bench/biomeSeeds.ts'],
    {
      encoding: 'utf8',
    },
  ).trim(),
);
const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
await build({ logLevel: 'error' });
const server = await preview({ preview: { port: 4176, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless: true });
try {
  for (const [id, [seed, wave]] of Object.entries(seeds)) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(
      `http://127.0.0.1:4176/?debug&starter=pikachu&seed=${seed}&wave=${wave}&ballLevel=3`,
    );
    await page.waitForFunction(() => typeof window.__debug === 'function');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: join(outDir, `bioma-${id}.png`) });
    await page.close();
  }
  console.log(`biomes in ${outDir}`);
} finally {
  await browser.close();
  server.httpServer.close();
}
