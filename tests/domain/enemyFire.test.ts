import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceEnemyFire,
  cloneRun,
  createRun,
  ENEMY_SHOT,
  type GameConfig,
  hashRun,
  tick,
} from '../../src/domain';
import { makeEnemy, quietConfig } from './fixtures';

const fire = gameConfig.enemyFire;
if (fire === undefined) throw new Error('no enemy fire table');

const bossTable = gameConfig.bossFight;
if (bossTable === undefined) throw new Error('no boss fight table');
// The shots fall through the hazard code of the boss fights, so the config needs its table too.
const cfg: GameConfig = {
  ...quietConfig,
  enemyFire: { ...fire, shooterOneIn: 5 },
  bossFight: bossTable,
};

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
    expect(run.hazards[0]).toMatchObject({ kind: 'shot', link: ENEMY_SHOT, damage: fire.damage });
    expect(run.hazards[0]?.telegraph).toBeGreaterThanOrEqual(60);
    // Not on the clock: nothing.
    const quiet = createRun(cfg, 1, 'charmander');
    quiet.enemies = [shooter(S)];
    quiet.tickCount = 1;
    advanceEnemyFire(quiet, cfg);
    expect(quiet.hazards.length).toBe(0);
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
    run.player.x = 200;
    const every = fire.byType.fire?.everyTicks ?? 1;
    run.tickCount = every - ((5 * 37) % every);
    advanceEnemyFire(run, cfg);
    expect(run.hazards[0]?.x).toBe(200);
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
    run.player.x = 200;
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
    expect(fire.telegraphTicks).toBeGreaterThanOrEqual(60);
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

  it('never more shots than maxAtOnce', () => {
    const quick = {
      ...cfg,
      enemyFire: { ...fire, shooterOneIn: 1, maxAtOnce: 2, byType: { fire: { everyTicks: 1 } } },
    };
    const run = createRun(quick, 1, 'charmander');
    run.enemies = [shooter(1), shooter(2), shooter(3), shooter(4)];
    advanceEnemyFire(run, quick);
    expect(run.hazards.filter((h) => h.link === ENEMY_SHOT).length).toBe(2);
  });
});
