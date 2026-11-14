import { baseOf, createRng, type GameConfig, nextInt } from '../domain';
import type { Profile } from './profile';

/**
 * The gacha (4G-I, Phase 5, ADR-025 point 4): coins of the runs buy a draw of a Pokémon for the
 * collection. It has its OWN seeded stream, kept in the profile (seed and number of draws): it never
 * touches a run and a run never touches it. A guarantee: after `PITY - 1` draws in a row with nothing
 * new, the next one is always new. A repeat gives candies instead. The pool is the roster of
 * generations 1-4 without the legendaries (they are only met as final bosses). No real money.
 */
export const GACHA_COST = 100;
/** The draw that is guaranteed new, counting the ones before it that brought nothing new. */
export const PITY = 10;
/** Candies a repeated Pokémon gives. */
export const REPEAT_CANDIES = 3;

/** The Pokémon the gacha can give: every first of a line of the roster, no legendaries. Sorted. */
export function gachaPool(config: GameConfig): readonly string[] {
  const legendary = new Set(config.boss?.finals ?? []);
  return Object.keys(config.species)
    .filter((id) => baseOf(config, id).base === id && !legendary.has(id))
    .sort();
}

export type DrawResult =
  | {
      readonly ok: true;
      readonly profile: Profile;
      readonly species: string;
      readonly isNew: boolean;
      readonly candies: number;
      /** True when the guarantee made it new. */
      readonly guaranteed: boolean;
    }
  | { readonly ok: false; readonly reason: 'coins' | 'empty' };

/** One number of the gacha's own stream, at its position `draws` (stateless: seed + position). */
function streamPick(seed: number, draws: number, n: number): number {
  const rng = createRng((seed ^ Math.imul(draws + 1, 0x9e3779b1)) >>> 0);
  return nextInt(rng, n);
}

/** One draw. Pure: the same profile gives the same draw. */
export function drawGacha(profile: Profile, pool: readonly string[]): DrawResult {
  if (pool.length === 0) return { ok: false, reason: 'empty' };
  if (profile.coins < GACHA_COST) return { ok: false, reason: 'coins' };
  const unowned = pool.filter((id) => profile.owned[id] === undefined);
  const guaranteed = profile.gacha.sinceNew >= PITY - 1 && unowned.length > 0;
  const from = guaranteed ? unowned : pool;
  const species = from[streamPick(profile.gacha.seed, profile.gacha.draws, from.length)] ?? pool[0];
  if (species === undefined) return { ok: false, reason: 'empty' };
  const isNew = profile.owned[species] === undefined;
  const candies = isNew ? 0 : REPEAT_CANDIES;
  const next: Profile = {
    ...profile,
    coins: profile.coins - GACHA_COST,
    owned: isNew ? { ...profile.owned, [species]: { level: 1 } } : profile.owned,
    candies: isNew
      ? profile.candies
      : { ...profile.candies, [species]: (profile.candies[species] ?? 0) + candies },
    seen: profile.seen.includes(species) ? profile.seen : [...profile.seen, species].sort(),
    gacha: {
      seed: profile.gacha.seed,
      draws: profile.gacha.draws + 1,
      sinceNew: isNew ? 0 : profile.gacha.sinceNew + 1,
    },
  };
  return { ok: true, profile: next, species, isNew, candies, guaranteed };
}
