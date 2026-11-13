import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceEnemyFire,
  cloneRun,
  createRun,
  createSnapshot,
  GAME_TYPES,
  type GameConfig,
  type Hazard,
  hashRun,
  isDodgeable,
  isEnemyShot,
  tick,
  WARN_TICKS,
  writeSnapshot,
} from '../../src/domain';
import { makeEnemy, quietConfig } from './fixtures';

const fire = gameConfig.enemyFire;
if (fire === undefined) throw new Error('no enemy fire table');

const bossTable = gameConfig.bossFight;
if (bossTable === undefined) throw new Error('no boss fight table');
// The shots fall through the hazard code of the boss fights, so the config needs its table too.
// The 4G-G shot (straight down from the enemy, alone) for these tests; the aimed bursts of the 4G-H
// have their own tests below, with the shipped table.
const single = Object.fromEntries(
  Object.entries(fire.byType).map(([type, rule]) => [type, { ...rule, burst: 1 }]),
);
const cfg: GameConfig = {
  ...quietConfig,
  enemyFire: { ...fire, shooterOneIn: 5, aimed: false, byType: single },
  bossFight: bossTable,
};
const shipped: GameConfig = { ...quietConfig, enemyFire: fire, bossFight: bossTable };

const S = 5; // the first id that shoots with the test table (one in five)
/** A fire-type enemy whose id makes it a shooter, placed in the middle of the field. */
function shooter(id = S) {
  return makeEnemy({ id, type: 'fire', x: 100, y: 150, hp: 1000 });
}

describe('ordinary enemies that shoot (4G-E)', () => {
  it('only one in `shooterOneIn`, of the types in the table, fires, and only on its own clock', () => {
    const run = createRun(cfg, 1, 'charmander');
    run.enemies = [shooter(S), shooter(S + 1), makeEnemy({ id: S * 2, type: 'grass', y: 150 })];
    const every = fire.byType.fire?.everyTicks ?? 0;
    // id S: (tick + S * 37) % every === 0
    run.tickCount = every - ((S * 37) % every);
    advanceEnemyFire(run, cfg);
    expect(run.hazards.length).toBe(1);
    // The shot comes out of the enemy itself: it starts at its x and its link is minus its id.
    expect(run.hazards[0]).toMatchObject({
      kind: 'shot',
      link: -S,
      x: 100,
      damage: fire.damage,
    });
    expect(isEnemyShot(run.hazards[0] as Hazard)).toBe(true);
    expect(run.hazards[0]?.telegraph).toBe(WARN_TICKS);
    expect(run.events.find((e) => e.type === 'bossTelegraph')).toMatchObject({ fromEnemy: true });
    // Not on the clock: nothing.
    const quiet = createRun(cfg, 1, 'charmander');
    quiet.enemies = [shooter(S)];
    quiet.tickCount = 1;
    advanceEnemyFire(quiet, cfg);
    expect(quiet.hazards.length).toBe(0);
  });

  it('the shot carries the type of its enemy and its own speed (4G-G)', () => {
    const run = createRun(cfg, 1, 'charmander');
    run.enemies = [shooter(S)];
    const every = fire.byType.fire?.everyTicks ?? 0;
    run.tickCount = every - ((S * 37) % every);
    advanceEnemyFire(run, cfg);
    expect(run.hazards[0]?.type).toBe('fire');
    expect(run.events.find((e) => e.type === 'bossTelegraph')).toMatchObject({ shotType: 'fire' });
    expect(run.hazards[0]?.speed).toBe(fire.speed * (fire.byType.fire?.speedMult ?? 1));
    // An electric shot is faster than a water one; a ghost's is the slowest (the shipped table).
    const mult = (t: 'electric' | 'water' | 'ghost') => fire.byType[t]?.speedMult ?? 1;
    expect(mult('electric')).toBeGreaterThan(mult('water'));
    expect(mult('ghost')).toBeLessThan(mult('water'));
    // The type is part of the hash: two shots that differ only in type are different states.
    const other = createRun(cfg, 1, 'charmander');
    other.enemies = [shooter(S)];
    other.tickCount = run.tickCount;
    advanceEnemyFire(other, cfg);
    expect(hashRun(other)).toBe(hashRun(run));
    other.hazards[0] = { ...(other.hazards[0] as Hazard), type: 'water' };
    expect(hashRun(other)).not.toBe(hashRun(run));
  });

  it('every type shoots (4G-H: "quiero más enemigos que ataquen")', () => {
    for (const type of GAME_TYPES) expect(fire.byType[type], type).toBeDefined();
    expect(fire.shooterOneIn).toBeLessThanOrEqual(2);
  });

  it('does not fire from the top edge or from too close to the line, nor beyond maxAtOnce', () => {
    const run = createRun(cfg, 1, 'charmander');
    const every = fire.byType.fire?.everyTicks ?? 1;
    const on = (id: number) => every - ((id * 37) % every);
    const high = shooter(5);
    high.y = 10;
    const low = shooter(10);
    low.y = cfg.arena.defenseLineY - 50;
    run.enemies = [high, low];
    run.tickCount = on(5);
    advanceEnemyFire(run, cfg);
    run.tickCount = on(10);
    advanceEnemyFire(run, cfg);
    expect(run.hazards.length).toBe(0);
  });

  it('the shot falls where the player was and hurts once, with the guard of the team', () => {
    const run = createRun(cfg, 1, 'charmander');
    run.enemies = [shooter(5)];
    run.player.x = 100; // the shot falls straight down from the enemy (at x = 100)
    const every = fire.byType.fire?.everyTicks ?? 1;
    run.tickCount = every - ((5 * 37) % every);
    advanceEnemyFire(run, cfg);
    expect(run.hazards[0]?.x).toBe(100);
    run.enemies = [];
    const before = run.player.hp;
    for (let i = 0; i < 400 && run.hazards.length > 0; i++) tick(run, { moveX: 0 }, cfg);
    expect(run.hazards.length).toBe(0);
    expect(before - run.player.hp).toBeGreaterThan(0);
    expect(before - run.player.hp).toBeLessThanOrEqual(Math.ceil(fire.damage));
  });

  it('a shot that is dodged does not hurt', () => {
    const run = createRun(cfg, 1, 'charmander');
    run.enemies = [shooter(5)];
    run.player.x = 100;
    const every = fire.byType.fire?.everyTicks ?? 1;
    run.tickCount = every - ((5 * 37) % every);
    advanceEnemyFire(run, cfg);
    run.enemies = [];
    const before = run.player.hp;
    for (let i = 0; i < 400 && run.hazards.length > 0; i++) tick(run, { moveX: 1 }, cfg);
    expect(run.player.hp).toBe(before);
  });

  it('is deterministic and the shots are part of the hash and of the clone', () => {
    const make = () => {
      const run = createRun(cfg, 1, 'charmander');
      run.enemies = [shooter(5)];
      const every = fire.byType.fire?.everyTicks ?? 1;
      run.tickCount = every - ((5 * 37) % every);
      advanceEnemyFire(run, cfg);
      return run;
    };
    expect(hashRun(make())).toBe(hashRun(make()));
    const a = make();
    expect(hashRun(cloneRun(a))).toBe(hashRun(a));
  });

  it('nobody shoots without a table', () => {
    const run = createRun(quietConfig, 1, 'charmander');
    run.enemies = [shooter(5)];
    run.tickCount = 5000;
    advanceEnemyFire(run, quietConfig);
    expect(run.hazards.length).toBe(0);
  });
});

describe('the shipped table', () => {
  it('has moderate numbers: announced, a few at once, small damage', () => {
    expect(fire.maxAtOnce).toBeLessThanOrEqual(5);
    expect(fire.damage).toBeLessThanOrEqual(2);
    expect(fire.shooterOneIn).toBeGreaterThanOrEqual(2);
    expect(Object.keys(fire.byType).length).toBeGreaterThanOrEqual(5);
  });
});

describe('gaps found by the mutants of the 4G-E', () => {
  const every = fire.byType.fire?.everyTicks ?? 1;

  it('the boss itself never shoots as an ordinary enemy', () => {
    const run = createRun(cfg, 1, 'charmander');
    run.enemies = [shooter(S)];
    run.boss.id = S;
    run.tickCount = every - ((S * 37) % every);
    advanceEnemyFire(run, cfg);
    expect(run.hazards.length).toBe(0);
  });

  it('an enemy whose id is not a multiple of shooterOneIn never shoots, on its own clock either', () => {
    const run = createRun(cfg, 1, 'charmander');
    run.enemies = [shooter(S + 1)];
    run.tickCount = every - (((S + 1) * 37) % every);
    advanceEnemyFire(run, cfg);
    expect(run.hazards.length).toBe(0);
  });

  it('an enemy does not fire again while its own shot is still on the field', () => {
    const run = createRun(cfg, 1, 'charmander');
    run.enemies = [shooter(S)];
    run.tickCount = every - ((S * 37) % every);
    advanceEnemyFire(run, cfg);
    advanceEnemyFire(run, cfg);
    expect(run.hazards.filter((h) => isEnemyShot(h)).length).toBe(1);
  });

  it('never more shots than maxAtOnce', () => {
    const quick = {
      ...cfg,
      enemyFire: { ...fire, shooterOneIn: 1, maxAtOnce: 2, byType: { fire: { everyTicks: 1 } } },
    };
    const run = createRun(quick, 1, 'charmander');
    run.enemies = [shooter(1), shooter(2), shooter(3), shooter(4)];
    advanceEnemyFire(run, quick);
    expect(run.hazards.filter((h) => isEnemyShot(h)).length).toBe(2);
  });
});

describe('4G-H: shots aimed at the player, in short bursts, and always with a way through', () => {
  const on = (id: number, type: keyof typeof fire.byType) => {
    const every = fire.byType[type]?.everyTicks ?? 1;
    return every - ((id * 37) % every);
  };

  it('the shot is aimed where the player stands, and flies from the body of its enemy', () => {
    const run = createRun(shipped, 1, 'charmander');
    run.player.x = 330;
    run.enemies = [makeEnemy({ id: 2, type: 'steel', x: 100, y: 150, hp: 1000 })];
    run.tickCount = on(2, 'steel');
    advanceEnemyFire(run, shipped);
    expect(run.hazards).toHaveLength(1);
    expect(run.hazards[0]).toMatchObject({
      kind: 'shot',
      x: 330,
      fromX: 100,
      fromY: 150,
      link: -2,
    });
  });

  it('a burst lands side by side round the player, one after another, all of the same enemy', () => {
    const run = createRun(shipped, 1, 'charmander');
    run.player.x = 240;
    run.enemies = [makeEnemy({ id: 2, type: 'electric', x: 100, y: 150, hp: 1000 })];
    run.tickCount = on(2, 'electric');
    advanceEnemyFire(run, shipped);
    const burst = fire.byType.electric?.burst ?? 1;
    expect(burst).toBe(3);
    expect(run.hazards).toHaveLength(3);
    const spread = fire.burstSpread ?? 0;
    const gap = fire.burstGapTicks ?? 0;
    expect(run.hazards.map((h) => h.x)).toEqual([240 - spread, 240, 240 + spread]);
    expect(run.hazards.map((h) => h.telegraph)).toEqual([
      WARN_TICKS,
      WARN_TICKS + gap,
      WARN_TICKS + 2 * gap,
    ]);
    for (const h of run.hazards) expect(h.link).toBe(-2);
  });

  it('a burst never goes over maxAtOnce: it is cut to the room left', () => {
    const run = createRun(shipped, 1, 'charmander');
    run.enemies = [makeEnemy({ id: 2, type: 'electric', x: 100, y: 150, hp: 1000 })];
    run.tickCount = on(2, 'electric');
    const tight = { ...shipped, enemyFire: { ...fire, maxAtOnce: 2 } };
    advanceEnemyFire(run, tight);
    expect(run.hazards).toHaveLength(2);
  });

  it('a burst that would leave no way through waits (the guarantee of 4G-G): it comes later', () => {
    const run = createRun(shipped, 1, 'charmander');
    run.player.x = 240;
    // A wall over the whole field except where the burst would land: with the burst, nowhere is safe.
    run.hazards.push(
      { ...wallAt(90, 180), telegraph: WARN_TICKS + 30 },
      { ...wallAt(390, 180), telegraph: WARN_TICKS + 30 },
    );
    run.enemies = [makeEnemy({ id: 2, type: 'electric', x: 100, y: 150, hp: 1000 })];
    run.tickCount = on(2, 'electric');
    advanceEnemyFire(run, shipped);
    const shots = run.hazards.filter((h) => isEnemyShot(h));
    // Thrown, but pushed back past the moment it would have closed the only gap.
    expect(shots).toHaveLength(3);
    expect(shots[0]?.telegraph ?? 0).toBeGreaterThan(WARN_TICKS);
    expect(isDodgeable(run, shipped, [])).toBe(true);
    // Without the delay it would have been unfair.
    const undelayed = shots.map((h, k) => ({
      ...h,
      telegraph: WARN_TICKS + k * (fire.burstGapTicks ?? 0),
    }));
    const bare = createRun(shipped, 1, 'charmander');
    bare.player.x = 240;
    bare.hazards.push(...run.hazards.filter((h) => !isEnemyShot(h)));
    expect(isDodgeable(bare, shipped, undelayed)).toBe(false);
  });

  it('property: in busy fields, with every type shooting, there is always a way through', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const run = createRun(shipped, seed, 'charmander');
      run.enemies = GAME_TYPES.map((type, k) =>
        makeEnemy({
          id: 2 * (k + 1),
          type,
          x: 30 + ((k * 97 + seed * 13) % 420),
          y: 100 + ((k * 53) % 300),
          hp: 1e9,
          speed: 0,
        }),
      );
      for (let t = 0; t < 900; t++) {
        run.player.x = 40 + ((t * 7 + seed * 31) % 400);
        const before = run.hazards.length;
        tick(run, { moveX: 0 }, shipped);
        if (run.hazards.length > before) expect(isDodgeable(run, shipped, [])).toBe(true);
        run.player.hp = run.player.maxHp;
      }
    }
  });

  it('through the tick: an aimed shot lands on the player who stays, and misses one who moves', () => {
    const play = (move: -1 | 0 | 1): number => {
      const run = createRun(shipped, 1, 'charmander');
      run.player.x = 240;
      run.enemies = [makeEnemy({ id: 2, type: 'steel', x: 100, y: 150, hp: 1e9, speed: 0 })];
      run.tickCount = on(2, 'steel') - 1;
      const before = run.player.hp;
      for (let t = 0; t < 240; t++) tick(run, { moveX: move }, shipped);
      return before - run.player.hp;
    };
    expect(play(0)).toBeGreaterThan(0);
    expect(play(1)).toBe(0);
  });

  it('a burst waits while three other warnings are on screen (the limit of 4G-F)', () => {
    const run = createRun(shipped, 1, 'charmander');
    run.player.x = 240;
    // Three thin columns far away, each announced at its own moment, all on screen now.
    for (const [x, t] of [
      [40, WARN_TICKS],
      [440, WARN_TICKS - 10],
      [60, WARN_TICKS - 20],
    ] as const) {
      run.hazards.push({ ...wallAt(x, 20), telegraph: t });
    }
    run.enemies = [makeEnemy({ id: 2, type: 'electric', x: 100, y: 150, hp: 1000 })];
    run.tickCount = on(2, 'electric');
    advanceEnemyFire(run, shipped);
    const shots = run.hazards.filter((h) => isEnemyShot(h));
    expect(shots).toHaveLength(3);
    // Pushed back until the first of the three has struck: never a fourth warning at once.
    expect(shots[0]?.telegraph ?? 0).toBeGreaterThan(WARN_TICKS);
  });

  it('the snapshot carries where a shot flies from, and -1 for what has no origin', () => {
    const run = createRun(shipped, 1, 'charmander');
    run.enemies = [makeEnemy({ id: 2, type: 'steel', x: 100, y: 150, hp: 1000 })];
    run.tickCount = on(2, 'steel');
    advanceEnemyFire(run, shipped);
    run.hazards.push(wallAt(400, 20));
    const snap = createSnapshot();
    writeSnapshot(run, snap, undefined, shipped);
    expect(snap.hazardFromX[0]).toBe(100);
    expect(snap.hazardFromY[0]).toBe(150);
    expect(snap.hazardFromX[1]).toBe(-1);
    expect(snap.hazardFromY[1]).toBe(-1);
  });

  it('the place it flies from is part of the hash and the clone', () => {
    const run = createRun(shipped, 1, 'charmander');
    run.enemies = [makeEnemy({ id: 2, type: 'steel', x: 100, y: 150, hp: 1000 })];
    run.tickCount = on(2, 'steel');
    advanceEnemyFire(run, shipped);
    const base = hashRun(run);
    expect(hashRun(cloneRun(run))).toBe(base);
    const moved = cloneRun(run);
    (moved.hazards[0] as Hazard).fromX = 101;
    expect(hashRun(moved)).not.toBe(base);
    const lower = cloneRun(run);
    (lower.hazards[0] as Hazard).fromY = 151;
    expect(hashRun(lower)).not.toBe(base);
  });
});

function wallAt(x: number, width: number): Hazard {
  return {
    kind: 'column',
    x,
    y: 0,
    link: 0,
    width,
    telegraph: WARN_TICKS,
    active: 40,
    damage: 2,
    speed: 0,
    struck: false,
  };
}
