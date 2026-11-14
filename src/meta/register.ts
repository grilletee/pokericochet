import type { RunSummary } from '../domain';
import { REPEAT_CANDIES } from './gacha';
import type { Profile } from './profile';

/**
 * Registering a capture (4G-I, Phase 5, Vision: "registrar en la colección uno de los Pokémon
 * capturados en la run si se supera un hito"): what you capture in a run is yours only for that run;
 * if you defeated at least one boss, at the end you may keep ONE of them for good. Pure.
 */
export const REGISTER_MIN_BOSSES = 1;

/** The captures you may register after this run (each species once, in capture order), or none. */
export function registerable(summary: RunSummary): readonly string[] {
  if (summary.bossesDefeated < REGISTER_MIN_BOSSES) return [];
  return [...new Set(summary.captured.map((c) => c.species))];
}

/**
 * Keeps one capture of the run: a new Pokémon joins the collection; one you already have gives its
 * candies instead. A species that was not offered changes nothing.
 */
export function registerCapture(
  profile: Profile,
  offered: readonly string[],
  species: string,
): { readonly profile: Profile; readonly isNew: boolean } {
  if (!offered.includes(species)) return { profile, isNew: false };
  if (profile.owned[species] === undefined) {
    return {
      profile: {
        ...profile,
        owned: { ...profile.owned, [species]: { level: 1 } },
        seen: profile.seen.includes(species) ? profile.seen : [...profile.seen, species].sort(),
      },
      isNew: true,
    };
  }
  return {
    profile: {
      ...profile,
      candies: { ...profile.candies, [species]: (profile.candies[species] ?? 0) + REPEAT_CANDIES },
    },
    isNew: false,
  };
}
