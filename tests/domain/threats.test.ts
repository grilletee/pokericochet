import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  advanceThreats,
  cloneRun,
  createRun,
  type EnemyThreatDef,
  type GameConfig,
  hashRun,
  isDodgeable,
  type Run,
  WARN_TICKS,
} from '../../src/domain';
import { makeEnemy, quietConfig } from './fixtures';

/** 4G-G, block 4: an ordinary enemy is marked as a threat; kill it in time or it explodes. */

const shipped = gameConfig.enemyThreat;
const fight = gameConfig.bossFight;
if (shipped === undefined || fight === undefined) throw new Error('no threat or fight table');
const threat: EnemyThreatDef = shipped;
const cfg: GameConfig = { ...quietConfig, enemyThreat: threat, bossFight: fight };

/** A run with a ball to measure the strongest hit with, a field and the clock on a mark. */
function field(species = 'voltorb', hp = 5000): Run {
  const run = createRun(cfg, 1, 'charmander');
  run.enemies = [
    makeEnemy({ id: 3, species, type: 'electric', hp, x: 200, y: 220, speed: 0, radius: 16 }),
    makeEnemy({ id: 4, species: 'rattata', type: 'normal', hp, x: 330, y: 260, speed: 0 }),
  ];
  run.tickCount = threat.everyTicks;
  run.events.length = 0;
  return run;
}

const blasts = (run: Run) => run.hazards.filter((h) => h.kind === 'blast');

describe('the enemy that becomes a threat (4G-G)', () => {
  it('marks a themed species first, with a blast that is announced for the whole countdown', () => {
    const run = field();
    advanceThreats(run, cfg);
    const [blast] = blasts(run);
    expect(blasts(run)).toHaveLength(1);
    expect(blast).toMatchObject({ kind: 'blast', link: -3, x: 200 });
    expect(blast?.telegraph).toBeGreaterThanOrEqual(WARN_TICKS);
    expect(blast?.width).toBe(threat.themed.voltorb?.width);
    // It was told to the player like every attack, as one of an enemy.
    expect(run.events.find((e) => e.type === 'bossTelegraph')).toMatchObject({
      kind: 'blast',
      fromEnemy: true,
    });
  });

  it('the marked enemy becomes a glass cannon: it dies in `hits` strong hits and takes extra damage', () => {
    const run = field('voltorb', 1e6);
    advanceThreats(run, cfg);
    const marked = run.enemies[0];
    expect(marked?.hp).toBeLessThan(1e6);
    expect(marked?.markBonus).toBe(threat.markBonus);
    expect(marked?.markTicks).toBeGreaterThan(WARN_TICKS);
    // The other enemy is not touched.
    expect(run.enemies[1]?.hp).toBe(1e6);
  });

  it('only on the clock: not on any other tick, and not while one is already alive', () => {
    const run = field();
    run.tickCount = threat.everyTicks + 1;
    advanceThreats(run, cfg);
    expect(blasts(run)).toHaveLength(0);
    run.tickCount = threat.everyTicks;
    advanceThreats(run, cfg);
    run.tickCount = threat.everyTicks * 2;
    advanceThreats(run, cfg);
    expect(blasts(run)).toHaveLength(threat.maxAtOnce);
  });

  it('with no themed species it picks others on one mark in `otherOneIn`, never the boss', () => {
    const run = field('rattata');
    run.enemies[0] = makeEnemy({ id: 3, species: 'rattata', hp: 100, x: 200, y: 220, speed: 0 });
    // Turn 1 (tick = everyTicks): 1 % 2 !== 0 -> nothing; turn 2 -> one.
    advanceThreats(run, cfg);
    expect(blasts(run)).toHaveLength(0);
    run.tickCount = threat.everyTicks * threat.other.otherOneIn;
    advanceThreats(run, cfg);
    expect(blasts(run)).toHaveLength(1);
    const boss = field();
    boss.boss.id = 3;
    boss.enemies = [boss.enemies[0] as Run['enemies'][number]];
    advanceThreats(boss, cfg);
    expect(blasts(boss)).toHaveLength(0);
  });

  it('killing the marked enemy in time cancels the explosion', () => {
    const run = field();
    advanceThreats(run, cfg);
    run.enemies = run.enemies.filter((e) => e.id !== 3); // dead
    const hp = run.player.hp;
    for (let i = 0; i < WARN_TICKS * 3; i++) advanceBossFight(run, cfg);
    expect(blasts(run)).toHaveLength(0);
    expect(run.player.hp).toBe(hp);
  });

  it('if it is alive when the countdown ends, it explodes: it is gone and the column hurts', () => {
    const run = field();
    advanceThreats(run, cfg);
    run.player.x = 200; // right under it
    run.player.hp = 10;
    const ticks = (blasts(run)[0]?.telegraph ?? 0) + 2;
    for (let i = 0; i < ticks; i++) advanceBossFight(run, cfg);
    expect(run.enemies.find((e) => e.id === 3)).toBeUndefined();
    expect(run.player.hp).toBeLessThan(10);
    // Standing away from it, the explosion costs nothing.
    const away = field();
    advanceThreats(away, cfg);
    away.player.x = 440;
    for (let i = 0; i < ticks; i++) advanceBossFight(away, cfg);
    expect(away.player.hp).toBe(away.player.maxHp);
  });

  it('respects the guarantee of dodgeability: it is not marked if there would be no way through', () => {
    const run = field();
    // The whole field is already covered by something that strikes soon.
    run.hazards.push({
      kind: 'column',
      x: 240,
      y: 0,
      link: 0,
      width: 600,
      telegraph: 400,
      active: 600,
      damage: 2,
      speed: 0,
      struck: false,
    });
    expect(isDodgeable(run, cfg)).toBe(false);
    const hp = run.enemies[0]?.hp;
    advanceThreats(run, cfg);
    expect(blasts(run)).toHaveLength(0);
    expect(run.enemies[0]?.hp).toBe(hp);
    expect(run.enemies[0]?.markTicks ?? 0).toBe(0);
  });

  it('is deterministic and the blast is part of the hash and the clone', () => {
    const make = () => {
      const run = field();
      advanceThreats(run, cfg);
      return run;
    };
    expect(hashRun(make())).toBe(hashRun(make()));
    const a = make();
    expect(hashRun(cloneRun(a))).toBe(hashRun(a));
  });

  it('nothing is marked without a table, without a team, or too close to the line', () => {
    const none = field();
    advanceThreats(none, quietConfig);
    expect(none.hazards).toHaveLength(0);
    const noBalls = field();
    noBalls.loadout = [];
    advanceThreats(noBalls, cfg);
    expect(noBalls.hazards).toHaveLength(0);
    const low = field();
    for (const e of low.enemies) e.y = cfg.arena.defenseLineY - 100;
    advanceThreats(low, cfg);
    expect(low.hazards).toHaveLength(0);
  });

  it('the shipped table names the themed species and is moderate', () => {
    expect(Object.keys(threat.themed).sort()).toEqual([
      'electrode',
      'exeggcute',
      'geodude',
      'graveler',
      'voltorb',
    ]);
    expect(threat.maxAtOnce).toBeLessThanOrEqual(2);
    expect(threat.everyTicks).toBeGreaterThanOrEqual(600);
    expect(threat.countdownTicks).toBeGreaterThanOrEqual(WARN_TICKS);
    for (const def of [...Object.values(threat.themed), threat.other]) {
      expect(def.damage).toBeLessThanOrEqual(3);
    }
  });
});
