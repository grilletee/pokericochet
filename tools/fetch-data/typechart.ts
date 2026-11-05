// The 18x18 type chart as data (4H-B1, ADR-047). Pure: no network, no files; unit-tested.
// The values are the RAW ones of PokéAPI (0, 0.5, 1, 2). The game softens the immunity when it
// reads the chart (x0 -> x0.25, a deliberate departure from the games: a ball that does no damage
// is frustrating); the generated file keeps what the games say.

/** The 18 types of the games, in the order PokéAPI lists them. `stellar`, `unknown` and `shadow` are not here. */
export const ALL_TYPES = [
  'normal',
  'fighting',
  'flying',
  'poison',
  'ground',
  'rock',
  'bug',
  'ghost',
  'steel',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ice',
  'dragon',
  'dark',
  'fairy',
] as const;
export type TypeId = (typeof ALL_TYPES)[number];

/** `chart[attacker][defender]`: 0, 0.5, 1 or 2. */
export type RawTypeChart = Readonly<Record<TypeId, Readonly<Record<TypeId, number>>>>;

export interface GeneratedTypeChart {
  readonly source: string;
  readonly types: readonly TypeId[];
  readonly chart: RawTypeChart;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function names(raw: unknown, key: string, type: string): string[] {
  if (!isRecord(raw) || !isRecord(raw.damage_relations)) {
    throw new Error(`PokéAPI response for type "${type}": no damage_relations`);
  }
  const list = raw.damage_relations[key];
  if (!Array.isArray(list)) throw new Error(`PokéAPI response for type "${type}": no ${key}`);
  return list.filter(isRecord).map((entry) => String(entry.name));
}

/**
 * The row of one attacking type: what it does to each defending type. A type that appears in no
 * list is neutral (1). A type in two lists, or one the game does not have, is an error.
 */
export function parseTypeRow(type: TypeId, raw: unknown): Record<TypeId, number> {
  const row = Object.fromEntries(ALL_TYPES.map((t) => [t, 1])) as Record<TypeId, number>;
  const seen = new Set<string>();
  for (const [key, value] of [
    ['double_damage_to', 2],
    ['half_damage_to', 0.5],
    ['no_damage_to', 0],
  ] as const) {
    for (const defender of names(raw, key, type)) {
      if (!ALL_TYPES.includes(defender as TypeId)) {
        throw new Error(`type "${type}": ${key} lists "${defender}", which is not one of the 18`);
      }
      if (seen.has(defender)) throw new Error(`type "${type}": "${defender}" is in two lists`);
      seen.add(defender);
      row[defender as TypeId] = value;
    }
  }
  return row;
}

/** Builds the whole chart from one `/type/{name}` response per type, and checks it. */
export function buildTypeChart(responses: Readonly<Record<string, unknown>>): GeneratedTypeChart {
  const chart = {} as Record<TypeId, Record<TypeId, number>>;
  for (const type of ALL_TYPES) {
    if (!(type in responses)) throw new Error(`no data for type "${type}"`);
    chart[type] = parseTypeRow(type, responses[type]);
  }
  return { source: 'https://pokeapi.co', types: ALL_TYPES, chart };
}
