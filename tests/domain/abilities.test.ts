import { describe, expect, it } from 'vitest';
import {
  abilitiesFor,
  applyHitEffects,
  createRun,
  damagePlayer,
  type Effect,
  type GameConfig,
  type GameType,
  type Run,
  tick,
} from '../../src/domain';
import { flyingRun, makeBall, makeEnemy, quietConfig, withConfig } from './fixtures';

const effects = (...list: Effect[]) => makeBall({ effects: list });

/** A run with enemies at given places and one fire ball (so effectiveness is easy to read). */
function arena(...enemies: ReturnType<typeof makeEnemy>[]): Run {
  const run = createRun(quietConfig, 1, 'charmander');
  run.enemies = enemies;
  return run;
}

describe('abilitiesFor: signature, then type, then generic (ADR-031)', () => {
  const cfg = withConfig({
    abilities: {
      byType: {
        fire: [[{ kind: 'burn', strength: 2 }], [{ kind: 'burn', strength: 3 }]],
        water: [[{ kind: 'pierce', strength: 1 }]],
      },
      signatures: {
        charmander: [null, null, [{ kind: 'blast', strength: 1, radius: 50 }]],
        squirtle: [[{ kind: 'splash', strength: 0.1, radius: 10 }]],
      },
      generic: [[{ kind: 'splash', strength: 0.2, radius: 30 }], [], []],
    },
  });
  const burn = (strength: number): Effect => ({ kind: 'burn', strength });

  it('uses the effects of the type when there is no signature for that stage', () => {
    expect(abilitiesFor(cfg, 'charmander', 'fire', 1)).toEqual([burn(2)]);
    expect(abilitiesFor(cfg, 'charmander', 'fire', 2)).toEqual([burn(3)]);
  });

  it('a signature beats the type, and a null entry hands the stage back to the type', () => {
    expect(abilitiesFor(cfg, 'charmander', 'fire', 3)).toEqual([
      { kind: 'blast', strength: 1, radius: 50 },
    ]);
    expect(abilitiesFor(cfg, 'squirtle', 'water', 1)).toEqual([
      { kind: 'splash', strength: 0.1, radius: 10 },
    ]);
  });

  it('a table that stops early repeats its last stage', () => {
    expect(abilitiesFor(cfg, 'vulpix', 'fire', 3)).toEqual([burn(3)]);
    expect(abilitiesFor(cfg, 'psyduck', 'water', 3)).toEqual([{ kind: 'pierce', strength: 1 }]);
    // A signature that ends before the stage hands it back to the type table.
    expect(abilitiesFor(cfg, 'squirtle', 'water', 2)).toEqual([
      { kind: 'splash', strength: 0.1, radius: 10 },
    ]);
  });

  it('a type without a table uses the generic one, so a new type works at once', () => {
    expect(abilitiesFor(cfg, 'pikachu', 'electric', 1)).toEqual([
      { kind: 'splash', strength: 0.2, radius: 30 },
    ]);
    expect(abilitiesFor(cfg, 'pikachu', 'electric', 2)).toEqual([]);
    expect(abilitiesFor(cfg, 'pikachu', 'electric', 0)).toEqual(
      abilitiesFor(cfg, 'pikachu', 'electric', 1),
    );
  });

  it('returns a copy: changing it does not change the rules', () => {
    const got = abilitiesFor(cfg, 'charmander', 'fire', 1);
    (got[0] as { strength: number }).strength = 99;
    expect(abilitiesFor(cfg, 'charmander', 'fire', 1)).toEqual([burn(2)]);
  });

  it('the shipped data gives every starter a different last stage than its type table', () => {
    const real = quietConfig;
    for (const [species, type] of [
      ['charmander', 'fire'],
      ['squirtle', 'water'],
      ['bulbasaur', 'grass'],
      ['pikachu', 'electric'],
    ] as const) {
      expect(abilitiesFor(real, species, type as GameType, 3)).not.toEqual(
        abilitiesFor(real, 'someone-else', type as GameType, 3),
      );
    }
  });
});

describe('the new effects', () => {
  const fireBall = (...extra: Effect[]) => effects({ kind: 'burn', strength: 2 }, ...extra);

  it('burnArea: the same burn, at a fraction, on whoever stands within its radius', () => {
    const target = makeEnemy({ id: 1, type: 'grass', x: 200, y: 300 });
    const near = makeEnemy({ id: 2, type: 'grass', x: 240, y: 300 });
    const far = makeEnemy({ id: 3, type: 'grass', x: 400, y: 300 });
    const dead = makeEnemy({ id: 4, type: 'grass', x: 210, y: 300, hp: 0 });
    const run = arena(target, near, far, dead);
    applyHitEffects(
      run,
      quietConfig,
      fireBall({ kind: 'burnArea', strength: 0.5, radius: 60 }),
      target,
      5,
    );
    expect(target.burnDps).toBe(4); // 2 x grass 2
    expect(near.burnDps).toBe(2); // half of it
    expect(near.burnTicks).toBe(quietConfig.effects.burnTicks);
    expect(far.burnDps).toBe(0);
    expect(dead.burnDps).toBe(0);
  });

  it('burnArea needs a burn to spread and never lowers a stronger burn', () => {
    const target = makeEnemy({ id: 1, x: 200, y: 300 });
    const near = makeEnemy({ id: 2, x: 220, y: 300, burnDps: 9, burnTicks: 5 });
    const run = arena(target, near);
    applyHitEffects(
      run,
      quietConfig,
      effects({ kind: 'burnArea', strength: 1, radius: 60 }),
      target,
      5,
    );
    expect(near.burnDps).toBe(9);
    expect(near.burnTicks).toBe(5);
    applyHitEffects(
      run,
      quietConfig,
      fireBall({ kind: 'burnArea', strength: 0.1, radius: 60 }),
      target,
      5,
    );
    expect(near.burnDps).toBe(9); // 0.1 x 2 x 0.5 is weaker: the stronger one stays
    expect(near.burnTicks).toBe(quietConfig.effects.burnTicks); // but it is refreshed
  });

  it('burnArea uses the damage multiplier of the Pokémon that fired the ball', () => {
    const target = makeEnemy({ id: 1, type: 'grass', x: 200, y: 300 });
    const near = makeEnemy({ id: 2, type: 'grass', x: 220, y: 300 });
    const run = arena(target, near);
    run.player.damageMult = 2;
    applyHitEffects(
      run,
      quietConfig,
      fireBall({ kind: 'burnArea', strength: 0.5, radius: 60 }),
      target,
      5,
    );
    expect(target.burnDps).toBe(8);
    expect(near.burnDps).toBe(4);
  });

  it('splash: a fraction of the hit on the others within its radius, by their own matchup', () => {
    const target = makeEnemy({ id: 1, type: 'water', x: 200, y: 300, hp: 100 });
    const grass = makeEnemy({ id: 2, type: 'grass', x: 230, y: 300, hp: 100 });
    const far = makeEnemy({ id: 3, type: 'grass', x: 400, y: 300, hp: 100 });
    const run = arena(target, grass, far);
    applyHitEffects(
      run,
      quietConfig,
      effects({ kind: 'splash', strength: 0.5, radius: 50 }),
      target,
      10,
    );
    expect(target.hp).toBe(100); // the hit itself was already applied by the caller
    expect(grass.hp).toBe(100 - 10 * 0.5 * quietConfig.typeChart.fire.grass);
    expect(far.hp).toBe(100);
  });

  it('blast happens only when the hit killed, and only around the target', () => {
    const target = makeEnemy({ id: 1, type: 'grass', x: 200, y: 300, hp: 0 });
    const near = makeEnemy({ id: 2, type: 'grass', x: 230, y: 300, hp: 100 });
    const run = arena(target, near);
    const blast = effects({ kind: 'blast', strength: 1, radius: 50 });
    applyHitEffects(run, quietConfig, blast, target, 10, false);
    expect(near.hp).toBe(100);
    applyHitEffects(run, quietConfig, blast, target, 10, true);
    expect(near.hp).toBe(100 - 10 * quietConfig.typeChart.fire.grass);
  });

  it('a kill by a ball with blast goes through the tick and hits the neighbours', () => {
    const victim = makeEnemy({ id: 1, hp: 1, type: 'electric', x: 240, y: 380 });
    const neighbour = makeEnemy({ id: 2, hp: 100, type: 'electric', x: 270, y: 380 });
    const run = flyingRun(effects({ kind: 'blast', strength: 1, radius: 60 }), [victim, neighbour]);
    tick(run, { moveX: 0 }, quietConfig);
    expect(neighbour.hp).toBeLessThan(100);
  });

  it('slow: marks the target, keeps the stronger slow while it lasts and never touches the dead', () => {
    const target = makeEnemy({ id: 1 });
    const run = arena(target);
    applyHitEffects(run, quietConfig, effects({ kind: 'slow', strength: 0.4 }), target, 1);
    expect([target.slow, target.slowTicks]).toEqual([0.4, quietConfig.effects.slowTicks]);
    applyHitEffects(run, quietConfig, effects({ kind: 'slow', strength: 0.2 }), target, 1);
    expect(target.slow).toBe(0.4);
    target.slowTicks = 0; // it wore off: a weaker one can apply now
    applyHitEffects(run, quietConfig, effects({ kind: 'slow', strength: 0.2 }), target, 1);
    expect(target.slow).toBe(0.2);
    const dead = makeEnemy({ id: 2, hp: 0 });
    applyHitEffects(run, quietConfig, effects({ kind: 'slow', strength: 0.5 }), dead, 1);
    expect(dead.slowTicks).toBe(0);
  });

  it('a slowed enemy advances slower and recovers when the time is up', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = [makeEnemy({ id: 1, y: 100, speed: 2, slow: 0.5, slowTicks: 3 })];
    run.loadout = [];
    run.cooldowns = [];
    const ys: number[] = [];
    for (let i = 0; i < 5; i++) {
      tick(run, { moveX: 0 }, quietConfig);
      ys.push(run.enemies[0]?.y ?? 0);
    }
    expect(ys).toEqual([101, 102, 103, 105, 107]);
    expect(run.enemies[0]?.slowTicks).toBe(0);
  });

  it('chain jumps `count` times, never back to an enemy it already hit, and stops when nobody is near', () => {
    const a = makeEnemy({ id: 1, x: 100, y: 300, hp: 100, type: 'electric' });
    const b = makeEnemy({ id: 2, x: 150, y: 300, hp: 100, type: 'electric' });
    const c = makeEnemy({ id: 3, x: 200, y: 300, hp: 100, type: 'electric' });
    const d = makeEnemy({ id: 4, x: 400, y: 300, hp: 100, type: 'electric' });
    const run = arena(a, b, c, d);
    const ball = effects({ kind: 'chain', strength: 0.5, count: 3 });
    applyHitEffects(run, quietConfig, ball, a, 10);
    const eff = quietConfig.typeChart.fire.electric;
    expect([b.hp, c.hp, d.hp]).toEqual([100 - 5 * eff, 100 - 5 * eff, 100]);
    expect(a.hp).toBe(100);
    expect(run.events.filter((e) => e.type === 'chain')).toEqual([
      { type: 'chain', fromX: 100, fromY: 300, toX: 150, toY: 300 },
      { type: 'chain', fromX: 150, fromY: 300, toX: 200, toY: 300 },
    ]);
  });

  it('chain with no count jumps once, as in the first stage', () => {
    const a = makeEnemy({ id: 1, x: 100, y: 300, hp: 100 });
    const b = makeEnemy({ id: 2, x: 150, y: 300, hp: 100 });
    const c = makeEnemy({ id: 3, x: 200, y: 300, hp: 100 });
    const run = arena(a, b, c);
    applyHitEffects(run, quietConfig, effects({ kind: 'chain', strength: 1 }), a, 10);
    expect(b.hp).toBeLessThan(100);
    expect(c.hp).toBe(100);
  });
});

describe('damage to the player goes through one door (ADR-032)', () => {
  it('damagePlayer subtracts and a leak uses it', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    damagePlayer(run, 3);
    expect(run.player.hp).toBe(quietConfig.player.maxHp - 3);
    run.enemies = [
      makeEnemy({ id: 1, y: quietConfig.arena.defenseLineY - 1, speed: 2, threat: 4 }),
    ];
    run.loadout = [];
    run.cooldowns = [];
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.player.hp).toBe(quietConfig.player.maxHp - 7);
    expect(run.events).toContainEqual({ type: 'leak', enemyId: 1, damage: 4 });
  });
});

describe('what a leak costs grows with the form of the enemy (ADR-032)', () => {
  const cfg = (tier: number, perTier: number): GameConfig =>
    withConfig({
      enemy: { ...quietConfig.enemy, threat: 1, threatPerTier: perTier },
      waves: [
        {
          durationTicks: 1000,
          spawnIntervalTicks: 1,
          speedScale: 1,
          hpScale: 1,
          types: ['water'],
          tier,
        },
      ],
    });
  const spawnedThreat = (c: GameConfig): number | undefined => {
    const run = createRun(c, 1, 'charmander');
    tick(run, { moveX: 0 }, c);
    return run.enemies[0]?.threat;
  };

  it('threat = base + (form - 1) x threatPerTier', () => {
    expect(spawnedThreat(cfg(1, 2))).toBe(1);
    expect(spawnedThreat(cfg(2, 2))).toBe(3);
    expect(spawnedThreat(cfg(3, 2))).toBe(5);
    expect(spawnedThreat(cfg(3, 0))).toBe(1);
  });
});

describe('the first wave is fair for every starter (ADR-033)', () => {
  const theme = (id: string, type: GameType) => ({
    id,
    name: id,
    type,
    species: ['psyduck'],
    purity: 1,
  });
  const fair: GameConfig = withConfig({
    themes: {
      fire: theme('fire', 'fire'),
      water: theme('water', 'water'),
      grass: theme('grass', 'grass'),
      electric: theme('electric', 'electric'),
    },
    waves: [
      {
        durationTicks: 100,
        spawnIntervalTicks: 10,
        speedScale: 1,
        hpScale: 1,
        types: ['water'],
        themes: ['fire', 'water', 'grass', 'electric'],
      },
      {
        durationTicks: 100,
        spawnIntervalTicks: 10,
        speedScale: 1,
        hpScale: 1,
        types: ['water'],
        themes: ['fire', 'water', 'grass', 'electric'],
      },
    ],
  });

  it('never starts against a type that resists the starter, whatever the seed', () => {
    for (const [starter, type] of [
      ['charmander', 'fire'],
      ['squirtle', 'water'],
      ['bulbasaur', 'grass'],
      ['pikachu', 'electric'],
    ] as const) {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 80; seed++) {
        const run = createRun(fair, seed, starter);
        const first = run.waveThemes[0] ?? '';
        seen.add(first);
        expect(quietConfig.typeChart[type][first as GameType]).toBeGreaterThanOrEqual(1);
      }
      expect(seen.size).toBeGreaterThan(1); // not always the same one either
    }
  });

  it('only the first wave is filtered, and the stream still advances the same number of times', () => {
    const later = new Set<string>();
    for (let seed = 1; seed <= 80; seed++)
      later.add(createRun(fair, seed, 'charmander').waveThemes[1] ?? '');
    expect(later.has('fire')).toBe(true); // wave 2 may be fire for a fire starter
    // Same seed, same later waves whatever the starter: the filter changes only the first draw.
    const a = createRun(fair, 7, 'charmander');
    const b = createRun(fair, 7, 'squirtle');
    expect(a.rng.themes).toEqual(b.rng.themes);
  });

  it('when no theme is fair it falls back to all of them instead of having none', () => {
    const onlyFire = withConfig({
      themes: { fire: theme('fire', 'fire') },
      waves: [{ ...(fair.waves[0] as GameConfig['waves'][number]), themes: ['fire'] }],
    });
    expect(createRun(onlyFire, 1, 'charmander').waveThemes).toEqual(['fire']);
  });
});
