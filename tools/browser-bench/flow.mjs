// The whole flow of the meta (4G-I, 4G-J; 4X) in a real Edge with a fresh profile: the professor's
// tutorial -> the first Pokémon (the four classics are yours) -> run -> a wild Pokémon joins at the
// first level-up -> a weakened boss is captured -> coins, fragments and the Pokédex mark at the end ->
// gacha x1 and x10 -> the legendary banner with a key (?debug&keys) -> collection -> a new run with
// another Pokémon of the collection.
//   node tools/browser-bench/flow.mjs --out <dir> [--no-build] [--only <tag>]
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const argOf = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = argOf('--out', 'flow-4gj');
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
if (!args.includes('--no-build')) await build({ logLevel: 'error' });
const server = await preview({ preview: { port: 4188, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless: false });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};
/** [tag, viewport, touch, extra query] */
const DEVICES = [
  ['escritorio', { width: 1280, height: 800 }, false, ''],
  ['movil-a', { width: 844, height: 390 }, true, '&layout=a'],
  ['movil-b', { width: 844, height: 390 }, true, '&layout=b'],
  ['tablet', { width: 1180, height: 820 }, true, ''],
].filter(([tag]) => only === '' || tag === only);
try {
  for (const [tag, viewport, touch, extra] of DEVICES) {
    const context = await browser.newContext({
      viewport,
      ...(touch ? { deviceScaleFactor: 2, hasTouch: true, isMobile: true } : {}),
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A fresh profile, with coins for a x1 and a x10 (?debug&coins) and two legendary keys.
    await page.goto(`http://127.0.0.1:4188/?debug&seed=6&coins=1100&keys=2${extra}`);
    await page.waitForSelector('[data-screen="start"] [data-action="play"]');
    const tap = (selector) => (touch ? page.tap(selector) : page.click(selector));
    // 1. First time: the professor's tutorial, a page at a time.
    await tap('[data-screen="start"] [data-action="play"]');
    await page.waitForSelector('[data-professor]');
    await page.screenshot({ path: join(outDir, `1-tutorial-${tag}.png`) });
    let pages = 0;
    while ((await page.$('[data-action="tutorialNext"]')) !== null && pages < 12) {
      await tap('[data-action="tutorialNext"]');
      pages += 1;
    }
    check(`${tag}: the tutorial has its pages`, pages >= 4, `${pages} pages`);
    // 2. The first Pokémon: 4X, the four classics, all of them yours already.
    await page.waitForSelector('[data-screen="starters"] [data-starter]');
    const offered = await page.$$eval('[data-screen="starters"] [data-starter]', (bs) =>
      bs.map((b) => b.dataset.starter),
    );
    check(
      `${tag}: first time, the four classics`,
      offered.length === 4 && offered.includes('charmander') && offered.includes('pikachu'),
      `${offered.join(',')}`,
    );
    await tap('[data-screen="starters"] [data-starter="charmander"]');
    await page.waitForSelector('[data-starter-detail="charmander"]');
    await page.screenshot({ path: join(outDir, `2-primer-pokemon-${tag}.png`) });
    await tap('[data-action="choose"]');
    await page.waitForFunction(() => window.__debug().screen === 'playing');
    check(
      `${tag}: the run starts with the chosen starter`,
      (await page.evaluate(() => window.__debug().starter)) === 'charmander',
    );
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, `3-partida-${tag}.png`) });
    // 3. 4X: the first level-up is a join encounter: three wild Pokémon, take one, its moment, then
    // the cards of the level.
    await page.evaluate(() => window.__levelUp());
    await page.waitForSelector('[data-join-option="0"]', { timeout: 8000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(outDir, `3b-se-quiere-unir-${tag}.png`) });
    await tap('[data-join-option="0"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, `3c-se-une-${tag}.png`) });
    await page.waitForSelector('button[data-card="0"]', { timeout: 8000 });
    await page.waitForTimeout(900);
    await tap('button[data-card="0"]');
    // Answer whatever else comes (a second level of the experience of the run) until it plays.
    for (let i = 0; i < 30; i++) {
      const s = await page.evaluate(() => window.__debug());
      if (s.phase === 'playing') break;
      if ((await page.$('[data-join-option="0"]')) !== null) await tap('[data-join-option="0"]');
      else if ((await page.$('button[data-card="0"]')) !== null) await tap('button[data-card="0"]');
      else if ((await page.$('[data-replace-release]')) !== null)
        await tap('[data-replace-release]');
      await page.waitForTimeout(1200);
    }
    const joined = await page.evaluate(() => window.__debug().team);
    check(`${tag}: a wild Pokémon joined the team`, joined >= 2, String(joined));
    // 4. 4X: a weakened boss: wait for a narrow ring, throw inside it.
    await page.evaluate(() => window.__catch('machoke'));
    await page.waitForFunction(() => window.__debug().phase === 'catch', null, { timeout: 5000 });
    await page.waitForSelector('[data-catch-ring]', { state: 'visible', timeout: 5000 });
    await page.screenshot({ path: join(outDir, `3d-captura-${tag}.png`) });
    let thrown = false;
    for (let i = 0; i < 100 && !thrown; i++) {
      const view = await page.evaluate(() => {
        const ring = document.querySelector('[data-catch-ring]')?.getBoundingClientRect();
        const sprite = document.querySelector('[data-catch-sprite]')?.getBoundingClientRect();
        return ring && sprite
          ? {
              ring: ring.width,
              body: sprite.width,
              x: sprite.left + sprite.width / 2,
              y: sprite.top + sprite.height / 2,
            }
          : null;
      });
      if (view !== null && view.ring < view.body * 1.05) {
        if (touch) await page.touchscreen.tap(view.x, view.y);
        else await page.mouse.click(view.x, view.y);
        thrown = true;
      } else {
        await page.waitForTimeout(40);
      }
    }
    check(`${tag}: the sphere was thrown inside the ring`, thrown);
    await page.waitForTimeout(2800);
    const caught = await page.evaluate(() => window.__debug().phase);
    if (caught === 'replace') await tap('[data-replace-release]');
    // 5. The run ends: coins, candies, fragments and the bosses captured (nothing registered).
    await page.evaluate(() => window.__lose());
    await page.waitForSelector('[data-screen="results"] [data-reward]', { timeout: 15000 });
    const reward = await page.textContent('[data-reward]');
    check(`${tag}: the results say the coins earned`, /monedas/.test(reward ?? ''), reward ?? '');
    check(
      `${tag}: the results say what the run leaves (no registering)`,
      (await page.$('[data-run-rewards]')) !== null && (await page.$('[data-register]')) === null,
    );
    await page.screenshot({ path: join(outDir, `4-resultados-${tag}.png`) });
    const p1 = await page.evaluate(() => window.__profile());
    const owned1 = Object.keys(p1.owned).sort();
    check(
      `${tag}: the collection is the four classics, nothing of the run joined it`,
      owned1.join() === 'bulbasaur,charmander,pikachu,squirtle',
      owned1.join(),
    );
    // 4. The gacha: a x1 and a x10.
    await page.keyboard.press('KeyM');
    await page.waitForSelector('[data-screen="start"] [data-action="gacha"]');
    // The title with the player's card and the parade (4G-J, block 6).
    check(
      `${tag}: the menu shows the player's card`,
      (await page.$('[data-trainer-card]')) !== null,
    );
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, `4b-menu-${tag}.png`) });
    await tap('[data-screen="start"] [data-action="gacha"]');
    await page.waitForSelector('[data-banner-art]');
    await page.screenshot({ path: join(outDir, `5-gacha-${tag}.png`) });
    await tap('[data-draw="1"]');
    await page.waitForSelector('[data-reveal-card]', { timeout: 5000 });
    await tap('[data-action="revealDone"]');
    await tap('[data-draw="10"]');
    await page.waitForSelector('[data-reveal-card]', { timeout: 5000 });
    await page.waitForTimeout(1300);
    const ten = await page.$$eval('[data-reveal-card]', (c) => c.length);
    check(`${tag}: a x10 reveals ten`, ten === 10, String(ten));
    await page.screenshot({ path: join(outDir, `6-gacha-x10-${tag}.png`) });
    await tap('[data-action="revealDone"]');
    const profile = await page.evaluate(() => window.__profile());
    check(
      `${tag}: eleven draws, paid and kept`,
      profile.gacha.draws === 11 &&
        profile.coins < 100 + 1100 &&
        profile.gacha.history.length === 11,
      `${profile.gacha.draws} draws, ${profile.coins} coins`,
    );
    // 4X: the legendary banner: a key opens one draw (a legendary or a ★5 / ★4).
    await tap('[data-gacha-tab^="legend@"]');
    await page.waitForSelector('[data-draw="key"]');
    await page.screenshot({ path: join(outDir, `6b-legendario-${tag}.png`) });
    await tap('[data-draw="key"]');
    await page.waitForSelector('[data-reveal-card]', { timeout: 6000 });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: join(outDir, `6c-llave-${tag}.png`) });
    await tap('[data-action="revealDone"]');
    const afterKey = await page.evaluate(() => window.__profile());
    check(
      `${tag}: a key spent its fragments and gave a ★4 or better`,
      afterKey.legend.draws === 1 &&
        afterKey.legend.fragments === profile.legend.fragments - 3 &&
        afterKey.gacha.history[0].stars >= 4,
      `${afterKey.legend.fragments} fragments, ★${afterKey.gacha.history[0].stars}`,
    );
    const owned2 = Object.keys(afterKey.owned);
    check(`${tag}: the gacha adds to the collection`, owned2.length >= 5, `${owned2.length}`);
    // 5. The collection.
    await page.keyboard.press('KeyM');
    await tap('[data-screen="start"] [data-action="collection"]');
    await page.waitForSelector('[data-dex-counts]');
    // 4G-J: the candies are one tap away (open by themselves while the collection is new).
    await tap('[data-action="candyHelp"]');
    check(`${tag}: the collection explains candies`, (await page.$('[data-candy-help]')) !== null);
    await tap('[data-action="candyHelp"]');
    const ownedTiles = await page.$$eval('[data-dex-state="owned"]', (t) => t.length);
    check(`${tag}: the Pokédex shows what you have`, ownedTiles === owned2.length, `${ownedTiles}`);
    await page.screenshot({ path: join(outDir, `7-pokedex-${tag}.png`) });
    // The filters: a type and a generation narrow the grid; "only mine" leaves only yours.
    const all = Number(await page.getAttribute('[data-dex-grid]', 'data-dex-grid'));
    // 4W, block 5: a search by name finds one, and keeps the focus while typing.
    await page.fill('[data-screen="collection"] [data-dex-search]', 'charman');
    const found = Number(await page.getAttribute('[data-dex-grid]', 'data-dex-grid'));
    const focused = await page.evaluate(() =>
      document.activeElement?.hasAttribute('data-dex-search'),
    );
    check(`${tag}: the search by name finds it`, found === 1 && focused === true, `${found}`);
    await page.fill('[data-screen="collection"] [data-dex-search]', '');
    // On a narrow screen the filters are folded under one button. The choice of a starter has a
    // panel of its own (hidden here), so every control is looked for inside the collection.
    const dexUi = (sel) => `[data-screen="collection"] ${sel}`;
    if ((await page.$(dexUi('[data-filters-toggle="closed"]'))) !== null) {
      await tap(dexUi('[data-filters-toggle="closed"]'));
    }
    await tap(dexUi('[data-filter-type="fire"]'));
    const fire = Number(await page.getAttribute('[data-dex-grid]', 'data-dex-grid'));
    await tap(dexUi('[data-filter-gen="1"]'));
    const fireKanto = Number(await page.getAttribute('[data-dex-grid]', 'data-dex-grid'));
    check(
      `${tag}: the filters by type and generation narrow the Pokédex`,
      all > fire && fire > fireKanto && fireKanto > 0,
      `${all} > ${fire} > ${fireKanto}`,
    );
    await page.screenshot({ path: join(outDir, `7-pokedex-filtros-${tag}.png`) });
    await tap(dexUi('[data-filter-type="fire"]'));
    await tap(dexUi('[data-filter-gen="1"]'));
    await tap(dexUi('[data-filter-mine]'));
    const mine = Number(await page.getAttribute('[data-dex-grid]', 'data-dex-grid'));
    check(`${tag}: "only mine" shows your collection`, mine === owned2.length, `${mine}`);
    await tap('[data-dex-state="owned"]');
    await page.waitForSelector('[data-dex-card]');
    await page.screenshot({ path: join(outDir, `7-ficha-${tag}.png`) });
    await tap(dexUi('[data-filter-mine]'));
    // 6. A new run with another Pokémon: only the collection is offered now.
    await page.keyboard.press('KeyM');
    await tap('[data-screen="start"] [data-action="play"]');
    await page.waitForSelector('[data-screen="starters"] [data-starter]');
    const choices = await page.$$eval('[data-screen="starters"] [data-starter]', (bs) =>
      bs.map((b) => b.dataset.starter),
    );
    check(
      `${tag}: after the first time, only the collection is offered`,
      choices.length === owned2.length && choices.every((c) => owned2.includes(c)),
      `${choices.length}`,
    );
    const other = choices.find((c) => c !== 'charmander');
    await tap(`[data-screen="starters"] [data-starter="${other}"]`);
    await tap('[data-action="choose"]');
    await page.waitForFunction(() => window.__debug().screen === 'playing');
    const s = await page.evaluate(() => window.__debug());
    check(`${tag}: a new run with another Pokémon (${other})`, s.starter === other, s.starter);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, `8-otra-partida-${tag}.png`) });
    check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(failures.length === 0 ? '\nALL PASS' : `\n${failures.length} FAILED`);
process.exitCode = failures.length === 0 ? 0 : 1;
