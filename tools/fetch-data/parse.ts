// Pure parts of fetch-data: no network, no files. Everything here is unit-tested.

import { ALL_TYPES } from './typechart';

/** The 18 types of the games (4H-B2, ADR-047). */
export const GAME_TYPES = ALL_TYPES;
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
  /**
   * 4W: how each form of `lines` is reached in the games (minimum level and trigger), in the same
   * order; the game derives the pace of each line from it.
   */
  readonly evolution?: Readonly<
    Record<string, readonly { readonly level: number | null; readonly trigger: string }[]>
  >;
  /**
   * 4W, block 7: the other ways a split line can go (Eevee, Ralts...): the stage of the split and
   * the forms of each branch from there. The game picks one by place.
   */
  readonly branches?: Readonly<
    Record<string, { readonly at: number; readonly options: readonly (readonly string[])[] }>
  >;
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
  /** The first of `types`, kept as a shortcut (ADR-047). */
  readonly type: GameType;
  /** One or two types, in the order of PokéAPI. */
  readonly types: readonly GameType[];
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

/**
 * Which games' level-up moves count (4W-fix, ADR-059). PokéAPI grows: when a new game appears, the
 * responses gain a version group, and a response cached before that day and one downloaded after it
 * would give different learnsets. Counting only the groups listed in `use` makes the learnset the
 * same whatever the day of the download; a group in neither list stops the tool, so a new game is
 * always a decision and never a silent change.
 */
export interface VersionGroups {
  readonly use: readonly string[];
  readonly ignore: readonly string[];
}

/** Checks that the two lists are not empty where it matters, hold no repeats and do not overlap. */
export function validateVersionGroups(groups: VersionGroups): void {
  if (groups.use.length === 0) throw new Error('versionGroups.use is empty');
  const seen = new Set<string>();
  for (const group of [...groups.use, ...groups.ignore]) {
    if (seen.has(group)) throw new Error(`version group "${group}" is listed twice`);
    seen.add(group);
  }
}

function readLearnset(name: string, raw: unknown, groups: VersionGroups): Learn[] {
  if (!Array.isArray(raw)) return fail(name, 'missing moves');
  const lowest = new Map<string, number>();
  for (const entry of raw) {
    const move = isRecord(entry) && isRecord(entry.move) ? entry.move.name : undefined;
    if (typeof move !== 'string') return fail(name, 'a move without a name');
    const details = isRecord(entry) ? entry.version_group_details : undefined;
    if (!Array.isArray(details)) return fail(name, `move "${move}" has no version_group_details`);
    for (const detail of details) {
      const group =
        isRecord(detail) && isRecord(detail.version_group) ? detail.version_group.name : undefined;
      const method =
        isRecord(detail) && isRecord(detail.move_learn_method)
          ? detail.move_learn_method.name
          : undefined;
      const level = isRecord(detail) ? detail.level_learned_at : undefined;
      if (typeof group !== 'string' || typeof method !== 'string' || typeof level !== 'number') {
        return fail(name, `move "${move}" has a detail without version group, method or level`);
      }
      if (groups.ignore.includes(group)) continue;
      if (!groups.use.includes(group)) {
        return fail(
          name,
          `version group "${group}" (move "${move}") is neither used nor ignored: PokéAPI has a ` +
            'new game. Add it to versionGroups.use or versionGroups.ignore in ' +
            'tools/fetch-data/moves-overrides.json (see the README before choosing "use")',
        );
      }
      if (method !== 'level-up') continue;
      const known = lowest.get(move);
      if (known === undefined || level < known) lowest.set(move, level);
    }
  }
  return [...lowest.entries()]
    .map(([move, level]) => ({ move, level }))
    .sort((a, b) => (a.move < b.move ? -1 : a.move > b.move ? 1 : 0));
}

/**
 * Reads what the game needs out of a PokéAPI `/pokemon/{name}` response: its one or two types in
 * slot order (each must be one of the 18 the game has), the six base stats and the level-up moves
 * of the games in `groups.use`.
 */
export function parsePokemon(name: string, raw: unknown, groups: VersionGroups): ParsedPokemon {
  if (!isRecord(raw)) return fail(name, 'not an object');
  const { id, types, stats, sprites } = raw;
  if (typeof id !== 'number') return fail(name, 'missing id');
  if (!Array.isArray(types)) return fail(name, 'missing types');
  const listed = types
    .filter(isRecord)
    .sort((a, b) => Number(a.slot) - Number(b.slot))
    .map((t) => (isRecord(t.type) ? t.type.name : undefined));
  for (const type of listed) {
    if (!GAME_TYPES.includes(type as GameType)) {
      return fail(name, `type "${String(type)}" is not one of ${GAME_TYPES.join(', ')}`);
    }
  }
  const gameTypes = listed.slice(0, 2) as GameType[];
  const first = gameTypes[0];
  if (first === undefined) return fail(name, 'has no type');
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
  // 4W: a regional form has an id of its own (10103 for vulpix-alola); its number in the national
  // Pokédex is the one of its species, at the end of `species.url`.
  const speciesUrl = isRecord(raw.species) ? raw.species.url : undefined;
  const fromUrl =
    typeof speciesUrl === 'string' ? Number(/\/(\d+)\/?$/.exec(speciesUrl)?.[1]) : Number.NaN;
  return {
    species: {
      id: name,
      pokedexId: Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : id,
      type: first,
      types: gameTypes,
      baseStats: {
        hp: stat('hp'),
        attack: stat('attack'),
        defense: stat('defense'),
        specialAttack: stat('special-attack'),
        specialDefense: stat('special-defense'),
        speed: stat('speed'),
      },
    },
    learnset: readLearnset(name, raw.moves, groups),
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
/**
 * The name of a regional form (4W, block 7): the name of its species plus its region, as the
 * Spanish games say it ("Vulpix de Alola"). Any other id keeps its name.
 */
export function regionalName(id: string, name: string): string {
  const region = /-(alola|galar|hisui|paldea)(-|$)/.exec(id)?.[1];
  return region === undefined
    ? name
    : `${name} de ${region.charAt(0).toUpperCase()}${region.slice(1)}`;
}

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
  const name = parseName(id, raw);
  // 4W-fix: the game shows the Spanish name (ADR-036); an English stand-in would be a silent hole.
  if (name.fallback) throw new Error(`PokéAPI response for move "${id}": no Spanish name`);
  return { id, name: name.name, type, power, damageClass };
}

/** Every species id the roster mentions, once, in a stable order. */
export function rosterIds(roster: Roster): string[] {
  const forms = [
    ...Object.values(roster.lines).flat(),
    ...Object.values(roster.branches ?? {}).flatMap((b) => b.options.flat()),
  ];
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
    // The fallback boss may itself be one of the legendaries (4G-D: Lugia is both).
    if (roster.balls.includes(id) || roster.enemies.includes(id)) {
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
  // 4W: a branch belongs to a line, splits at stage 2 or 3, fits in three stages and its forms are
  // not bases nor forms of any line.
  const lineForms = new Set(Object.values(roster.lines).flat());
  for (const [id, set] of Object.entries(roster.branches ?? {})) {
    if (roster.lines[id] === undefined) throw new Error(`roster.branches has "${id}", not a line`);
    if (set.at !== 2 && set.at !== 3) throw new Error(`roster.branches["${id}"].at must be 2 or 3`);
    for (const forms of set.options) {
      if (forms.length === 0 || set.at + forms.length - 1 > 3) {
        throw new Error(`a branch of "${id}" has ${forms.length} forms from stage ${set.at}`);
      }
      for (const form of forms) {
        if (base.has(form) || lineForms.has(form)) {
          throw new Error(`branch form "${form}" of "${id}" is also a base or a line form`);
        }
      }
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
  readonly defaults: Readonly<Record<string, readonly [string, string, string]>>;
  /** Signature moves per base species; null keeps the automatic choice for that tier. */
  readonly signatures: Readonly<Record<string, readonly (string | null)[]>>;
  /** The games whose level-up moves count, and the ones left out on purpose (ADR-059). */
  readonly versionGroups: VersionGroups;
}

export interface ChosenMoves {
  readonly moves: readonly [string, string, string];
  readonly sources: readonly [MoveSource, MoveSource, MoveSource];
}

/**
 * One move per stage for a species line (ADR-039): the signature if there is one; else the
 * strongest damaging move of ANY of the species' types that the form of that stage learns by
 * level-up (ADR-047: a dual type brings coverage), inside the power band of the tier (ties: lower
 * id), and stronger than the move of the tier before; else the default move of its first type.
 * The default is a rule, not a stand-in for missing data: a form without a learnset, or a move
 * without its data, stops the tool (4W-fix).
 */
export function chooseMoves(
  base: string,
  speciesTypes: GameType | readonly GameType[],
  forms: readonly [string, string, string],
  learnsets: Readonly<Record<string, readonly Learn[]>>,
  infos: Readonly<Record<string, MoveInfo>>,
  overrides: MoveOverrides,
): ChosenMoves {
  const types: readonly GameType[] =
    typeof speciesTypes === 'string' ? [speciesTypes] : speciesTypes;
  const moves: string[] = [];
  const sources: MoveSource[] = [];
  let previousPower = 0;
  for (let tier = 0; tier < 3; tier++) {
    const ladder = overrides.defaults[types[0] as GameType];
    if (ladder === undefined) throw new Error(`no default moves for the type of "${base}"`);
    const fallback = ladder[tier] as string;
    const signature = overrides.signatures[base]?.[tier];
    let pick: string | undefined;
    let source: MoveSource = 'auto';
    if (signature !== undefined && signature !== null) {
      pick = signature;
      source = 'signature';
    } else {
      const [low, high] = TIER_BANDS[tier] as readonly [number, number];
      let best: MoveInfo | undefined;
      const form = forms[tier] as string;
      const learnset = learnsets[form];
      if (learnset === undefined) throw new Error(`no learnset for "${form}" (line of "${base}")`);
      for (const { move } of learnset) {
        const info = infos[move];
        if (info === undefined) throw new Error(`no data for move "${move}" (learnt by "${form}")`);
        if (!types.includes(info.type as GameType) || info.power === null) continue;
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
    const picked = infos[pick];
    if (picked === undefined) throw new Error(`no data for move "${pick}" (chosen for "${base}")`);
    moves.push(pick);
    sources.push(source);
    previousPower = picked.power ?? previousPower;
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
      if (info === undefined)
        throw new Error(`no data for move "${move}" (report of "${row.base}")`);
      lines.push(
        `| ${row.base} | ${index + 1} | ${row.forms[index]} | ${move} | ${info.name} | ${info.power ?? '-'} | ${row.chosen.sources[index]} |`,
      );
    });
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The URL of the cry of a Pokémon in a PokéAPI `/pokemon/{name}` response (`cries.latest`, from the
 * PokeAPI/cries repository), or undefined when it has none. Cries are optional: the game is silent
 * without them (4G-E).
 */
export function parseCryUrl(raw: unknown): string | undefined {
  if (!isRecord(raw) || !isRecord(raw.cries)) return undefined;
  const latest = raw.cries.latest;
  return typeof latest === 'string' && latest.startsWith('https://') ? latest : undefined;
}
