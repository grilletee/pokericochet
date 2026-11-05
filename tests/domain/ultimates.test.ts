import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { ultimateValue } from '../bench/ultimateValue';

/**
 * U1 (4H-B1): the Ultimates of the four starters are worth the same. The shipped powers are
 * calibrated so each is within 20 % of the mean at stage 2 and at stage 3; this pins it, so a
 * change to a shape or to the type damage that makes one starter's Ultimate worth much more or
 * less than the others fails here (the eighth playtest found Charizard's cross at +50 %).
 */
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];

describe('U1 the Ultimates are worth the same', () => {
  for (const [stage, level] of [
    [2, 3],
    [3, 6],
  ] as const) {
    it(`at stage ${stage} every starter is within 20 % of the mean`, () => {
      const values = STARTERS.map((s) => ultimateValue(gameConfig, s, level));
      const mean = values.reduce((a, v) => a + v, 0) / values.length;
      expect(mean).toBeGreaterThan(0);
      for (const v of values) expect(Math.abs(v / mean - 1)).toBeLessThanOrEqual(0.2);
    });
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
