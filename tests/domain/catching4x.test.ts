import { describe, expect, it } from 'vitest';
import { FIVE_STAR_LINES, gameConfig } from '../../src/data';
import {
  addMember,
  advanceCatch,
  biomeLines,
  catchChance,
  catchPerformance,
  catchRing,
  catchSway,
  checkLevelUp,
  cloneRun,
  createRun,
  damageEnemy,
  drawJoinOffers,
  type GameConfig,
  hashRun,
  joinCandidates,
  joinStage,
  onBossDefeated,
  openBossCatch,
  type Run,
  ringTightness,
  SKIP_JOIN,
  tick,
} from '../../src/domain';
import { makeEnemy } from './fixtures';

/**
 * 4X, block 1 (19th playtest: "hay que rehacer la captura"): an ordinary enemy drops nothing, wild
 * Pokémon of the biome ask to join at some level-ups, and a defeated boss is captured with a throw.
 */
const rules = gameConfig.capture;
const join = rules.join;
const bossRules = rules.boss;
if (join === undefined || bossRules === undefined)
  throw new Error('the shipped game has 4X capture');

function levelUpRun(seed = 3, starter = 'charmander'): Run {
  const run = createRun(gameConfig, seed, starter);
  run.events.length = 0;
  return run;
}

/** Forces the next level-up. */
function levelUp(run: Run): void {
  run.player.xp = run.player.xpNext;
  checkLevelUp(run, gameConfig);
}

function bossRun(seed = 5): { run: Run; boss: ReturnType<typeof makeEnemy> } {
  const run = createRun(gameConfig, seed, 'pikachu');
  run.boss.next = 1;
  run.boss.spawned = false;
  run.boss.tick = 1800;
  run.boss.hpAtSpawn = run.player.hp;
  const boss = makeEnemy({ id: 99, species: 'machoke', type: 'fighting', hp: 0, x: 240, y: 200 });
  boss.radius = 40;
  run.events.length = 0;
  return { run, boss };
}

describe('an ordinary enemy drops nothing (4X)', () => {
  it('a kill draws the capture roll but leaves no ball on the floor, over many kills', () => {
    const run = createRun(gameConfig, 11, 'squirtle');
    for (let i = 0; i < 300; i++) {
      const enemy = makeEnemy({ id: 1000 + i, species: 'rattata', type: 'normal', hp: 1 });
      run.enemies.push(enemy);
      damageEnemy(run, gameConfig, enemy, 5);
    }
    expect(run.pickups).toHaveLength(0);
    expect(run.kills).toBe(300);
  });
});

describe('join encounters at a level-up (4X)', () => {
  it('the first level-up is always one: three different wild Pokémon, never in the team', () => {
    const run = levelUpRun();
    levelUp(run);
    expect(run.phase).toBe('levelup');
    expect(run.offers).toHaveLength(join.options);
    expect(run.offers.every((c) => c.kind === 'join')).toBe(true);
    const species = run.offers.map((c) => (c.kind === 'join' ? c.species : ''));
    expect(new Set(species).size).toBe(join.options);
    expect(species).not.toContain('charmander');
    expect(run.events.some((e) => e.type === 'joinOffer')).toBe(true);
  });

  it('never offers a starter or a pseudo-legendary, over many seeds and waves', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const run = createRun(gameConfig, seed, 'bulbasaur');
      run.wave.index = seed % gameConfig.waves.length;
      for (const card of drawJoinOffers(run, gameConfig, join)) {
        if (card.kind !== 'join') continue;
        expect(FIVE_STAR_LINES).not.toContain(card.species);
        expect(run.pool).toContain(card.species);
      }
    }
    // 120 runs created: slow under the parallel suite.
  }, 60_000);

  it('offers the lines of the biome of the wave whenever the biome has enough of them', () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const run = createRun(gameConfig, seed, 'squirtle');
      const theme = gameConfig.themes?.[run.waveThemes[0] ?? ''];
      if (theme === undefined) continue;
      const biome = new Set(
        biomeLines(gameConfig, run.pool, theme).filter(
          (id) => !join.excluded.includes(id) && id !== 'squirtle',
        ),
      );
      const candidates = joinCandidates(run, gameConfig, join).map((c) => c.species);
      if (biome.size < join.options) continue;
      checked += 1;
      expect(new Set(candidates)).toEqual(biome);
      for (const card of drawJoinOffers(run, gameConfig, join)) {
        if (card.kind === 'join') expect(biome.has(card.species)).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('a Pokémon the team already has never asks to join again', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const run = createRun(gameConfig, seed, 'bulbasaur');
      const first = joinCandidates(run, gameConfig, join).map((c) => c.species);
      const taken = first[0];
      if (taken === undefined) continue;
      addMember(run, gameConfig, taken, 1);
      checked += 1;
      const after = joinCandidates(run, gameConfig, join).map((c) => c.species);
      expect(after, `seed ${seed}`).not.toContain(taken);
      for (const member of run.team) expect(after).not.toContain(member.species);
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('a wild Pokémon joins at the stage the enemies of the wave have', () => {
    const run = levelUpRun();
    run.wave.index = gameConfig.waves.length - 1;
    const stage = joinStage(run, gameConfig);
    expect(stage).toBe(gameConfig.waves.at(-1)?.tier ?? 1);
    for (const card of drawJoinOffers(run, gameConfig, join)) {
      if (card.kind === 'join') expect(card.stage).toBe(stage);
    }
  });

  it('taking one: it joins with its moment (a capture of source "join"), then the cards come', () => {
    const run = levelUpRun();
    levelUp(run);
    const card = run.offers[1];
    if (card?.kind !== 'join') throw new Error('a join encounter');
    run.events.length = 0;
    tick(run, { moveX: 0, action: { type: 'pick', index: 1 } }, gameConfig);
    expect(run.team.map((m) => m.species)).toContain(card.species);
    expect(run.events).toContainEqual(
      expect.objectContaining({ type: 'capture', species: card.species, source: 'join' }),
    );
    expect(run.captured.at(-1)).toMatchObject({ species: card.species, source: 'join' });
    // The encounter came before the cards of the level, not instead of them (4X, measured: the team
    // grows as fast as with the drops of before).
    expect(run.phase).toBe('levelup');
    expect(run.offers.length).toBeGreaterThan(0);
    expect(run.offers.some((c) => c.kind === 'join')).toBe(false);
    expect(run.pendingCards).toBe(false);
    tick(run, { moveX: 0, action: { type: 'pick', index: 0 } }, gameConfig);
    expect(run.phase).toBe('playing');
  });

  it('letting them go brings the usual cards of the level instead', () => {
    const run = levelUpRun();
    levelUp(run);
    run.events.length = 0;
    tick(run, { moveX: 0, action: { type: 'pick', index: SKIP_JOIN } }, gameConfig);
    expect(run.phase).toBe('levelup');
    expect(run.offers.length).toBeGreaterThan(0);
    expect(run.offers.some((c) => c.kind === 'join')).toBe(false);
    expect(run.events).toContainEqual({ type: 'joinSkip' });
    // SKIP_JOIN means nothing on the usual cards: the run keeps waiting.
    const before = hashRun(run);
    tick(run, { moveX: 0, action: { type: 'pick', index: SKIP_JOIN } }, gameConfig);
    expect(hashRun(run)).toBe(before);
  });

  it('with the team full, taking one opens the replace screen for it', () => {
    const run = levelUpRun();
    for (const id of ['squirtle', 'bulbasaur', 'pikachu', 'rattata', 'pidgey']) {
      addMember(run, gameConfig, id, 1);
    }
    expect(run.team).toHaveLength(gameConfig.team.maxMembers);
    run.player.level = join.firstAt - 1;
    levelUp(run);
    const card = run.offers[0];
    if (card?.kind !== 'join') throw new Error('a join encounter');
    tick(run, { moveX: 0, action: { type: 'pick', index: 0 } }, gameConfig);
    expect(run.phase).toBe('replace');
    expect(run.pendingCapture).toMatchObject({ species: card.species, source: 'join' });
    // Whatever the answer, the cards of the level come after it.
    tick(run, { moveX: 0, action: { type: 'release' } }, gameConfig);
    expect(run.phase).toBe('levelup');
    expect(run.offers.some((c) => c.kind === 'join')).toBe(false);
  });

  it('later ones come by chance with bad-luck protection: never a long drought', () => {
    const gaps: number[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const run = levelUpRun(seed);
      let since = 0;
      for (let n = 0; n < 16; n++) {
        levelUp(run);
        const isJoin = run.offers[0]?.kind === 'join';
        run.offers = [];
        run.pendingCards = false;
        run.phase = 'playing';
        if (isJoin) {
          gaps.push(since);
          since = 0;
        } else {
          since += 1;
        }
      }
    }
    // The chance reaches 1 after (1 - chance) / pityStep misses.
    const most = Math.ceil((1 - join.chance) / join.pityStep);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(most);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeGreaterThan(0.5);
    expect(mean).toBeLessThan(3);
  });

  it('is deterministic: the same seed and picks give the same team', () => {
    const a = levelUpRun(9);
    const b = levelUpRun(9);
    for (const run of [a, b]) {
      for (let n = 0; n < 8; n++) {
        levelUp(run);
        tick(run, { moveX: 0, action: { type: 'pick', index: n % 3 } }, gameConfig);
        if (run.phase === 'levelup') {
          tick(run, { moveX: 0, action: { type: 'pick', index: 0 } }, gameConfig);
        }
      }
    }
    expect(hashRun(a)).toBe(hashRun(b));
    expect(a.team.map((m) => m.species)).toEqual(b.team.map((m) => m.species));
  });
});

describe('the capture of a boss (4X)', () => {
  it('a defeated boss between waves opens the capture as its own form, before the heal', () => {
    const { run, boss } = bossRun();
    run.player.hp = 6;
    run.boss.hpAtSpawn = 10;
    onBossDefeated(run, gameConfig, boss);
    expect(run.phase).toBe('catch');
    expect(run.catch).toMatchObject({ species: 'machop', stage: 2, form: 'machoke' });
    // 4 of 10 lost: the "unhurt" part of the chance counts that damage, not the healed health.
    expect(run.catch?.performance).toBeCloseTo(
      catchPerformance({ ...run, player: { ...run.player, hp: 6 } }, bossRules),
      6,
    );
    expect(run.events.some((e) => e.type === 'catchOpen')).toBe(true);
    expect(run.pickups).toHaveLength(0);
  });

  it('the final boss is never captured (the legendaries come from keys)', () => {
    const { run, boss } = bossRun();
    run.boss.spawned = true;
    onBossDefeated(run, gameConfig, boss);
    expect(run.phase).not.toBe('catch');
    expect(run.catch).toBeNull();
  });

  it('a faster fight with less damage earns a better chance, always within 0..1', () => {
    const { run } = bossRun();
    const at = (ticks: number, hurt: number): number => {
      run.boss.tick = ticks;
      run.player.hp = run.player.maxHp - hurt;
      run.boss.hpAtSpawn = run.player.maxHp;
      return catchPerformance(run, bossRules);
    };
    expect(at(600, 0)).toBeGreaterThan(at(3000, 0));
    expect(at(1800, 0)).toBeGreaterThan(at(1800, 3));
    for (const t of [0, 1000, 5000, 99999]) {
      for (const h of [0, 2, 5, 10]) {
        expect(at(t, h)).toBeGreaterThanOrEqual(0);
        expect(at(t, h)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the ring narrows and starts again; a narrower ring is a better chance', () => {
    const state = { ticks: 0, radius: 40, performance: 0.5 };
    let lastRing = Number.POSITIVE_INFINITY;
    let lastChance = 0;
    for (let t = 0; t < bossRules.ringCycleTicks; t++) {
      state.ticks = t;
      const ring = catchRing(bossRules, state);
      const chance = catchChance(bossRules, state);
      expect(ring).toBeLessThan(lastRing);
      expect(chance).toBeGreaterThanOrEqual(lastChance);
      lastRing = ring;
      lastChance = chance;
    }
    state.ticks = bossRules.ringCycleTicks;
    expect(ringTightness(bossRules, state)).toBe(0);
    expect(catchRing(bossRules, state)).toBeCloseTo(40 * bossRules.ringMax, 6);
  });

  it('the chance never leaves [minChance, maxChance]: a perfect throw is never certain, a bad one never hopeless', () => {
    const tightest = bossRules.ringCycleTicks - 1;
    // A perfect fight on the narrowest ring would be over 1 without the bound.
    expect(bossRules.ringHigh).toBeGreaterThan(1);
    expect(catchChance(bossRules, { ticks: tightest, performance: 1 })).toBe(bossRules.maxChance);
    expect(catchChance(bossRules, { ticks: 0, performance: 0 })).toBe(bossRules.minChance);
    for (let t = 0; t < bossRules.ringCycleTicks; t += 5) {
      for (const performance of [0, 0.01, 0.3, 0.5, 0.75, 1]) {
        const chance = catchChance(bossRules, { ticks: t, performance });
        expect(chance).toBeGreaterThanOrEqual(bossRules.minChance);
        expect(chance).toBeLessThanOrEqual(bossRules.maxChance);
      }
    }
  });

  it('the sway stays within its width and starts at the centre', () => {
    expect(catchSway(bossRules, 0)).toBeCloseTo(0, 9);
    for (let t = 0; t < 1000; t++) {
      expect(Math.abs(catchSway(bossRules, t))).toBeLessThanOrEqual(bossRules.sway + 1e-9);
    }
  });

  it('a throw outside the ring misses and the boss flees', () => {
    const { run, boss } = bossRun();
    onBossDefeated(run, gameConfig, boss);
    const state = run.catch;
    if (state === null) throw new Error('capture open');
    run.events.length = 0;
    advanceCatch(run, { moveX: 0, throw: true, aimX: state.x + 400, aimY: state.y }, gameConfig);
    expect(run.events.find((e) => e.type === 'catchThrow')).toMatchObject({
      hit: false,
      caught: false,
    });
    expect(run.events.some((e) => e.type === 'catchFled')).toBe(true);
    expect(run.phase).toBe('playing');
    expect(run.team.some((m) => m.species === 'machop')).toBe(false);
  });

  it('no throw in time: it flees when the window ends', () => {
    const { run, boss } = bossRun();
    onBossDefeated(run, gameConfig, boss);
    for (let t = 0; t < bossRules.windowTicks; t++) {
      expect(run.phase).toBe('catch');
      advanceCatch(run, { moveX: 0 }, gameConfig);
    }
    expect(run.phase).toBe('playing');
    expect(run.events.some((e) => e.type === 'catchFled')).toBe(true);
  });

  it('a throw that lands captures with the chance shown, over many seeds', () => {
    let caught = 0;
    let expected = 0;
    const N = 400;
    for (let seed = 1; seed <= N; seed++) {
      const { run, boss } = bossRun(seed);
      onBossDefeated(run, gameConfig, boss);
      const state = run.catch;
      if (state === null) throw new Error('capture open');
      for (let t = 0; t < 40; t++) advanceCatch(run, { moveX: 0 }, gameConfig);
      const now = run.catch;
      if (now === null) throw new Error('still open');
      expected += catchChance(bossRules, now);
      advanceCatch(run, { moveX: 0, throw: true, aimX: now.x, aimY: now.y }, gameConfig);
      if (run.team.some((m) => m.species === 'machop')) caught += 1;
    }
    expect(Math.abs(caught - expected) / N).toBeLessThan(0.06);
    // 400 real runs: slow under the parallel suite (like the sweeps of 4W).
  }, 60_000);

  it('the field stands still while it waits: no tick passes, no enemy moves', () => {
    const { run, boss } = bossRun();
    const enemy = makeEnemy({ id: 7, species: 'rattata', type: 'normal', hp: 5, x: 100, y: 100 });
    run.enemies.push(enemy);
    onBossDefeated(run, gameConfig, boss);
    const before = run.tickCount;
    for (let t = 0; t < 30; t++) tick(run, { moveX: 1 }, gameConfig);
    expect(run.tickCount).toBe(before);
    expect(enemy.y).toBe(100);
    expect(run.player.x).toBe(gameConfig.arena.width / 2);
  });

  it("the assisted aim aims at the boss: the timing is still the player's", () => {
    const { run, boss } = bossRun();
    run.autoAim = true;
    onBossDefeated(run, gameConfig, boss);
    advanceCatch(run, { moveX: 0, throw: true, aimX: 0, aimY: 0 }, gameConfig);
    expect(run.events.find((e) => e.type === 'catchThrow')).toMatchObject({ hit: true });
  });

  it('is deterministic and cloned and hashed whole', () => {
    const { run, boss } = bossRun(21);
    onBossDefeated(run, gameConfig, boss);
    for (let t = 0; t < 17; t++) advanceCatch(run, { moveX: 0 }, gameConfig);
    const copy = cloneRun(run);
    expect(hashRun(copy)).toBe(hashRun(run));
    expect(copy.catch).not.toBe(run.catch);
    advanceCatch(run, { moveX: 0 }, gameConfig);
    expect(hashRun(copy)).not.toBe(hashRun(run));
  });

  it('a config without boss rules keeps the old drop of the boss ball', () => {
    const { join: _j, boss: _b, ...old } = gameConfig.capture;
    const legacy: GameConfig = { ...gameConfig, capture: old };
    const { run, boss } = bossRun();
    expect(openBossCatch(run, legacy, boss)).toBe(false);
    onBossDefeated(run, legacy, boss);
    expect(run.pickups).toHaveLength(1);
  });
});
