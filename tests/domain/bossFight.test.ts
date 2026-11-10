import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  type BossAttackDef,
  bossDamage,
  cloneRun,
  createRun,
  damageEnemy,
  type GameConfig,
  type Hazard,
  hashRun,
  MIN_TELEGRAPH_TICKS,
  patternFor,
  type Run,
  startFight,
  tick,
  ultimateOnBoss,
  zoneCovers,
} from '../../src/domain';
import { makeBall, makeBody, makeEnemy, quietConfig } from './fixtures';

const fight = gameConfig.bossFight;
if (fight === undefined) throw new Error('the game has no boss fight table');

const column: BossAttackDef = {
  kind: 'column',
  width: 60,
  telegraphTicks: 70,
  activeTicks: 20,
  damage: 3,
};

/** A table of one attack in both phases, so a test knows exactly what the boss does. */
function testConfig(
  attack: BossAttackDef = column,
  rageAttack: BossAttackDef = attack,
): GameConfig {
  const phase = (a: BossAttackDef, mult: number) => ({
    attacks: [a],
    intervalTicks: 100,
    perRound: 1,
    damageMult: mult,
    coreEvery: 200,
    coreOpen: 90,
    strong: { ...column, width: 120, damage: 4 },
  });
  const table = { phases: [phase(attack, 1), phase(rageAttack, 2)] as const };
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

/** A run with a boss of 1000 health on the field and its fight started (calm, core closed). */
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

describe('the data of the boss fights (ADR-053)', () => {
  it('has two phases in every table: the normal one and a harder, faster fury', () => {
    const tables = [
      fight.default,
      ...Object.values(fight.byType),
      ...Object.values(fight.bySpecies),
    ];
    for (const t of tables) {
      if (t === undefined) continue;
      const [normal, fury] = t.phases;
      expect(fury.damageMult).toBeGreaterThan(normal.damageMult);
      expect(fury.intervalTicks).toBeLessThan(normal.intervalTicks);
      expect(fury.perRound).toBeGreaterThan(normal.perRound);
      expect(fury.coreEvery).toBeLessThan(normal.coreEvery);
      expect(fury.coreOpen).toBeLessThan(normal.coreOpen);
      expect(fury.attacks.length).toBeGreaterThanOrEqual(normal.attacks.length);
    }
    expect(fight.rageAt).toBe(0.5);
  });

  it('announces everything that hurts for at least a second, and uses all the verbs', () => {
    const kinds = new Set<string>();
    const tables = [
      fight.default,
      ...Object.values(fight.byType),
      ...Object.values(fight.bySpecies),
    ];
    for (const t of tables) {
      for (const phase of t?.phases ?? []) {
        for (const a of phase.attacks) {
          kinds.add(a.kind);
          if (a.damage > 0) expect(a.telegraphTicks).toBeGreaterThanOrEqual(MIN_TELEGRAPH_TICKS);
        }
      }
    }
    expect([...kinds].sort()).toEqual(
      ['column', 'comb', 'gust', 'rain', 'shot', 'summon', 'sweep', 'zone'].sort(),
    );
  });

  it('gives the five families of types their verbs, and each legendary a table of its own', () => {
    for (const id of Object.values(gameConfig.boss?.byType ?? {})) {
      expect(fight.bySpecies[id], id).toBeDefined();
    }
    const own = Object.values(fight.bySpecies).map((t) => JSON.stringify(t));
    expect(new Set(own).size).toBe(own.length);
    expect(new Set(Object.values(fight.byType)).size).toBe(5);
    const verbs = (t: (typeof fight)['default']): Set<string> =>
      new Set(t.phases.flatMap((p) => p.attacks.map((a) => a.kind)));
    expect(verbs(fight.byType.fire ?? fight.default).has('shot')).toBe(true);
    expect(verbs(fight.byType.water ?? fight.default).has('gust')).toBe(true);
    expect(verbs(fight.byType.poison ?? fight.default).has('zone')).toBe(true);
    expect(verbs(fight.byType.ground ?? fight.default).has('column')).toBe(true);
    expect(verbs(fight.byType.bug ?? fight.default).has('summon')).toBe(true);
  });

  it('the finals hit harder and more often than the intermediates (they can kill)', () => {
    const peak = (t: (typeof fight)['default']): number =>
      Math.max(...t.phases[1].attacks.map((a) => a.damage * t.phases[1].damageMult));
    const intermediate = peak(fight.byType.fire ?? fight.default);
    for (const id of Object.values(gameConfig.boss?.byType ?? {})) {
      const table = fight.bySpecies[id];
      if (table === undefined) throw new Error(id);
      expect(peak(table), id).toBeGreaterThan(intermediate);
      expect(table.phases[1].perRound, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('picks the table of the species, else of its main type, else the default', () => {
    expect(patternFor(gameConfig, 'moltres', 'fire')).toBe(fight.bySpecies.moltres);
    expect(patternFor(gameConfig, 'charizard', 'fire')).toBe(fight.byType.fire);
    expect(patternFor(gameConfig, 'nothing', 'unknown')).toBe(fight.default);
    expect(patternFor(quietConfig, 'moltres', 'fire')).toBeUndefined();
  });

  it('the bosses are big and slow, and the final one is far stronger than the third in between', () => {
    const mids = gameConfig.interludes ?? [];
    expect(mids.map((m) => m.hpScale)).toEqual(
      [...mids.map((m) => m.hpScale)].sort((a, b) => a - b),
    );
    expect(gameConfig.boss?.hpScale ?? 0).toBeGreaterThan(1.8 * (mids[2]?.hpScale ?? 0));
    for (const m of mids) expect(m.radius).toBeGreaterThanOrEqual(44);
    expect(gameConfig.boss?.radius ?? 0).toBeGreaterThan(mids[2]?.radius ?? 0);
  });
});

describe('the attacks (ADR-053)', () => {
  it('a column is announced first, then strikes once and hurts only if the player stands in it', () => {
    const cfg = testConfig();
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    const warning = run.events.find((e) => e.type === 'bossTelegraph');
    expect(warning).toMatchObject({ width: 60, ticks: 70 });
    run.player.x = (warning as { x: number }).x;
    const hp = run.player.hp;
    steps(run, cfg, 68);
    expect(run.player.hp).toBe(hp);
    advanceBossFight(run, cfg);
    expect(run.player.hp).toBe(hp - 3);
    steps(run, cfg, 25);
    expect(run.player.hp).toBe(hp - 3);
    expect(run.hazards).toHaveLength(0);
  });

  it('a column covers its whole width, edges included, and the guard lowers its damage', () => {
    const cfg = {
      ...testConfig(),
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
      run.player.x = (run.hazards[0]?.x ?? 0) + offset;
      const hp = run.player.hp;
      steps(run, cfg, 72);
      expect(hp - run.player.hp, `offset ${offset}`).toBe(hurt ? 2 : 0);
    }
  });

  it('a comb covers the floor but one slot; a rain warns one column after another', () => {
    const comb = testConfig({
      kind: 'comb',
      width: 0,
      count: 4,
      telegraphTicks: 70,
      activeTicks: 20,
      damage: 1,
    });
    for (let seed = 1; seed <= 30; seed++) {
      const { run } = withBoss(comb);
      run.rng.boss = { a: seed, b: seed * 3, c: seed * 7, d: seed };
      run.boss.attackIn = 1;
      advanceBossFight(run, comb);
      expect(run.hazards).toHaveLength(3);
      const covered = (x: number): boolean =>
        run.hazards.some((h) => Math.abs(x - h.x) <= h.width / 2);
      expect([30, 120, 240, 360, 450].filter((x) => !covered(x)).length).toBeGreaterThanOrEqual(1);
    }
    const rain = testConfig({
      kind: 'rain',
      width: 30,
      count: 5,
      telegraphTicks: 70,
      activeTicks: 16,
      damage: 1,
    });
    const { run } = withBoss(rain);
    run.boss.attackIn = 1;
    advanceBossFight(run, rain);
    const told = run.events
      .filter((e) => e.type === 'bossTelegraph')
      .map((e) => (e as { ticks: number }).ticks);
    // 4G-F: one after the other, but never more than three warnings shown together: the fourth and
    // fifth columns are staggered (moved 20 ticks later) until they fit.
    expect(told).toEqual([70, 88, 106, 164, 182]);
  });

  it('a sweep moves and hurts a player it catches later', () => {
    const cfg = testConfig({
      kind: 'sweep',
      width: 60,
      telegraphTicks: 70,
      activeTicks: 80,
      damage: 1,
      speed: 3,
    });
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    const sweep = run.hazards[0] as Hazard;
    expect(Math.abs(sweep.speed)).toBe(3);
    run.player.x = sweep.x + Math.sign(sweep.speed) * 90;
    const hp = run.player.hp;
    steps(run, cfg, 160);
    expect(hp - run.player.hp).toBeGreaterThanOrEqual(1);
  });

  it('a shot is aimed where the player stands, falls after its warning and hurts if it lands on them', () => {
    const cfg = testConfig({
      kind: 'shot',
      width: 40,
      count: 1,
      telegraphTicks: 70,
      activeTicks: 0,
      damage: 2,
      speed: 8,
    });
    const { run } = withBoss(cfg);
    run.player.x = 300;
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    const shot = run.hazards[0] as Hazard;
    expect(shot.kind).toBe('shot');
    expect(Math.abs(shot.x - 300)).toBeLessThanOrEqual(30 + 20); // aimed with a small spread
    run.player.x = shot.x;
    const hp = run.player.hp;
    steps(run, cfg, 69);
    expect(shot.y).toBeLessThan(200); // still waiting for the warning to end
    steps(run, cfg, 120);
    expect(hp - run.player.hp).toBe(2);
    expect(run.hazards.includes(shot)).toBe(false); // spent; the round after has launched another
  });

  it('a shot that lands beside the player does nothing', () => {
    const cfg = testConfig({
      kind: 'shot',
      width: 40,
      count: 1,
      telegraphTicks: 70,
      activeTicks: 0,
      damage: 2,
      speed: 8,
    });
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    const shot = run.hazards[0] as Hazard;
    run.player.x = shot.x < 240 ? 470 : 20;
    const hp = run.player.hp;
    steps(run, cfg, 200);
    expect(run.player.hp).toBe(hp);
  });

  it('a zone keeps balls from being collected while it lasts; a gust pushes the player; neither hurts', () => {
    const zone = testConfig({
      kind: 'zone',
      width: 120,
      telegraphTicks: 70,
      activeTicks: 100,
      damage: 0,
    });
    const { run } = withBoss(zone);
    run.boss.attackIn = 1;
    advanceBossFight(run, zone);
    const patch = run.hazards[0] as Hazard;
    expect(zoneCovers(run, patch.x)).toBe(false); // only announced
    steps(run, zone, 70);
    expect(zoneCovers(run, patch.x)).toBe(true);
    expect(zoneCovers(run, patch.x + 59)).toBe(true);
    expect(zoneCovers(run, patch.x + 61)).toBe(false);
    steps(run, zone, 110);
    expect(zoneCovers(run, patch.x)).toBe(false);
    expect(run.player.hp).toBe(run.player.maxHp);

    const wind = testConfig({
      kind: 'gust',
      width: 480,
      telegraphTicks: 70,
      activeTicks: 60,
      damage: 0,
      speed: 3,
    });
    const w = withBoss(wind);
    w.run.boss.attackIn = 1;
    advanceBossFight(w.run, wind);
    const dir = Math.sign((w.run.hazards[0] as Hazard).speed);
    w.run.player.x = 240;
    steps(w.run, wind, 69);
    expect(w.run.player.x).toBe(240);
    steps(w.run, wind, 30);
    expect(w.run.player.x).toBeCloseTo(240 + dir * 3 * 30, 6);
    w.run.player.x = dir > 0 ? 470 : 10;
    steps(w.run, wind, 20);
    expect(w.run.player.x).toBeGreaterThanOrEqual(20); // never out of the floor
    expect(w.run.player.x).toBeLessThanOrEqual(460);
    expect(w.run.player.hp).toBe(w.run.player.maxHp);
  });

  it('a summon asks for reinforcements that the wave code spawns', () => {
    const cfg = testConfig({
      kind: 'summon',
      width: 0,
      count: 3,
      telegraphTicks: 0,
      activeTicks: 0,
      damage: 0,
    });
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    expect(run.boss.summonDebt).toBe(3);
    expect(run.events.some((e) => e.type === 'bossSummon' && e.count === 3)).toBe(true);
  });

  it('never announces for less than a second, and never has more than the cap on the field', () => {
    const cfg = testConfig({ ...column, telegraphTicks: 10 });
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    const told = run.events.find((e) => e.type === 'bossTelegraph') as
      | { ticks: number }
      | undefined;
    expect(told?.ticks).toBe(MIN_TELEGRAPH_TICKS);
    const rain = testConfig({
      kind: 'rain',
      width: 30,
      count: 5,
      telegraphTicks: 70,
      activeTicks: 16,
      damage: 1,
    });
    const capped = { ...rain, bossFight: { ...rain.bossFight, maxHazards: 3 } } as GameConfig;
    const second = withBoss(capped);
    second.run.boss.attackIn = 1;
    advanceBossFight(second.run, capped);
    expect(second.run.hazards).toHaveLength(3);
  });

  it('the fury makes the attacks hit harder (the damage multiplier of the phase)', () => {
    const cfg = testConfig();
    const { run, boss } = withBoss(cfg);
    boss.hp = 500;
    advanceBossFight(run, cfg); // the fury starts
    expect(run.boss.phase).toBe(1);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    expect(run.hazards[0]?.damage).toBe(6); // 3 x 2
  });

  it('where the attacks go comes from the boss stream only: no other stream moves', () => {
    const cfg = testConfig();
    const { run } = withBoss(cfg);
    const others = JSON.stringify([run.rng.spawn, run.rng.aim, run.rng.cards, run.rng.themes]);
    const before = JSON.stringify(run.rng.boss);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    expect(JSON.stringify(run.rng.boss)).not.toBe(before);
    expect(JSON.stringify([run.rng.spawn, run.rng.aim, run.rng.cards, run.rng.themes])).toBe(
      others,
    );
  });
});

describe('the fury (ADR-053)', () => {
  it('starts at half health with a message, no pause and the core reset', () => {
    const cfg = testConfig();
    const { run, boss } = withBoss(cfg);
    boss.hp = 501;
    advanceBossFight(run, cfg);
    expect(run.boss.phase).toBe(0);
    boss.hp = 500;
    run.boss.coreOpen = 50;
    advanceBossFight(run, cfg);
    expect(run.boss.phase).toBe(1);
    expect(run.boss.coreOpen).toBe(0);
    expect(run.events.some((e) => e.type === 'bossPhase' && e.phase === 1)).toBe(true);
    expect(run.boss.attackIn).toBe(30); // a calm moment, not a stop: the game keeps ticking
  });

  it('the damage that would cross half health is cut there, so the fury is always played', () => {
    const cfg = testConfig();
    const { run, boss } = withBoss(cfg);
    run.boss.coreOpen = 50;
    damageEnemy(run, cfg, boss, 5000);
    expect(boss.hp).toBeCloseTo(500, 9);
    advanceBossFight(run, cfg);
    run.boss.coreOpen = 50;
    damageEnemy(run, cfg, boss, 5000);
    expect(boss.hp).toBeLessThanOrEqual(0); // the fury has no line: the boss can die
  });

  it('the things on the floor are gone when the boss dies', () => {
    const cfg = testConfig();
    const { run, boss } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    expect(run.hazards.length).toBeGreaterThan(0);
    boss.hp = 0;
    advanceBossFight(run, cfg);
    expect(run.hazards).toHaveLength(0);
  });
});

describe('the core, the skill of the fight (ADR-053)', () => {
  it('is closed at first, is announced, opens for a while at a place on the body and closes again', () => {
    const cfg = testConfig();
    const { run, boss } = withBoss(cfg);
    expect(run.boss.coreOpen).toBe(0);
    let announced = false;
    let opened = false;
    let closedAgain = false;
    for (let i = 0; i < 400; i++) {
      advanceBossFight(run, cfg);
      for (const e of run.events) {
        if (e.type === 'bossCore' && e.warning) announced = true;
        if (e.type === 'bossCore' && e.open) {
          opened = true;
          expect(Math.abs(run.boss.weakX)).toBeLessThanOrEqual(boss.radius * 0.55 + 1e-9);
          expect(run.boss.coreOpen).toBe(90);
        }
        if (e.type === 'bossCore' && !e.open && !e.warning) closedAgain = true;
      }
      run.events.length = 0;
    }
    expect(announced && opened && closedAgain).toBe(true);
  });

  it('little damage gets through while it is guarded and much more while it is charging', () => {
    const cfg = testConfig();
    const { run, boss } = withBoss(cfg);
    expect(bossDamage(run, cfg, boss, 100)).toBeCloseTo(100 * fight.closedMult, 9);
    run.boss.coreOpen = 50;
    expect(bossDamage(run, cfg, boss, 100)).toBeCloseTo(100 * fight.openMult, 9);
    expect(fight.openMult).toBeGreaterThan(fight.closedMult * 3);
  });

  it('a ball that hits the boss while it charges really does more, through the tick', () => {
    const cfg = testConfig();
    const hit = (exposed: boolean): number => {
      const { run, boss } = withBoss(cfg);
      run.boss.coreOpen = exposed ? 50 : 0;
      run.loadout = [makeBall({ effects: [] })];
      run.cooldowns = [-1];
      run.bodies = [makeBody({ x: boss.x, y: boss.y + 30, vy: -1 })];
      const before = boss.hp;
      tick(run, { moveX: 0 }, cfg);
      return before - boss.hp;
    };
    expect(hit(true)).toBeGreaterThan(hit(false) * 2);
  });

  it('an Ultimate hits extra only while the core is open', () => {
    const cfg = testConfig();
    const { run } = withBoss(cfg);
    expect(ultimateOnBoss(run, cfg)).toBe(1);
    run.boss.coreOpen = 10;
    expect(ultimateOnBoss(run, cfg)).toBe(fight.ultimateOpenBonus);
  });
});

describe('the fight is part of the run state', () => {
  it('is hashed and cloned: things on the floor, phase, core, summons and the boss stream', () => {
    const cfg = testConfig();
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    const base = hashRun(run);
    expect(hashRun(cloneRun(run))).toBe(base);
    for (const change of [
      (r: Run) =>
        r.hazards.push({
          kind: 'shot',
          x: 1,
          link: 0,
          y: 1,
          width: 1,
          telegraph: 1,
          active: 1,
          damage: 1,
          speed: 0,
          struck: false,
        }),
      (r: Run) => {
        r.boss.phase += 1;
      },
      (r: Run) => {
        r.boss.coreOpen += 1;
      },
      (r: Run) => {
        r.boss.coreIn += 1;
      },
      (r: Run) => {
        r.boss.weakX += 1;
      },
      (r: Run) => {
        r.boss.summonDebt += 1;
      },
      (r: Run) => {
        r.boss.used.push('x');
      },
      (r: Run) => {
        r.rng.boss.a += 1;
      },
      (r: Run) => {
        r.boss.attackIn += 1;
      },
    ]) {
      const other = cloneRun(run);
      change(other);
      expect(hashRun(other)).not.toBe(base);
    }
    const copy = cloneRun(run);
    const first = copy.hazards[0];
    if (first === undefined) throw new Error('no hazard');
    first.x += 50;
    expect(run.hazards[0]?.x).not.toBe(first.x);
    copy.boss.used.push('y');
    expect(run.boss.used).not.toContain('y');
  });

  it('two runs with the same seed and the same commands fight the same fight', () => {
    const cfg = testConfig();
    const a = withBoss(cfg).run;
    const b = withBoss(cfg).run;
    for (let i = 0; i < 700; i++) {
      tick(a, { moveX: i % 80 < 40 ? 1 : -1 }, cfg);
      tick(b, { moveX: i % 80 < 40 ? 1 : -1 }, cfg);
    }
    expect(hashRun(a)).toBe(hashRun(b));
  });

  it('a config without the table leaves the boss a plain one', () => {
    const run = createRun(quietConfig, 5, 'charmander');
    const boss = makeEnemy({ id: 9, hp: 1000, x: 240, y: 120, radius: 40 });
    run.enemies = [boss];
    run.boss.id = 9;
    run.boss.maxHp = 1000;
    for (let i = 0; i < 400; i++) advanceBossFight(run, quietConfig);
    expect(run.hazards).toHaveLength(0);
    damageEnemy(run, quietConfig, boss, 100);
    expect(boss.hp).toBe(900);
  });
});
