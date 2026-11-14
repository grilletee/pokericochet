import type { Profile } from './profile';

/**
 * Who can start a run (4G-I, Phase 5, Vision: "solo puedes empezar una run con iniciales de tu
 * colección"). The first time, one of the four classic starters, offered by the professor of the
 * game; after that, only the Pokémon of the collection. Pure.
 */

/** The Pokémon offered now: the classics the first time, the collection (sorted) after. */
export function starterChoices(profile: Profile, classics: readonly string[]): readonly string[] {
  if (!profile.firstStarterChosen) return classics;
  const owned = Object.keys(profile.owned).sort();
  // A collection never empties itself, but a broken import might: the classics are the way back.
  return owned.length > 0 ? owned : classics;
}

/** Can a run start with this Pokémon? */
export function canStartWith(
  profile: Profile,
  classics: readonly string[],
  species: string,
): boolean {
  return starterChoices(profile, classics).includes(species);
}

/**
 * The first choice: the classic starter joins the collection (at level 1) and from now on only the
 * collection is offered. Any other species, or a second time, changes nothing.
 */
export function chooseFirstStarter(
  profile: Profile,
  classics: readonly string[],
  species: string,
): Profile {
  if (profile.firstStarterChosen || !classics.includes(species)) return profile;
  return {
    ...profile,
    firstStarterChosen: true,
    owned: { ...profile.owned, [species]: { level: 1 } },
    seen: [...new Set([...profile.seen, species])].sort(),
  };
}
