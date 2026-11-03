import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import type { GameConfig } from '../../src/domain';
import { chaserPolicy, type Outcome, type Policy, playRun, randomPolicy } from './bots';

/**
 * Balance harness: plays many seeded runs with simple bots and reports how far they get. It is a
 * measuring tool, not a test of fun: use it to compare configurations, then look at the numbers.
 * Run with `pnpm bench:balance`. Variants are named patches of the shipped configuration.
 */
const SEEDS = Number(process.env.BALANCE_SEEDS ?? 40);
const STARTERS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];

type Variant = readonly [name: string, patch: (c: GameConfig) => GameConfig];

// Composable levers: each returns a patched copy of the configuration.
const patch =
  (f: (c: GameConfig) => GameConfig) =>
  (c: GameConfig): GameConfig =>
    f(c);
const grassDamage = (mult: number) =>
  patch((c) => ({
    ...c,
    stats: { ...c.stats, typeDamage: { ...c.stats.typeDamage, grass: mult } },
  }));
const drainPerHp = (n: number) =>
  patch((c) => ({ ...c, effects: { ...c.effects, drainPerHp: n } }));
const spawnEvery = (mult: number) =>
  patch((c) => ({
    ...c,
    waves: c.waves.map((w) => ({
      ...w,
      spawnIntervalTicks: Math.round(w.spawnIntervalTicks * mult),
    })),
  }));
const enemySpeed = (mult: number) =>
  patch((c) => ({
    ...c,
    waves: c.waves.map((w) => ({ ...w, speedScale: w.speedScale * mult })),
  }));
const all =
  (...fs: Array<(c: GameConfig) => GameConfig>) =>
  (c: GameConfig): GameConfig =>
    fs.reduce((acc, f) => f(acc), c);

const VARIANTS: readonly Variant[] = [
  ['shipped config (typeDamage all 1, as in the GDD)', (c) => c],
  ['  + grass typeDamage x1.5', grassDamage(1.5)],
  ['  + grass typeDamage x2', grassDamage(2)],
  ['  + grass typeDamage x2 and drain 1 hp per 8 hits', all(grassDamage(2), drainPerHp(8))],
  ['  sensitivity: spawn 20% more often', spawnEvery(0.8)],
  ['  sensitivity: enemies 20% faster', enemySpeed(1.2)],
];

function evaluate(config: GameConfig, policyFor: (seed: number) => Policy): Outcome[] {
  return Array.from({ length: SEEDS }, (_, i) =>
    playRun(config, 1000 + i, STARTERS[i % STARTERS.length] ?? 'charmander', policyFor(1000 + i)),
  );
}

function summarize(outcomes: readonly Outcome[]): string {
  const n = outcomes.length;
  const mean = (f: (o: Outcome) => number) => outcomes.reduce((a, o) => a + f(o), 0) / n;
  const won = outcomes.filter((o) => o.result === 'won').length;
  const waves = outcomes.map((o) => o.wave).sort((a, b) => a - b);
  const median = waves[Math.floor(n / 2)] ?? 0;
  return [
    `win ${((100 * won) / n).toFixed(0).padStart(3)}%`,
    `wave med ${median + 1} (mean ${(mean((o) => o.wave) + 1).toFixed(1)})`,
    `time ${(mean((o) => o.ticks) / 60).toFixed(0).padStart(3)}s`,
    `level ${mean((o) => o.level).toFixed(1)}`,
    `kills ${mean((o) => o.kills)
      .toFixed(0)
      .padStart(3)}`,
    `balls ${mean((o) => o.balls).toFixed(1)}`,
  ].join(' | ');
}

describe('balance harness', () => {
  it('reports how far simple bots get', () => {
    const lines: string[] = [`BALANCE  ${SEEDS} seeds per row, starters rotate`];
    for (const [name, patch] of VARIANTS) {
      const config = patch(gameConfig);
      lines.push(`\n${name}`);
      lines.push(`  random  ${summarize(evaluate(config, randomPolicy))}`);
      const chaser = evaluate(config, () => chaserPolicy);
      lines.push(`  chaser  ${summarize(chaser)}`);
      for (const [k, starter] of STARTERS.entries()) {
        const mine = chaser.filter((_, i) => i % STARTERS.length === k);
        lines.push(`    ${starter.padEnd(10)} ${summarize(mine)}`);
      }
    }
    console.log(`\n${lines.join('\n')}\n`);
    expect(lines.length).toBeGreaterThan(1);
  }, 600_000);
});
