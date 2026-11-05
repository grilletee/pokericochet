import { describe, it } from 'vitest';
import { mergeConfig } from '../../src/app/tune';
import { gameConfig } from '../../src/data';
import { ultimateValue } from './ultimateValue';

/**
 * U1, the Ultimates are worth the same (4H-B1): the value of the signature of each starter (see
 * `ultimateValue`) must not differ by more than 20 % from the mean of the four (eighth playtest:
 * "Charizard's cross equals Blastoise's horizontal plus Venusaur's vertical"). The second measure
 * of U1 is M17 of `pnpm bench:fun` (win rate with / without it).
 * Run with `pnpm bench:ultimates`; FUN_PATCH merges a config patch like the other benches.
 */
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];
const STAGES: readonly { stage: number; level: number }[] = [
  { stage: 2, level: 3 },
  { stage: 3, level: 6 },
];

describe('U1 the Ultimates are worth the same', () => {
  it('reports the value of each starter and how far it is from the mean (target <= 20 %)', () => {
    const raw = process.env.FUN_PATCH;
    const config = raw ? mergeConfig(gameConfig, JSON.parse(raw)) : gameConfig;
    const lines: string[] = ['', 'U1  damage of one Ultimate in 24 fixed situations'];
    for (const { stage, level } of STAGES) {
      const values = STARTERS.map((s) => ultimateValue(config, s, level));
      const mean = values.reduce((a, v) => a + v, 0) / values.length;
      const worst = Math.max(...values.map((v) => Math.abs(v / mean - 1)));
      lines.push(
        `  stage ${stage}: ${STARTERS.map((s, i) => `${s} ${(values[i] ?? 0).toFixed(1)} (${(((values[i] ?? 0) / mean - 1) * 100).toFixed(0)}%)`).join(' | ')}`,
        `           furthest from the mean: ${(100 * worst).toFixed(0)} % (target <= 20 %)`,
      );
    }
    console.log(lines.join('\n'));
  });
});
