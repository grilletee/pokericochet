// The 12th-playtest case: a Bagon Nv1 in the team plus the Salamence the boss dropped must evolve
// Bagon -> Shelgon -> Salamence in order. Prints the names the evolution moment shows.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
await build({ logLevel: 'error' });
const server = await preview({ preview: { port: 4178, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 820 } });
  await page.goto(
    'http://127.0.0.1:4178/?debug&starter=charmander&team=charmander,bagon&capture=bagon&captureStage=3&seed=9',
  );
  await page.waitForFunction(() => typeof window.__debug === 'function');
  const seen = [];
  for (let i = 0; i < 160; i++) {
    const text = await page
      .locator('[data-evolution-moment]')
      .textContent({ timeout: 500 })
      .catch(() => '');
    if (text && !seen.includes(text)) seen.push(text);
    await page.waitForTimeout(100);
  }
  console.log(JSON.stringify(seen));
} finally {
  await browser.close();
  server.httpServer.close();
}
