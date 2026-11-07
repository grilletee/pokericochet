import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  type BossAttackDef,
  type BossMechanicDef,
  barrierUp,
  cloneRun,
  createRun,
  fieldMargin,
  type GameConfig,
  hashRun,
  playerSpeedMult,
  type Run,
  startFight,
  tick,
} from '../../src/domain';
import { makeBall, makeBody, makeEnemy, quietConfig } from './fixtures';

const fight = gameConfig.bossFight;
if (fight === undefined) throw new Error('no boss fight table');

// A boss that never attacks on its own (very long rounds), so only the mechanic acts.
const idle: BossAttackDef = {
  kind: 'column',
  width: 40,
  telegraphTicks: 70,
  activeTicks: 20,
  damage: 1,
};

function configWith(mechanic: BossMechanicDef | undefined): GameConfig {
  const phase = {
    attacks: [idle],
    intervalTicks: 100000,
    perRound: 1,
    damageMult: 1,
    coreEvery: 100000,
    coreOpen: 90,
    strong: idle,
  };
  const table = {
    phases: [phase, phase] as const,
    ...(mechanic === undefined ? {} : { mechanic }),
  };
  return {
    ...quietConfig,
    bossFight: {
      ...fight,
      bySpecies: { psyduck: table },
      byType: {},
      default: table,
      calmTicks: 5,
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

function steps(run: Run, cfg: GameConfig, n: number): void {
  for (let i = 0; i < n; i++) advanceBossFight(run, cfg);
}

describe('the exclusive mechanics of the legendaries (ADR-054)', () => {
  it('tide: the field narrows over time, never beyond its maximum, and pushes the player in', () => {
    const cfg = configWith({ kind: 'tide', maxSqueeze: 0.5, riseTicks: 100 });
    const { run } = withBoss(cfg);
    const before = fieldMargin(run, cfg);
    run.player.x = 2;
    steps(run, cfg, 50);
    expect(fieldMargin(run, cfg)).toBeGreaterThan(before);
    expect(run.player.x).toBeGreaterThanOrEqual(fieldMargin(run, cfg));
    steps(run, cfg, 5000);
    // Normal phase: only 55 % of the maximum; it stays there and does not keep growing.
    expect(run.boss.squeeze).toBeCloseTo(0.5 * 0.55, 6);
    run.boss.phase = 1;
    steps(run, cfg, 5000);
    expect(run.boss.squeeze).toBeCloseTo(0.5, 6);
  });

  it('cracks: a few cracks open in the floor, announced first, and they hurt once active', () => {
    const cfg = configWith({ kind: 'cracks', everyTicks: 60, count: 2, lastTicks: 100 });
    const { run } = withBoss(cfg);
    steps(run, cfg, 250); // the mechanic starts after a calm of 240 ticks
    const cracks = run.hazards.filter((h) => h.kind === 'crack');
    expect(cracks.length).toBeGreaterThanOrEqual(2);
    for (const c of cracks) expect(c.telegraph).toBeGreaterThanOrEqual(0);
    expect(cracks.every((c) => c.damage > 0)).toBe(true);
  });

  it('barrier: goes up and down on its clock and reflects balls that touch the boss while it is up', () => {
    const cfg = configWith({ kind: 'barrier', onTicks: 50, offTicks: 30 });
    const { run } = withBoss(cfg);
    let up = false;
    let down = false;
    for (let i = 0; i < 400; i++) {
      advanceBossFight(run, cfg);
      for (const e of run.events) {
        if (e.type === 'bossBarrier') {
          if (e.up) up = true;
          else down = true;
        }
      }
      run.events.length = 0;
    }
    expect(up && down).toBe(true);
    run.boss.barrier = 10;
    expect(barrierUp(run)).toBe(true);
    const hit = (barrier: number): number => {
      const w = withBoss(cfg);
      w.run.boss.barrier = barrier;
      w.run.loadout = [makeBall({ effects: [] })];
      w.run.cooldowns = [-1];
      w.run.bodies = [makeBody({ x: w.boss.x, y: w.boss.y + 30, vy: -1 })];
      const before = w.boss.hp;
      tick(w.run, { moveX: 0 }, cfg);
      return before - w.boss.hp;
    };
    expect(hit(0)).toBeGreaterThan(0);
    expect(hit(40)).toBe(0);
  });

  it('timeSlow: slows the player for a while and then lets go', () => {
    const cfg = configWith({ kind: 'timeSlow', everyTicks: 60, lastTicks: 40, mult: 0.5 });
    const { run } = withBoss(cfg);
    expect(playerSpeedMult(run, cfg)).toBe(1);
    let slowed = false;
    let freed = false;
    for (let i = 0; i < 300; i++) {
      advanceBossFight(run, cfg);
      const m = playerSpeedMult(run, cfg);
      if (m === 0.5) slowed = true;
      if (slowed && m === 1) freed = true;
    }
    expect(slowed && freed).toBe(true);
  });

  it('portals: open in pairs that point at each other', () => {
    const cfg = configWith({ kind: 'portals', everyTicks: 50, lastTicks: 200 });
    const { run } = withBoss(cfg);
    steps(run, cfg, 250);
    const portals = run.hazards.filter((h) => h.kind === 'portal');
    expect(portals.length).toBeGreaterThanOrEqual(2);
    const [a, b] = portals;
    expect(a?.link).toBeCloseTo(b?.x ?? -1, 9);
    expect(b?.link).toBeCloseTo(a?.x ?? -1, 9);
  });

  it('a boss without a mechanic has none of it, and the state is hashed and cloned', () => {
    const cfg = configWith(undefined);
    const { run } = withBoss(cfg);
    steps(run, cfg, 500);
    expect(run.boss.squeeze).toBe(0);
    expect(run.boss.barrier).toBe(0);
    expect(run.boss.timeSlow).toBe(0);
    const base = hashRun(run);
    expect(hashRun(cloneRun(run))).toBe(base);
    for (const change of [
      (r: Run) => {
        r.boss.squeeze += 0.1;
      },
      (r: Run) => {
        r.boss.barrier += 1;
      },
      (r: Run) => {
        r.boss.timeSlow += 1;
      },
      (r: Run) => {
        r.boss.mechIn += 1;
      },
      (r: Run) => {
        r.boss.portalCool += 1;
      },
    ]) {
      const copy = cloneRun(run);
      change(copy);
      expect(hashRun(copy)).not.toBe(base);
    }
  });
});

describe('the legendaries as data (ADR-054)', () => {
  const finals = gameConfig.boss?.finals ?? [];

  it('there are at least 35 final bosses, every one of them a species of the game with its own table', () => {
    expect(finals.length).toBeGreaterThanOrEqual(35);
    expect(new Set(finals).size).toBe(finals.length);
    for (const id of finals) {
      expect(gameConfig.species[id], id).toBeDefined();
      expect(fight.bySpecies[id], id).toBeDefined();
    }
  });

  it('the five iconic ones have exactly the mechanic of their theme', () => {
    const kind = (id: string) => fight.bySpecies[id]?.mechanic?.kind;
    expect(kind('kyogre')).toBe('tide');
    expect(kind('groudon')).toBe('cracks');
    expect(kind('mewtwo')).toBe('barrier');
    expect(kind('dialga')).toBe('timeSlow');
    expect(kind('palkia')).toBe('portals');
  });

  it('every attack of every legendary is announced for at least 60 ticks, and strong attacks too', () => {
    for (const [id, table] of Object.entries(fight.bySpecies)) {
      for (const p of table.phases) {
        for (const a of [...p.attacks, p.strong]) {
          if (a.damage > 0 || a.kind === 'zone' || a.kind === 'gust') {
            expect(a.telegraphTicks, `${id} ${a.kind}`).toBeGreaterThanOrEqual(60);
          }
        }
      }
    }
  });

  it('the intermediate bosses have no mechanic of their own', () => {
    for (const table of Object.values(fight.byType)) expect(table?.mechanic).toBeUndefined();
  });
});
