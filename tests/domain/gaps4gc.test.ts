import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  advancePickups,
  type BossAttackDef,
  cloneRun,
  createRun,
  deriveRng,
  type GameConfig,
  type Hazard,
  hashRun,
  type Run,
  startFight,
  tick,
} from '../../src/domain';
import { config, makeBall, makeBody, makeEnemy, quietConfig } from './fixtures';

const fight = gameConfig.bossFight;
if (fight === undefined) throw new Error('no boss fight table');

const column: BossAttackDef = {
  kind: 'column',
  width: 60,
  telegraphTicks: 70,
  activeTicks: 20,
  damage: 2,
};

function testConfig(attack: BossAttackDef = column, perRound = 1): GameConfig {
  const phase = (mult: number) => ({
    attacks: [attack],
    intervalTicks: 100,
    perRound,
    damageMult: mult,
    coreEvery: 200,
    coreOpen: 90,
  });
  const table = { phases: [phase(1), phase(2)] as const };
  return {
    ...quietConfig,
    bossFight: {
      ...fight,
      bySpecies: { psyduck: table },
      byType: {},
      default: table,
      calmTicks: 30,
    },
  } as GameConfig;
}

function withBoss(cfg: GameConfig): { run: Run; boss: ReturnType<typeof makeEnemy> } {
  const run = createRun(cfg, 5, 'charmander');
  const boss = makeEnemy({ id: 9, species: 'psyduck', hp: 1000, x: 240, y: 120, radius: 40 });
  run.enemies = [boss];
  run.boss.id = 9;
  run.boss.maxHp = 1000;
  startFight(run, cfg, boss);
  run.events.length = 0;
  return { run, boss };
}

describe('gaps found by the mutants of the 4G-C', () => {
  it('the bosses met so far are part of the hash by what they are, not only by how many', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    const a = cloneRun(run);
    const b = cloneRun(run);
    a.boss.used = ['abra'];
    b.boss.used = ['zubat'];
    expect(hashRun(a)).not.toBe(hashRun(b));
  });

  it('the core opens at a different place each time, inside the body', () => {
    const cfg = testConfig();
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const { run, boss } = withBoss(cfg);
      run.rng.boss = deriveRng(seed * 7919, 'boss');
      run.boss.coreIn = 1;
      advanceBossFight(run, cfg);
      expect(run.boss.coreOpen).toBeGreaterThan(0);
      expect(Math.abs(run.boss.weakX)).toBeLessThanOrEqual(boss.radius * 0.55 + 1e-9);
      seen.add(Math.round(run.boss.weakX));
    }
    expect(seen.size).toBeGreaterThan(10);
    expect(Math.max(...seen)).toBeGreaterThan(5); // it goes to the right as well as the left...
    expect(Math.min(...seen)).toBeLessThan(-5);
    expect(Math.max(...[...seen].map(Math.abs))).toBeGreaterThan(14); // ...and near the edge of the body
  });

  it('through the tick, a ball on the open core does about five times what one beside it does', () => {
    const cfg = testConfig();
    const dealt = (x: number, y: number): number => {
      const { run, boss } = withBoss(cfg);
      run.boss.coreOpen = 50;
      run.boss.weakX = 0;
      run.loadout = [makeBall({ effects: [] })];
      run.cooldowns = [-1];
      run.bodies = [makeBody({ x: boss.x + x, y: boss.y + y, vy: -1 })];
      const before = boss.hp;
      tick(run, { moveX: 0 }, cfg);
      return before - boss.hp;
    };
    const onCore = dealt(0, 20); // inside the core (radius 18 + ball 6)
    const beside = dealt(22, 30); // touches the body but not the core
    expect(beside).toBeGreaterThan(0);
    expect(onCore / beside).toBeCloseTo(fight.coreHitMult, 6);
  });

  it('balls on a patch of floor made by a boss are not collected, and are outside it', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.player.x = 100;
    const zone: Hazard = {
      kind: 'zone',
      x: 100,
      y: 0,
      width: 80,
      telegraph: 0,
      active: 50,
      damage: 0,
      speed: 0,
      struck: false,
    };
    run.hazards = [zone];
    run.pickups = [
      {
        slot: -1,
        species: 'charmander',
        type: 'fire',
        x: 110,
        y: quietConfig.player.y,
        level: 1,
        ticks: 999,
      },
    ];
    advancePickups(run, quietConfig);
    expect(run.pickups).toHaveLength(1); // in reach but sealed
    run.hazards = [];
    advancePickups(run, quietConfig);
    expect(run.pickups).toHaveLength(0); // collected once the patch is gone
  });

  it('a gust never pushes the player out of the floor, in either direction', () => {
    const cfg = testConfig();
    for (const speed of [3, -3]) {
      const { run } = withBoss(cfg);
      run.hazards = [
        {
          kind: 'gust',
          x: 240,
          y: 0,
          width: 480,
          telegraph: 0,
          active: 200,
          damage: 0,
          speed,
          struck: false,
        },
      ];
      run.player.x = speed > 0 ? 440 : 40;
      for (let i = 0; i < 80; i++) advanceBossFight(run, cfg);
      expect(run.player.x).toBe(speed > 0 ? 460 : 20);
    }
  });

  it('a round launches as many attacks as its phase says', () => {
    const cfg = testConfig({ ...column, telegraphTicks: 70 }, 3);
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    expect(run.hazards).toHaveLength(3);
  });

  it('the reinforcements a boss asked for are spawned, exactly as many', () => {
    const cfg: GameConfig = {
      ...config,
      boss: { ...(config.boss as NonNullable<GameConfig['boss']>), species: 'gyarados' },
    };
    const run = createRun(cfg, 3, 'charmander');
    run.wave.index = cfg.waves.length;
    tick(run, { moveX: 0 }, cfg); // the final boss comes in
    expect(run.boss.id).not.toBe(0);
    const before = run.enemies.length;
    run.boss.summonDebt = 2;
    tick(run, { moveX: 0 }, cfg);
    expect(run.enemies.length - before).toBe(2);
    expect(run.boss.summonDebt).toBe(0);
  });
});
