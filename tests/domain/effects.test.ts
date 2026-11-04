import { describe, expect, it } from 'vitest';
import {
  applyHitEffects,
  type Ball,
  createRun,
  damageEnemy,
  deriveRng,
  nextU32,
  pierceCount,
  tick,
  tickBurning,
} from '../../src/domain';
import { flyingRun, makeBall, makeBody, makeEnemy, quietConfig } from './fixtures';

const cfg = quietConfig;
const fireBall = (o: Partial<Ball> = {}) =>
  makeBall({ species: 'charmander', type: 'fire', effects: [{ kind: 'burn', strength: 2 }], ...o });
const waterBall = (o: Partial<Ball> = {}) =>
  makeBall({
    species: 'squirtle',
    type: 'water',
    effects: [{ kind: 'pierce', strength: 1 }],
    ...o,
  });
const grassBall = (o: Partial<Ball> = {}) =>
  makeBall({
    species: 'bulbasaur',
    type: 'grass',
    effects: [{ kind: 'drain', strength: 1 }],
    ...o,
  });
const electricBall = (o: Partial<Ball> = {}) =>
  makeBall({
    species: 'pikachu',
    type: 'electric',
    effects: [{ kind: 'chain', strength: 0.5 }],
    ...o,
  });

function hitRun(ball: Ball, target = makeEnemy()) {
  return flyingRun(ball, [target]);
}

describe('burn', () => {
  it('sets the status on hit, with dps = strength x effectiveness x damage multiplier', () => {
    const run = hitRun(fireBall(), makeEnemy({ type: 'grass' })); // fire vs grass: x2
    run.player.damageMult = 1.5;
    run.cooldowns = [-1];
    tick(run, { moveX: 0 }, cfg);
    const enemy = run.enemies[0];
    // applied during the hit and already ticked once in the same tick
    expect(enemy?.burnTicks).toBe(cfg.effects.burnTicks - 1);
    expect(enemy?.burnDps).toBeCloseTo(2 * 2 * 1.5, 9);
  });

  it('deals dps / 60 each tick and ends after burnTicks', () => {
    const enemy = makeEnemy({ type: 'electric', burnTicks: 180, burnDps: 6 });
    const run = createRun(cfg, 1, 'charmander');
    run.cooldowns = [-1]; // the starter ball must not fire at the enemy
    run.enemies = [enemy];
    for (let i = 0; i < 60; i++) tick(run, { moveX: 0 }, cfg);
    expect(enemy.hp).toBeCloseTo(1000 - 6, 6);
    expect(enemy.burnTicks).toBe(120);
    for (let i = 0; i < 120; i++) tick(run, { moveX: 0 }, cfg);
    expect(enemy.burnTicks).toBe(0);
    expect(enemy.burnDps).toBe(0);
    expect(enemy.hp).toBeCloseTo(1000 - 18, 6);
    for (let i = 0; i < 60; i++) tick(run, { moveX: 0 }, cfg);
    expect(enemy.hp).toBeCloseTo(1000 - 18, 6); // no more damage once it is over
  });

  it('refreshes the duration and keeps the highest dps instead of stacking', () => {
    const run = createRun(cfg, 1, 'charmander');
    const enemy = makeEnemy({ type: 'electric', burnTicks: 10, burnDps: 5 });
    run.enemies = [enemy];
    applyHitEffects(run, cfg, fireBall(), enemy, 4); // dps 2 x 1 = 2, below the existing 5
    expect(enemy.burnTicks).toBe(cfg.effects.burnTicks);
    expect(enemy.burnDps).toBe(5);
    applyHitEffects(run, cfg, fireBall({ effects: [{ kind: 'burn', strength: 8 }] }), enemy, 4);
    expect(enemy.burnDps).toBe(8);
  });

  it('a burn kill is reported once, grants the xp and removes the enemy', () => {
    const run = createRun(cfg, 1, 'charmander');
    const enemy = makeEnemy({ hp: 0.05, burnTicks: 50, burnDps: 6, xp: 4 });
    run.cooldowns = [-1];
    run.enemies = [enemy];
    const kills: number[] = [];
    for (let i = 0; i < 5; i++) {
      for (const e of tick(run, { moveX: 0 }, cfg).events)
        if (e.type === 'kill') kills.push(e.enemyId);
    }
    expect(kills).toEqual([1]);
    expect(run.enemies).toEqual([]);
    expect(run.player.xp).toBeGreaterThanOrEqual(4);
  });

  it('tickBurning ignores enemies that are not burning', () => {
    const run = createRun(cfg, 1, 'charmander');
    const enemy = makeEnemy();
    run.enemies = [enemy];
    tickBurning(run, cfg);
    expect(enemy.hp).toBe(1000);
  });
});

describe('pierce', () => {
  const twoEnemies = () => [makeEnemy({ id: 1, y: 380 }), makeEnemy({ id: 2, y: 320 })];

  function simulate(ball: Ball, pierce: number) {
    const run = flyingRun(ball, twoEnemies(), makeBody({ pierce }));
    const hits: number[] = [];
    for (let i = 0; i < 40; i++) {
      for (const e of tick(run, { moveX: 0 }, cfg).events)
        if (e.type === 'hit') hits.push(e.enemyId);
    }
    return { run, hits };
  }

  it('without pierce the ball bounces back at the first enemy', () => {
    const { run, hits } = simulate(waterBall(), 0);
    expect(hits[0]).toBe(1);
    expect(hits).not.toContain(2);
    expect(run.bodies[0]?.vy ?? 0).toBeGreaterThan(0);
  });

  it('with pierce 1 it passes through the first enemy, hits it once, and bounces off the second', () => {
    const { run, hits } = simulate(waterBall(), 1);
    // Until the ball reaches the second enemy: exactly one hit on the first (not one per tick
    // of overlap). Afterwards it may legitimately come back and hit the first one again.
    const untilSecond = hits.slice(0, hits.indexOf(2) + 1);
    expect(untilSecond).toEqual([1, 2]);
    expect(run.bodies[0]?.vy ?? 0).toBeGreaterThan(0); // reflected by the second
    expect(run.bodies[0]?.pierce).toBe(0);
  });

  it('forgets the enemy it passed through once it is clear of it', () => {
    const run = flyingRun(waterBall(), [makeEnemy({ id: 1, y: 380 })], makeBody({ pierce: 1 }));
    for (let i = 0; i < 12; i++) tick(run, { moveX: 0 }, cfg);
    expect(run.bodies[0]?.skipId).toBe(0);
  });

  it('a launched ball carries the pierce of its effects', () => {
    const run = createRun(cfg, 1, 'squirtle'); // water: pierce 1
    run.enemies = [makeEnemy({ y: 200 })];
    tick(run, { moveX: 0 }, cfg);
    expect(run.bodies[0]?.pierce).toBe(1);
    const fire = createRun(cfg, 1, 'charmander');
    fire.enemies = [makeEnemy({ y: 200 })];
    tick(fire, { moveX: 0 }, cfg);
    expect(fire.bodies[0]?.pierce).toBe(0);
  });

  it('pierceCount: whole strengths are exact and use no random numbers', () => {
    const run = createRun(cfg, 1, 'charmander');
    const before = { ...run.rng.aim };
    expect(pierceCount(run, waterBall())).toBe(1);
    expect(pierceCount(run, fireBall())).toBe(0);
    expect(pierceCount(run, waterBall({ effects: [{ kind: 'pierce', strength: 2 }] }))).toBe(2);
    expect(run.rng.aim).toEqual(before);
  });

  it('pierceCount: a half strength is a seeded 50 % chance, drawn only from the aim stream', () => {
    const run = createRun(cfg, 5, 'charmander');
    const half = waterBall({ effects: [{ kind: 'pierce', strength: 0.5 }] });
    const others = JSON.stringify([run.rng.spawn, run.rng.cards, run.rng.loot]);
    let ones = 0;
    for (let i = 0; i < 2000; i++) ones += pierceCount(run, half);
    expect(ones / 2000).toBeGreaterThan(0.45);
    expect(ones / 2000).toBeLessThan(0.55);
    expect(JSON.stringify([run.rng.spawn, run.rng.cards, run.rng.loot])).toBe(others);
    const again = createRun(cfg, 5, 'charmander');
    let onesAgain = 0;
    for (let i = 0; i < 2000; i++) onesAgain += pierceCount(again, half);
    expect(onesAgain).toBe(ones); // reproducible
  });
});

describe('drain', () => {
  it('heals 1 hp every drainPerHp strength points and reports it', () => {
    const run = createRun(cfg, 1, 'charmander');
    run.player.hp = 5;
    const enemy = makeEnemy();
    const ball = grassBall();
    for (let i = 0; i < cfg.effects.drainPerHp - 1; i++) applyHitEffects(run, cfg, ball, enemy, 1);
    expect(run.player.hp).toBe(5);
    run.events.length = 0;
    applyHitEffects(run, cfg, ball, enemy, 1);
    expect(run.player.hp).toBe(6);
    expect(run.events).toContainEqual({ type: 'heal', amount: 1 });
    expect(run.player.drain).toBeCloseTo(0, 9);
  });

  it('a hybrid (half strength) needs twice as many hits', () => {
    const run = createRun(cfg, 1, 'charmander');
    run.player.hp = 5;
    const half = grassBall({ effects: [{ kind: 'drain', strength: 0.5 }] });
    for (let i = 0; i < 2 * cfg.effects.drainPerHp - 1; i++) {
      applyHitEffects(run, cfg, half, makeEnemy(), 1);
    }
    expect(run.player.hp).toBe(5);
    applyHitEffects(run, cfg, half, makeEnemy(), 1);
    expect(run.player.hp).toBe(6);
  });

  it('never heals above max hp and does not bank unlimited progress at full health', () => {
    const run = createRun(cfg, 1, 'charmander');
    for (let i = 0; i < 200; i++) applyHitEffects(run, cfg, grassBall(), makeEnemy(), 1);
    expect(run.player.hp).toBe(run.player.maxHp);
    expect(run.player.drain).toBe(cfg.effects.drainPerHp);
    run.player.hp = run.player.maxHp - 1;
    applyHitEffects(run, cfg, grassBall(), makeEnemy(), 1); // the stored progress pays off at once
    expect(run.player.hp).toBe(run.player.maxHp);
  });
});

describe('chain', () => {
  const target = () => makeEnemy({ id: 1, x: 240, y: 300, type: 'grass' });

  it('hits the nearest other enemy within the radius for strength x damage x effectiveness', () => {
    const run = createRun(cfg, 1, 'charmander');
    const t = target();
    const other = makeEnemy({ id: 2, x: 300, y: 300, type: 'water' }); // electric vs water: x2
    run.enemies = [t, other];
    applyHitEffects(run, cfg, electricBall(), t, 10);
    expect(other.hp).toBeCloseTo(1000 - 10 * 0.5 * 2, 9);
    expect(t.hp).toBe(1000); // the chain never hits the original target again
    expect(run.events).toContainEqual({
      type: 'chain',
      fromX: 240,
      fromY: 300,
      toX: 300,
      toY: 300,
    });
  });

  it('does not reach beyond chainRadius', () => {
    const run = createRun(cfg, 1, 'charmander');
    const t = target();
    const far = makeEnemy({ id: 2, x: 240 + cfg.effects.chainRadius + 1, y: 300 });
    run.enemies = [t, far];
    applyHitEffects(run, cfg, electricBall(), t, 10);
    expect(far.hp).toBe(1000);
    expect(run.events.some((e) => e.type === 'chain')).toBe(false);
  });

  it('reaches an enemy exactly at the radius boundary only from the inside', () => {
    const run = createRun(cfg, 1, 'charmander');
    const t = target();
    const inside = makeEnemy({ id: 2, x: 240 + cfg.effects.chainRadius - 0.01, y: 300 });
    run.enemies = [t, inside];
    applyHitEffects(run, cfg, electricBall(), t, 10);
    expect(inside.hp).toBeLessThan(1000);
  });

  it('picks the nearest of several, breaking ties by lower id', () => {
    const run = createRun(cfg, 1, 'charmander');
    const t = target();
    const near = makeEnemy({ id: 5, x: 270, y: 300 });
    const far = makeEnemy({ id: 2, x: 300, y: 300 });
    run.enemies = [t, far, near];
    applyHitEffects(run, cfg, electricBall(), t, 10);
    expect(near.hp).toBeLessThan(1000);
    expect(far.hp).toBe(1000);

    const a = makeEnemy({ id: 9, x: 280, y: 300 });
    const b = makeEnemy({ id: 4, x: 200, y: 300 }); // same distance, lower id
    const run2 = createRun(cfg, 1, 'charmander');
    run2.enemies = [t, a, b];
    t.hp = 1000;
    applyHitEffects(run2, cfg, electricBall(), t, 10);
    expect(b.hp).toBeLessThan(1000);
    expect(a.hp).toBe(1000);
  });

  it('ignores dead enemies', () => {
    const run = createRun(cfg, 1, 'charmander');
    const t = target();
    const dead = makeEnemy({ id: 2, x: 260, y: 300, hp: 0 });
    run.enemies = [t, dead];
    applyHitEffects(run, cfg, electricBall(), t, 10);
    expect(dead.hp).toBe(0);
    expect(run.events.some((e) => e.type === 'chain')).toBe(false);
  });

  it('can kill the second enemy: one kill event and the xp', () => {
    const run = createRun(cfg, 1, 'charmander');
    const t = target();
    const weak = makeEnemy({ id: 2, x: 280, y: 300, hp: 1, xp: 5 });
    run.enemies = [t, weak];
    applyHitEffects(run, cfg, electricBall(), t, 10);
    expect(run.events.filter((e) => e.type === 'kill')).toHaveLength(1);
    expect(run.player.xp).toBeGreaterThanOrEqual(5);
  });

  it('a hybrid (strength 0.25) chains for a quarter of the damage', () => {
    const run = createRun(cfg, 1, 'charmander');
    const t = target();
    const other = makeEnemy({ id: 2, x: 280, y: 300, type: 'fire' }); // electric vs fire: x1
    run.enemies = [t, other];
    applyHitEffects(
      run,
      cfg,
      electricBall({ effects: [{ kind: 'chain', strength: 0.25 }] }),
      t,
      10,
    );
    expect(other.hp).toBeCloseTo(1000 - 2.5, 9);
  });

  it('happens in a real tick when a ball hits', () => {
    const run = flyingRun(electricBall(), [
      makeEnemy({ id: 1, x: 240, y: 380 }),
      makeEnemy({ id: 2, x: 300, y: 380 }),
    ]);
    const types: string[] = [];
    for (const e of tick(run, { moveX: 0 }, cfg).events) types.push(e.type);
    expect(types).toContain('hit');
    expect(types).toContain('chain');
    expect(run.enemies[1]?.hp).toBeLessThan(1000);
  });
});

describe('damageEnemy', () => {
  it('reports a kill once and refuses to damage the dead', () => {
    const run = createRun(cfg, 1, 'charmander');
    const e = makeEnemy({ hp: 5 });
    expect(damageEnemy(run, cfg, e, 3)).toBe(false);
    expect(damageEnemy(run, cfg, e, 3)).toBe(true);
    expect(damageEnemy(run, cfg, e, 3)).toBe(false);
    expect(run.events.filter((x) => x.type === 'kill')).toHaveLength(1);
    expect(e.hp).toBeLessThanOrEqual(0);
    expect(e.hp).toBeCloseTo(-1, 9); // not damaged a third time
  });

  it('draws one loot number per kill, from the loot stream only', () => {
    const run = createRun(cfg, 9, 'charmander');
    const spawn = { ...run.rng.spawn };
    const aim = { ...run.rng.aim };
    const cards = { ...run.rng.cards };
    for (let i = 0; i < 5; i++) damageEnemy(run, cfg, makeEnemy({ id: i + 1, hp: 1 }), 5);
    const expected = deriveRng(9, 'loot');
    for (let i = 0; i < 5; i++) nextU32(expected);
    expect(run.rng.loot).toEqual(expected);
    expect(run.rng.spawn).toEqual(spawn);
    expect(run.rng.aim).toEqual(aim);
    expect(run.rng.cards).toEqual(cards);
  });
});

describe('effects use the type of the first ingredient', () => {
  it('a hybrid keeps the second ingredient effect but uses the first type for effectiveness', () => {
    const hybrid = makeBall({
      type: 'fire',
      hybrid: true,
      level: 2,
      effects: [
        { kind: 'burn', strength: 2 },
        { kind: 'chain', strength: 0.25 },
      ],
    });
    const run = createRun(cfg, 1, 'charmander');
    const t = makeEnemy({ id: 1, x: 240, y: 300, type: 'grass' }); // fire vs grass: x2
    const o = makeEnemy({ id: 2, x: 280, y: 300, type: 'grass' });
    run.enemies = [t, o];
    applyHitEffects(run, cfg, hybrid, t, 10);
    expect(t.burnDps).toBeCloseTo(2 * 2, 9);
    expect(o.hp).toBeCloseTo(1000 - 10 * 0.25 * 2, 9);
  });
});
