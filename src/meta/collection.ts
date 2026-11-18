import { formAt, type GameConfig, stageForLevel } from '../domain';
import { MAX_PERMANENT_LEVEL, type Profile, startLevelFor, startLevelOf } from './profile';

/**
 * The collection (4G-I, Phase 5): a Pokédex of the pool (seen, owned) and the candies that raise the
 * permanent level of a Pokémon as starter. Pure.
 */

/** Candies to go from `level` to `level + 1`: 3, 6, 9... (Infinity at the top). */
export function levelUpCost(level: number): number {
  return level >= MAX_PERMANENT_LEVEL ? Number.POSITIVE_INFINITY : 3 * level;
}

/** Raises a Pokémon of the collection one permanent level with its candies, if it has enough. */
export function levelUp(profile: Profile, species: string): Profile {
  const owned = profile.owned[species];
  if (owned === undefined) return profile;
  const cost = levelUpCost(owned.level);
  const candies = profile.candies[species] ?? 0;
  if (candies < cost) return profile;
  const left = candies - cost;
  const nextCandies = { ...profile.candies };
  if (left > 0) nextCandies[species] = left;
  else delete nextCandies[species];
  return {
    ...profile,
    candies: nextCandies,
    owned: { ...profile.owned, [species]: { level: owned.level + 1 } },
  };
}

export type DexState = 'owned' | 'seen' | 'unknown';

export interface DexEntry {
  readonly species: string;
  readonly state: DexState;
  readonly level: number;
  readonly candies: number;
  /** Candies the next level costs (Infinity at the top). */
  readonly nextCost: number;
  /** The level it starts a run at. */
  readonly startLevel: number;
}

/** The Pokédex: every Pokémon of the pool, in order, with what you know of it. */
export function dex(
  profile: Profile,
  pool: readonly string[],
  /** 4W: with the config, the start level keeps the pace of each line (`startLevelOf`). */
  config?: GameConfig,
): readonly DexEntry[] {
  const seen = new Set(profile.seen);
  return pool.map((species) => {
    const owned = profile.owned[species];
    const level = owned?.level ?? 0;
    return {
      species,
      state: owned !== undefined ? 'owned' : seen.has(species) ? 'seen' : 'unknown',
      level,
      candies: profile.candies[species] ?? 0,
      nextCost: owned === undefined ? Number.POSITIVE_INFINITY : levelUpCost(level),
      startLevel:
        owned === undefined
          ? 0
          : config === undefined
            ? startLevelFor(level)
            : startLevelOf(config, species, level),
    };
  });
}

/**
 * 4W, block 4 (18th playtest: "no entiendo subir de nivel"): what each permanent level gives a
 * Pokémon, so the sheet can show it as a ladder. For every permanent level 1-10, the level its runs
 * start at (`startLevelOf`, which keeps the pace of its line) and the form it starts in.
 */
export interface LadderStep {
  readonly level: number;
  readonly startLevel: number;
  readonly form: string;
  /** True when this level makes it start stronger than the level before. */
  readonly milestone: boolean;
}

export function permanentLadder(config: GameConfig, species: string): readonly LadderStep[] {
  const steps: LadderStep[] = [];
  let before = 0;
  for (let level = 1; level <= MAX_PERMANENT_LEVEL; level++) {
    const startLevel = startLevelOf(config, species, level);
    steps.push({
      level,
      startLevel,
      form: formAt(config, species, stageForLevel(config, startLevel, species)),
      milestone: level > 1 && startLevel > before,
    });
    before = startLevel;
  }
  return steps;
}

/** Candies to go from permanent `from` to `to` (0 when `to` is not above `from`). */
export function candiesBetween(from: number, to: number): number {
  let sum = 0;
  for (let level = Math.max(1, from); level < Math.min(to, MAX_PERMANENT_LEVEL); level++) {
    sum += levelUpCost(level);
  }
  return sum;
}

export interface NextGoal {
  /** The permanent level of the next milestone. */
  readonly level: number;
  readonly startLevel: number;
  readonly form: string;
  /** Candies still missing to get there (0: you can already). */
  readonly missing: number;
}

/** The next permanent level that makes this Pokémon start stronger, or null when none is left. */
export function nextGoal(
  config: GameConfig,
  species: string,
  level: number,
  candies: number,
): NextGoal | null {
  const step = permanentLadder(config, species).find((s) => s.level > level && s.milestone);
  if (step === undefined) return null;
  return {
    level: step.level,
    startLevel: step.startLevel,
    form: step.form,
    missing: Math.max(0, candiesBetween(level, step.level) - candies),
  };
}

/** "Vistos 40 · conseguidos 6 de 214". */
export function dexCounts(entries: readonly DexEntry[]): {
  readonly seen: number;
  readonly owned: number;
  readonly total: number;
} {
  return {
    seen: entries.filter((e) => e.state !== 'unknown').length,
    owned: entries.filter((e) => e.state === 'owned').length,
    total: entries.length,
  };
}
