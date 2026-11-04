import { describe, expect, it } from 'vitest';
import {
  applyTune,
  changedKnobs,
  defaultTune,
  mergeConfig,
  neutral,
  sanitizeTune,
  TUNE_DEFS,
  tuneToPatch,
} from '../../src/app/tune';
import { gameConfig } from '../../src/data';

const base = gameConfig;
const tuned = (key: string, value: number) =>
  applyTune(base, { ...defaultTune(base), [key]: value });

describe('live tuning', () => {
  it('has one neutral value per knob and applying them all changes nothing', () => {
    expect(Object.keys(defaultTune(base)).sort()).toEqual(TUNE_DEFS.map((d) => d.key).sort());
    expect(applyTune(base, defaultTune(base))).toEqual(base);
    expect(changedKnobs(base, defaultTune(base))).toEqual({});
  });

  it('keeps every neutral value inside the range of its slider, on a step', () => {
    for (const def of TUNE_DEFS) {
      const value = neutral(def, base);
      expect(value, def.key).toBeGreaterThanOrEqual(def.min);
      expect(value, def.key).toBeLessThanOrEqual(def.max);
    }
  });

  it('density divides the spawn interval of every wave', () => {
    const faster = tuned('spawnRate', 2);
    faster.waves.forEach((w, i) => {
      expect(w.spawnIntervalTicks).toBe(Math.round((base.waves[i]?.spawnIntervalTicks ?? 0) / 2));
      expect(w.hpScale).toBe(base.waves[i]?.hpScale); // the rest of the wave is untouched
    });
  });

  it('never lets an interval reach zero', () => {
    const extreme = applyTune(base, { ...defaultTune(base), spawnRate: 1e9 });
    expect(extreme.waves.every((w) => w.spawnIntervalTicks >= 1)).toBe(true);
  });

  it('scales enemy speed, hp, ball speed, damage and xp as multipliers', () => {
    expect(tuned('enemySpeed', 2).enemy.speedMax).toBeCloseTo(base.enemy.speedMax * 2, 12);
    expect(tuned('enemySpeed', 2).enemy.speedMin).toBeCloseTo(base.enemy.speedMin * 2, 12);
    expect(tuned('enemyHp', 2).enemy.hpScale).toBeCloseTo(base.enemy.hpScale * 2, 12);
    expect(tuned('ballSpeed', 1.5).ball.speedMax).toBeCloseTo(base.ball.speedMax * 1.5, 12);
    expect(tuned('ballSpeed', 1.5).ball.speedMin).toBeCloseTo(base.ball.speedMin * 1.5, 12);
    // Damage = attack / divisor: twice the damage is half the divisor.
    expect(tuned('damage', 2).stats.damageDivisor).toBeCloseTo(base.stats.damageDivisor / 2, 12);
    expect(tuned('levelCost', 2).progression.levelCosts).toEqual(
      base.progression.levelCosts.map((c) => Math.round(c * 2)),
    );
  });

  it('sets the absolute knobs where the game reads them', () => {
    expect(tuned('playerSpeed', 8).player.speed).toBe(8);
    expect(tuned('reload', 40.4).ball.cooldownTicks).toBe(40);
    expect(tuned('manualJitter', 0.1).ball.manualAimJitter).toBe(0.1);
    expect(tuned('autoJitter', 0.3).ball.aimJitter).toBe(0.3);
    expect(tuned('autoReload', 2).ball.autoCooldownMult).toBe(2);
    expect(tuned('pickupRadius', 60).pickup.radius).toBe(60);
    expect(tuned('returnTicks', 100.6).pickup.returnTicks).toBe(101);
    expect(tuned('captureFall', 4).pickup.dropSpeed).toBe(4);
    expect(tuned('captureChance', 0.3).capture.chance).toBe(0.3);
    expect(tuned('capturePity', 0.05).capture.pityStep).toBe(0.05);
  });

  it('does not touch what no knob owns', () => {
    const out = tuned('captureChance', 0.3);
    expect(out.arena).toBe(base.arena);
    expect(out.typeChart).toBe(base.typeChart);
    expect(out.species).toBe(base.species);
    expect(out.boss).toEqual(base.boss);
    expect(base.capture.chance).not.toBe(0.3); // the shipped config is never mutated
  });

  it('copies only what moved, and the patch reproduces the tuning', () => {
    const values = { ...defaultTune(base), captureChance: 0.2, spawnRate: 1.5 };
    expect(changedKnobs(base, values)).toEqual({ captureChance: 0.2, spawnRate: 1.5 });
    expect(mergeConfig(base, tuneToPatch(base, values))).toEqual(applyTune(base, values));
  });

  it('clamps stored values to the slider range and ignores junk', () => {
    const clamped = sanitizeTune(base, {
      captureChance: 99,
      spawnRate: -4,
      nonsense: 1,
      enemyHp: 'x',
    });
    const chance = TUNE_DEFS.find((d) => d.key === 'captureChance');
    const rate = TUNE_DEFS.find((d) => d.key === 'spawnRate');
    expect(clamped.captureChance).toBe(chance?.max);
    expect(clamped.spawnRate).toBe(rate?.min);
    expect(clamped.enemyHp).toBe(1);
    expect(clamped.nonsense).toBeUndefined();
    expect(sanitizeTune(base, null)).toEqual(defaultTune(base));
    expect(sanitizeTune(base, 'text')).toEqual(defaultTune(base));
    expect(sanitizeTune(base, { captureChance: Number.NaN }).captureChance).toBe(
      base.capture.chance,
    );
  });
});

describe('the difficulty curve knobs (ADR-029)', () => {
  it('has a density, health and speed knob for each of the seven waves and one for the bosses', () => {
    const keys = TUNE_DEFS.map((d) => d.key);
    for (let wave = 1; wave <= base.waves.length; wave++) {
      for (const kind of ['Spawn', 'Hp', 'Speed']) expect(keys).toContain(`w${wave}${kind}`);
    }
    expect(keys).toContain('bossHp');
    expect(base.waves).toHaveLength(7);
  });

  it('a wave knob changes only that wave', () => {
    const tuned = applyTune(base, {
      ...defaultTune(base),
      w3Hp: 2,
      w3Spawn: 2,
      w3Speed: 0.5,
    });
    for (let i = 0; i < base.waves.length; i++) {
      const was = base.waves[i];
      const now = tuned.waves[i];
      if (i !== 2) {
        expect(now?.hpScale).toBe(was?.hpScale);
        expect(now?.spawnIntervalTicks).toBe(was?.spawnIntervalTicks);
        expect(now?.speedScale).toBe(was?.speedScale);
      } else {
        expect(now?.hpScale).toBeCloseTo((was?.hpScale ?? 0) * 2, 9);
        expect(now?.spawnIntervalTicks).toBe(Math.round((was?.spawnIntervalTicks ?? 0) / 2));
        expect(now?.speedScale).toBeCloseTo((was?.speedScale ?? 0) * 0.5, 9);
      }
    }
    // The themes and the form of each wave survive the merge.
    expect(tuned.waves[2]?.themes).toEqual(base.waves[2]?.themes);
    expect(tuned.waves[2]?.tier).toBe(base.waves[2]?.tier);
  });

  it('the global density multiplies with the per-wave one', () => {
    const tuned = applyTune(base, { ...defaultTune(base), spawnRate: 2, w1Spawn: 2 });
    expect(tuned.waves[0]?.spawnIntervalTicks).toBe(
      Math.round((base.waves[0]?.spawnIntervalTicks ?? 0) / 4),
    );
  });

  it('the boss knob scales every boss between waves and the final one', () => {
    const tuned = applyTune(base, { ...defaultTune(base), bossHp: 2 });
    expect(tuned.boss?.hpScale).toBe((base.boss?.hpScale ?? 0) * 2);
    base.interludes?.forEach((boss, i) => {
      expect(tuned.interludes?.[i]?.hpScale).toBe(boss.hpScale * 2);
      expect(tuned.interludes?.[i]?.byType).toEqual(boss.byType);
    });
    expect(tuned.interludes).toHaveLength(base.interludes?.length ?? -1);
  });
});

describe('mergeConfig', () => {
  it('merges objects, replaces numbers and merges arrays by index', () => {
    const merged = mergeConfig(
      { a: { b: 1, c: 2 }, list: [{ x: 1, y: 2 }, { x: 3 }] },
      {
        a: { b: 9 },
        list: [{ y: 5 }],
      },
    );
    expect(merged).toEqual({ a: { b: 9, c: 2 }, list: [{ x: 1, y: 5 }, { x: 3 }] });
  });

  it('returns the base untouched for an undefined patch and does not mutate its input', () => {
    const input = { a: { b: 1 } };
    expect(mergeConfig(input, undefined)).toBe(input);
    mergeConfig(input, { a: { b: 2 } });
    expect(input).toEqual({ a: { b: 1 } });
  });

  it('the 4F knobs write the team, card and capture rules they are named after', () => {
    expect(tuned('fullTeamCapture', 0.5).capture.fullTeamChanceMult).toBe(0.5);
    expect(tuned('powerStep', 0.4).cards.powerStep).toBe(0.4);
    expect(tuned('cadenceFactor', 0.8).cards.cadenceFactor).toBe(0.8);
    expect(tuned('teamStep', 0.1).cards.damageStep).toBe(0.1);
    expect(tuned('wTrain', 1).cards.weights.train).toBe(1);
    expect(tuned('wPower', 2).cards.weights.power).toBe(2);
    expect(tuned('wCadence', 3).cards.weights.cadence).toBe(3);
    expect(tuned('wRecruit', 4).cards.weights.newBall).toBe(4);
    expect(tuned('wVitality', 5).cards.weights.vitality).toBe(5);
    expect(tuned('drainPerHp', 60).effects.drainPerHp).toBe(60);
    expect(tuned('threatPerTier', 1).enemy.threatPerTier).toBe(1);
    expect(tuned('stage2', 4).team.stageLevels).toEqual([4, base.team.stageLevels[1]]);
    expect(tuned('stage3', 7).team.stageLevels).toEqual([base.team.stageLevels[0], 7]);
    // The balls by level move in two blocks (levels 3-5 and 6-8); levels 1 and 2 keep their value.
    expect(tuned('ballsMid', 4).team.ballsByLevel).toEqual([1, 1, 4, 4, 4, 3, 3, 3]);
    expect(tuned('ballsMax', 5).team.ballsByLevel).toEqual([1, 1, 2, 2, 2, 5, 5, 5]);
    expect(tuned('powerStep', 0.4).team).toEqual(base.team); // nothing else moves
  });

  it('the 4F-C knobs write the stats, guard, stage growth and move rules (ADR-037..039)', () => {
    expect(tuned('powerMultMax', 2).stats.powerMultMax).toBe(2);
    expect(tuned('powerMultMax', 2).stats.powerMultMin).toBe(base.stats.powerMultMin);
    expect(tuned('guardMax', 0.5).stats.guardMax).toBe(0.5);
    expect(tuned('stageGrowth2', 1.3).team.stageGrowth).toEqual([1, 1.3, base.team.stageGrowth[2]]);
    expect(tuned('stageGrowth3', 1.6).team.stageGrowth).toEqual([1, base.team.stageGrowth[1], 1.6]);
    expect(tuned('chargeStage1', 4).moves.chargeByStage).toEqual([
      4,
      base.moves.chargeByStage[1],
      base.moves.chargeByStage[2],
    ]);
    expect(tuned('chargeStage2', 5.4).moves.chargeByStage[1]).toBe(5);
    expect(tuned('chargeStage3', 3).moves.chargeByStage[2]).toBe(3);
  });

  it('the move strength knobs scale each tier and keep its shape', () => {
    const out = tuned('moveTier2', 2);
    expect(out.moves.tiers[1]).toEqual({
      ...base.moves.tiers[1],
      power: (base.moves.tiers[1]?.power ?? 0) * 2,
    });
    expect(out.moves.tiers[0]).toEqual(base.moves.tiers[0]);
    expect(out.moves.tiers[2]).toEqual(base.moves.tiers[2]);
    expect(out.moves.signatures).toEqual(base.moves.signatures);
    expect(out.moves.byBase).toEqual(base.moves.byBase);
  });

  it('the speed cap moves with the ball speed knob so the two never fight', () => {
    expect(tuned('speedCap', 7).ball.speedCap).toBeCloseTo(7, 12);
    expect(tuned('ballSpeed', 1.5).ball.speedCap).toBeCloseTo(base.ball.speedCap * 1.5, 12);
    expect(tuned('ballSpeed', 1.5).ball.speedMax).toBeCloseTo(base.ball.speedMax * 1.5, 12);
  });

  it('has the 11 knobs of the 4F-C on top of the 53 of the 4F-B', () => {
    const keys = TUNE_DEFS.map((d) => d.key);
    for (const key of [
      'powerMultMax',
      'guardMax',
      'stageGrowth2',
      'stageGrowth3',
      'speedCap',
      'chargeStage1',
      'chargeStage2',
      'chargeStage3',
      'moveTier1',
      'moveTier2',
      'moveTier3',
    ]) {
      expect(keys, key).toContain(key);
    }
    expect(TUNE_DEFS).toHaveLength(64);
  });
});
