import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { chaserPolicy, type Outcome, type Policy, playRun, standStillPolicy } from './bots';

/**
 * Two questions for the playtest, answered with bots (not humans):
 *  - How much does moving matter? (chaser vs a bot that never moves)
 *  - Do hybrids (F2) ever happen, and are fusion tokens used?
 * Run with `pnpm bench:agency`. BALANCE_PER_STARTER sets the runs per starter (default 100).
 */
const PER_STARTER = Number(process.env.BALANCE_PER_STARTER ?? 100);
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];

function play(policy: Policy): Outcome[] {
  const outcomes: Outcome[] = [];
  for (const [k, starter] of STARTERS.entries()) {
    for (let i = 0; i < PER_STARTER; i++) {
      outcomes.push(playRun(gameConfig, 5000 + k * 1000 + i, starter, policy));
    }
  }
  return outcomes;
}

function describeRuns(name: string, outcomes: readonly Outcome[]): string {
  const n = outcomes.length;
  const mean = (f: (o: Outcome) => number) => outcomes.reduce((a, o) => a + f(o), 0) / n;
  const pct = (f: (o: Outcome) => boolean) => (100 * outcomes.filter(f).length) / n;
  return [
    `${name.padEnd(8)} win ${pct((o) => o.result === 'won')
      .toFixed(0)
      .padStart(3)}%`,
    `boss ${pct((o) => o.bossReached)
      .toFixed(0)
      .padStart(3)}%`,
    `evolutions ${mean((o) => o.evolutions).toFixed(2)}`,
    `hybrids ${mean((o) => o.hybrids).toFixed(2)} (runs with one: ${pct((o) => o.hybrids > 0).toFixed(0)}%)`,
    `runs with an evolution: ${pct((o) => o.evolutions > 0).toFixed(0)}%`,
  ].join(' | ');
}

describe('agency and fusion use', () => {
  it('reports how much moving matters and how often hybrids happen', () => {
    const chaser = play(chaserPolicy);
    const still = play(standStillPolicy);
    console.log(
      `\nAGENCY  ${PER_STARTER * 4} runs per policy\n${describeRuns('chaser', chaser)}\n${describeRuns('still', still)}\n`,
    );
    expect(chaser.length).toBe(still.length);
  }, 600_000);
});
