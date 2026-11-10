// Opens the game with a query and prints its debug state a few times (to see why a check waits).
//   node tools/browser-bench/probe.mjs "<query>" [seconds]
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const query = process.argv[2] ?? '';
const seconds = Number(process.argv[3] ?? 10);
const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
await build({ logLevel: 'error' });
const server = await preview({ preview: { port: 4181, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => window.localStorage.setItem('autoAim.v1', '1'));
  await page.goto(`http://127.0.0.1:4181/?debug&${query}`);
  await page.waitForFunction(() => typeof window.__debug === 'function');
  for (let i = 0; i < seconds; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => window.__debug());
    console.log(
      JSON.stringify({
        t: i + 1,
        tick: s.tick,
        screen: s.screen,
        hp: s.hp,
        moveCasts: s.moveCasts,
        balls: s.balls,
        enemies: s.enemies,
        kills: s.kills,
        loadout: s.loadout,
      }),
    );
  }
  console.log(errors.slice(0, 3));
} finally {
  await browser.close();
  server.httpServer.close();
}
