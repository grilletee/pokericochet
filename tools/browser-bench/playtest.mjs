// Scripted, observational playtest on the production build served under a sub-path (like GitHub
// Pages): mobile and desktop, screenshots plus measurements. It judges nothing: a human reads the
// screenshots and the numbers (see the playtest guide in the vault).
//
//   pnpm playtest            writes playtest-out/*.png and prints the measurements as JSON
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { build } from 'vite';

const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!executablePath) throw new Error('No browser found. Set BROWSER_PATH.');

await build({ logLevel: 'warn' });
const dist = resolve('dist');
const out = resolve('playtest-out');
mkdirSync(out, { recursive: true });
const BASE = '/pokericochet/';
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.css': 'text/css',
};
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (!path.startsWith(BASE)) {
    res.writeHead(404).end();
    return;
  }
  const file = join(dist, path.slice(BASE.length) || 'index.html');
  try {
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(4175, '127.0.0.1', done));
const url = (query = '') => `http://127.0.0.1:4175${BASE}${query}`;

const browser = await chromium.launch({ executablePath, headless: true });
const report = {};
const errors = [];

async function open(context, query) {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  await page.goto(url(query));
  return page;
}

const rect = (page, selector) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        x: Math.round(r.x),
        y: Math.round(r.y),
      };
    });

// ---- Mobile (390x844 CSS px, touch) ----
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
{
  const page = await open(mobile, '?seed=21');
  await page.waitForSelector('button[data-starter]');
  await page.screenshot({ path: join(out, 'mobile-1-title.png') });
  report.mobile = {
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    starterButton: await rect(page, 'button[data-starter]'),
    creditsButton: await rect(page, 'button[data-action="credits"]'),
  };
  await page.close();

  // Play with 4 balls from wave 4, steering by touch-drag, to look at legibility.
  const play = await open(
    mobile,
    '?debug&seed=21&starter=charmander&wave=3&loadout=charmander,squirtle,bulbasaur,pikachu&tokens=2',
  );
  await play.waitForFunction(() => typeof window.__debug === 'function');
  const canvas = await play.locator('canvas').boundingBox();
  const scale = Math.min(canvas.width / 480, canvas.height / 720);
  report.mobile.arenaScale = Number(scale.toFixed(3));
  // Art sizes in CSS pixels: ball art = 2 * 6 * 2.4 arena px, enemy art = 2 * 16 * 1.7.
  report.mobile.ballSpriteCssPx = Number((2 * 6 * 2.4 * scale).toFixed(1));
  report.mobile.enemySpriteCssPx = Number((2 * 16 * 1.7 * scale).toFixed(1));
  report.mobile.bossSpriteCssPx = Number((2 * 40 * 1.7 * scale).toFixed(1));
  await play.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.9);
  await play.mouse.down();
  for (let i = 0; i < 40; i++) {
    const x = canvas.x + canvas.width * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(i / 3)));
    await play.mouse.move(x, canvas.y + canvas.height * 0.9, { steps: 3 });
    await play.waitForTimeout(250);
    if (i === 12) await play.screenshot({ path: join(out, 'mobile-2-play-wave4.png') });
  }
  await play.mouse.up();
  report.mobile.afterPlay = await play.evaluate(() => window.__debug());

  // The workshop on a phone.
  report.mobile.launcher = await rect(play, '[data-fusion-open]');
  await play.locator('[data-fusion-open]').tap();
  await play.waitForSelector('[data-fusion-panel] button[data-slot]');
  await play.locator('button[data-slot="0"]').tap();
  await play.locator('button[data-slot="1"]').tap();
  await play.screenshot({ path: join(out, 'mobile-3-workshop.png') });
  report.mobile.workshop = {
    panel: await rect(play, '[data-fusion-panel]'),
    chip: await rect(play, 'button[data-slot="0"]'),
    closeButton: await rect(play, '[data-fusion-close]'),
    swapButton: await rect(play, '[data-fusion-swap]'),
    fuseButton: await rect(play, '[data-fusion-go]'),
    text: (await play.locator('[data-fusion-text]').textContent()) ?? '',
    canvas: { w: Math.round(canvas.width), h: Math.round(canvas.height) },
  };
  report.mobile.soundToggle = await rect(play, '[data-sound-toggle]');
  await play.close();
}
await mobile.close();

// ---- Desktop (1280x800): legibility and sound density ----
const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
{
  await desktop.addInitScript(() => {
    window.__oscillators = 0;
    const proto = window.AudioContext?.prototype;
    if (proto) {
      const original = proto.createOscillator;
      proto.createOscillator = function (...args) {
        window.__oscillators += 1;
        return original.apply(this, args);
      };
    }
  });
  const page = await open(
    desktop,
    '?debug&seed=33&starter=pikachu&wave=3&loadout=pikachu,charmander,squirtle,bulbasaur',
  );
  await page.waitForFunction(() => typeof window.__debug === 'function');
  await page.mouse.click(640, 400); // a gesture, so the audio context may start
  const canvas = await page.locator('canvas').boundingBox();
  const start = Date.now();
  for (let i = 0; i < 60; i++) {
    await page.mouse.move(canvas.x + canvas.width * (0.5 + 0.3 * Math.sin(i / 4)), 700);
    await page.keyboard.down(i % 8 < 4 ? 'ArrowLeft' : 'ArrowRight');
    await page.waitForTimeout(250);
    await page.keyboard.up(i % 8 < 4 ? 'ArrowLeft' : 'ArrowRight');
    if (i === 30) await page.screenshot({ path: join(out, 'desktop-1-play.png') });
  }
  const seconds = (Date.now() - start) / 1000;
  const oscillators = await page.evaluate(() => window.__oscillators);
  report.desktop = {
    seconds: Number(seconds.toFixed(1)),
    oscillatorsCreated: oscillators,
    notesPerSecond: Number((oscillators / seconds).toFixed(1)),
    state: await page.evaluate(() => window.__debug()),
  };
  await page.close();
}
await desktop.close();

report.errors = errors;
console.log(JSON.stringify(report, null, 2));
await browser.close();
await new Promise((done) => server.close(done));
