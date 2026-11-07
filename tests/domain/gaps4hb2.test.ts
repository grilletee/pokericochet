import { describe, expect, it } from 'vitest';
import {
  applyHitEffects,
  attackTypeOf,
  createRun,
  damageEnemy,
  type GameConfig,
  tick,
} from '../../src/domain';
import { tickAilments } from '../../src/domain/effects';
import { config, flyingRun, makeBall, makeBody, makeEnemy, quietConfig } from './fixtures';

describe('gaps found by the mutants of the 4H-B2 and the 4G-B', () => {
  it('a move of a type the species does not have does not become its attack type', () => {
    const cfg: GameConfig = {
      ...quietConfig,
      moves: { ...quietConfig.moves, byBase: { psyduck: ['m', 'm', 'm'] }, types: { m: 'fire' } },
    };
    expect(attackTypeOf(cfg, 'psyduck', 1, 'water')).toBe('water');
    const own: GameConfig = { ...cfg, moves: { ...cfg.moves, types: { m: 'water' } } };
    expect(attackTypeOf(own, 'psyduck', 1, 'fire')).toBe('water');
  });

  it('a ball hitting an enemy of two types reports the product of the cells', () => {
    const target = makeEnemy({ id: 1, type: 'grass', type2: 'bug', y: 300, hp: 5000 });
    const run = flyingRun(
      makeBall({ type: 'fire', effects: [] }),
      [target],
      makeBody({ x: 240, y: 318 }),
    );
    const events = tick(run, { moveX: 0 }, quietConfig).events;
    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ effectiveness: 3 });
  });

  it('poison restarts its clock on every hit; a curse keeps the clock of its first hit', () => {
    const target = makeEnemy();
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = [target];
    const poison = makeBall({ effects: [{ kind: 'poison', strength: 1 }] });
    applyHitEffects(run, quietConfig, poison, target, 10);
    for (let i = 0; i < 100; i++) tickAilments(run, quietConfig);
    applyHitEffects(run, quietConfig, poison, target, 10);
    expect(target.poisonTicks).toBe(quietConfig.effects.poisonTicks);
    const other = makeEnemy({ id: 2 });
    run.enemies = [other];
    const curse = makeBall({ effects: [{ kind: 'curse', strength: 1 }] });
    applyHitEffects(run, quietConfig, curse, other, 10);
    for (let i = 0; i < 60; i++) tickAilments(run, quietConfig);
    applyHitEffects(run, quietConfig, curse, other, 10);
    expect(other.curseTicks).toBe((quietConfig.effects.curseTicks ?? 0) - 60);
  });

  it('a quake reaches an enemy exactly at the edge of the column', () => {
    const target = makeEnemy({ id: 1, x: 240, y: 300 });
    const edge = makeEnemy({ id: 2, x: 268, y: 100 });
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = [target, edge];
    applyHitEffects(
      run,
      quietConfig,
      makeBall({ effects: [{ kind: 'quake', strength: 0.5, radius: 28 }] }),
      target,
      10,
    );
    expect(edge.hp).toBeLessThan(1000);
  });

  it('a stun does not replace a stop already running (ice)', () => {
    const target = makeEnemy();
    target.haltTicks = 50;
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = [target];
    applyHitEffects(
      run,
      quietConfig,
      makeBall({ effects: [{ kind: 'stun', strength: 1 }] }),
      target,
      10,
    );
    expect(target.haltTicks).toBe(50);
  });

  it('a mark adds to the damage of a hit', () => {
    const target = makeEnemy();
    target.markTicks = 100;
    target.markBonus = 0.5;
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = [target];
    damageEnemy(run, quietConfig, target, 10);
    expect(target.hp).toBe(985);
  });

  it('the fairy guard lowers a real leak and runs out tick by tick', () => {
    const leaker = makeEnemy({ id: 1, y: 639, speed: 5, threat: 10 });
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = [leaker];
    run.guardTicks = 5;
    tick(run, { moveX: 0 }, quietConfig);
    expect(run.player.maxHp - run.player.hp).toBe(9); // x0.85 of 10, rounded
    expect(run.guardTicks).toBe(4);
  });

  it('the health stat of a boss counts between 60 and 110', () => {
    for (const [stat, expected] of [
      [300, 110],
      [5, 60],
    ] as const) {
      const base = config.species.gyarados;
      if (base === undefined || config.boss === undefined) throw new Error('fixture');
      const cfg: GameConfig = {
        ...config,
        boss: { ...config.boss, species: 'gyarados' },
        species: {
          ...config.species,
          gyarados: { ...base, baseStats: { ...base.baseStats, hp: stat } },
        },
      };
      const run = createRun(cfg, 3, 'charmander');
      run.wave.index = cfg.waves.length;
      tick(run, { moveX: 0 }, cfg);
      const boss = run.enemies.find((e) => e.id === run.boss.id);
      expect(boss?.hp).toBeCloseTo(expected * cfg.enemy.hpScale * config.boss.hpScale, 6);
    }
  });
});
