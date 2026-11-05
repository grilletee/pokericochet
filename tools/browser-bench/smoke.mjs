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
    'the panel opens with 64 sliders (42 general, boss health and 21 for the wave curve)',
    (await tunePage.locator('input[data-tune]').count()) === 64,
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
  // The signature of each starter is announced before choosing (4F-D).
  const signatures = await title.locator('[data-signature]').allTextContents();
  check(
    'every starter shows its signature move with its shape and the form it starts with',
    signatures.length === 4 &&
      signatures.every((text) => text.startsWith('Ultimate: ') && text.includes('la lanzas tú')) &&
      signatures.some((text) => text.includes('Lanzallamas') && text.includes('cruz')),
    signatures.join(' | '),
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

  // The evolution pause can be skipped with a key (and a tap), after a short grace (4H-B1).
  for (const how of ['key', 'tap']) {
    const skip = await open('starter=charmander&ballLevel=2&offers=growth&seed=9');
    await skip.waitForFunction(() => window.__debug().phase === 'levelup');
    await skip.locator('button[data-card="0"]').click();
    await skip.waitForFunction(() => window.__debug().phase === 'playing');
    const moment2 = skip.locator('[data-evolution-moment]');
    check(`(${how}) the evolution moment is up before the skip`, await moment2.isVisible());
    const stoppedAt = (await dbg(skip)).tick;
    await skip.waitForTimeout(450); // past the grace
    if (how === 'key') await skip.keyboard.press('Space');
    else await skip.mouse.click(270, 400);
    await skip.waitForTimeout(250);
    check(`(${how}) it ends at once, long before its two seconds`, !(await moment2.isVisible()));
    await skip.waitForTimeout(300);
    check(`(${how}) and the game goes on`, (await dbg(skip)).tick > stoppedAt);
    await skip.close();
  }

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
    'the training card announces the evolution: both forms in the title and the level',
    trainText.includes('¡Charmander evolucionará a Charmeleon!') && trainText.includes('Nv 2 → 3'),
    trainText,
  );
  check(
    'the evolving card shows both forms, big, and stands out in gold',
    (await trainCard.locator('img').count()) === 2 &&
      (await trainCard.getAttribute('data-step')) === 'evolve',
  );
  await evo.screenshot({ path: outFile.replace('.png', '-growth-cards.png') });
  const levelBefore = await dbg(evo);
  await trainCard.click();
  await evo.waitForFunction(() => window.__debug().phase === 'playing');
  const levelAfter = await dbg(evo);
  check(
    'training gives a ball: the level-3 Pokémon fires two',
    levelBefore.loadout === 1 && levelAfter.loadout === 2,
  );
  // The evolution moment (4F-D): slow motion, silhouette, flash and the big name, in the centre.
  const moment = evo.locator('[data-evolution-moment]');
  const momentText = (await moment.textContent()) ?? '';
  check(
    'the evolution moment is on screen and names who evolves',
    (await moment.isVisible()) && momentText.includes('Charmander'),
    momentText,
  );
  check('it draws both forms', (await moment.locator('img').count()) === 2);
  await evo.waitForFunction(
    () => document.querySelector('[data-evolution-moment]')?.textContent?.includes('Charmeleon'),
    undefined,
    { timeout: 3000 },
  );
  check('the flash turns the name into the new form', true);
  await evo.screenshot({ path: outFile.replace('.png', '-moment.png') });
  // The game is stopped for about two seconds (4H-B1): no tick while the moment is up.
  const pausedAt = (await dbg(evo)).tick;
  await evo.waitForTimeout(200);
  check('evolving stops the game while it plays', (await dbg(evo)).tick === pausedAt);
  await evo.waitForFunction(
    () => getComputedStyle(document.querySelector('[data-evolution-moment]')).display === 'none',
    undefined,
    { timeout: 4000 },
  );
  check('the moment ends by itself', true);
  await evo.waitForTimeout(300);
  check('and the game goes on afterwards', (await dbg(evo)).tick > pausedAt);
  const barText = (await evo.locator('[data-team-bar]').textContent()) ?? '';
  check(
    'the team bar shows one Pokémon, still one, with its level and the name of its CURRENT form',
    (await evo.locator('[data-team-bar] img').count()) === 1 &&
      barText.includes('Nv3') &&
      barText.includes('Charmeleon') &&
      !barText.includes('Charmander'),
    barText,
  );
  check(
    'the tile has no charge bar any more: it glows instead (4F-D)',
    (await evo.locator('[data-team-bar] [data-charge]').count()) === 0 &&
      (await evo.locator('[data-team-tile="0"]').getAttribute('data-glow')) !== null,
  );

  // The sheet of a Pokémon (from its small "i"): real stats, its move, and the game waits.
  await evo.locator('[data-team-info="0"]').click();
  const sheetText = (await evo.locator('[data-sheet]').textContent()) ?? '';
  check(
    'clicking a Pokémon of the team opens its sheet with six stat bars and its move',
    (await evo.locator('[data-sheet]').isVisible()) &&
      (await evo.locator('[data-sheet] [data-stat]').count()) === 6 &&
      sheetText.includes('Charmeleon') &&
      sheetText.includes('Lanzallamas'),
    sheetText,
  );
  const sheetTick = (await dbg(evo)).tick;
  await evo.waitForTimeout(400);
  check('the game waits while the sheet is open', (await dbg(evo)).tick === sheetTick);
  await evo.keyboard.press('Escape');
  await evo.waitForTimeout(300);
  check('Escape closes it and the game goes on', (await dbg(evo)).tick > sheetTick);
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
  check(
    'it shows the real stats of the capture and of each Pokémon, and the guard of each choice',
    (await rep.locator('[data-replace] [data-stat-bars]').count()) === 7 &&
      repText.includes('Guardia') &&
      repText.includes('Daño ×'),
    repText.slice(0, 300),
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

  // Moves with a real name (ADR-039): with one hit of charge missing, the next hit casts, the
  // label shows its Spanish name and never more than three labels are on screen at once.
  const moves = await browser.newPage({ viewport: { width: 540, height: 820 } });
  moves.on('pageerror', (e) => errors.push(e.message));
  moves.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await moves.addInitScript(() => window.localStorage.setItem('autoAim.v1', '1'));
  await moves.goto(
    'http://127.0.0.1:4174/?debug&starter=charmander&team=charmander,squirtle,bulbasaur,pikachu,vulpix,psyduck&ballLevel=3&charge=9&wave=2&seed=9',
  );
  await moves.bringToFront();
  await moves.waitForFunction(() => typeof window.__debug === 'function');
  await moves.waitForFunction(() => window.__debug().moveCasts >= 1, undefined, { timeout: 30000 });
  check('a Pokémon casts its move once its charge is full', true);
  const labelText = (await moves.locator('[data-move-labels]').textContent()) ?? '';
  check(
    'the label names a real move in Spanish',
    /(Lanzallamas|Surf|Hoja Afilada|Rayo|Rueda Fuego|Hidropulso|Pistola Agua)/.test(labelText),
    labelText,
  );
  let maxLabels = 0;
  for (let i = 0; i < 40; i++) {
    maxLabels = Math.max(maxLabels, await moves.locator('[data-move-labels] > div').count());
    await moves.waitForTimeout(100);
  }
  const movesState = await dbg(moves);
  check('never more than three labels at once', maxLabels <= 3, `max ${maxLabels}`);
  check(
    'the labels shown plus the ones left out add up to the casts that were offered',
    movesState.moveCasts >= movesState.labelsShown,
    JSON.stringify({
      casts: movesState.moveCasts,
      shown: movesState.labelsShown,
      dropped: movesState.labelsDropped,
    }),
  );
  await moves.screenshot({ path: outFile.replace('.png', '-moves.png') });

  // The starter's signature (4F-D): it waits glowing with its tag, never goes off alone, and the
  // player throws it with its number key or by tapping the portrait.
  for (const how of ['key', 'tap']) {
    const sig = await open('starter=charmander&ballLevel=3&charge=30&wave=2&seed=9');
    await sig.waitForSelector('[data-team-tile="0"][data-glow="ready"]', { timeout: 20000 });
    check(
      `(${how}) the ready signature shows its tag with the key that throws it`,
      (await sig.locator('[data-team-tile="0"] [data-signature-tag]').isVisible()) &&
        (
          (await sig.locator('[data-team-tile="0"] [data-signature-tag]').textContent()) ?? ''
        ).includes('[1]'),
    );
    const readyText = (await sig.locator('[data-banner]').textContent()) ?? '';
    check(
      `(${how}) the first time, a notice says the signature is ready and how to throw it`,
      readyText.includes('Ultimate lista') && readyText.includes('Charmeleon'),
      readyText,
    );
    await sig.waitForTimeout(600);
    check(
      `(${how}) it does not go off by itself`,
      (await dbg(sig)).moveCasts === 0,
      String((await dbg(sig)).moveCasts),
    );
    // Nobody to hit, nothing to throw at: wait for enemies on the field.
    await sig.waitForFunction(() => window.__debug().enemies > 0, undefined, { timeout: 10000 });
    if (how === 'key') await sig.keyboard.press('Digit1');
    // The ready portrait breathes (an endless animation), so the click does not wait for it to rest.
    else await sig.locator('[data-team-tile="0"]').click({ force: true });
    await sig.waitForFunction(() => window.__debug().moveCasts >= 1, undefined, { timeout: 5000 });
    const thrown = (await sig.locator('[data-banner]').textContent()) ?? '';
    check(`(${how}) the first throw shows a big notice`, thrown.includes('¡ULTIMATE!'), thrown);
    check(
      `(${how}) the tag goes away once it is thrown`,
      !(await sig.locator('[data-team-tile="0"] [data-signature-tag]').isVisible()),
    );
    if (how === 'key') await sig.screenshot({ path: outFile.replace('.png', '-signature.png') });
  }

  // Themed waves: the first wave is announced with its theme, its type and what beats it.
  const themePage = await open('starter=charmander&seed=9');
  await themePage.waitForTimeout(300);
  // The wave cartel (4H-B1, ADR-050): its own sign with the theme, the type icons and what is
  // effective; the strip under the HUD always says the wave, the clock and the next boss.
  const cartel = themePage.locator('[data-cartel]');
  const cartelText = (await cartel.textContent()) ?? '';
  check(
    'the first wave is announced by a cartel with its number and its theme',
    (await cartel.isVisible()) && /OLEADA 1\/7 · .+/.test(cartelText),
    cartelText,
  );
  check(
    'the cartel shows the types of the wave as icons and says what is effective',
    (await cartel.locator('[data-type-icon]').count()) >= 2 &&
      (cartelText.includes('Eficaz:') || cartelText.includes('Ningún tipo tiene ventaja')),
    cartelText,
  );
  check(
    'the cartel says which boss comes (the first one is two waves away: none yet)',
    !cartelText.includes('Al acabar'),
    cartelText,
  );
  const stripText = (await themePage.locator('[data-wave-strip]').textContent()) ?? '';
  check(
    'the strip shows the wave, its seconds, and how long until the first boss',
    stripText.includes('Oleada 1/7') &&
      /\d+ s/.test(stripText) &&
      /Jefe 1\/3 en \d:\d\d/.test(stripText),
    stripText,
  );
  check(
    'the strip carries the type icons',
    (await themePage.locator('[data-wave-strip] [data-type-icon]').count()) >= 1,
  );
  check(
    'every tile of the team bar has its effectiveness arrow slot',
    (await themePage.locator('[data-team-tile] [data-tile-edge]').count()) >= 1,
  );
  await themePage.screenshot({ path: outFile.replace('.png', '-theme.png') });
  // A1/A2: the strip is readable on a phone and never lies over the buttons or the team bar.
  const overlaps = (a, b) =>
    a !== null &&
    b !== null &&
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;
  for (const [label, size] of [
    ['desktop', { width: 540, height: 820 }],
    ['phone', { width: 360, height: 640 }],
  ]) {
    const view = await open('starter=charmander&seed=9', size);
    await view.waitForTimeout(400);
    const stripBox = await view.locator('[data-wave-strip]').boundingBox();
    const others = [
      await view.locator('[data-sound-toggle]').boundingBox(),
      await view.locator('[data-aim-toggle]').boundingBox(),
      await view.locator('[data-team-bar]').boundingBox(),
    ];
    check(
      `(${label}) the strip is inside the screen and clear of the buttons and the team bar`,
      stripBox !== null &&
        stripBox.x >= 0 &&
        stripBox.x + stripBox.width <= size.width &&
        others.every((box) => !overlaps(stripBox, box)),
      JSON.stringify({ stripBox, others }),
    );
    if (label === 'phone') await view.screenshot({ path: outFile.replace('.png', '-phone.png') });
    await view.close();
  }
  await themePage.waitForFunction(
    () => getComputedStyle(document.querySelector('[data-cartel]')).display === 'none',
    undefined,
    { timeout: 4000 },
  );
  check('the cartel takes itself down after about two seconds', true);
  check(
    'no toast repeats the wave message',
    !((await themePage.locator('body').textContent()) ?? '').includes('Oleada 1: '),
  );

  // Boss: jumping to the last wave brings it in, with its health bar.
  const bossPage = await open('starter=pikachu&wave=7&seed=3');
  await bossPage.waitForFunction(() => window.__debug().bossMaxHp > 0);
  check('the boss appears after the last wave', true);
  await bossPage.waitForTimeout(400);
  check('the boss bar is visible', await bossPage.locator('[data-boss-bar]').isVisible());
  // Wave 7 jumped to: the wave cartel is up, and the boss one waits its turn behind it (A1).
  await bossPage.waitForFunction(
    () => document.querySelector('[data-cartel]')?.textContent?.includes('JEFE FINAL'),
    undefined,
    { timeout: 6000 },
  );
  check('the boss gets its own cartel, after the wave one, with its name', true);
  check(
    'while a boss lives the strip says which one instead of the clock',
    ((await bossPage.locator('[data-wave-strip]').textContent()) ?? '').includes('Jefe final'),
  );
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
