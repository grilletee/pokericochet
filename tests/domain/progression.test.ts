import { describe, expect, it } from 'vitest';
import {
  applyCard,
  type Card,
  checkLevelUp,
  createRun,
  damageEnemy,
  deriveRng,
  drawOffers,
  enemyXp,
  hashRun,
  nextU32,
  tick,
  xpCost,
} from '../../src/domain';
import { flyingRun, makeBall, makeEnemy, quietConfig, withConfig } from './fixtures';

const noLoot = withConfig({ progression: { ...quietConfig.progression, lootChance: 0 } });
const alwaysLoot = withConfig({ progression: { ...quietConfig.progression, lootChance: 1 } });
const cardKey = (c: Card) => (c.kind === 'newBall' ? `newBall:${c.species}` : c.kind);

describe('experience', () => {
  it('xpCost follows the table and repeats the last value', () => {
    const costs = quietConfig.progression.levelCosts;
    expect(xpCost(quietConfig, 1)).toBe(costs[0]);
    expect(xpCost(quietConfig, 2)).toBe(costs[1]);
    expect(xpCost(quietConfig, costs.length)).toBe(costs[costs.length - 1]);
    expect(xpCost(quietConfig, costs.length + 7)).toBe(costs[costs.length - 1]);
  });

  it('an enemy is worth hp / hpPerXp, rounded, at least 1', () => {
    expect(enemyXp(quietConfig, 39)).toBe(4);
    expect(enemyXp(quietConfig, 34)).toBe(3);
    expect(enemyXp(quietConfig, 4)).toBe(1);
    expect(enemyXp(quietConfig, 0)).toBe(1);
  });

  it('a kill grants the enemy xp; a rich kill grants lootMultiplier times that', () => {
    const plain = createRun(noLoot, 1, 'charmander');
    damageEnemy(plain, noLoot, makeEnemy({ hp: 1, xp: 5 }), 9);
    expect(plain.player.xp).toBe(5);
    const rich = createRun(alwaysLoot, 1, 'charmander');
    damageEnemy(rich, alwaysLoot, makeEnemy({ hp: 1, xp: 5 }), 9);
    expect(rich.player.xp).toBe(5 * quietConfig.progression.lootMultiplier);
  });

  it('rich kills happen at the configured rate and are reproducible per seed', () => {
    const count = (seed: number) => {
      const run = createRun(quietConfig, seed, 'charmander');
      let rich = 0;
      for (let i = 0; i < 2000; i++) {
        const before = run.player.xp;
        damageEnemy(run, quietConfig, makeEnemy({ id: i + 1, hp: 1, xp: 1 }), 9);
        if (run.player.xp - before > 1) rich += 1;
      }
      return rich;
    };
    const n = count(8);
    expect(n / 2000).toBeGreaterThan(quietConfig.progression.lootChance - 0.03);
    expect(n / 2000).toBeLessThan(quietConfig.progression.lootChance + 0.03);
    expect(count(8)).toBe(n);
  });

  it('draws a loot number on every kill even when the chance is 0 (the stream never depends on config)', () => {
    const run = createRun(noLoot, 4, 'charmander');
    for (let i = 0; i < 7; i++) damageEnemy(run, noLoot, makeEnemy({ id: i + 1, hp: 1 }), 9);
    const expected = deriveRng(4, 'loot');
    for (let i = 0; i < 7; i++) nextU32(expected);
    expect(run.rng.loot).toEqual(expected);
  });

  it('does not grant experience for damage that does not kill', () => {
    const run = createRun(noLoot, 1, 'charmander');
    damageEnemy(run, noLoot, makeEnemy({ hp: 10, xp: 5 }), 3);
    expect(run.player.xp).toBe(0);
  });
});

describe('level up', () => {
  /** A ball hits and kills a 1 hp enemy worth 5 xp, with the player 1 xp short of a level. */
  function killingRun() {
    const run = flyingRun(makeBall(), [makeEnemy({ hp: 1, xp: 5 })], undefined, noLoot);
    run.player.xp = run.player.xpNext - 1;
    return run;
  }

  it('opens the card choice when the xp threshold is crossed', () => {
    const run = killingRun();
    const cost1 = xpCost(noLoot, 1);
    const out = tick(run, { moveX: 0 }, noLoot);
    expect(run.phase).toBe('levelup');
    expect(run.player.level).toBe(2);
    expect(run.player.xp).toBe(4); // 5 gained - 1 missing: the surplus is kept
    expect(run.player.xpNext).toBe(xpCost(noLoot, 2));
    expect(cost1).not.toBe(run.player.xpNext);
    expect(run.offers).toHaveLength(noLoot.cards.offerCount);
    expect(out.events).toContainEqual({ type: 'levelup', level: 2 });
  });

  it('does not level up below the threshold', () => {
    const run = flyingRun(makeBall(), [makeEnemy({ hp: 1, xp: 5 })], undefined, noLoot);
    run.player.xp = 0;
    tick(run, { moveX: 0 }, noLoot);
    expect(run.phase).toBe('playing');
    expect(run.offers).toEqual([]);
  });

  it('pauses the simulation until a valid pick arrives', () => {
    const run = killingRun();
    run.enemies.push(makeEnemy({ id: 2, hp: 1e9, y: 100, speed: 1 }));
    tick(run, { moveX: 0 }, noLoot);
    expect(run.phase).toBe('levelup');
    const frozen = hashRun(run);
    for (const cmd of [
      { moveX: 1 as const },
      { moveX: -1 as const },
      { moveX: 0 as const, action: { type: 'pick' as const, index: 9 } },
      { moveX: 0 as const, action: { type: 'pick' as const, index: -1 } },
    ]) {
      tick(run, cmd, noLoot);
      expect(hashRun(run)).toBe(frozen);
    }
  });

  it('a valid pick applies the card, reports it and resumes play', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.phase = 'levelup';
    run.offers = [{ kind: 'damage' }, { kind: 'token' }];
    const out = tick(run, { moveX: 0, action: { type: 'pick', index: 1 } }, quietConfig);
    expect(run.tokens).toBe(1);
    expect(run.phase).toBe('playing');
    expect(run.offers).toEqual([]);
    expect(out.events).toContainEqual({ type: 'pick', card: { kind: 'token' } });
    expect(run.player.damageMult).toBe(1);
  });

  it('chains straight into a second level-up when there is enough xp', () => {
    const run = createRun(noLoot, 1, 'charmander');
    run.player.xp = xpCost(noLoot, 1) + xpCost(noLoot, 2) + 1;
    expect(checkLevelUp(run, noLoot)).toBe(true);
    expect(run.player.level).toBe(2);
    tick(run, { moveX: 0, action: { type: 'pick', index: 0 } }, noLoot);
    expect(run.phase).toBe('levelup');
    expect(run.player.level).toBe(3);
    expect(run.player.xp).toBe(1);
  });

  it('dying on the same tick beats levelling up', () => {
    const run = killingRun();
    run.player.hp = 1;
    run.enemies.push(makeEnemy({ id: 2, x: 30, y: noLoot.arena.defenseLineY - 0.1, speed: 1 }));
    tick(run, { moveX: 0 }, noLoot);
    expect(run.phase).toBe('lost');
  });
});

describe('card offers', () => {
  const offersFor = (seed: number, cfg = quietConfig) =>
    drawOffers(createRun(cfg, seed, 'charmander'), cfg);

  it('offers offerCount different cards, with valid species', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const offers = offersFor(seed);
      expect(offers).toHaveLength(quietConfig.cards.offerCount);
      expect(new Set(offers.map(cardKey)).size).toBe(offers.length);
      for (const c of offers) {
        if (c.kind === 'newBall') expect(quietConfig.ballSpecies).toContain(c.species);
      }
    }
  });

  it('is reproducible for a seed and varies between seeds', () => {
    expect(offersFor(5)).toEqual(offersFor(5));
    const distinct = new Set(
      Array.from({ length: 30 }, (_, s) => JSON.stringify(offersFor(s + 1))),
    );
    expect(distinct.size).toBeGreaterThan(10);
  });

  it('draws from the cards stream only', () => {
    const run = createRun(quietConfig, 12, 'charmander');
    const others = JSON.stringify([run.rng.spawn, run.rng.aim, run.rng.loot]);
    drawOffers(run, quietConfig);
    expect(JSON.stringify([run.rng.spawn, run.rng.aim, run.rng.loot])).toBe(others);
    const fresh = deriveRng(12, 'cards');
    expect(run.rng.cards).not.toEqual(fresh);
  });

  it('draws the same offers whatever happened in the fight before (cards stream is independent)', () => {
    const calm = createRun(quietConfig, 33, 'charmander');
    const busy = createRun(quietConfig, 33, 'charmander');
    for (let i = 0; i < 50; i++) damageEnemy(busy, quietConfig, makeEnemy({ id: i + 1, hp: 1 }), 5);
    for (let i = 0; i < 30; i++) nextU32(busy.rng.aim);
    for (let i = 0; i < 30; i++) nextU32(busy.rng.spawn);
    expect(drawOffers(busy, quietConfig)).toEqual(drawOffers(calm, quietConfig));
  });

  it('never offers a new ball when the loadout is full, and offers one otherwise', () => {
    const full = createRun(quietConfig, 1, 'charmander');
    full.loadout = Array.from({ length: quietConfig.cards.maxBalls }, (_, i) =>
      makeBall({ id: i + 1 }),
    );
    let balls = 0;
    for (let i = 0; i < 300; i++)
      balls += drawOffers(full, quietConfig).filter((c) => c.kind === 'newBall').length;
    expect(balls).toBe(0);

    const room = createRun(quietConfig, 1, 'charmander');
    let withRoom = 0;
    for (let i = 0; i < 300; i++)
      withRoom += drawOffers(room, quietConfig).filter((c) => c.kind === 'newBall').length;
    expect(withRoom).toBeGreaterThan(100);
  });

  it('terminates with fewer cards when only one distinct card exists', () => {
    const cfg = withConfig({
      cards: { ...quietConfig.cards, weights: { newBall: 0, upgrade: 0, token: 1 } },
    });
    const offers = offersFor(1, cfg);
    expect(offers).toEqual([{ kind: 'token' }]);
  });

  it('upgrade cards cover all three kinds over many draws', () => {
    const kinds = new Set<string>();
    const run = createRun(quietConfig, 1, 'charmander');
    for (let i = 0; i < 200; i++) for (const c of drawOffers(run, quietConfig)) kinds.add(c.kind);
    expect(kinds).toEqual(new Set(['newBall', 'damage', 'cadence', 'vitality', 'token']));
  });
});

describe('applying cards', () => {
  const fresh = () => createRun(quietConfig, 1, 'charmander');

  it('newBall adds a ball with a new id and a ready slot', () => {
    const run = fresh();
    applyCard(run, quietConfig, { kind: 'newBall', species: 'pikachu' });
    expect(run.loadout.map((b) => [b.id, b.species])).toEqual([
      [1, 'charmander'],
      [2, 'pikachu'],
    ]);
    expect(run.cooldowns).toEqual([0, 0]);
    expect(run.nextBallId).toBe(3);
  });

  it('newBall is ignored when the loadout is full', () => {
    const run = fresh();
    for (let i = 0; i < 6; i++)
      applyCard(run, quietConfig, { kind: 'newBall', species: 'pikachu' });
    expect(run.loadout).toHaveLength(quietConfig.cards.maxBalls);
    expect(run.cooldowns).toHaveLength(quietConfig.cards.maxBalls);
  });

  it('a new ball fires on the next tick when there is a target', () => {
    const run = fresh();
    run.cooldowns = [-1];
    run.bodies = [];
    run.enemies = [makeEnemy({ y: 200 })];
    applyCard(run, quietConfig, { kind: 'newBall', species: 'pikachu' });
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.bodies.map((b) => b.slot)).toEqual([1]);
  });

  it('damage adds damageStep to the multiplier, and hits use it', () => {
    const run = flyingRun(makeBall(), [makeEnemy({ type: 'electric' })]);
    const base = tick(run, { moveX: 0 }, quietConfig).events.find((e) => e.type === 'hit');
    const boosted = flyingRun(makeBall(), [makeEnemy({ type: 'electric' })]);
    applyCard(boosted, quietConfig, { kind: 'damage' });
    applyCard(boosted, quietConfig, { kind: 'damage' });
    expect(boosted.player.damageMult).toBeCloseTo(1 + 2 * quietConfig.cards.damageStep, 9);
    const hit = tick(boosted, { moveX: 0 }, quietConfig).events.find((e) => e.type === 'hit');
    expect(base?.type === 'hit' && hit?.type === 'hit' ? hit.damage / base.damage : 0).toBeCloseTo(
      1 + 2 * quietConfig.cards.damageStep,
      9,
    );
  });

  it('cadence shortens the cooldown after a ball leaves, never below the floor', () => {
    const run = flyingRun(makeBall(), [], {
      slot: 0,
      x: 240,
      y: 730,
      vx: 0,
      vy: 6,
      pierce: 0,
      skipId: 0,
    });
    applyCard(run, quietConfig, { kind: 'cadence' });
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.cooldowns[0]).toBe(
      Math.floor(quietConfig.ball.cooldownTicks * quietConfig.cards.cadenceFactor + 0.5),
    );
    for (let i = 0; i < 40; i++) applyCard(run, quietConfig, { kind: 'cadence' });
    expect(run.player.cooldownMult).toBeCloseTo(quietConfig.cards.cadenceFloor, 9);
  });

  it('vitality raises max hp and heals the same amount', () => {
    const run = fresh();
    run.player.hp = 4;
    applyCard(run, quietConfig, { kind: 'vitality' });
    expect(run.player.maxHp).toBe(quietConfig.player.maxHp + quietConfig.cards.vitalityHp);
    expect(run.player.hp).toBe(4 + quietConfig.cards.vitalityHp);
  });

  it('token adds a fusion token', () => {
    const run = fresh();
    applyCard(run, quietConfig, { kind: 'token' });
    applyCard(run, quietConfig, { kind: 'token' });
    expect(run.tokens).toBe(2);
  });
});
