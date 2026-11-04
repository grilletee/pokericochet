import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import type { GameConfig } from '../../src/domain';
import { chaserPolicy, type Outcome, type Policy, playRun, randomPolicy } from './bots';

/**
 * Balance harness: plays many seeded runs with simple bots and reports how far they get. It is a
 * measuring tool, not a test of fun: use it to compare configurations, then look at the numbers.
 * Run with `pnpm bench:balance`. Variants are named patches of the shipped configuration.
 */
// Runs per starter; every row plays PER_STARTER * 4 runs, so each starter is measured alone.
const PER_STARTER = Number(process.env.BALANCE_PER_STARTER ?? 25);
const SEEDS = PER_STARTER * 4;
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
const levelCostsScale = (mult: number) =>
  patch((c) => ({
    ...c,
    progression: {
      ...c.progression,
      levelCosts: c.progression.levelCosts.map((x) => Math.floor(x * mult + 0.5)),
    },
  }));
const bossHp = (hpScale: number) =>
  patch((c) => (c.boss ? { ...c, boss: { ...c.boss, hpScale } } : c));
const electricDamage = (mult: number) =>
  patch((c) => ({
    ...c,
    stats: { ...c.stats, typeDamage: { ...c.stats.typeDamage, electric: mult } },
  }));
const chainStrength = (strength: number) =>
  patch((c) => ({
    ...c,
    abilities: {
      ...c.abilities,
      byType: {
        ...c.abilities.byType,
        electric: (c.abilities.byType.electric ?? []).map((stage, i) =>
          i === 0 ? stage.map((e) => (e.kind === 'chain' ? { ...e, strength } : e)) : stage,
        ),
      },
    },
  }));
const all =
  (...fs: Array<(c: GameConfig) => GameConfig>) =>
  (c: GameConfig): GameConfig =>
    fs.reduce((acc, f) => f(acc), c);

const ALL_VARIANTS: readonly Variant[] = [
  // Index 0 on purpose: BALANCE_ONLY=0 is always the shipped configuration.
  ['shipped config (grass x2, level costs x1.8, enemy hpScale 0.45, boss hpScale 30)', (c) => c],
  // Proposals for Electric (not applied): chain damage fraction, shipped = 0.5.
  ['  proposal: chain 0.4', chainStrength(0.4)],
  ['  proposal: chain 0.3', chainStrength(0.3)],
  ['  proposal: chain 0.2', chainStrength(0.2)],
  ['  proposal: electric base damage x0.85', electricDamage(0.85)],
  ['  proposal: electric base damage x0.75', electricDamage(0.75)],
  ['  proposal: electric base damage x0.65', electricDamage(0.65)],
  ['  proposal: grass x1.75 + electric x0.85', all(grassDamage(1.75), electricDamage(0.85))],
  ['  proposal: grass x1.5 + electric x0.85', all(grassDamage(1.5), electricDamage(0.85))],
  ['  proposal: grass x1.5 + electric x0.9', all(grassDamage(1.5), electricDamage(0.9))],
  ['  boss hp x20', bossHp(20)],
  ['  boss hp x30', bossHp(30)],
  ['  boss hp x40', bossHp(40)],
  ['  cost x1.3', levelCostsScale(1.3)],
  ['  cost x1.5', levelCostsScale(1.5)],
  ['  cost x1.7', levelCostsScale(1.7)],
  ['  + grass typeDamage x1.5', grassDamage(1.5)],
  ['  + grass typeDamage x1.75', grassDamage(1.75)],
  ['  + grass typeDamage x2', grassDamage(2)],
  ['  + grass typeDamage x2 and drain 1 hp per 8 hits', all(grassDamage(2), drainPerHp(8))],
  ['  sensitivity: spawn 20% more often', spawnEvery(0.8)],
  ['  sensitivity: enemies 20% faster', enemySpeed(1.2)],
];

// BALANCE_ONLY=0,2 selects variants by index while tuning.
const only = process.env.BALANCE_ONLY?.split(',').map(Number);
const VARIANTS = ALL_VARIANTS.filter((_, i) => !only || only.includes(i));

function evaluate(config: GameConfig, policyFor: (seed: number) => Policy): Outcome[] {
  return Array.from({ length: SEEDS }, (_, i) =>
    playRun(config, 1000 + i, STARTERS[i % STARTERS.length] ?? 'charmander', policyFor(1000 + i)),
  );
}

/** 95 % Wilson score interval of a proportion, as percentages. */
function wilson(wins: number, n: number): [number, number] {
  if (n === 0) return [0, 100];
  const z = 1.96;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [100 * Math.max(0, centre - half), 100 * Math.min(1, centre + half)];
}

function summarize(outcomes: readonly Outcome[]): string {
  const n = outcomes.length;
  const mean = (f: (o: Outcome) => number) => outcomes.reduce((a, o) => a + f(o), 0) / n;
  const won = outcomes.filter((o) => o.result === 'won').length;
  const waves = outcomes.map((o) => o.wave).sort((a, b) => a - b);
  const median = waves[Math.floor(n / 2)] ?? 0;
  return [
    `win ${((100 * won) / n).toFixed(0).padStart(3)}% [${wilson(won, n)
      .map((x) => x.toFixed(0))
      .join('-')}]`,
    `wave med ${median + 1} (mean ${(mean((o) => o.wave) + 1).toFixed(1)})`,
    `time ${(mean((o) => o.ticks) / 60).toFixed(0).padStart(3)}s`,
    `level ${mean((o) => o.level).toFixed(1)}`,
    `${(mean((o) => o.ticks) / 60 / Math.max(1, mean((o) => o.level) - 1)).toFixed(1)}s/level`,
    `kills ${mean((o) => o.kills)
      .toFixed(0)
      .padStart(3)}`,
    `balls ${mean((o) => o.balls).toFixed(1)}`,
    `evolutions ${mean((o) => o.evolutions).toFixed(1)}`,
    `boss ${((100 * outcomes.filter((o) => o.bossReached).length) / n).toFixed(0)}%`,
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
