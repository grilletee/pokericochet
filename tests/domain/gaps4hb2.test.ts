import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  applyHitEffects,
  attackTypeOf,
  createRun,
  damageEnemy,
  type GameConfig,
  hitWeakPoint,
  startFight,
  tick,
} from '../../src/domain';
import { tickAilments } from '../../src/domain/effects';
import { config, flyingRun, makeBall, makeBody, makeEnemy, quietConfig } from './fixtures';

const fight = gameConfig.bossFight;
if (fight === undefined) throw new Error('no boss fight table');

const column = {
  kind: 'column' as const,
  width: 60,
  telegraphTicks: 70,
  activeTicks: 20,
  damage: 3,
};
function fightConfig(attack = column, extra: Partial<GameConfig> = {}): GameConfig {
  const table = {
    phases: [
      { fromHp: 1, attacks: [attack], intervalTicks: 100 },
      {
        fromHp: 0.66,
        attacks: [attack],
        intervalTicks: 90,
        shield: { share: 0.1, weakRadius: 20, weakSpeed: 1 },
      },
      { fromHp: 0.33, attacks: [attack], intervalTicks: 80 },
    ],
  };
  return {
    ...quietConfig,
    ...extra,
    bossFight: {
      ...fight,
      bySpecies: { psyduck: table },
      byType: {},
      default: table,
      phasePauseTicks: 30,
    },
  } as GameConfig;
}
function withBoss(cfg: GameConfig) {
  const run = createRun(cfg, 5, 'charmander');
  const boss = makeEnemy({ id: 9, species: 'psyduck', hp: 1000, x: 240, y: 120, radius: 40 });
  run.enemies = [boss];
  run.boss.id = 9;
  run.boss.maxHp = 1000;
  startFight(run, cfg, boss);
  run.events.length = 0;
  return { run, boss };
}

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

  it('the weak point counts exactly at its reach, and a ball on the way hurts the shield', () => {
    const cfg = fightConfig();
    const { run, boss } = withBoss(cfg);
    boss.hp = 660;
    advanceBossFight(run, cfg);
    run.boss.weakX = 0;
    hitWeakPoint(run, cfg, boss, boss.x + 26, boss.y, 6, 10); // radius 20 + ball 6
    expect(run.boss.shieldHp).toBeCloseTo(90, 9);
    // The same through the tick: a ball sitting on the weak point.
    const ball = makeBall({ effects: [] });
    run.loadout = [ball];
    run.cooldowns = [-1];
    run.bodies = [makeBody({ x: boss.x, y: boss.y + 20, vy: -1 })];
    const before = run.boss.shieldHp;
    tick(run, { moveX: 0 }, cfg);
    expect(run.boss.shieldHp).toBeLessThan(before);
  });

  it('a column covers its whole width, edges included, and the guard lowers its damage', () => {
    const cfg = {
      ...fightConfig(),
      stats: { ...quietConfig.stats, guardMax: 0.5, guardStatMin: 0, guardStatMax: 1 },
    } as GameConfig;
    for (const [offset, hurt] of [
      [30, true],
      [25, true],
      [31, false],
    ] as const) {
      const { run } = withBoss(cfg);
      run.boss.attackIn = 1;
      advanceBossFight(run, cfg);
      const x = run.hazards[0]?.x ?? 0;
      run.player.x = x + offset;
      const hp = run.player.hp;
      for (let i = 0; i < 72; i++) advanceBossFight(run, cfg);
      expect(hp - run.player.hp, `offset ${offset}`).toBe(hurt ? 2 : 0); // 3 x 0.5 rounded
    }
  });

  it('the weak point goes back and forth more than once', () => {
    const cfg = fightConfig();
    const { run, boss } = withBoss(cfg);
    boss.hp = 660;
    advanceBossFight(run, cfg);
    const signs: number[] = [];
    for (let i = 0; i < 120; i++) {
      advanceBossFight(run, cfg);
      const s = Math.sign(run.boss.weakX);
      if (s !== 0 && signs[signs.length - 1] !== s) signs.push(s);
    }
    expect(signs.length).toBeGreaterThanOrEqual(3);
    expect(signs.slice(0, 3)).toEqual([1, -1, 1]);
  });
});
