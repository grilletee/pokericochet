// Pure parts of fetch-data: no network, no files. Everything here is unit-tested.

export const GAME_TYPES = ['fire', 'water', 'grass', 'electric'] as const;
export type GameType = (typeof GAME_TYPES)[number];

/** Which species the slice uses, and in which role. Game design, not PokéAPI data. */
export interface Roster {
  readonly balls: readonly string[];
  readonly enemies: readonly string[];
  readonly boss: string;
  readonly starters: readonly string[];
}

export interface GeneratedSpecies {
  readonly id: string;
  readonly pokedexId: number;
  readonly type: GameType;
  readonly baseStats: { readonly hp: number; readonly attack: number; readonly speed: number };
}

/** What the game loads: `src/data/generated/species.json`. Deterministic: no dates. */
export interface GeneratedFile {
  readonly source: string;
  readonly roster: Roster;
  readonly species: readonly GeneratedSpecies[];
}

export interface ParsedPokemon {
  readonly species: GeneratedSpecies;
  /** Where PokéAPI says the front sprite is (a PokeAPI/sprites URL). */
  readonly spriteUrl: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function fail(name: string, what: string): never {
  throw new Error(`PokéAPI response for "${name}": ${what}`);
}

/**
 * Reads what the game needs out of a PokéAPI `/pokemon/{name}` response: the first listed type
 * (it must be one of the four the game has) and the base stats hp, attack and speed.
 */
export function parsePokemon(name: string, raw: unknown): ParsedPokemon {
  if (!isRecord(raw)) return fail(name, 'not an object');
  const { id, types, stats, sprites } = raw;
  if (typeof id !== 'number') return fail(name, 'missing id');
  if (!Array.isArray(types)) return fail(name, 'missing types');
  const first = types
    .filter(isRecord)
    .sort((a, b) => Number(a.slot) - Number(b.slot))
    .map((t) => (isRecord(t.type) ? t.type.name : undefined))[0];
  if (!GAME_TYPES.includes(first as GameType)) {
    return fail(name, `first type "${String(first)}" is not one of ${GAME_TYPES.join(', ')}`);
  }
  if (!Array.isArray(stats)) return fail(name, 'missing stats');
  const stat = (key: string): number => {
    const entry = stats.filter(isRecord).find((s) => isRecord(s.stat) && s.stat.name === key);
    if (entry === undefined || typeof entry.base_stat !== 'number') {
      return fail(name, `missing stat "${key}"`);
    }
    return entry.base_stat;
  };
  const spriteUrl = isRecord(sprites) ? sprites.front_default : undefined;
  if (typeof spriteUrl !== 'string') return fail(name, 'no front_default sprite');
  return {
    species: {
      id: name,
      pokedexId: id,
      type: first as GameType,
      baseStats: { hp: stat('hp'), attack: stat('attack'), speed: stat('speed') },
    },
    spriteUrl,
  };
}

/** Every species id the roster mentions, once, in a stable order. */
export function rosterIds(roster: Roster): string[] {
  return [...new Set([...roster.balls, ...roster.enemies, roster.boss, ...roster.starters])];
}

/** Checks that the starters are balls and nothing is listed twice within a role. */
export function validateRoster(roster: Roster): void {
  for (const [role, ids] of [
    ['balls', roster.balls],
    ['enemies', roster.enemies],
  ] as const) {
    if (new Set(ids).size !== ids.length) throw new Error(`roster.${role} has duplicates`);
  }
  for (const id of roster.starters) {
    if (!roster.balls.includes(id)) throw new Error(`starter "${id}" is not in roster.balls`);
  }
}

export function buildFile(roster: Roster, species: readonly GeneratedSpecies[]): GeneratedFile {
  const byId = new Map(species.map((s) => [s.id, s]));
  return {
    source: 'https://pokeapi.co',
    roster,
    species: rosterIds(roster).map((id) => {
      const found = byId.get(id);
      if (found === undefined) throw new Error(`no data for "${id}"`);
      return found;
    }),
  };
}

/** Stable text of the generated file: same data, same bytes (so CI can diff it). */
export function serialize(file: GeneratedFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
