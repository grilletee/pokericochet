// Captures of the 4V art sprint: the same scenes before and after, on a desktop and on a phone held
// sideways, for the art director's review and for the vault (08-Visual/4V).
//
//   node tools/browser-bench/shots4v.mjs --url http://127.0.0.1:5199 --out <dir> --set biomes
//        [--prefix despues] [--device desktop|phone] [--only name1,name2] [--sheet]
//
// It drives a server that is already running (vite dev or preview) with Playwright (Edge or
// Chrome). Read-only for the repository: the files go to --out.
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = argOf('--url', 'http://127.0.0.1:5199');
const outDir = argOf('--out', 'captures-4v');
const prefix = argOf('--prefix', 'despues');
const set = argOf('--set', 'biomes');
const device = argOf('--device', 'desktop');
const only = argOf('--only', '');
mkdirSync(outDir, { recursive: true });

const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!executablePath) throw new Error('No browser found. Set BROWSER_PATH.');

// A (seed, wave) in which each biome is the theme of the wave (tools/browser-bench/biomeSeeds.ts).
const BIOMES = {
  meadow: [1, 3],
  forest: [3, 3],
  'fairy-glade': [2, 3],
  coast: [1, 5],
  swamp: [1, 1],
  volcano: [4, 0],
  cave: [1, 2],
  'frozen-peak': [1, 0],
  dojo: [3, 4],
  ruins: [4, 5],
  'haunted-house': [2, 4],
  'power-plant': [1, 4],
  storm: [1, 6],
  'dragon-sky': [2, 6],
};
const TEAM = 'pikachu,charmander,squirtle,bulbasaur,dratini,gastly';

const SETS = {
  // Every biome a few seconds into its wave, with a team that hits.
  biomes: Object.entries(BIOMES).map(([id, [seed, wave]]) => ({
    name: `bioma-${id}`,
    query: `starter=pikachu&seed=${seed}&wave=${wave}&team=${TEAM}&ballLevel=2`,
    wait: 5200,
  })),
  // The field in play: early, crowded, a boss and the final legendary.
  field: [
    { name: 'campo-inicio', query: 'starter=pikachu&seed=6', wait: 3500 },
    {
      name: 'campo-oleada',
      query: `starter=pikachu&seed=1&wave=3&team=${TEAM}&ballLevel=3`,
      wait: 9000,
    },
    {
      name: 'campo-jefe',
      query: `starter=pikachu&seed=6&wave=2&bossNo=1&team=${TEAM}&ballLevel=3`,
      wait: 9000,
    },
    {
      name: 'campo-legendario',
      query: `starter=pikachu&seed=6&wave=7&team=${TEAM}&ballLevel=3`,
      wait: 9500,
    },
  ],
};

// The measured loads of the benchmark (a bot plays): what a crowded fight looks like.
SETS.bench = [
  { name: 'carga-real', query: 'bench=real', wait: 4000 },
  { name: 'carga-estres', query: 'bench', wait: 4000 },
];

// An Ultimate thrown with the key 1, and a boss attacking, frame by frame.
SETS.fx = [
  ...['charmander', 'squirtle', 'bulbasaur', 'pikachu'].map((starter) => ({
    name: `ultimate-${starter}`,
    query: `starter=${starter}&ballLevel=3&charge=30&wave=3&seed=9`,
    wait: 9000,
    press: '1',
    frames: [60, 220, 420],
  })),
  {
    name: 'jefe-ataque',
    query: `starter=pikachu&seed=6&wave=2&bossNo=1&team=${TEAM}&ballLevel=3`,
    wait: 7000,
    frames: [0, 700, 1400, 2100, 2800, 3500],
  },
];

const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: {
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
  field: { viewport: { width: 560, height: 800 } },
};

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const shots = (SETS[set] ?? []).filter((s) => only === '' || only.split(',').includes(s.name));
  for (const shot of shots) {
    const context = await browser.newContext(DEVICES[device] ?? DEVICES.desktop);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${url}/?debug&${shot.query}`);
    await page.waitForFunction(() => typeof window.__debug === 'function', undefined, {
      timeout: 60000,
    });
    await page.waitForTimeout(shot.wait);
    if (shot.press) await page.keyboard.press(shot.press);
    // `frames`: several captures, each so many milliseconds after the wait (an effect over time).
    let at = 0;
    for (const t of shot.frames ?? []) {
      await page.waitForTimeout(t - at);
      at = t;
      await page.screenshot({ path: join(outDir, `${prefix}-${shot.name}-${t}-${device}.png`) });
    }
    if (shot.frames) {
      console.log(shot.name);
      await context.close();
      continue;
    }
    await page.screenshot({ path: join(outDir, `${prefix}-${shot.name}-${device}.png`) });
    console.log(`${shot.name}${errors.length > 0 ? ` ERRORS: ${errors.join(' | ')}` : ''}`);
    await context.close();
  }
} finally {
  await browser.close();
}
