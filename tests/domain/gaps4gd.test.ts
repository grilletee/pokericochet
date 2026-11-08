import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  type BossAttackDef,
  type BossMechanicDef,
  createRun,
  createSnapshot,
  type GameConfig,
  type Hazard,
  type Run,
  startFight,
  tick,
  writeSnapshot,
} from '../../src/domain';
import { makeBall, makeBody, makeEnemy, quietConfig } from './fixtures';

const fight = gameConfig.bossFight;
if (fight === undefined) throw new Error('no boss fight table');

const normal: BossAttackDef = {
  kind: 'column',
  width: 40,
  telegraphTicks: 70,
  activeTicks: 20,
  damage: 1,
};
const strong: BossAttackDef = {
  kind: 'column',
  width: 177,
  telegraphTicks: 70,
  activeTicks: 20,
  damage: 2,
};

function configWith(mechanic?: BossMechanicDef): GameConfig {
  const phase = (every: number) => ({
    attacks: [normal],
    intervalTicks: 100000,
    perRound: 1,
    damageMult: 1,
    coreEvery: every,
    coreOpen: 30,
    strong,
  });
  const table = {
    phases: [phase(300), phase(222)] as const,
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

function withBoss(cfg: GameConfig, y = 120): { run: Run; boss: ReturnType<typeof makeEnemy> } {
  const run = createRun(cfg, 5, 'charmander');
  const boss = makeEnemy({
    id: 9,
    species: 'psyduck',
    hp: 1000,
    x: 240,
    y,
    radius: 40,
    speed: 0.04,
  });
  run.enemies = [boss];
  run.boss.id = 9;
  run.boss.maxHp = 1000;
  startFight(run, cfg, boss);
  run.events.length = 0;
  return { run, boss };
}

const hazard = (over: Partial<Hazard>): Hazard => ({
  kind: 'zone',
  x: 100,
  link: 0,
  y: 0,
  width: 60,
  telegraph: 0,
  active: 200,
  damage: 0,
  speed: 0,
  struck: false,
  ...over,
});

describe('gaps found by the mutants of the 4G-D', () => {
  it('the charge: announced at the right tick, launches the STRONG attack and restarts its clock', () => {
    const cfg = configWith();
    const { run } = withBoss(cfg);
    run.boss.coreIn = fight.coreWarnTicks + 1;
    const warnings: number[] = [];
    for (let i = 0; i < 3; i++) {
      advanceBossFight(run, cfg);
      for (const e of run.events)
        if (e.type === 'bossCore' && e.warning) warnings.push(run.boss.coreIn);
      run.events.length = 0;
    }
    expect(warnings).toEqual([fight.coreWarnTicks]);
    run.boss.coreIn = 1;
    advanceBossFight(run, cfg);
    expect(run.boss.coreOpen).toBe(30);
    for (let i = 0; i < 30; i++) advanceBossFight(run, cfg);
    expect(run.boss.coreOpen).toBe(0);
    expect(run.boss.coreIn).toBe(300);
    expect(run.hazards.some((h) => h.width === 177)).toBe(true);
  });

  it('the fury has its own charge clock', () => {
    const cfg = configWith();
    const { run, boss } = withBoss(cfg);
    boss.hp = 400;
    advanceBossFight(run, cfg);
    expect(run.boss.phase).toBe(1);
    expect(run.boss.coreIn).toBe(222);
  });

  it('the boss comes down fast to its place, then slowly; other enemies never get the entrance', () => {
    const cfg = configWith();
    const { run, boss } = withBoss(cfg, -40);
    const other = makeEnemy({ id: 4, x: 100, y: -10, radius: 10, speed: 0.1 });
    run.enemies.push(other);
    tick(run, { moveX: 0 }, cfg);
    expect(boss.y).toBeCloseTo(-40 + 1.6, 6);
    expect(other.y).toBeCloseTo(-10 + 0.1, 6);
    boss.y = 400;
    tick(run, { moveX: 0 }, cfg);
    expect(boss.y).toBeCloseTo(400.04, 6); // past its place it advances at its own speed
  });

  it('cracks: announced for 80 ticks, one more in the fury, and they burn again every second', () => {
    const cfg = configWith({ kind: 'cracks', everyTicks: 600, count: 2, lastTicks: 300 });
    const calm = withBoss(cfg);
    calm.run.boss.mechIn = 1;
    advanceBossFight(calm.run, cfg);
    const cracks = calm.run.hazards.filter((h) => h.kind === 'crack');
    expect(cracks.length).toBe(2);
    expect(cracks.every((c) => c.telegraph === 79)).toBe(true);
    const fury = withBoss(cfg);
    fury.run.boss.phase = 1;
    fury.run.boss.mechIn = 1;
    advanceBossFight(fury.run, cfg);
    expect(fury.run.hazards.filter((h) => h.kind === 'crack').length).toBe(3);

    const burn = withBoss(cfg);
    burn.run.hazards = [
      hazard({ kind: 'crack', x: burn.run.player.x, width: 80, active: 130, damage: 1 }),
    ];
    burn.run.boss.mechIn = 100000;
    const before = burn.run.player.hp;
    for (let i = 0; i < 130; i++) advanceBossFight(burn.run, cfg);
    expect(before - burn.run.player.hp).toBeGreaterThanOrEqual(2 * 0.9);
  });

  it('barrier: only the boss reflects; any other enemy takes the hit', () => {
    const cfg = configWith({ kind: 'barrier', onTicks: 50, offTicks: 30 });
    const { run } = withBoss(cfg);
    const other = makeEnemy({ id: 4, x: 100, y: 300, hp: 1000, radius: 40 });
    run.enemies.push(other);
    run.boss.barrier = 40;
    run.loadout = [makeBall({ effects: [] })];
    run.cooldowns = [-1];
    run.bodies = [makeBody({ x: 100, y: 330, vy: -1 })];
    tick(run, { moveX: 0 }, cfg);
    expect(other.hp).toBeLessThan(1000);
  });

  it('time slow: the player really moves slower while it lasts', () => {
    const cfg = configWith({ kind: 'timeSlow', everyTicks: 100000, lastTicks: 100, mult: 0.5 });
    const run = (slow: number): number => {
      const w = withBoss(cfg);
      w.run.boss.mechIn = 100000;
      w.run.boss.timeSlow = slow;
      const x0 = w.run.player.x;
      tick(w.run, { moveX: 1 }, cfg);
      return w.run.player.x - x0;
    };
    expect(run(50)).toBeCloseTo(run(0) * 0.5, 6);
  });

  it('portals: carry the player to the pair once, and not back at once', () => {
    const cfg = configWith({ kind: 'portals', everyTicks: 100000, lastTicks: 200 });
    const { run } = withBoss(cfg);
    run.boss.mechIn = 100000;
    run.player.x = 100;
    run.hazards = [
      hazard({ kind: 'portal', x: 100, link: 300, width: 40 }),
      hazard({ kind: 'portal', x: 300, link: 100, width: 40 }),
    ];
    advanceBossFight(run, cfg);
    expect(run.player.x).toBe(300);
    expect(run.boss.portalCool).toBe(45);
    for (let i = 0; i < 20; i++) advanceBossFight(run, cfg);
    expect(run.player.x).toBe(300);
  });

  it('portals opened by the mechanic point at each other and stay on the field', () => {
    const cfg = configWith({ kind: 'portals', everyTicks: 600, lastTicks: 200 });
    const { run } = withBoss(cfg);
    run.boss.mechIn = 1;
    advanceBossFight(run, cfg);
    const [a, b] = run.hazards.filter((h) => h.kind === 'portal');
    expect(a?.link).toBe(b?.x);
    expect(b?.link).toBe(a?.x);
  });

  it('the snapshot carries the barrier, the slow and the squeeze for the render', () => {
    const cfg = configWith({ kind: 'tide', maxSqueeze: 0.5, riseTicks: 100 });
    const { run } = withBoss(cfg);
    run.boss.barrier = 5;
    run.boss.timeSlow = 5;
    run.boss.squeeze = 0.25;
    const snap = createSnapshot();
    writeSnapshot(run, snap);
    expect(snap.bossBarrier).toBe(true);
    expect(snap.bossTimeSlow).toBe(true);
    expect(snap.bossSqueeze).toBe(0.25);
    run.boss.barrier = 0;
    run.boss.timeSlow = 0;
    writeSnapshot(run, snap);
    expect(snap.bossBarrier).toBe(false);
    expect(snap.bossTimeSlow).toBe(false);
  });

  it('the legendaries are slow to read and their strong attack is not one of the normal ones', () => {
    const k = fight.bySpecies.kyogre;
    expect(k).toBeDefined();
    for (const id of Object.keys(fight.bySpecies)) {
      const t = fight.bySpecies[id];
      expect(t?.phases[0].intervalTicks ?? 0, id).toBeGreaterThan(150);
      const p = t?.phases[0];
      expect(
        p?.attacks.some((a) => JSON.stringify(a) === JSON.stringify(p.strong)),
        id,
      ).toBe(false);
    }
  });
});

describe('gaps found by the mutants of the 4G-E (final boss)', () => {
  it('the final boss does not summon on a clock; the snapshot says when it is the final one', () => {
    const solo: GameConfig = {
      ...gameConfig,
      player: { ...gameConfig.player, maxHp: 1e9 },
      interludes: [],
      waves: gameConfig.waves.map((w) => ({ ...w, durationTicks: 20 })),
    };
    const run = createRun(solo, 3, 'charmander');
    for (let t = 0; t < 7 * 20 + 5 && !run.boss.spawned; t++) tick(run, { moveX: 0 }, solo);
    expect(run.boss.spawned).toBe(true);
    const snap = createSnapshot();
    writeSnapshot(run, snap);
    expect(snap.bossFinal).toBe(true);
    let summons = 0;
    for (let t = 0; t < 2000; t++) {
      for (const e of tick(run, { moveX: 0 }, solo).events)
        if (e.type === 'bossSummon') summons += 1;
    }
    expect(summons).toBe(0);
    const fresh = createRun(solo, 3, 'charmander');
    writeSnapshot(fresh, snap);
    expect(snap.bossFinal).toBe(false);
  });
});
