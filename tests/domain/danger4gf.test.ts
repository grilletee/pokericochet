import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  advanceBossFight,
  type BossAttackDef,
  createRun,
  type GameConfig,
  type Hazard,
  isEnemyShot,
  MAX_WARNINGS,
  type Run,
  startFight,
  WARN_TICKS,
} from '../../src/domain';
import { makeEnemy, quietConfig } from './fixtures';

const fight = gameConfig.bossFight;
if (fight === undefined) throw new Error('no boss fight table');

function configOf(attack: BossAttackDef): GameConfig {
  const phase = {
    attacks: [attack],
    intervalTicks: 100000,
    perRound: 1,
    damageMult: 1,
    coreEvery: 100000,
    coreOpen: 90,
    strong: attack,
  };
  const table = { phases: [phase, phase] as const };
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

function withBoss(cfg: GameConfig): Run {
  const run = createRun(cfg, 5, 'charmander');
  const boss = makeEnemy({ id: 9, species: 'psyduck', hp: 1000, x: 240, y: 120, radius: 40 });
  run.enemies = [boss];
  run.boss.id = 9;
  run.boss.maxHp = 1000;
  startFight(run, cfg, boss);
  run.events.length = 0;
  return run;
}

const column = (telegraph: number): Hazard => ({
  kind: 'column',
  x: 100,
  link: 0,
  y: 0,
  width: 40,
  telegraph,
  active: 20,
  damage: 1,
  speed: 0,
  struck: false,
});

describe('one language of danger (4G-F)', () => {
  it('every announced attack of the game has the same warning time', () => {
    const tables = [
      ...Object.values(fight.bySpecies),
      ...Object.values(fight.byType),
      fight.default,
    ];
    for (const table of tables) {
      for (const phase of table?.phases ?? []) {
        for (const a of [...phase.attacks, phase.strong]) {
          if (a.kind === 'summon') continue;
          expect(a.telegraphTicks).toBe(WARN_TICKS);
        }
      }
    }
  });

  it('the intermediate bosses have more verbs than the plain family table (4G-F)', () => {
    for (const [type, table] of Object.entries(fight.byType)) {
      expect(table?.phases[0].attacks.length, type).toBeGreaterThanOrEqual(3);
      expect(table?.phases[1].attacks.length, type).toBeGreaterThanOrEqual(4);
    }
  });

  it('a shot of an enemy is told from the others by its link', () => {
    expect(isEnemyShot({ ...column(10), link: -7 })).toBe(true);
    expect(isEnemyShot({ ...column(10), link: 0 })).toBe(false);
    expect(isEnemyShot({ ...column(10), link: 120 })).toBe(false);
  });

  it('never more than three warnings are shown together: the rest wait their turn', () => {
    const cfg = configOf({
      kind: 'rain',
      width: 30,
      count: 7,
      telegraphTicks: WARN_TICKS,
      activeTicks: 16,
      damage: 1,
    });
    const run = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    const told = run.events
      .filter((e) => e.type === 'bossTelegraph')
      .map((e) => (e as { ticks: number }).ticks);
    expect(told.length).toBe(7);
    // At any moment, the zones in their last WARN_TICKS ticks (strike time within the next
    // WARN_TICKS) are at most MAX_WARNINGS.
    for (let moment = 0; moment <= Math.max(...told); moment++) {
      const visible = new Set(told.filter((s) => s >= moment && s < moment + WARN_TICKS));
      expect(visible.size, `at ${moment}`).toBeLessThanOrEqual(MAX_WARNINGS);
    }
    // And they really were moved: without it, they would all be announced at 80, 98, 116...
    expect(Math.max(...told)).toBeGreaterThan(WARN_TICKS + 6 * 18);
  });

  it('the slots of a comb always strike together, even when the field is full of warnings', () => {
    const cfg = configOf({
      kind: 'comb',
      width: 0,
      count: 6,
      telegraphTicks: WARN_TICKS,
      activeTicks: 20,
      damage: 1,
    });
    const run = withBoss(cfg);
    run.hazards = [column(WARN_TICKS), column(WARN_TICKS + 5), column(WARN_TICKS + 10)];
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    const comb = run.hazards.filter((h) => h.kind === 'comb');
    expect(comb.length).toBe(5); // one slot of six is left safe
    expect(new Set(comb.map((h) => h.telegraph)).size).toBe(1);
  });

  it('an event says what was announced and whether an enemy fired it', () => {
    const cfg = configOf({
      kind: 'column',
      width: 60,
      telegraphTicks: WARN_TICKS,
      activeTicks: 20,
      damage: 1,
    });
    const run = withBoss(cfg);
    run.boss.attackIn = 1;
    advanceBossFight(run, cfg);
    expect(run.events.find((e) => e.type === 'bossTelegraph')).toMatchObject({
      kind: 'column',
      fromEnemy: false,
    });
  });
});
