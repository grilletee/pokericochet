/**
 * The pace of evolution of each line (4W, block 1; 18th playtest: "Cogí a Bagon de inicial y al
 * principio de la oleada 2 ya tenía Salamence"). Every line used to reach stage 2 at level 3 and stage
 * 3 at level 6. Now each line keeps the rhythm of the games: its real evolution levels (PokéAPI,
 * `roster.json` `evolution`) scaled to the levels 1-8 of a run.
 *
 * The rule, documented in the vault (Decisiones-a-revisar-2026-11-17):
 * - A level of the games becomes `1 + round(level / 7)`: Charmander 16/36 -> 3/6 (as before),
 *   Bagon 30/50 -> 5/8, Caterpie 7/10 -> 2/3.
 * - Stage 2 between levels 2 and 6; stage 3 at least one level after stage 2, at most 8.
 * - An evolution without a level (a stone, a trade, friendship...): stage 2 at level 4, and stage 3
 *   two levels after stage 2 (a trade or a stone is "one step more").
 * - A line of two forms reaches its "maximum power" (stage 3, same form) three levels after stage 2.
 * - The pseudo-legendaries (their final form has a base-stat total of 600) wait longer: stage 2 at
 *   level 5 or later, and the final form only at level 8, the last one.
 * - A line of one form has no entry: it uses the common thresholds of the config.
 * Pure: no files, no randomness; unit-tested.
 */

export interface EvolutionStep {
  readonly level: number | null;
  readonly trigger: string;
}

export const PACE = {
  /** Levels of the games per level of a run. */
  divisor: 7,
  firstMin: 2,
  firstMax: 6,
  lastMax: 8,
  /** Stage 2 of an evolution without a level, and the gap to stage 3 after it. */
  noLevelFirst: 4,
  noLevelGap: 2,
  /** A line of two forms: stage 3 ("maximum power") this many levels after stage 2. */
  peakGap: 3,
  /** The pseudo-legendaries: stage 2 not before this level, the final form at `lastMax`. */
  pseudoFirstMin: 5,
} as const;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** A level of the games as a level of a run. */
export function gameLevel(real: number): number {
  return 1 + Math.round(real / PACE.divisor);
}

/**
 * The levels at which a line reaches stage 2 and stage 3, from how its forms are reached; null for
 * a line of one form (it keeps the common thresholds).
 */
export function lineStageLevels(
  steps: readonly EvolutionStep[],
  pseudo = false,
): readonly [number, number] | null {
  const first = steps[0];
  if (first === undefined) return null;
  const firstMin = pseudo ? PACE.pseudoFirstMin : PACE.firstMin;
  const two =
    first.level === null
      ? clamp(PACE.noLevelFirst, firstMin, PACE.firstMax)
      : clamp(gameLevel(first.level), firstMin, PACE.firstMax);
  const second = steps[1];
  let three: number;
  if (pseudo) three = PACE.lastMax;
  else if (second === undefined) three = two + PACE.peakGap;
  else if (second.level === null) three = two + PACE.noLevelGap;
  else three = gameLevel(second.level);
  return [two, clamp(three, two + 1, PACE.lastMax)];
}

/** The pace of every line of the data, by base species (lines of one form are left out). */
export function paceOfLines(
  evolution: Readonly<Record<string, readonly EvolutionStep[]>>,
  pseudoLines: readonly string[],
): Record<string, readonly number[]> {
  const pseudo = new Set(pseudoLines);
  const out: Record<string, readonly number[]> = {};
  for (const [base, steps] of Object.entries(evolution)) {
    const levels = lineStageLevels(steps, pseudo.has(base));
    if (levels !== null) out[base] = levels;
  }
  return out;
}
