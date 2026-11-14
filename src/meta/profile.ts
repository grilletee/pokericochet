import type { GameConfig } from '../domain';

/**
 * The persistent profile (Phase 5, ADR-025; 4G-I): what a player keeps between runs. It lives apart
 * from the run: the run is still `f(seed, commands, config)` and never reads it; the profile only
 * changes WHICH config goes into a run (`applyUpgrades`, once, before it is created).
 *
 * Pure: no storage, no clock, no randomness of the host (the gacha has its own seeded stream here,
 * in `gacha`). The app stores it (localStorage, `profile.v1`) and exports / imports it as JSON.
 *
 * Versions: every stored profile says its `version`. `migrateProfile` reads ANY stored value (an
 * older version, a broken file, an object written by hand) and returns a valid profile of the
 * current version, field by field, never throwing; a profile of a NEWER version than the game knows
 * is refused (`null`) so it is never overwritten by an older game.
 */

export const PROFILE_VERSION = 1;

/** The most a Pokémon of the collection can be raised with candies (its level as a starter). */
export const MAX_PERMANENT_LEVEL = 10;

export interface OwnedPokemon {
  /** Its permanent level as a starter, 1..MAX_PERMANENT_LEVEL (candies raise it). */
  readonly level: number;
}

export interface GachaState {
  /** The seed of the gacha's own stream and how many draws it has made (its position). */
  readonly seed: number;
  readonly draws: number;
  /** Draws in a row with nothing new: the guarantee counts them. */
  readonly sinceNew: number;
}

export interface ProfileStats {
  readonly runs: number;
  readonly wins: number;
  readonly bossesDefeated: number;
}

export interface Profile {
  readonly version: typeof PROFILE_VERSION;
  readonly coins: number;
  /** Candies per Pokémon of the collection (by its species id, the first of its line). */
  readonly candies: Readonly<Record<string, number>>;
  /** The collection: the Pokémon you have, by species id (the first of its line). */
  readonly owned: Readonly<Record<string, OwnedPokemon>>;
  /** Every species met in a run, for the Pokédex ("vistos"). */
  readonly seen: readonly string[];
  /** The first time: the four classic starters, then only the collection (block 8). */
  readonly firstStarterChosen: boolean;
  readonly gacha: GachaState;
  readonly stats: ProfileStats;
}

/** A new profile: nothing owned yet (the first starter is chosen the first time you play). */
export function emptyProfile(gachaSeed: number): Profile {
  return {
    version: PROFILE_VERSION,
    coins: 0,
    candies: {},
    owned: {},
    seen: [],
    firstStarterChosen: false,
    gacha: { seed: gachaSeed >>> 0 || 1, draws: 0, sinceNew: 0 },
    stats: { runs: 0, wins: 0, bossesDefeated: 0 },
  };
}

const int = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.floor(value)))
    : fallback;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads any stored value into a profile of the current version. `known` says which species ids exist
 * (unknown ones are dropped, so a profile of a bigger roster still loads). `gachaSeed` seeds a new
 * gacha stream when the stored one has none. Returns null for a profile of a NEWER version.
 *
 * Migrations: version 0 (no `version`: an unversioned draft, e.g. written by hand, with a
 * `collection` list of species) is read into version 1; version 1 is validated field by field.
 */
export function migrateProfile(
  raw: unknown,
  known: (species: string) => boolean,
  gachaSeed: number,
): Profile | null {
  if (!isRecord(raw)) return emptyProfile(gachaSeed);
  const version = int(raw.version, 0, Number.MAX_SAFE_INTEGER, 0);
  if (version > PROFILE_VERSION) return null;
  const base = emptyProfile(gachaSeed);
  // v0 -> v1: a plain list of species becomes the collection, at level 1.
  const ownedRaw: Record<string, unknown> = isRecord(raw.owned) ? { ...raw.owned } : {};
  if (version === 0 && Array.isArray(raw.collection)) {
    for (const id of raw.collection) if (typeof id === 'string') ownedRaw[id] ??= { level: 1 };
  }
  const owned: Record<string, OwnedPokemon> = {};
  for (const [id, value] of Object.entries(ownedRaw)) {
    if (!known(id)) continue;
    const level = isRecord(value) ? int(value.level, 1, MAX_PERMANENT_LEVEL, 1) : 1;
    owned[id] = { level };
  }
  const candies: Record<string, number> = {};
  if (isRecord(raw.candies)) {
    for (const [id, value] of Object.entries(raw.candies)) {
      if (!known(id)) continue;
      const n = int(value, 0, 1_000_000, 0);
      if (n > 0) candies[id] = n;
    }
  }
  const seen = Array.isArray(raw.seen)
    ? [
        ...new Set(raw.seen.filter((id): id is string => typeof id === 'string' && known(id))),
      ].sort()
    : [];
  const gachaRaw = isRecord(raw.gacha) ? raw.gacha : {};
  const statsRaw = isRecord(raw.stats) ? raw.stats : {};
  return {
    version: PROFILE_VERSION,
    coins: int(raw.coins, 0, 1_000_000_000, 0),
    candies,
    owned,
    // Owned Pokémon are seen too.
    seen: [...new Set([...seen, ...Object.keys(owned)])].sort(),
    // Someone who has a collection has chosen a first starter, whatever the flag says.
    firstStarterChosen: raw.firstStarterChosen === true || Object.keys(owned).length > 0,
    gacha: {
      seed: int(gachaRaw.seed, 1, 0xffffffff, base.gacha.seed),
      draws: int(gachaRaw.draws, 0, Number.MAX_SAFE_INTEGER, 0),
      sinceNew: int(gachaRaw.sinceNew, 0, 1_000_000, 0),
    },
    stats: {
      runs: int(statsRaw.runs, 0, Number.MAX_SAFE_INTEGER, 0),
      wins: int(statsRaw.wins, 0, Number.MAX_SAFE_INTEGER, 0),
      bossesDefeated: int(statsRaw.bossesDefeated, 0, Number.MAX_SAFE_INTEGER, 0),
    },
  };
}

/** The mark an exported save carries, to recognise it (the name of the game lives in one place only). */
export const SAVE_MARK = 'ricochet-save';

/** The profile as the JSON of an export (it carries `SAVE_MARK`, to recognise it). */
export function exportProfile(profile: Profile): string {
  return JSON.stringify({ game: SAVE_MARK, ...profile }, null, 1);
}

/** Reads an exported file: the profile, or why it cannot be read (in Spanish, for the screen). */
export function importProfile(
  text: string,
  known: (species: string) => boolean,
  gachaSeed: number,
): { readonly profile: Profile } | { readonly error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'El archivo no es un guardado válido (no es JSON).' };
  }
  if (!isRecord(raw) || raw.game !== SAVE_MARK) {
    return { error: 'El archivo no es un guardado de este juego.' };
  }
  const profile = migrateProfile(raw, known, gachaSeed);
  if (profile === null) {
    return { error: 'El guardado es de una versión más nueva del juego.' };
  }
  return { profile };
}

/** Level the starter begins a run at, from its permanent level: 1, 2 at 4, 3 at 7, 4 at 10. */
export function startLevelFor(permanentLevel: number): number {
  const level = Math.max(1, Math.min(MAX_PERMANENT_LEVEL, Math.floor(permanentLevel)));
  return 1 + Math.floor((level - 1) / 3);
}

/**
 * "aplicarMejoras" (ADR-025): the config a run with this starter begins with. Today it only sets the
 * level the starter starts at, from its permanent level in the collection. The shipped config is
 * not changed (a new object is returned); without the starter in the collection, it is the same.
 * The legendaries, shinies, the Laboratory's upgrades and the type synergies of the next phase come
 * in here as more fields of the profile and more lines of this function.
 */
export function applyUpgrades(config: GameConfig, profile: Profile, starter: string): GameConfig {
  const owned = profile.owned[starter];
  if (owned === undefined) return config;
  return {
    ...config,
    team: { ...config.team, starterLevel: startLevelFor(owned.level) },
  };
}

/** Adds the species met in a run to the Pokédex. */
export function addSeen(profile: Profile, species: readonly string[]): Profile {
  const seen = [...new Set([...profile.seen, ...species])].sort();
  return seen.length === profile.seen.length ? profile : { ...profile, seen };
}
