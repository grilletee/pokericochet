import { type GameConfig, stageLevelsOf } from '../domain';

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

export const PROFILE_VERSION = 2;

/** The most a Pokémon of the collection can be raised with candies (its level as a starter). */
export const MAX_PERMANENT_LEVEL = 10;

export interface OwnedPokemon {
  /** Its permanent level as a starter, 1..MAX_PERMANENT_LEVEL (candies raise it). */
  readonly level: number;
}

/** One draw of the history (4G-J), newest first in `GachaState.history`. */
export interface PullRecord {
  readonly species: string;
  readonly stars: 3 | 4 | 5;
  /** The name of the banner it came from. */
  readonly banner: string;
  /** A featured Pokémon of a limited banner. */
  readonly featured: boolean;
  /** Its number among all the draws of the profile (1 = the first one ever). */
  readonly n: number;
}

/** What a limited banner remembers (4G-J): its draws, for the guaranteed featured ★5. */
export interface BannerProgress {
  readonly draws: number;
  /** Its featured ★5 has come (the guarantee is spent). */
  readonly won: boolean;
  /**
   * The last ★5 on this banner was not the featured one (the 50/50 was lost), so the next ★5 on it
   * is the featured one for sure (4V). Absent in older saves: nothing owed.
   */
  readonly owed?: boolean;
}

export interface GachaState {
  /** The seed of the gacha's own stream and how many draws it has made (its position). */
  readonly seed: number;
  readonly draws: number;
  /** Draws since the last ★5 and since the last ★4 or better: the pity, shared by every banner. */
  readonly pity5: number;
  readonly pity4: number;
  /** Progress of each limited banner, by its key (banner and period). */
  readonly banners: Readonly<Record<string, BannerProgress>>;
  readonly history: readonly PullRecord[];
}

/** The most banners and history entries a profile keeps (the oldest go first). */
export const MAX_BANNER_KEYS = 24;
export const MAX_HISTORY = 200;

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
    gacha: { seed: gachaSeed >>> 0 || 1, draws: 0, pity5: 0, pity4: 0, banners: {}, history: [] },
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
 * `collection` list of species) is read into version 1; version 1 into version 2 (4G-J: the gacha's
 * pity, banners and history start empty); version 2 is validated field by field.
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
    // v1 -> v2 (4G-J): the old "novelty" counter (`sinceNew`) has no meaning in the new rules, so
    // the pity starts at 0; the seed and the position of the stream are kept.
    gacha: {
      seed: int(gachaRaw.seed, 1, 0xffffffff, base.gacha.seed),
      draws: int(gachaRaw.draws, 0, Number.MAX_SAFE_INTEGER, 0),
      pity5: version < 2 ? 0 : int(gachaRaw.pity5, 0, 1_000_000, 0),
      pity4: version < 2 ? 0 : int(gachaRaw.pity4, 0, 1_000_000, 0),
      banners: version < 2 ? {} : readBanners(gachaRaw.banners),
      history: version < 2 ? [] : readHistory(gachaRaw.history, known),
    },
    stats: {
      runs: int(statsRaw.runs, 0, Number.MAX_SAFE_INTEGER, 0),
      wins: int(statsRaw.wins, 0, Number.MAX_SAFE_INTEGER, 0),
      bossesDefeated: int(statsRaw.bossesDefeated, 0, Number.MAX_SAFE_INTEGER, 0),
    },
  };
}

function readBanners(raw: unknown): Record<string, BannerProgress> {
  const out: Record<string, BannerProgress> = {};
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw).slice(-MAX_BANNER_KEYS)) {
    if (!isRecord(value)) continue;
    out[key] = {
      draws: int(value.draws, 0, 1_000_000, 0),
      won: value.won === true,
      ...(value.owed === true ? { owed: true } : {}),
    };
  }
  return out;
}

function readHistory(raw: unknown, known: (species: string) => boolean): PullRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: PullRecord[] = [];
  for (const entry of raw.slice(0, MAX_HISTORY)) {
    if (!isRecord(entry) || typeof entry.species !== 'string' || !known(entry.species)) continue;
    const stars = int(entry.stars, 3, 5, 3) as 3 | 4 | 5;
    out.push({
      species: entry.species,
      stars,
      banner: typeof entry.banner === 'string' ? entry.banner.slice(0, 60) : '',
      featured: entry.featured === true,
      n: int(entry.n, 1, Number.MAX_SAFE_INTEGER, 1),
    });
  }
  return out;
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
    team: { ...config.team, starterLevel: startLevelOf(config, starter, owned.level) },
  };
}

/**
 * Level a starter of the line of `species` begins a run at (4W, block 1): `startLevelFor`, but never
 * in its final form. Candies may let it start evolved once (a Charmeleon), never as a Charizard, and
 * a pseudo-legendary, whose pace is slow, keeps its wait (a Bagon starts as a Bagon or a Shelgon).
 */
export function startLevelOf(config: GameConfig, species: string, permanentLevel: number): number {
  const levels = stageLevelsOf(config, species);
  const last = levels[levels.length - 1];
  const cap = last === undefined ? Number.POSITIVE_INFINITY : Math.max(1, last - 1);
  return Math.min(startLevelFor(permanentLevel), cap);
}

/** Adds the species met in a run to the Pokédex. */
export function addSeen(profile: Profile, species: readonly string[]): Profile {
  const seen = [...new Set([...profile.seen, ...species])].sort();
  return seen.length === profile.seen.length ? profile : { ...profile, seen };
}
