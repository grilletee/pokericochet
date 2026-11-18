import type { GachaRules } from '../data';
import { fiveChance } from './gacha';

/**
 * 4X, block 2 (19th playtest: "economía escasa... conseguir un Deino o un Salamence tiene que ser un
 * '¡hostia, lo tengo!'"): the numbers of the economy, worked out exactly from the rules of the gacha,
 * so the report, the tests and the screen say the same. Pure.
 *
 * The draws until the featured ★5 of a weekly banner come out of a Markov chain over (draws since the
 * last ★5, whether the 50/50 is owed): every draw is a ★5 with `fiveChance`; a ★5 is the featured one
 * half the time, or for sure when the 50/50 is owed (and a lost one makes it owed). The debt carries
 * over the weeks (4X), so the chain is the whole story whatever the week.
 */

const BP = 10_000;

/**
 * `P(k)`: the chance that the featured ★5 comes exactly on draw `k` (1-based), from a fresh start
 * (no pity, nothing owed). Index 0 is unused. Ends where the chance left is under 1e-12.
 */
export function featuredDrawDistribution(rules: GachaRules): readonly number[] {
  const S = rules.hardAt;
  // dist[owed][n]: the chance of being at `n` draws since the last ★5 with or without the debt.
  let free = new Float64Array(S + 1);
  let owed = new Float64Array(S + 1);
  free[0] = 1;
  const out: number[] = [0];
  const share = rules.featuredShare / BP;
  for (let k = 1; k <= 4 * S; k++) {
    const nextFree = new Float64Array(S + 1);
    const nextOwed = new Float64Array(S + 1);
    let hit = 0;
    for (let n = 0; n < S; n++) {
      const p5 = fiveChance(rules, n + 1) / BP;
      const f = free[n] ?? 0;
      const o = owed[n] ?? 0;
      if (f > 0) {
        hit += f * p5 * share;
        // A lost 50/50: owed from now on (or nothing changes without the payback).
        if (rules.lostHalfPaysBack) nextOwed[0] = (nextOwed[0] ?? 0) + f * p5 * (1 - share);
        else nextFree[0] = (nextFree[0] ?? 0) + f * p5 * (1 - share);
        nextFree[n + 1] = (nextFree[n + 1] ?? 0) + f * (1 - p5);
      }
      if (o > 0) {
        hit += o * p5;
        nextOwed[n + 1] = (nextOwed[n + 1] ?? 0) + o * (1 - p5);
      }
    }
    out.push(hit);
    free = nextFree;
    owed = nextOwed;
    let left = 0;
    for (let n = 0; n <= S; n++) left += (free[n] ?? 0) + (owed[n] ?? 0);
    if (left < 1e-12) break;
  }
  return out;
}

/** The fewest draws by which the featured ★5 has come with at least chance `q` (0..1]. */
export function featuredDrawsQuantile(rules: GachaRules, q: number): number {
  const dist = featuredDrawDistribution(rules);
  let sum = 0;
  for (let k = 1; k < dist.length; k++) {
    sum += dist[k] ?? 0;
    if (sum >= q - 1e-9) return k;
  }
  return dist.length - 1;
}

/** The mean number of draws until the featured ★5. */
export function featuredDrawsMean(rules: GachaRules): number {
  const dist = featuredDrawDistribution(rules);
  let mean = 0;
  for (let k = 1; k < dist.length; k++) mean += k * (dist[k] ?? 0);
  return mean;
}

/** The worst case: the featured ★5 comes for sure by this draw (two hard pities with the payback). */
export function featuredDrawsWorst(rules: GachaRules): number {
  return rules.lostHalfPaysBack ? 2 * rules.hardAt : Number.POSITIVE_INFINITY;
}

/** How a player who plays `runsPerDay` runs a day, of `coinsPerRun` coins on average, gets on. */
export interface EconomyPlan {
  readonly coinsPerRun: number;
  readonly drawsPerRun: number;
  readonly runsPerDay: number;
  /** Runs and days until the featured ★5: half the time, on average and at the very worst. */
  readonly medianRuns: number;
  readonly meanRuns: number;
  readonly worstRuns: number;
  readonly medianDays: number;
  readonly meanDays: number;
  readonly worstDays: number;
  /** Runs until the hard pity (a ★5, featured or not, for sure). */
  readonly runsToHardPity: number;
}

export function economyPlan(
  rules: GachaRules,
  coinsPerRun: number,
  runsPerDay: number,
): EconomyPlan {
  const drawsPerRun = coinsPerRun / rules.cost;
  const runs = (draws: number): number => draws / drawsPerRun;
  const median = runs(featuredDrawsQuantile(rules, 0.5));
  const mean = runs(featuredDrawsMean(rules));
  const worst = runs(featuredDrawsWorst(rules));
  return {
    coinsPerRun,
    drawsPerRun,
    runsPerDay,
    medianRuns: median,
    meanRuns: mean,
    worstRuns: worst,
    medianDays: median / runsPerDay,
    meanDays: mean / runsPerDay,
    worstDays: worst / runsPerDay,
    runsToHardPity: runs(rules.hardAt),
  };
}

/** 4X: "juego normal", the reference of the economy (decision 3 of the 4X): four runs a day. */
export const RUNS_PER_DAY = 4;
