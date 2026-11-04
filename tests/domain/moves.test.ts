import { describe, expect, it } from 'vitest';
import {
  type Ball,
  chargeNeed,
  cloneRun,
  createBall,
  createRun,
  type Enemy,
  type GameConfig,
  hashRun,
  hitDamage,
  landHit,
  type MoveShapeDef,
  moveIdOf,
  moveShape,
  type Run,
  tick,
} from '../../src/domain';
import { makeBall, makeBody, makeEnemy, withConfig } from './fixtures';

/** A config where fire Pokémon have a move at every stage, so the hand-built scenarios cast. */
function configWith(
  tiers: GameConfig['moves']['tiers'],
  signatures: GameConfig['moves']['signatures'] = {},
  charge: readonly number[] = [3, 3, 3],
): GameConfig {
  return withConfig({
    moves: {
      chargeByStage: charge,
      tiers,
      byBase: { charmander: ['ember', 'flamethrower', 'fire-blast'] },
      signatures,
      status: { fire: { burn: 2 }, water: { slow: 0.3 } },
    },
  });
}

const tiers: GameConfig['moves']['tiers'] = [
  { kind: 'burst', radius: 50, power: 2 },
  { kind: 'beam', width: 40, power: 3 },
  { kind: 'nova', radius: 120, power: 4 },
];
const cfg = configWith(tiers);

/** A run whose first Pokémon is one step short of its move, with these enemies. */
function loaded(enemies: Enemy[], stage = 1, config: GameConfig = cfg): { run: Run; ball: Ball } {
  const run = createRun(config, 1, 'charmander');
  run.enemies = enemies;
  const member = run.team[0];
  if (member === undefined) throw new Error('no team');
  member.charge = chargeNeed(config, stage) - 1;
  const ball = createBall(config, 'charmander', 1, 0, stage === 1 ? 1 : stage === 2 ? 3 : 6);
  run.events.length = 0;
  return { run, ball };
}

const hp = (e: Enemy) => 1000 - e.hp;

describe('charge by hits (ADR-039)', () => {
  it('gains one per landed hit and casts when it reaches the need, then starts again', () => {
    const run = createRun(cfg, 1, 'charmander');
    const target = makeEnemy({ id: 7, x: 240, y: 300 });
    run.enemies = [target];
    const ball = createBall(cfg, 'charmander', 1);
    const need = chargeNeed(cfg, 1);
    for (let i = 1; i < need; i++) {
      landHit(run, cfg, ball, target);
      expect(run.team[0]?.charge).toBe(i);
      expect(run.events.filter((e) => e.type === 'move')).toHaveLength(0);
    }
    landHit(run, cfg, ball, target);
    expect(run.team[0]?.charge).toBe(0);
    expect(run.events.filter((e) => e.type === 'move')).toHaveLength(1);
    landHit(run, cfg, ball, target);
    expect(run.team[0]?.charge).toBe(1);
  });

  it('needs fewer hits at later stages (the need comes from the data and repeats its last value)', () => {
    const c = configWith(tiers, {}, [10, 8, 6]);
    expect([1, 2, 3].map((stage) => chargeNeed(c, stage))).toEqual([10, 8, 6]);
    expect(chargeNeed(c, 4)).toBe(6);
    expect(chargeNeed(withConfig({ moves: { ...c.moves, chargeByStage: [] } }), 1)).toBe(1);
  });

  it('a Pokémon without a move in the data never charges, and a ball without a Pokémon is ignored', () => {
    const run = createRun(cfg, 1, 'squirtle'); // the fixture has no move for it
    const target = makeEnemy();
    run.enemies = [target];
    landHit(run, cfg, createBall(cfg, 'squirtle', 1, 0), target);
    expect(run.team[0]?.charge).toBe(0);
    landHit(run, cfg, makeBall({ owner: 5 }), target); // nobody owns it
    expect(run.team[0]?.charge).toBe(0);
    expect(run.events).toEqual([]);
  });

  it('a real hit of a ball in flight charges its Pokémon (through the tick)', () => {
    const run = createRun(cfg, 1, 'charmander');
    run.autoAim = false;
    const ball = run.loadout[0] as Ball;
    run.cooldowns = [-1];
    run.bodies = [makeBody({ x: 240, y: 400, vy: -6 })];
    run.enemies = [makeEnemy({ x: 240, y: 380 })];
    expect(ball.owner).toBe(0);
    tick(run, { moveX: 0 }, cfg);
    expect(run.events.some((e) => e.type === 'hit')).toBe(true);
    expect(run.team[0]?.charge).toBe(1);
  });

  it('is part of the state: hashed and cloned', () => {
    const a = createRun(cfg, 1, 'charmander');
    const b = cloneRun(a);
    expect(hashRun(b)).toBe(hashRun(a));
    (a.team[0] as { charge: number }).charge = 4;
    expect(hashRun(a)).not.toBe(hashRun(b));
    expect(cloneRun(a).team[0]?.charge).toBe(4);
  });
});

describe('the event of a move', () => {
  it('names the move of the stage, the Pokémon, the shape and how many enemies it reached', () => {
    const target = makeEnemy({ id: 7, x: 240, y: 300 });
    const near = makeEnemy({ id: 8, x: 270, y: 300 });
    const far = makeEnemy({ id: 9, x: 400, y: 300 });
    const { run, ball } = loaded([target, near, far]);
    landHit(run, cfg, ball, target);
    expect(run.events.find((e) => e.type === 'move')).toEqual({
      type: 'move',
      member: 0,
      species: 'charmander',
      starter: true,
      move: 'ember',
      tier: 1,
      element: 'fire',
      shape: 'burst',
      size: 50,
      x: 240,
      y: 300,
      hits: 2,
      damage: expect.closeTo(hp(target) + hp(near), 9),
    });
  });

  it('picks the move of the stage of the ball: stage 2 and 3 have their own', () => {
    expect([1, 2, 3, 4].map((stage) => moveIdOf(cfg, 'charmander', stage))).toEqual([
      'ember',
      'flamethrower',
      'fire-blast',
      'fire-blast',
    ]);
    expect(moveIdOf(cfg, 'nobody', 1)).toBeUndefined();
    for (const [stage, move] of [
      [1, 'ember'],
      [2, 'flamethrower'],
      [3, 'fire-blast'],
    ] as const) {
      const target = makeEnemy({ id: 7 });
      const { run, ball } = loaded([target], stage);
      landHit(run, cfg, ball, target);
      expect(run.events.find((e) => e.type === 'move')).toMatchObject({ move, tier: stage });
    }
  });
});

describe('shapes (ADR-039): who a move reaches', () => {
  /** Enemies in a cross around (240, 300), 50 px apart, plus ones off every line. */
  const around = (): Enemy[] => [
    makeEnemy({ id: 1, x: 240, y: 300 }), // the target
    makeEnemy({ id: 2, x: 240, y: 200 }), // same column, above
    makeEnemy({ id: 3, x: 240, y: 400 }), // same column, below
    makeEnemy({ id: 4, x: 100, y: 300 }), // same row, far left
    makeEnemy({ id: 5, x: 290, y: 300 }), // same row, 50 right
    makeEnemy({ id: 6, x: 100, y: 100 }), // nowhere near
  ];
  const reached = (shape: MoveShapeDef): number[] => {
    const c = configWith([
      { ...shape, power: 1 },
      { ...shape, power: 1 },
      { ...shape, power: 1 },
    ]);
    const enemies = around();
    const target = enemies[0] as Enemy;
    const { run, ball } = loaded(enemies, 1, c);
    landHit(run, c, ball, target);
    return enemies.filter((e) => hp(e) > 0).map((e) => e.id);
  };

  it('burst and nova: everyone inside the circle, the target included', () => {
    expect(reached({ kind: 'burst', radius: 60 })).toEqual([1, 5]);
    expect(reached({ kind: 'burst', radius: 49 })).toEqual([1]);
    expect(reached({ kind: 'nova', radius: 120 })).toEqual([1, 2, 3, 5]);
    expect(reached({ kind: 'nova', radius: 10 })).toEqual([1]);
  });

  it('beam: the column of its width from the impact up to the top edge, nothing below', () => {
    expect(reached({ kind: 'beam', width: 40 })).toEqual([1, 2]);
    expect(reached({ kind: 'beam', width: 120 })).toEqual([1, 2, 5]); // wide enough to take the one 50 away
  });

  it('wave: the whole row, from wall to wall', () => {
    expect(reached({ kind: 'wave', width: 40 })).toEqual([1, 4, 5]);
  });

  it('cross: the column and the row together', () => {
    expect(reached({ kind: 'cross', width: 40 })).toEqual([1, 2, 3, 4, 5]);
  });

  it('chain: the target and the nearest enemies, one jump each, within the chain radius', () => {
    const c = configWith(
      [
        { kind: 'chain', count: 2, power: 1 },
        { kind: 'chain', count: 2, power: 1 },
        { kind: 'chain', count: 2, power: 1 },
      ],
      {},
      [3, 3, 3],
    );
    const enemies = around();
    const target = enemies[0] as Enemy;
    const { run, ball } = loaded(enemies, 1, c);
    landHit(run, c, ball, target);
    // The target, then its nearest (enemy 5 at 50 px). From 5 nothing else is within the chain
    // radius (80 px), so the second jump finds nobody and the chain ends there.
    expect(c.effects.chainRadius).toBe(80);
    expect(enemies.filter((e) => hp(e) > 0).map((e) => e.id)).toEqual([1, 5]);
    expect(run.events.filter((e) => e.type === 'chain')).toHaveLength(1);
    expect(run.events.find((e) => e.type === 'move')).toMatchObject({ shape: 'chain', hits: 2 });
    // With a longer reach the second jump goes on to the next nearest one.
    const far = withConfig({ ...c, effects: { ...c.effects, chainRadius: 120 } });
    const again = around();
    const second = loaded(again, 1, far);
    landHit(second.run, far, second.ball, again[0] as Enemy);
    expect(again.filter((e) => hp(e) > 0).map((e) => e.id)).toEqual([1, 2, 5]);
  });

  it('includes an enemy exactly on the edge of the shape, and not one pixel past it', () => {
    const edge = (shape: MoveShapeDef, dx: number, dy: number): boolean => {
      const c = configWith([
        { ...shape, power: 1 },
        { ...shape, power: 1 },
        { ...shape, power: 1 },
      ]);
      const target = makeEnemy({ id: 1, x: 240, y: 300 });
      const other = makeEnemy({ id: 2, x: 240 + dx, y: 300 + dy });
      const { run, ball } = loaded([target, other], 1, c);
      landHit(run, c, ball, target);
      return hp(other) > 0;
    };
    expect(edge({ kind: 'burst', radius: 50 }, 50, 0)).toBe(true);
    expect(edge({ kind: 'burst', radius: 50 }, 51, 0)).toBe(false);
    expect(edge({ kind: 'beam', width: 40 }, 20, -100)).toBe(true); // half the width
    expect(edge({ kind: 'beam', width: 40 }, 21, -100)).toBe(false);
    expect(edge({ kind: 'beam', width: 40 }, 0, 0)).toBe(true); // level with the impact
    expect(edge({ kind: 'wave', width: 40 }, 100, 20)).toBe(true);
    expect(edge({ kind: 'wave', width: 40 }, 100, 21)).toBe(false);
  });

  it('chain: jumps exactly `count` times, one by default, when there are enough enemies', () => {
    const line = (): Enemy[] =>
      [0, 1, 2, 3, 4].map((i) => makeEnemy({ id: i + 1, x: 240 + 40 * i, y: 300 }));
    const hitBy = (count: number | undefined): number => {
      const shape =
        count === undefined ? { kind: 'chain' as const } : { kind: 'chain' as const, count };
      const c = configWith([
        { ...shape, power: 1 },
        { ...shape, power: 1 },
        { ...shape, power: 1 },
      ]);
      const enemies = line();
      const { run, ball } = loaded(enemies, 1, c);
      landHit(run, c, ball, enemies[0] as Enemy);
      return enemies.filter((e) => hp(e) > 0).length;
    };
    expect(hitBy(undefined)).toBe(2); // the target and one jump
    expect(hitBy(1)).toBe(2);
    expect(hitBy(3)).toBe(4);
  });

  it('a move never weakens a slow the enemy already has, and renews its time', () => {
    const target = makeEnemy({ id: 1, type: 'fire', x: 240, y: 300, slow: 0.9, slowTicks: 5 });
    const { run, ball } = loaded([target]);
    landHit(run, cfg, { ...ball, type: 'water' }, target); // water slows by 0.3
    expect(target.slow).toBe(0.9);
    expect(target.slowTicks).toBe(cfg.effects.slowTicks);
    const gone = makeEnemy({ id: 2, type: 'fire', x: 240, y: 300, slow: 0.9, slowTicks: 0 });
    const again = loaded([gone]);
    landHit(again.run, cfg, { ...again.ball, type: 'water' }, gone);
    expect(gone.slow).toBe(0.3); // an old slow that wore off does not count
  });

  it('does not touch the enemies that are already dead', () => {
    const enemies = around();
    (enemies[1] as Enemy).hp = 0;
    const target = enemies[0] as Enemy;
    const { run, ball } = loaded(enemies);
    landHit(run, configWith(tiers), ball, target);
    expect(enemies[1]?.hp).toBe(0);
  });
});

describe('what a move does (ADR-039)', () => {
  it('hits for the hit of the Pokémon times the strength of the tier and its power cards', () => {
    const target = makeEnemy({ id: 1, type: 'grass', x: 240, y: 300 });
    const { run, ball } = loaded([target]);
    const member = run.team[0];
    if (member) member.damageUps = 2;
    run.player.damageMult = 1.5;
    landHit(run, cfg, ball, target);
    const power = run.player.damageMult * (1 + 2 * cfg.cards.powerStep);
    expect(hp(target)).toBeCloseTo(hitDamage(cfg, ball, 'grass') * power * 2, 9); // tier 1 strength 2
  });

  it('uses the effectiveness of the enemy it reaches, one by one', () => {
    const water = makeEnemy({ id: 1, type: 'water', x: 240, y: 300 });
    const grass = makeEnemy({ id: 2, type: 'grass', x: 260, y: 300 });
    const { run, ball } = loaded([water, grass]);
    landHit(run, cfg, ball, water);
    expect(hp(grass) / hp(water)).toBeCloseTo(
      cfg.typeChart.fire.grass / cfg.typeChart.fire.water,
      9,
    );
    expect(hp(grass)).toBeGreaterThan(hp(water));
  });

  it('applies the status of its type: fire burns, water slows', () => {
    const target = makeEnemy({ id: 1, type: 'grass', x: 240, y: 300 });
    const { run, ball } = loaded([target]);
    landHit(run, cfg, ball, target);
    expect(target.burnTicks).toBe(cfg.effects.burnTicks);
    expect(target.burnDps).toBeGreaterThan(0);

    const calm = makeEnemy({ id: 2, type: 'fire', x: 240, y: 300 });
    const water = loaded([calm]);
    const waterBall = { ...water.ball, type: 'water' as const };
    landHit(water.run, cfg, waterBall, calm);
    expect(calm.slowTicks).toBe(cfg.effects.slowTicks);
    expect(calm.slow).toBe(0.3);
    expect(calm.burnTicks).toBe(0);
  });

  it('a type without a status adds nothing but damage', () => {
    const c = withConfig({ moves: { ...cfg.moves, status: {} } });
    const target = makeEnemy({ id: 1, x: 240, y: 300 });
    const { run, ball } = loaded([target], 1, c);
    landHit(run, c, ball, target);
    expect(hp(target)).toBeGreaterThan(0);
    expect(target.burnTicks).toBe(0);
    expect(target.slowTicks).toBe(0);
  });

  it('kills count: an enemy that dies to a move is a kill with its experience', () => {
    const target = makeEnemy({ id: 1, hp: 0.5, x: 240, y: 300 });
    const { run, ball } = loaded([target]);
    const kills = run.kills;
    landHit(run, cfg, ball, target);
    expect(run.kills).toBe(kills + 1);
    expect(run.events.some((e) => e.type === 'kill')).toBe(true);
  });

  it('uses no random numbers: every stream is exactly where it was', () => {
    const enemies = [makeEnemy({ id: 1, x: 240, y: 300 }), makeEnemy({ id: 2, x: 260, y: 300 })];
    const { run, ball } = loaded(enemies);
    const rng = JSON.stringify(run.rng);
    landHit(run, cfg, ball, enemies[0] as Enemy);
    expect(run.events.some((e) => e.type === 'move')).toBe(true);
    // A kill would draw from `capture`; nobody dies here, so nothing moved.
    expect(JSON.stringify(run.rng)).toBe(rng);
  });

  it('is deterministic: the same state gives the same events and the same hash', () => {
    const make = () => {
      const enemies = around3();
      const { run, ball } = loaded(enemies);
      landHit(run, cfg, ball, enemies[0] as Enemy);
      return run;
    };
    const a = make();
    const b = make();
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(hashRun(a)).toBe(hashRun(b));
  });
});

function around3(): Enemy[] {
  return [
    makeEnemy({ id: 1, x: 240, y: 300 }),
    makeEnemy({ id: 2, x: 255, y: 310 }),
    makeEnemy({ id: 3, x: 225, y: 290 }),
  ];
}

describe('signatures: a hand-made shape instead of the tier (ADR-039)', () => {
  it('replaces the shape and the strength of one stage and leaves the others', () => {
    const c = configWith(tiers, {
      charmander: [null, null, { kind: 'cross', width: 48, power: 4.5 }],
    });
    expect(moveShape(c, 'charmander', 1)).toEqual(tiers[0]);
    expect(moveShape(c, 'charmander', 2)).toEqual(tiers[1]);
    expect(moveShape(c, 'charmander', 3)).toEqual({ kind: 'cross', width: 48, power: 4.5 });
    expect(moveShape(c, 'squirtle', 3)).toEqual(tiers[2]); // other species keep the tier
    expect(moveShape(c, 'charmander', 9)).toEqual({ kind: 'cross', width: 48, power: 4.5 });
  });

  it('keeps the strength of the tier when the signature does not give one', () => {
    const c = configWith(tiers, { charmander: [{ kind: 'wave', width: 50 }] });
    expect(moveShape(c, 'charmander', 1)).toEqual({ kind: 'wave', width: 50, power: 2 });
  });

  it('falls back to a plain burst if the config has no tiers at all', () => {
    const c = configWith([]);
    expect(moveShape(c, 'charmander', 1)).toEqual({ kind: 'burst', power: 1 });
  });

  it('the starters of the game have a signature at their last stage, with the shape of the design', () => {
    // The real data: a cross, a wave, a long beam and a chain of five (ADR-039).
    // (Imported lazily so this file stays about the rules, not the numbers.)
    return import('../../src/data').then(({ gameConfig }) => {
      const kind = (id: string, stage: number) => moveShape(gameConfig, id, stage).kind;
      expect(kind('charmander', 3)).toBe('cross');
      expect(kind('squirtle', 3)).toBe('wave');
      expect(kind('bulbasaur', 3)).toBe('beam');
      expect(kind('pikachu', 3)).toBe('chain');
      expect(moveShape(gameConfig, 'pikachu', 3).count).toBe(5);
    });
  });
});
