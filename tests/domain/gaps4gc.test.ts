import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  advancePickups,
  type BossAttackDef,
  cloneRun,
  createRun,
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
    strong: { ...attack, damage: attack.damage + 1 },
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

  it('through the tick, a ball does the same to the boss charging or not (4G-H: no exposed bonus)', () => {
    const cfg = testConfig();
    const dealt = (open: number): number => {
      const { run, boss } = withBoss(cfg);
      run.boss.coreOpen = open;
      run.loadout = [makeBall({ effects: [] })];
      run.cooldowns = [-1];
      run.bodies = [makeBody({ x: boss.x, y: boss.y + 30, vy: -1 })];
      const before = boss.hp;
      tick(run, { moveX: 0 }, cfg);
      return before - boss.hp;
    };
    const guarded = dealt(0);
    expect(guarded).toBeGreaterThan(0);
    expect(dealt(50) / guarded).toBeCloseTo(1, 6);
  });

  it('balls on a patch of floor made by a boss are not collected, and are outside it', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.player.x = 100;
    const zone: Hazard = {
      kind: 'zone',
      x: 100,
      link: 0,
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
          link: 0,
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
