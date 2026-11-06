import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  bossDamage,
  cloneRun,
  createRun,
  damageEnemy,
  type GameConfig,
  type Hazard,
  hashRun,
  hitWeakPoint,
  MIN_TELEGRAPH_TICKS,
  patternFor,
  type Run,
  startFight,
  tick,
  ultimateOnBoss,
} from '../../src/domain';
import { makeEnemy, quietConfig } from './fixtures';

/** A tiny pattern table so the tests know exactly what the boss does. */
const fight = gameConfig.bossFight;
if (fight === undefined) throw new Error('the game has no boss fight table');

function configWith(attacks: GameConfig['bossFight'] extends infer F ? F : never): GameConfig {
  return { ...quietConfig, bossFight: attacks } as GameConfig;
}

const column = {
  kind: 'column' as const,
  width: 60,
  telegraphTicks: 70,
  activeTicks: 20,
  damage: 2,
};
const phases = (attack: typeof column | Record<string, unknown>, shield = 0.1) => ({
  phases: [
    { fromHp: 1, attacks: [attack], intervalTicks: 100 },
    {
      fromHp: 0.66,
      attacks: [attack],
      intervalTicks: 90,
      shield: { share: shield, weakRadius: 20, weakSpeed: 1 },
    },
    { fromHp: 0.33, attacks: [attack], intervalTicks: 80 },
  ],
});

function testConfig(attack: typeof column | Record<string, unknown> = column): GameConfig {
  return configWith({
    ...fight,
    bySpecies: { psyduck: phases(attack) as never },
    byType: {},
    default: phases(attack) as never,
    phasePauseTicks: 30,
  } as never);
}

/** A run with a boss of 1000 health on the field and the fight started. */
function withBoss(cfg: GameConfig): { run: Run; boss: ReturnType<typeof makeEnemy> } {
  const run = createRun(cfg, 5, 'charmander');
  const boss = makeEnemy({ id: 9, species: 'psyduck', hp: 1000, x: 240, y: 120, radius: 40 });
  run.enemies = [boss];
  run.boss.id = 9;
  run.boss.maxHp = 1000;
  run.boss.spawned = true;
  // As placeBoss does it: the fight starts at phase 0 with a pause before the first attack.
  startFight(run, cfg, boss);
  run.events.length = 0;
  return { run, boss };
}

describe('the data of the boss fights (ADR-046)', () => {
  it('has three phases at 100, 66 and 33 % in every table, and a shield from the second on', () => {
    const tables = [
      fight.default,
      ...Object.values(fight.byType),
      ...Object.values(fight.bySpecies),
    ];
    for (const table of tables) {
      if (table === undefined) continue;
      expect(table.phases.map((p) => p.fromHp)).toEqual([1, 0.66, 0.33]);
      expect(table.phases[0]?.shield).toBeUndefined();
      expect(table.phases[1]?.shield).toBeDefined();
      expect(table.phases[2]?.shield).toBeDefined();
    }
  });

  it('never announces a column for less than a second, and never hits harder than 3 health', () => {
    const tables = [
      fight.default,
      ...Object.values(fight.byType),
      ...Object.values(fight.bySpecies),
    ];
    for (const table of tables) {
      for (const phase of table?.phases ?? []) {
        for (const attack of phase.attacks) {
          expect(attack.telegraphTicks).toBeGreaterThanOrEqual(MIN_TELEGRAPH_TICKS);
          expect(attack.damage).toBeLessThanOrEqual(3);
          expect(attack.damage).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('gives each of the 14 final legendaries a table of its own, and the seven families a template', () => {
    for (const id of Object.values(gameConfig.boss?.byType ?? {})) {
      expect(fight.bySpecies[id], id).toBeDefined();
    }
    const own = Object.values(fight.bySpecies).map((t) => JSON.stringify(t));
    expect(new Set(own).size).toBe(own.length); // no two are the same fight
    expect(new Set(Object.values(fight.byType)).size).toBe(7);
  });

  it('picks the table of the species, else of its main type, else the default', () => {
    expect(patternFor(gameConfig, 'moltres', 'fire')).toBe(fight.bySpecies.moltres);
    expect(patternFor(gameConfig, 'charizard', 'fire')).toBe(fight.byType.fire);
    expect(patternFor(gameConfig, 'nothing', 'unknown')).toBe(fight.default);
    expect(patternFor(quietConfig, 'moltres', 'fire')).toBeUndefined();
  });
});

describe('the ground attacks (ADR-046)', () => {
  it('a column is announced first, then strikes once and hurts only if the player stands in it', () => {
    const cfg = testConfig();
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg); // the attack is chosen
    const [warning] = run.events.filter((e) => e.type === 'bossTelegraph');
    expect(warning).toMatchObject({ type: 'bossTelegraph', width: 60, ticks: 70 });
    const x = (warning as { x: number }).x;
    run.player.x = x; // standing right in it
    const hp = run.player.hp;
    // The tick that chose the attack already counted one tick of its warning.
    for (let i = 0; i < 68; i++) advanceBossFight(run, cfg);
    expect(run.player.hp).toBe(hp); // no damage during the warning
    advanceBossFight(run, cfg);
    expect(run.player.hp).toBe(hp - 2);
    // It hurts once, even if the player stays for the rest of the strike.
    for (let i = 0; i < 25; i++) advanceBossFight(run, cfg);
    expect(run.player.hp).toBe(hp - 2);
    expect(run.hazards).toHaveLength(0);
  });

  it('does nothing to a player who stepped out of the column during the warning', () => {
    const cfg = testConfig();
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    const column0 = run.hazards[0] as Hazard;
    run.player.x = column0.x < 240 ? 470 : 20;
    const hp = run.player.hp;
    for (let i = 0; i < 100; i++) advanceBossFight(run, cfg);
    expect(run.player.hp).toBe(hp);
    expect(run.events.some((e) => e.type === 'bossStrike' && !e.hit)).toBe(true);
  });

  it('the guard of the team lowers a hit, and a hit is never less than 1', () => {
    const cfg = {
      ...testConfig({ ...column, damage: 1 }),
      stats: { ...quietConfig.stats, guardMax: 0.5, guardStatMin: 0, guardStatMax: 1 },
    } as GameConfig;
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    run.player.x = (run.hazards[0] as Hazard).x;
    const hp = run.player.hp;
    for (let i = 0; i < 71; i++) advanceBossFight(run, cfg);
    expect(hp - run.player.hp).toBe(1);
  });

  it('a comb covers the floor but one slot, which is always there to stand in', () => {
    const cfg = testConfig({
      kind: 'comb',
      width: 0,
      count: 4,
      telegraphTicks: 70,
      activeTicks: 20,
      damage: 1,
    });
    for (let seed = 1; seed <= 30; seed++) {
      const { run } = withBoss(cfg);
      run.rng.boss = { a: seed, b: seed * 3, c: seed * 7, d: seed };
      run.boss.attackIn = 1;
      advanceBossFight(run, cfg);
      expect(run.hazards).toHaveLength(3);
      const covered = (x: number): boolean =>
        run.hazards.some((h) => Math.abs(x - h.x) <= h.width / 2);
      const free = [30, 120, 240, 360, 450].filter((x) => !covered(x));
      expect(free.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('a sweeping column moves, and hurts a player it catches later', () => {
    const cfg = testConfig({
      kind: 'sweep',
      width: 60,
      telegraphTicks: 70,
      activeTicks: 80,
      damage: 1,
      sweepSpeed: 3,
    });
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    const sweep = run.hazards[0] as Hazard;
    expect(Math.abs(sweep.speed)).toBe(3);
    // The player waits where the column will be a little after it strikes.
    run.player.x = sweep.x + Math.sign(sweep.speed) * 90;
    const hp = run.player.hp;
    for (let i = 0; i < 160; i++) advanceBossFight(run, cfg);
    expect(hp - run.player.hp).toBeGreaterThanOrEqual(1);
  });

  it('rain announces each narrow column a little after the last, and the number of columns is capped', () => {
    const cfg = testConfig({
      kind: 'rain',
      width: 30,
      count: 5,
      telegraphTicks: 70,
      activeTicks: 16,
      damage: 1,
    });
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    expect(run.hazards.map((h) => h.telegraph)).toEqual([69, 87, 105, 123, 141]); // one tick counted
    const told = run.events
      .filter((e) => e.type === 'bossTelegraph')
      .map((e) => (e as { ticks: number }).ticks);
    expect(told).toEqual([70, 88, 106, 124, 142]);
    // More than the cap are never on the field.
    const capped = { ...cfg, bossFight: { ...cfg.bossFight, maxHazards: 3 } } as GameConfig;
    const second = withBoss(capped);
    second.run.boss.attackIn = 1;
    advanceBossFight(second.run, capped);
    expect(second.run.hazards).toHaveLength(3);
  });

  it('an announcement is never shorter than a second, whatever the table says', () => {
    const cfg = testConfig({ ...column, telegraphTicks: 10 });
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    const told = run.events.find((e) => e.type === 'bossTelegraph') as
      | { ticks: number }
      | undefined;
    expect(told?.ticks).toBe(MIN_TELEGRAPH_TICKS);
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

describe('phases (ADR-046)', () => {
  it('start at 66 % and 33 % of the health, announce themselves and clear the columns', () => {
    const cfg = testConfig();
    const { run, boss } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    expect(run.hazards.length).toBeGreaterThan(0);
    boss.hp = 660;
    advanceBossFight(run, cfg);
    expect(run.boss.phase).toBe(1);
    expect(run.hazards).toHaveLength(0);
    expect(run.events.some((e) => e.type === 'bossPhase' && e.phase === 1)).toBe(true);
    boss.hp = 330;
    run.boss.shieldHp = 0;
    advanceBossFight(run, cfg);
    expect(run.boss.phase).toBe(2);
  });

  it('the damage that would cross the line is cut at it, so every phase is played', () => {
    const cfg = testConfig();
    const { run, boss } = withBoss(cfg);
    damageEnemy(run, cfg, boss, 900); // far more than a third of its health
    expect(boss.hp).toBeCloseTo(660, 9);
    advanceBossFight(run, cfg); // the phase begins...
    run.boss.shieldHp = 0;
    damageEnemy(run, cfg, boss, 900);
    expect(boss.hp).toBeCloseTo(330, 9); // ...and the next line holds the next blow
    advanceBossFight(run, cfg);
    damageEnemy(run, cfg, boss, 900);
    expect(boss.hp).toBeLessThanOrEqual(0); // the last phase has no line: the boss can die
  });

  it('the columns are gone when the boss dies', () => {
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

describe('the shield, the weak point and the stun (ADR-046)', () => {
  function shielded(): { run: Run; boss: ReturnType<typeof makeEnemy>; cfg: GameConfig } {
    const cfg = testConfig();
    const { run, boss } = withBoss(cfg);
    boss.hp = 660;
    advanceBossFight(run, cfg); // phase 1: the shield goes up
    return { run, boss, cfg };
  }

  it('the shield goes up with the second phase, a share of the boss health', () => {
    const { run } = shielded();
    expect(run.boss.shieldMax).toBeCloseTo(100, 9); // 10 % of 1000
    expect(run.boss.shieldHp).toBeCloseTo(100, 9);
    expect(run.events.some((e) => e.type === 'bossShield' && !e.broken)).toBe(true);
  });

  it('while it stands a hit does a small part of its damage, and burns and chains count too', () => {
    const { run, boss, cfg } = shielded();
    const before = boss.hp;
    damageEnemy(run, cfg, boss, 100);
    expect(before - boss.hp).toBeCloseTo(100 * fight.shieldMult, 9);
    expect(bossDamage(run, cfg, boss, 100)).toBeCloseTo(100 * fight.shieldMult, 9);
  });

  it('a ball on the weak point takes the shield down; one beside it does nothing to it', () => {
    const { run, boss, cfg } = shielded();
    run.boss.weakX = 0;
    hitWeakPoint(run, cfg, boss, boss.x + 200, boss.y, 6, 30); // far from the weak point
    expect(run.boss.shieldHp).toBeCloseTo(100, 9);
    hitWeakPoint(run, cfg, boss, boss.x + 10, boss.y + 5, 6, 30); // on it
    expect(run.boss.shieldHp).toBeCloseTo(70, 9);
    // The weak point is where the boss says, not at its centre.
    run.boss.weakX = 25;
    hitWeakPoint(run, cfg, boss, boss.x + 25, boss.y, 6, 30);
    expect(run.boss.shieldHp).toBeCloseTo(40, 9);
    hitWeakPoint(run, cfg, boss, boss.x - 10, boss.y, 6, 30); // now off to the side
    expect(run.boss.shieldHp).toBeCloseTo(40, 9);
  });

  it('breaking it stuns the boss: it stops, takes double and does not attack', () => {
    const { run, boss, cfg } = shielded();
    hitWeakPoint(run, cfg, boss, boss.x, boss.y, 6, 500);
    expect(run.boss.shieldHp).toBe(0);
    expect(run.boss.stunTicks).toBe(fight.stunTicks);
    expect(boss.haltTicks).toBe(fight.stunTicks);
    expect(run.events.some((e) => e.type === 'bossShield' && e.broken)).toBe(true);
    expect(run.events.some((e) => e.type === 'bossStun' && e.ticks === fight.stunTicks)).toBe(true);
    const before = boss.hp;
    damageEnemy(run, cfg, boss, 10);
    expect(before - boss.hp).toBeCloseTo(10 * fight.stunMult, 9);
    // No new column is announced during the stun.
    run.boss.attackIn = 1;
    run.hazards.length = 0;
    advanceBossFight(run, cfg);
    expect(run.hazards).toHaveLength(0);
  });

  it('the stun ends by itself and a new shield goes up', () => {
    const { run, boss, cfg } = shielded();
    hitWeakPoint(run, cfg, boss, boss.x, boss.y, 6, 500);
    for (let i = 0; i < fight.stunTicks; i++) advanceBossFight(run, cfg);
    expect(run.boss.stunTicks).toBe(0);
    expect(run.boss.shieldHp).toBeGreaterThan(0);
  });

  it('the boss does not move while stunned (it is stopped by its own stun, not by ice)', () => {
    const { run, boss, cfg } = shielded();
    boss.speed = 1;
    hitWeakPoint(run, cfg, boss, boss.x, boss.y, 6, 500);
    const y = boss.y;
    tick(run, { moveX: 0 }, cfg);
    expect(boss.y).toBe(y);
  });

  it('an Ultimate takes a quarter of an intact shield (it can break it), and hits extra in the stun', () => {
    const { run, boss, cfg } = shielded();
    expect(ultimateOnBoss(run, cfg, boss)).toBe(1);
    expect(run.boss.shieldHp).toBeCloseTo(100 - 100 * fight.ultimateShieldShare, 9);
    for (let i = 0; i < 3; i++) ultimateOnBoss(run, cfg, boss);
    expect(run.boss.shieldHp).toBe(0);
    expect(run.boss.stunTicks).toBe(fight.stunTicks); // the fourth one broke it
    expect(ultimateOnBoss(run, cfg, boss)).toBe(fight.ultimateStunBonus);
  });

  it('the weak point slides from side to side over the body and turns at the edges', () => {
    const { run, cfg } = shielded();
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      advanceBossFight(run, cfg);
      seen.add(Math.sign(run.boss.weakX));
      expect(Math.abs(run.boss.weakX)).toBeLessThanOrEqual(20 + 1e-9); // radius 40 - weak radius 20
    }
    expect(seen.has(1) && seen.has(-1)).toBe(true);
  });
});

describe('the fight is part of the run state', () => {
  it('is hashed and cloned: columns, phase, shield, stun and the boss stream', () => {
    const cfg = testConfig();
    const { run } = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    const base = hashRun(run);
    const copy = cloneRun(run);
    expect(hashRun(copy)).toBe(base);
    for (const change of [
      (r: Run) =>
        r.hazards.push({
          x: 1,
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
        r.boss.shieldHp += 1;
      },
      (r: Run) => {
        r.boss.stunTicks += 1;
      },
      (r: Run) => {
        r.boss.weakX += 1;
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
    // The clone is deep: moving a column of the copy does not move the original's.
    const first = copy.hazards[0];
    if (first === undefined) throw new Error('no column');
    first.x += 50;
    expect(run.hazards[0]?.x).not.toBe(first.x);
  });

  it('two runs with the same seed and the same commands fight the same fight', () => {
    const cfg = testConfig();
    const make = (): Run => {
      const { run } = withBoss(cfg);
      return run;
    };
    const a = make();
    const b = make();
    for (let i = 0; i < 600; i++) {
      tick(a, { moveX: i % 80 < 40 ? 1 : -1 }, cfg);
      tick(b, { moveX: i % 80 < 40 ? 1 : -1 }, cfg);
    }
    expect(hashRun(a)).toBe(hashRun(b));
  });

  it('a config without the table leaves the boss a plain one: no columns, no shield', () => {
    const { run, boss } = (() => {
      const run = createRun(quietConfig, 5, 'charmander');
      const boss = makeEnemy({ id: 9, hp: 1000, x: 240, y: 120, radius: 40 });
      run.enemies = [boss];
      run.boss.id = 9;
      run.boss.maxHp = 1000;
      return { run, boss };
    })();
    for (let i = 0; i < 400; i++) advanceBossFight(run, quietConfig);
    expect(run.hazards).toHaveLength(0);
    damageEnemy(run, quietConfig, boss, 100);
    expect(boss.hp).toBe(900);
  });
});
