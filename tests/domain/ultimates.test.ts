import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { stageForLevel, stageLevelsOf } from '../../src/domain';
import { ultimateValue } from '../bench/ultimateValue';

/**
 * U1 (4H-B1): the Ultimates of the four starters are worth the same. The shipped powers are
 * calibrated so each is within 20 % of the mean at stage 2 and at stage 3; this pins it, so a
 * change to a shape or to the type damage that makes one starter's Ultimate worth much more or
 * less than the others fails here (the eighth playtest found Charizard's cross at +50 %).
 */
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];

describe('U1 the Ultimates are worth the same', () => {
  for (const stage of [2, 3] as const) {
    it(`at stage ${stage} every starter is within 20 % of the mean`, () => {
      // 4W: each line has its own pace (Pikachu evolves a level later). They are compared at the
      // same level, the first at which all four are at this stage, so only the Ultimate differs.
      const level = Math.max(...STARTERS.map((s) => stageLevelsOf(gameConfig, s)[stage - 2] ?? 1));
      for (const s of STARTERS) expect(stageForLevel(gameConfig, level, s), s).toBe(stage);
      const values = STARTERS.map((s) => ultimateValue(gameConfig, s, level));
      const mean = values.reduce((a, v) => a + v, 0) / values.length;
      expect(mean).toBeGreaterThan(0);
      for (const v of values) expect(Math.abs(v / mean - 1)).toBeLessThanOrEqual(0.2);
      // 4W: it plays real fights (~2 s alone); under the whole suite in parallel it passed 5 s.
    }, 30_000);
  }

  it('is a measure that notices when one is out of line (the 4F-E cross was far out)', () => {
    const wild = {
      ...gameConfig,
      moves: {
        ...gameConfig.moves,
        signatures: {
          ...gameConfig.moves.signatures,
          charmander: [
            null,
            { kind: 'cross', width: 36, power: 3 },
            { kind: 'cross', width: 48, power: 4.7 },
          ],
        },
      },
    } as typeof gameConfig;
    const fire = ultimateValue(wild, 'charmander', 6);
    const water = ultimateValue(wild, 'squirtle', 6);
    expect(fire / water).toBeGreaterThan(1.4);
  });
});
