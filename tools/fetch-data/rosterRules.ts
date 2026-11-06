// The rule that builds the roster (4H-B1, ADR-048). Pure: no network, no files; unit-tested.
// Every evolution line of the chosen generations becomes one LINEAR line (ADR-027, ADR-037: a base
// form and up to two more), without legendaries or babies, and with ONE branch kept where the
// evolution splits. The branches that are dropped are listed, not lost: the collection of the
// Phase 5 can bring them back (Eevee's other evolutions, for one).

export interface RosterRules {
  /** Highest national Pokédex number of the roster (493 = generations 1 to 4). */
  readonly maxPokedexId: number;
  readonly excludeLegendary: boolean;
  readonly excludeMythical: boolean;
  /** A baby form is not a base: the line starts at the first form that is not a baby. */
  readonly excludeBabies: boolean;
  /** Curated, not derived (4H-B2): the starters of the title screen, in key order. */
  readonly starters?: readonly string[];
  /** Curated: the legendaries that may be final bosses; they are never in a line. */
  readonly legendaries?: readonly string[];
  /** Curated: the fallback boss species (a legendary of its own, not one of `legendaries`). */
  readonly boss?: string;
}

/** What one `/pokemon-species/{id}` response says that the rule needs. */
export interface SpeciesInfo {
  readonly id: number;
  /** The species name, as the evolution chains call it. */
  readonly name: string;
  /** The name of the default form (`/pokemon/{name}`): the id the game uses. */
  readonly pokemon: string;
  readonly legendary: boolean;
  readonly mythical: boolean;
  readonly baby: boolean;
  readonly chainId: number;
}

/** An evolution chain as a tree of species names. */
export interface ChainNode {
  readonly name: string;
  readonly children: readonly ChainNode[];
}

export interface BuiltRoster {
  /** Line of each base: the forms after the base, in order (as `roster.json` writes them). */
  readonly lines: Readonly<Record<string, readonly string[]>>;
  /** Branches that were not taken: where the evolution split, what was kept and what was left. */
  readonly discardedBranches: readonly {
    readonly from: string;
    readonly kept: string;
    readonly dropped: readonly string[];
  }[];
  readonly counts: {
    readonly lines: number;
    readonly forms: number;
    readonly legendary: number;
    readonly babies: number;
    readonly outOfRange: number;
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function fail(what: string, why: string): never {
  throw new Error(`PokéAPI response for ${what}: ${why}`);
}

/** The sum of the six base stats in a `/pokemon/{name}` response (any type: this rule ignores types). */
export function baseStatTotal(name: string, raw: unknown): number {
  if (!isRecord(raw) || !Array.isArray(raw.stats)) return fail(`"${name}"`, 'no stats');
  let total = 0;
  for (const entry of raw.stats.filter(isRecord)) {
    if (typeof entry.base_stat !== 'number') return fail(`"${name}"`, 'a stat without a value');
    total += entry.base_stat;
  }
  if (total <= 0) return fail(`"${name}"`, 'stats add up to nothing');
  return total;
}

/** The id at the end of a PokéAPI resource URL (".../evolution-chain/10/" gives 10). */
function idFromUrl(url: unknown, what: string): number {
  const match = typeof url === 'string' ? /\/(\d+)\/?$/.exec(url) : null;
  if (match?.[1] === undefined) return fail(what, 'no id in the url');
  return Number(match[1]);
}

export function parseSpeciesInfo(raw: unknown): SpeciesInfo {
  if (!isRecord(raw)) return fail('a species', 'not an object');
  const { id, name } = raw;
  if (typeof id !== 'number' || typeof name !== 'string') return fail('a species', 'no id or name');
  const varieties = Array.isArray(raw.varieties) ? raw.varieties.filter(isRecord) : [];
  const standard = varieties.find((v) => v.is_default === true);
  const pokemon = isRecord(standard?.pokemon) ? standard.pokemon.name : undefined;
  const chain = isRecord(raw.evolution_chain) ? raw.evolution_chain.url : undefined;
  return {
    id,
    name,
    pokemon: typeof pokemon === 'string' ? pokemon : name,
    legendary: raw.is_legendary === true,
    mythical: raw.is_mythical === true,
    baby: raw.is_baby === true,
    chainId: idFromUrl(chain, `species ${name}`),
  };
}

function readNode(raw: unknown): ChainNode {
  if (!isRecord(raw) || !isRecord(raw.species) || typeof raw.species.name !== 'string') {
    return fail('an evolution chain', 'a link without a species');
  }
  const next = Array.isArray(raw.evolves_to) ? raw.evolves_to : [];
  return { name: raw.species.name, children: next.map(readNode) };
}

export function parseChain(raw: unknown): { readonly id: number; readonly root: ChainNode } {
  if (!isRecord(raw) || typeof raw.id !== 'number') return fail('an evolution chain', 'no id');
  return { id: raw.id, root: readNode(raw.chain) };
}

/** Names that need a base-stat total to choose between branches (the children of every split). */
export function namesNeedingStats(root: ChainNode): string[] {
  const out: string[] = [];
  const walk = (node: ChainNode): void => {
    if (node.children.length > 1) for (const child of node.children) out.push(child.name);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return out;
}

/**
 * Builds the lines of a set of chains. `species` is every species of the range by name;
 * `statTotal` is the sum of the six base stats of a form (only asked for at a split).
 */
export function buildRoster(
  rules: RosterRules,
  chains: readonly ChainNode[],
  species: ReadonlyMap<string, SpeciesInfo>,
  statTotal: (name: string) => number,
): BuiltRoster {
  const lines: Record<string, readonly string[]> = {};
  const discarded: { from: string; kept: string; dropped: string[] }[] = [];
  let legendary = 0;
  let babies = 0;
  let outOfRange = 0;

  const inRange = (name: string): boolean => {
    const info = species.get(name);
    return info !== undefined && info.id <= rules.maxPokedexId;
  };
  const isBaby = (name: string): boolean => rules.excludeBabies && species.get(name)?.baby === true;
  const isLegend = (name: string): boolean => {
    const info = species.get(name);
    return (
      info !== undefined &&
      ((rules.excludeLegendary && info.legendary) || (rules.excludeMythical && info.mythical))
    );
  };
  const idOf = (name: string): string => species.get(name)?.pokemon ?? name;
  const dexOf = (name: string): number => species.get(name)?.id ?? Number.POSITIVE_INFINITY;

  /** The linear path from a node: at a split the child with the higher total (then the lower number). */
  const pathFrom = (start: ChainNode): string[] => {
    const path = [start.name];
    let node = start;
    while (path.length < 3 && node.children.length > 0) {
      const options = node.children.filter((c) => inRange(c.name));
      outOfRange += node.children.length - options.length;
      if (options.length === 0) break;
      const best = options.reduce((a, b) => {
        const ta = statTotal(a.name);
        const tb = statTotal(b.name);
        return tb > ta || (tb === ta && dexOf(b.name) < dexOf(a.name)) ? b : a;
      });
      if (options.length > 1) {
        discarded.push({
          from: idOf(node.name),
          kept: idOf(best.name),
          dropped: options.filter((c) => c !== best).map((c) => idOf(c.name)),
        });
      }
      path.push(best.name);
      node = best;
    }
    return path;
  };

  /** Starts a line at `node`, or at its children when it is a baby form (each becomes a line). */
  const start = (node: ChainNode): void => {
    if (!inRange(node.name)) return;
    if (isLegend(node.name)) {
      legendary += 1;
      return;
    }
    if (isBaby(node.name)) {
      babies += 1;
      for (const child of node.children) start(child);
      return;
    }
    const path = pathFrom(node);
    const [base, ...rest] = path.map(idOf);
    if (base !== undefined) lines[base] = rest;
  };
  for (const root of chains) start(root);

  const dexByPokemon = new Map([...species.values()].map((info) => [info.pokemon, info.id]));
  const dexOfId = (id: string): number => dexByPokemon.get(id) ?? Number.POSITIVE_INFINITY;
  const names = Object.keys(lines).sort((a, b) => dexOfId(a) - dexOfId(b));
  const sorted: Record<string, readonly string[]> = {};
  for (const name of names) sorted[name] = lines[name] ?? [];
  return {
    lines: sorted,
    discardedBranches: discarded.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)),
    counts: {
      lines: names.length,
      forms: names.reduce((sum, name) => sum + 1 + (lines[name]?.length ?? 0), 0),
      legendary,
      babies,
      outOfRange,
    },
  };
}
