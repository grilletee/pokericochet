// Plays the game in a real browser for a few seconds: keyboard, pointer, spawning, rendering.
// Fails on any page error. Saves a screenshot.
//
//   pnpm smoke -- --out screenshot.png [--headless]
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const args = process.argv.slice(2);
const headless = args.includes('--headless');
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? args[outIndex + 1] : 'smoke.png';

const executablePath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!executablePath) throw new Error('No browser found. Set BROWSER_PATH.');

await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4174, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ executablePath, headless });
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

try {
  const page = await browser.newPage({ viewport: { width: 540, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('http://127.0.0.1:4174/?debug&seed=123&starter=charmander');
  await page.bringToFront();
  await page.waitForFunction(() => typeof window.__debug === 'function');
  const state = () => page.evaluate(() => window.__debug());
  const hold = async (key, ms) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  };

  check('canvas is on the page', (await page.locator('canvas').count()) === 1);
  const s0 = await state();
  await hold('ArrowRight', 700);
  const s1 = await state();
  check(
    'ArrowRight moves the player right',
    s1.playerX > s0.playerX + 20,
    `${s0.playerX} -> ${s1.playerX}`,
  );
  await hold('KeyA', 700);
  const s2 = await state();
  check('A moves the player left', s2.playerX < s1.playerX - 20, `${s1.playerX} -> ${s2.playerX}`);

  const box = await page.locator('canvas').boundingBox();
  // A press on the floor strip (below the defence line) steers; anywhere above it aims (ADR-021).
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.94);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  const s3 = await state();
  await page.mouse.up();
  check(
    'holding the pointer on the floor on the right steers right',
    s3.playerX > s2.playerX + 20,
    `${s2.playerX} -> ${s3.playerX}`,
  );

  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.waitForTimeout(150);
  const aimed = await state();
  check(
    'pointing the mouse above the floor sets the aim point',
    aimed.aimX < 140 && aimed.aimY > 150 && aimed.aimY < 300,
    `aim ${aimed.aimX},${aimed.aimY}`,
  );
  check('the assisted aim is off by default', aimed.autoAim === false);
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(150);
  check('T switches the assisted aim on', (await state()).autoAim === true);
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(150);
  check('T switches it off again', (await state()).autoAim === false);
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3);

  // Balls leave through the bottom, wait on the floor and come back when collected.
  let sawPickup = false;
  for (let i = 0; i < 80 && !sawPickup; i++) {
    sawPickup = (await state()).pickups > 0;
    if (!sawPickup) await page.waitForTimeout(250);
  }
  check('a ball that leaves the arena waits on the floor as a pickup', sawPickup);

  const t0 = Date.now();
  const before = await state();
  await page.waitForTimeout(6000);
  const after = await state();
  const seconds = (Date.now() - t0) / 1000;
  const rate = (after.tick - before.tick) / seconds;
  check('simulation runs at ~60 ticks/s', rate > 54 && rate < 66, `${rate.toFixed(1)} ticks/s`);
  check('enemies spawn and balls fly', after.enemies > 0 || after.balls > 0, JSON.stringify(after));
  await page.screenshot({ path: outFile });
  console.log(`screenshot: ${outFile}`);

  // Card choice: start with enough xp to level up at once, then pick with the keyboard and
  // with the mouse, in two fresh pages.
  const cardsPage = async (query) => {
    const p = await browser.newPage({ viewport: { width: 540, height: 820 } });
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    // xp must equal the first entry of progression.levelCosts (18) to trigger exactly one level-up.
    await p.goto(`http://127.0.0.1:4174/?debug&starter=charmander&xp=18&${query}`);
    await p.bringToFront();
    await p.waitForFunction(() => typeof window.__debug === 'function');
    return p;
  };

  // ?tune: the live panel opens, a slider changes the game and the choice is remembered.
  const tunePage = await browser.newPage({ viewport: { width: 540, height: 820 } });
  tunePage.on('pageerror', (e) => errors.push(e.message));
  tunePage.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await tunePage.goto('http://127.0.0.1:4174/?debug&tune&starter=charmander&seed=3');
  await tunePage.waitForFunction(() => typeof window.__debug === 'function');
  check(
    '?tune shows the Ajustes button',
    (await tunePage.locator('[data-tune-toggle]').count()) === 1,
  );
  check(
    'without ?tune there is no panel',
    (await page.locator('[data-tune-toggle]').count()) === 0,
  );
  await tunePage.locator('[data-tune-toggle]').click();
  check(
    'the panel opens with 53 sliders (31 general, boss health and 21 for the wave curve)',
    (await tunePage.locator('input[data-tune]').count()) === 53,
  );
  await tunePage.locator('input[data-tune="captureChance"]').fill('0.5');
  const tuneStored = await tunePage.evaluate(() => window.localStorage.getItem('tune.v1'));
  check(
    'a changed knob is remembered',
    tuneStored !== null && JSON.parse(tuneStored).captureChance === 0.5,
  );
  await tunePage.close();

  const byKey = await cardsPage('seed=7');
  await byKey.waitForSelector('button[data-card]');
  const offered = await byKey.locator('button[data-card]').count();
  check('level-up shows 3 cards', offered === 3, `${offered} buttons`);
  const pausedTick = (await byKey.evaluate(() => window.__debug())).tick;
  await byKey.waitForTimeout(600);
  const stillPaused = (await byKey.evaluate(() => window.__debug())).tick === pausedTick;
  check('the game waits while the cards are shown', stillPaused);
  await byKey.screenshot({ path: outFile.replace('.png', '-cards.png') });
  await byKey.keyboard.press('Digit2');
  await byKey.waitForFunction(() => window.__debug().phase === 'playing');
  const afterKey = await byKey.evaluate(() => window.__debug());
  check(
    'key 2 picks a card and play resumes at level 2',
    afterKey.level === 2,
    JSON.stringify(afterKey),
  );
  check(
    'the card buttons disappear after picking',
    (await byKey.locator('button[data-card]').count()) === 0,
  );

  const byClick = await cardsPage('seed=8');
  await byClick.waitForSelector('button[data-card]');
  await byClick.locator('button[data-card]').first().click();
  await byClick.waitForFunction(() => window.__debug().phase === 'playing');
  check(
    'clicking a card picks it and play resumes',
    (await byClick.evaluate(() => window.__debug())).level === 2,
  );

  // A page helper for the screens: opens the game with the given query and waits for it.
  const open = async (query, size = { width: 540, height: 820 }) => {
    const p = await browser.newPage({ viewport: size });
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await p.goto(`http://127.0.0.1:4174/?debug&${query}`);
    await p.bringToFront();
    await p.waitForFunction(() => typeof window.__debug === 'function');
    return p;
  };
  const dbg = (p) => p.evaluate(() => window.__debug());

  // Title screen: the game waits, there are four starters, and a key or a click starts the run.
  const title = await open('seed=5');
  await title.waitForSelector('button[data-starter]');
  check(
    'the title screen offers 4 starters',
    (await title.locator('button[data-starter]').count()) === 4,
  );
  const idleTick = (await dbg(title)).tick;
  await title.waitForTimeout(500);
  const idle = await dbg(title);
  check(
    'the game does not run on the title screen',
    idle.tick === idleTick && idle.screen === 'menu',
  );
  await title.screenshot({ path: outFile.replace('.png', '-title.png') });
  await title.keyboard.press('Digit3');
  await title.waitForFunction(() => window.__debug().screen === 'playing');
  check('key 3 starts the run with Bulbasaur', (await dbg(title)).starter === 'bulbasaur');
  check(
    'the title screen is gone once playing',
    (await title.locator('button[data-starter]:visible').count()) === 0,
  );
  const clicked = await open('seed=6');
  await clicked.locator('button[data-starter="pikachu"]').click();
  await clicked.waitForFunction(() => window.__debug().screen === 'playing');
  check('clicking Pikachu starts the run with Pikachu', (await dbg(clicked)).starter === 'pikachu');

  // Credits: reachable from the title screen, with the affiliation notice and both sources.
  const creditsPage = await open('seed=11');
  await creditsPage.waitForSelector('button[data-starter]');
  const footer = (await creditsPage.locator('[data-screen="start"]').textContent()) ?? '';
  check('the title screen carries the affiliation notice', footer.includes('No está afiliado'));
  await creditsPage.locator('button[data-action="credits"]').click();
  await creditsPage.waitForFunction(() => window.__debug().screen === 'credits');
  const creditsText = (await creditsPage.locator('[data-screen="credits"]').textContent()) ?? '';
  check(
    'the credits name PokéAPI, PokeAPI/sprites and the rights holders',
    creditsText.includes('PokéAPI') &&
      creditsText.includes('PokeAPI/sprites') &&
      creditsText.includes('The Pokémon Company') &&
      creditsText.includes('sin ánimo de lucro'),
  );
  await creditsPage.screenshot({ path: outFile.replace('.png', '-credits.png') });
  await creditsPage.keyboard.press('Escape');
  await creditsPage.waitForFunction(() => window.__debug().screen === 'menu');
  check('Escape goes back from the credits to the title screen', true);

  // Sound switch: present, and the choice is remembered.
  await creditsPage.locator('[data-sound-toggle]').click();
  check(
    'the sound switch saves the choice',
    (await creditsPage.evaluate(() => window.localStorage.getItem('muted.v1'))) === '1',
  );

  // Growth: a training card gives a level; at level 3 the Pokémon evolves (new form, second ball).
  const evo = await open('starter=charmander&ballLevel=2&offers=growth&seed=9');
  await evo.waitForFunction(() => window.__debug().phase === 'levelup');
  const trainCard = evo.locator('button[data-card="0"]');
  const trainText = (await trainCard.textContent()) ?? '';
  check(
    'the training card names the Pokémon, the level and the evolution',
    trainText.includes('Entrenar a Charmander') &&
      trainText.includes('Nv 2 → 3') &&
      trainText.includes('evoluciona'),
    trainText,
  );
  check('the training card shows the Pokémon', (await trainCard.locator('img').count()) === 1);
  await evo.screenshot({ path: outFile.replace('.png', '-growth-cards.png') });
  const levelBefore = await dbg(evo);
  await trainCard.click();
  await evo.waitForFunction(() => window.__debug().phase === 'playing');
  const levelAfter = await dbg(evo);
  check(
    'training gives a ball: the level-3 Pokémon fires two',
    levelBefore.loadout === 1 && levelAfter.loadout === 2,
  );
  const evoText = (await evo.locator('[data-banner]').textContent()) ?? '';
  check(
    'a banner says who evolved into what',
    (await evo.locator('[data-banner]').isVisible()) &&
      evoText.includes('Charmander') &&
      evoText.includes('Charmeleon'),
    evoText,
  );
  check('the banner shows the sprites', (await evo.locator('[data-banner] img').count()) === 2);
  const pausedAt = (await dbg(evo)).tick;
  await evo.waitForTimeout(400);
  check('evolving never pauses the game', (await dbg(evo)).tick > pausedAt);
  check(
    'the team bar shows one Pokémon, still one, with its level',
    (await evo.locator('[data-team-bar] img').count()) === 1 &&
      ((await evo.locator('[data-team-bar]').textContent()) ?? '').includes('Nv3'),
  );
  await evo.screenshot({ path: outFile.replace('.png', '-evolution.png') });

  // Capture with room in the team: the Pokémon joins and flies into the bar.
  const cap = await open('starter=charmander&capture=growlithe&seed=9');
  await cap.waitForFunction(() => window.__debug().team === 2);
  check('the captured Pokémon joins the team', true);
  const capToast = (await cap.locator('body').textContent()) ?? '';
  check('a message names the captured species', capToast.includes('Growlithe'));
  await cap.waitForTimeout(1200);
  check(
    'the team bar shows both Pokémon once the sprite has landed',
    (await cap.locator('[data-team-bar] img').count()) === 2,
  );
  await cap.screenshot({ path: outFile.replace('.png', '-capture.png') });

  // Replace screen: with six Pokémon a capture pauses the run and asks.
  const FULL = 'charmander,squirtle,bulbasaur,pikachu,vulpix,psyduck';
  const rep = await open(`starter=charmander&team=${FULL}&capture=growlithe&seed=9`);
  await rep.waitForFunction(() => window.__debug().phase === 'replace');
  const repText = (await rep.locator('[data-replace]').textContent()) ?? '';
  check(
    'the replace screen names the capture and says the team is full',
    (await rep.locator('[data-replace]').isVisible()) &&
      repText.includes('Growlithe') &&
      repText.includes('completo'),
    repText,
  );
  check(
    'it offers the six Pokémon and a release button',
    (await rep.locator('[data-replace-slot]').count()) === 6 &&
      (await rep.locator('[data-replace-release]').count()) === 1,
  );
  const paused = (await dbg(rep)).tick;
  await rep.waitForTimeout(400);
  check('the run is paused while it waits', (await dbg(rep)).tick === paused);
  const tall = await rep.locator('[data-replace-slot="2"]').boundingBox();
  check(
    'the buttons are big enough to touch (at least 44 px)',
    tall !== null && tall.height >= 44 && tall.width >= 44,
    JSON.stringify(tall),
  );
  await rep.screenshot({ path: outFile.replace('.png', '-replace.png') });
  await rep.locator('[data-replace-slot="2"]').click();
  await rep.waitForFunction(() => window.__debug().phase === 'playing');
  const swapped = await dbg(rep);
  check(
    'choosing a Pokémon swaps it and the run goes on',
    swapped.team === 6 && swapped.pendingCapture === '',
  );
  check(
    'the bar shows the newcomer and its message',
    ((await rep.locator('body').textContent()) ?? '').includes('reemplaza'),
  );
  const rel = await open(`starter=charmander&team=${FULL}&capture=growlithe&seed=9`);
  await rel.waitForFunction(() => window.__debug().phase === 'replace');
  await rel.keyboard.press('Digit0');
  await rel.waitForFunction(() => window.__debug().phase === 'playing');
  check('the 0 key lets the capture go', (await dbg(rel)).team === 6);
  const num = await open(`starter=charmander&team=${FULL}&capture=growlithe&seed=9`);
  await num.waitForFunction(() => window.__debug().phase === 'replace');
  await num.keyboard.press('Digit5');
  await num.waitForFunction(() => window.__debug().phase === 'playing');
  check(
    'a number key swaps that Pokémon',
    ((await num.locator('body').textContent()) ?? '').includes('reemplaza a Vulpix'),
  );

  // Themed waves: the first wave is announced with its theme, its type and what beats it.
  const themePage = await open('starter=charmander&seed=9');
  await themePage.waitForTimeout(300);
  const themeText = (await themePage.locator('body').textContent()) ?? '';
  check(
    'the first wave is announced with its theme and the types that beat it',
    /Oleada 1: .+\(.+\) · le gana/.test(themeText),
    themeText.slice(0, 200),
  );
  await themePage.screenshot({ path: outFile.replace('.png', '-theme.png') });

  // Boss: jumping to the last wave brings it in, with its health bar.
  const bossPage = await open('starter=pikachu&wave=7&seed=3');
  await bossPage.waitForFunction(() => window.__debug().bossMaxHp > 0);
  check('the boss appears after the last wave', true);
  await bossPage.waitForTimeout(400);
  check('the boss bar is visible', await bossPage.locator('[data-boss-bar]').isVisible());
  check(
    'the final boss is a legendary named on its bar',
    /(Moltres|Kyogre|Virizion|Zapdos)/.test(
      (await bossPage.locator('[data-boss-bar]').textContent()) ?? '',
    ),
  );
  await bossPage.screenshot({ path: outFile.replace('.png', '-boss.png') });

  // End of run: results screen, best run in localStorage, and the two ways to go on.
  const end = await open('starter=charmander&hp=0&seed=2');
  await end.waitForFunction(() => window.__debug().screen === 'results');
  const resultsText = await end.locator('[data-screen="results"]').textContent();
  check(
    'the results screen shows the defeat, the seed and the starter',
    (resultsText ?? '').includes('Derrota') &&
      (resultsText ?? '').includes('Semilla: 2') &&
      (resultsText ?? '').includes('Charmander'),
    (resultsText ?? '').replace(/\n/g, ' | '),
  );
  const stored = await end.evaluate(() => window.localStorage.getItem('bestRun.v1'));
  check(
    'the best run was saved with its seed',
    stored !== null && JSON.parse(stored).seed === 2,
    String(stored),
  );
  await end.screenshot({ path: outFile.replace('.png', '-results.png') });
  await end.keyboard.press('KeyR');
  await end.waitForFunction(() => window.__debug().screen === 'playing');
  check('R starts a new run with the same starter', (await dbg(end)).starter === 'charmander');
  const again = await open('starter=charmander&hp=0&seed=2');
  await again.waitForFunction(() => window.__debug().screen === 'results');
  await again.locator('button[data-action="menu"]').click();
  await again.waitForFunction(() => window.__debug().screen === 'menu');
  check('the menu button goes back to the title screen', true);

  check('no page or console errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
if (failures.length > 0) {
  console.error(`FAILED: ${failures.join(', ')}`);
  process.exit(1);
}
