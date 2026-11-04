// Pure parts of fetch-data: no network, no files. Everything here is unit-tested.

export const GAME_TYPES = ['fire', 'water', 'grass', 'electric'] as const;
export type GameType = (typeof GAME_TYPES)[number];

/** Which species the slice uses, and in which role. Game design, not PokéAPI data. */
export interface Roster {
  readonly balls: readonly string[];
  readonly enemies: readonly string[];
  readonly boss: string;
  /** Final bosses, one per game type (ADR-028). They only ever come from bosses, never from captures. */
  readonly legendaries: readonly string[];
  readonly starters: readonly string[];
  /**
   * Evolution line of every ball and enemy species: the forms after the base one, in order
   * (ADR-024, ADR-037). A species may have none, one or two forms; see `stageForms`.
   */
  readonly lines: Readonly<Record<string, readonly string[]>>;
}

export interface BaseStats {
  readonly hp: number;
  readonly attack: number;
  readonly defense: number;
  readonly specialAttack: number;
  readonly specialDefense: number;
  readonly speed: number;
}

export interface GeneratedSpecies {
  readonly id: string;
  readonly pokedexId: number;
  /** Name in Spanish (ADR-036), straight from PokéAPI. */
  readonly name: string;
  readonly type: GameType;
  readonly baseStats: BaseStats;
}

/** What the game loads: `src/data/generated/species.json`. Deterministic: no dates. */
export interface GeneratedFile {
  readonly source: string;
  readonly roster: Roster;
  readonly species: readonly GeneratedSpecies[];
}

/** A move a species learns by level-up, with the lowest level any game teaches it at. */
export interface Learn {
  readonly move: string;
  readonly level: number;
}

export interface ParsedPokemon {
  readonly species: Omit<GeneratedSpecies, 'name'>;
  /** Level-up moves, sorted by move id (so the output never depends on the response order). */
  readonly learnset: readonly Learn[];
  /** Where PokéAPI says the front sprite is (a PokeAPI/sprites URL). */
  readonly spriteUrl: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function fail(name: string, what: string): never {
  throw new Error(`PokéAPI response for "${name}": ${what}`);
}

function readLearnset(raw: unknown): Learn[] {
  if (!Array.isArray(raw)) return [];
  const lowest = new Map<string, number>();
  for (const entry of raw.filter(isRecord)) {
    const move = isRecord(entry.move) ? entry.move.name : undefined;
    if (typeof move !== 'string' || !Array.isArray(entry.version_group_details)) continue;
    for (const detail of entry.version_group_details.filter(isRecord)) {
      const method = isRecord(detail.move_learn_method) ? detail.move_learn_method.name : undefined;
      const level = detail.level_learned_at;
      if (method !== 'level-up' || typeof level !== 'number') continue;
      const known = lowest.get(move);
      if (known === undefined || level < known) lowest.set(move, level);
    }
  }
  return [...lowest.entries()]
    .map(([move, level]) => ({ move, level }))
    .sort((a, b) => (a.move < b.move ? -1 : a.move > b.move ? 1 : 0));
}

/**
 * Reads what the game needs out of a PokéAPI `/pokemon/{name}` response: the first listed type
 * (it must be one of the four the game has), the six base stats and the level-up moves.
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
      baseStats: {
        hp: stat('hp'),
        attack: stat('attack'),
        defense: stat('defense'),
        specialAttack: stat('special-attack'),
        specialDefense: stat('special-defense'),
        speed: stat('speed'),
      },
    },
    learnset: readLearnset(raw.moves),
    spriteUrl,
  };
}

/** The name in `language` out of a PokéAPI `names` list, if there is one. */
function localName(names: unknown, language: string): string | undefined {
  if (!Array.isArray(names)) return undefined;
  for (const entry of names.filter(isRecord)) {
    const lang = isRecord(entry.language) ? entry.language.name : undefined;
    if (lang === language && typeof entry.name === 'string' && entry.name !== '') return entry.name;
  }
  return undefined;
}

export interface LocalName {
  readonly name: string;
  /** True when Spanish was missing and the English name (or the id) was used instead. */
  readonly fallback: boolean;
}

/** The Spanish name out of a `/pokemon-species/{id}` or `/move/{id}` response (ADR-036). */
export function parseName(id: string, raw: unknown): LocalName {
  const names = isRecord(raw) ? raw.names : undefined;
  const spanish = localName(names, 'es');
  if (spanish !== undefined) return { name: spanish, fallback: false };
  return { name: localName(names, 'en') ?? id, fallback: true };
}

/** What the game keeps of a move (ADR-039). */
export interface MoveInfo {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  /** Null for moves that do no direct damage. */
  readonly power: number | null;
  readonly damageClass: string;
}

export function parseMove(id: string, raw: unknown): MoveInfo {
  if (!isRecord(raw)) throw new Error(`PokéAPI response for move "${id}": not an object`);
  const type = isRecord(raw.type) ? raw.type.name : undefined;
  const damageClass = isRecord(raw.damage_class) ? raw.damage_class.name : undefined;
  if (typeof type !== 'string') throw new Error(`PokéAPI response for move "${id}": missing type`);
  if (typeof damageClass !== 'string') {
    throw new Error(`PokéAPI response for move "${id}": missing damage_class`);
  }
  const power = typeof raw.power === 'number' ? raw.power : null;
  return { id, name: parseName(id, raw).name, type, power, damageClass };
}

/** Every species id the roster mentions, once, in a stable order. */
export function rosterIds(roster: Roster): string[] {
  const forms = Object.values(roster.lines).flat();
  return [
    ...new Set([
      ...roster.balls,
      ...roster.enemies,
      roster.boss,
      ...roster.legendaries,
      ...roster.starters,
      ...forms,
    ]),
  ];
}

/**
 * Checks that the starters are balls, nothing is listed twice within a role and every line has
 * at most two forms, none of them a roster species itself. A species without a line has no
 * evolution (ADR-037).
 */
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
  if (new Set(roster.legendaries).size !== roster.legendaries.length) {
    throw new Error('roster.legendaries has duplicates');
  }
  for (const id of roster.legendaries) {
    if (roster.balls.includes(id) || roster.enemies.includes(id) || id === roster.boss) {
      throw new Error(`legendary "${id}" is also a ball, an enemy or the boss`);
    }
  }
  const base = new Set([...roster.balls, ...roster.enemies, roster.boss, ...roster.legendaries]);
  for (const id of [...roster.balls, ...roster.enemies]) {
    const line = roster.lines[id];
    if (line === undefined) continue;
    if (line.length > 2) throw new Error(`roster.lines["${id}"] needs at most two forms`);
    for (const form of line) {
      if (base.has(form)) throw new Error(`form "${form}" of "${id}" is also a base species`);
    }
  }
  for (const id of Object.keys(roster.lines)) {
    if (!roster.balls.includes(id) && !roster.enemies.includes(id)) {
      throw new Error(`roster.lines has "${id}", which is not a ball or an enemy`);
    }
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

/** Stable text of a generated file: same data, same bytes (so CI can diff it). */
export function serialize(file: unknown): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

// ---------------------------------------------------------------------------------------------
// Moves (ADR-039)
// ---------------------------------------------------------------------------------------------

/** The species shown at stages 1, 2 and 3 of a line (ADR-037). */
export function stageForms(
  base: string,
  line: readonly string[] | undefined,
): [string, string, string] {
  const forms = line ?? [];
  const second = forms[0] ?? base;
  const third = forms[1] ?? forms[0] ?? base;
  return [base, second, third];
}

/** Power bands of the three tiers: [from, to] inclusive. */
export const TIER_BANDS: readonly (readonly [number, number])[] = [
  [30, 60],
  [61, 95],
  [96, Number.POSITIVE_INFINITY],
];

export type MoveSource = 'auto' | 'default' | 'signature';

/** Hand-written part of the move data (tools/fetch-data/moves-overrides.json). */
export interface MoveOverrides {
  /** Fallback ladder per game type, used when a power band has no candidate. */
  readonly defaults: Readonly<Record<GameType, readonly [string, string, string]>>;
  /** Signature moves per base species; null keeps the automatic choice for that tier. */
  readonly signatures: Readonly<Record<string, readonly (string | null)[]>>;
}

export interface ChosenMoves {
  readonly moves: readonly [string, string, string];
  readonly sources: readonly [MoveSource, MoveSource, MoveSource];
}

/**
 * One move per stage for a species line (ADR-039): the signature if there is one; else the
 * strongest damaging move of the species type that the form of that stage learns by level-up,
 * inside the power band of the tier (ties: lower id), and stronger than the move of the tier
 * before; else the default move of the type.
 */
export function chooseMoves(
  base: string,
  type: GameType,
  forms: readonly [string, string, string],
  learnsets: Readonly<Record<string, readonly Learn[]>>,
  infos: Readonly<Record<string, MoveInfo>>,
  overrides: MoveOverrides,
): ChosenMoves {
  const moves: string[] = [];
  const sources: MoveSource[] = [];
  let previousPower = 0;
  for (let tier = 0; tier < 3; tier++) {
    const fallback = overrides.defaults[type][tier] as string;
    const signature = overrides.signatures[base]?.[tier];
    let pick: string | undefined;
    let source: MoveSource = 'auto';
    if (signature !== undefined && signature !== null) {
      pick = signature;
      source = 'signature';
    } else {
      const [low, high] = TIER_BANDS[tier] as readonly [number, number];
      let best: MoveInfo | undefined;
      for (const { move } of learnsets[forms[tier] as string] ?? []) {
        const info = infos[move];
        if (info === undefined || info.type !== type || info.power === null) continue;
        if (info.power < low || info.power > high || info.power <= previousPower) continue;
        const better =
          best === undefined ||
          info.power > (best.power ?? 0) ||
          (info.power === best.power && info.id < best.id);
        if (better) best = info;
      }
      pick = best?.id;
    }
    if (pick === undefined) {
      pick = fallback;
      source = 'default';
    }
    moves.push(pick);
    sources.push(source);
    previousPower = infos[pick]?.power ?? previousPower;
  }
  return {
    moves: moves as unknown as ChosenMoves['moves'],
    sources: sources as unknown as ChosenMoves['sources'],
  };
}

/** Every move id that has to be fetched: the candidates of every form, the defaults and signatures. */
export function movesToFetch(
  learnsets: Readonly<Record<string, readonly Learn[]>>,
  overrides: MoveOverrides,
): string[] {
  const ids = new Set<string>();
  for (const learn of Object.values(learnsets)) for (const { move } of learn) ids.add(move);
  for (const ladder of Object.values(overrides.defaults)) for (const id of ladder) ids.add(id);
  for (const list of Object.values(overrides.signatures)) {
    for (const id of list) if (id !== null) ids.add(id);
  }
  return [...ids].sort();
}

/** What the game loads for moves: `src/data/generated/moves.json`. */
export interface GeneratedMoves {
  /** Per base species: the move of stage 1, 2 and 3. */
  readonly byBase: Readonly<Record<string, readonly string[]>>;
  /** Per game type: the fallback ladder. */
  readonly defaults: Readonly<Record<string, readonly string[]>>;
  /** Only the moves the table uses. */
  readonly moves: Readonly<Record<string, { name: string; type: string; power: number | null }>>;
}

/** The review table of the automatic choices (markdown), so a person can check them. */
export function movesReport(
  rows: readonly {
    base: string;
    forms: readonly string[];
    chosen: ChosenMoves;
  }[],
  infos: Readonly<Record<string, MoveInfo>>,
): string {
  const lines = [
    '# Move choices (generated by tools/fetch-data, do not edit)',
    '',
    '| species | stage | form | move | name | power | source |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    row.chosen.moves.forEach((move, index) => {
      const info = infos[move];
      lines.push(
        `| ${row.base} | ${index + 1} | ${row.forms[index]} | ${move} | ${info?.name ?? '?'} | ${info?.power ?? '-'} | ${row.chosen.sources[index]} |`,
      );
    });
  }
  return `${lines.join('\n')}\n`;
}
