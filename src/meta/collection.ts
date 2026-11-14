import { MAX_PERMANENT_LEVEL, type Profile, startLevelFor } from './profile';

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
export function dex(profile: Profile, pool: readonly string[]): readonly DexEntry[] {
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
      startLevel: owned === undefined ? 0 : startLevelFor(level),
    };
  });
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
