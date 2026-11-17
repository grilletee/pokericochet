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
  // The instant a column of the boss strikes, and right after it (the beam and the residue).
  {
    name: 'jefe-golpe',
    query: `starter=pikachu&seed=6&wave=2&bossNo=1&team=${TEAM}&ballLevel=3`,
    wait: 12000,
    waitFor: '() => { const n = window.__debug().nextStrike; return n > 0 && n <= 2; }',
    frames: [0, 1, 2, 3, 4, 300],
  },
];

// The key moments (block 2): a boss enters, the legendary appears, an evolution, the end of a run.
const momentOpen = '() => document.querySelector("[data-boss-moment]")?.style.display === "flex"';
const resultsOpen =
  '() => document.querySelector(\'[data-screen="results"]\')?.style.display === "flex"';
SETS.moments = [
  {
    name: 'momento-jefe',
    query: `starter=pikachu&seed=6&wave=2&bossNo=1&team=${TEAM}&ballLevel=3`,
    wait: 0,
    waitFor: momentOpen,
    frames: [150, 600, 1200],
  },
  {
    name: 'momento-legendario',
    query: `starter=pikachu&seed=6&wave=7&team=${TEAM}&ballLevel=3`,
    wait: 0,
    waitFor: momentOpen,
    frames: [300, 1500, 2500, 3500, 4600],
  },
  {
    name: 'momento-evolucion',
    query: 'starter=charmander&ballLevel=2&offers=growth&seed=9',
    wait: 0,
    waitFor: '() => window.__debug().phase === "levelup"',
    click: 'button[data-card="0"]',
    after: '() => document.querySelector("[data-evolution-moment]")?.style.display === "flex"',
    frames: [300, 950, 1350],
  },
  {
    name: 'momento-derrota',
    query: 'starter=pikachu&seed=6&wave=3&hp=1',
    wait: 0,
    waitFor: resultsOpen,
    frames: [80, 700, 1600],
  },
  {
    name: 'momento-victoria',
    query: `starter=pikachu&seed=6&wave=7&team=${TEAM}&ballLevel=3&bossHp=0.004`,
    wait: 0,
    waitFor: resultsOpen,
    frames: [80, 700, 1600],
  },
];

// The gacha (block 3): a limited banner, the probabilities, and a x10 turning card by card.
const gachaShot = (name, steps) => ({ name, query: 'seed=6&coins=200000', wait: 0, script: steps });
const openGacha = async (page) => {
  await page.waitForSelector('[data-screen="start"] [data-action="gacha"]', { timeout: 60000 });
  await page.click('[data-screen="start"] [data-action="gacha"]');
  await page.waitForSelector('[data-banner-art]');
  const tabs = await page.$$eval('[data-gacha-tab]', (bs) => bs.map((b) => b.dataset.gachaTab));
  await page.click(`[data-gacha-tab="${tabs[1]}"]`);
  await page.waitForTimeout(500);
};
SETS.gacha = [
  gachaShot('gacha-banner', async (page, snap) => {
    await openGacha(page);
    await snap('');
    await page.click('[data-panel="rates"]');
    await page.waitForTimeout(200);
    await snap('probabilidades');
  }),
  gachaShot('gacha-x10', async (page, snap) => {
    await openGacha(page);
    // Draw x10 until a ★5 comes (the pity makes it sure within a few), shooting the last one.
    for (let k = 0; k < 12; k++) {
      await page.click('[data-draw="10"]');
      await page.waitForSelector('[data-reveal-card]', { timeout: 8000 });
      const five = (await page.$$('[data-reveal-card][data-stars="5"]')).length > 0;
      if (five || k === 11) {
        for (const t of [250, 700, 1300, 2300]) {
          await page.waitForTimeout(
            t === 250 ? 250 : t - (t === 700 ? 250 : t === 1300 ? 700 : 1300),
          );
          await snap(String(t));
        }
        break;
      }
      await page.click('[data-action="revealDone"]');
    }
  }),
  gachaShot('gacha-x1', async (page, snap) => {
    await openGacha(page);
    await page.click('[data-draw="1"]');
    await page.waitForTimeout(500);
    await snap('esfera');
    await page.waitForSelector('[data-reveal-card]', { timeout: 8000 });
    await page.waitForTimeout(900);
    await snap('carta');
  }),
];

// The interface (block 4): the menu, the Pokédex, the settings, the credits and the HUD in a run.
const menuShot = (name, action) => ({
  name,
  query: 'seed=6&coins=5000',
  wait: 0,
  script: async (page, snap) => {
    await page.waitForSelector('[data-screen="start"] [data-action="gacha"]', { timeout: 60000 });
    await page.waitForTimeout(600);
    if (action === '') {
      await page.hover('[data-screen="start"] [data-action="gacha"]');
      await page.waitForTimeout(200);
      await snap('');
      return;
    }
    await page.click(`[data-screen="start"] [data-action="${action}"]`);
    await page.waitForTimeout(700);
    await snap('');
  },
});
SETS.ui = [
  menuShot('menu', ''),
  menuShot('pokedex', 'collection'),
  menuShot('ajustes', 'settings'),
  menuShot('creditos', 'credits'),
  {
    name: 'hud',
    query: `starter=pikachu&seed=1&wave=3&team=${TEAM}&ballLevel=3`,
    wait: 6000,
  },
  {
    name: 'cartas',
    query: 'starter=charmander&ballLevel=2&offers=growth&seed=9',
    wait: 1500,
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

// --headed: a visible browser. Headless Edge does not always advance long CSS animations between
// screenshots (the stepped reveal of the gacha), so those captures are taken headed.
const browser = await chromium.launch({ executablePath, headless: !args.includes('--headed') });
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
    // `script`: a sequence of its own, with `snap(suffix)` to take each capture.
    if (shot.script) {
      await shot.script(page, (suffix) =>
        page.screenshot({
          path: join(outDir, `${prefix}-${shot.name}${suffix ? `-${suffix}` : ''}-${device}.png`),
        }),
      );
      console.log(`${shot.name}${errors.length > 0 ? ` ERRORS: ${errors.join(' | ')}` : ''}`);
      await context.close();
      continue;
    }
    await page.waitForTimeout(shot.wait);
    // `waitFor`: a condition on window.__debug() that starts the frames (e.g. the moment a strike lands).
    if (shot.waitFor) {
      // A string is evaluated as an expression: the arrow function has to be called, not returned.
      await page.waitForFunction(`(${shot.waitFor})()`, undefined, {
        timeout: 90000,
        polling: 'raf',
      });
    }
    if (shot.press) await page.keyboard.press(shot.press);
    if (shot.click) await page.locator(shot.click).first().click();
    // `after`: a second condition after the click (e.g. the moment opened by it).
    if (shot.after) {
      await page.waitForFunction(`(${shot.after})()`, undefined, {
        timeout: 30000,
        polling: 'raf',
      });
    }
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
