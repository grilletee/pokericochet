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
  /**
   * Curated (4G-J): species left out with everything after them, by species name. The Ultra Beasts
   * and the Paradox Pokémon (not flagged legendary by PokéAPI, but of that kind) and the forms that
   * only evolve from a regional form (regional forms are out for now).
   */
  readonly exclude?: readonly string[];
  /**
   * Curated (4W, block 7): regional lines, each a line of its own (base pokemon id -> its forms):
   * `vulpix-alola` -> `ninetales-alola`, `zigzagoon-galar` -> `linoone-galar` -> `obstagoon`... Their
   * pace comes from the species they are a form of. The forms that only evolve from a regional form
   * stay in `exclude` for the normal chains and come in here.
   */
  readonly regional?: Readonly<Record<string, readonly string[]>>;
}

/** The species a pokemon id is a form of: `ninetales-alola` -> `ninetales` (4W). */
export function speciesNameOf(pokemon: string): string {
  return pokemon.replace(/-(alola|galar|hisui|paldea)(-.*)?$/, '');
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
  /** How this form is reached from the one before it (4W): absent for the first of a chain. */
  readonly via?: EvolutionVia;
}

/**
 * How one form of a line is reached (4W, block 1): the minimum level of the games if it evolves by
 * level, and the trigger (`level-up`, `use-item`, `trade`, `friendship`...). `level` is null when
 * the evolution needs no level (a stone, a trade, friendship...).
 */
export interface EvolutionVia {
  readonly level: number | null;
  readonly trigger: string;
}

/** The evolution steps of a chain link: the first detail that names a level, else the first one. */
export function parseVia(raw: unknown): EvolutionVia | undefined {
  const details =
    isRecord(raw) && Array.isArray(raw.evolution_details) ? raw.evolution_details : [];
  const all = details.filter(isRecord);
  if (all.length === 0) return undefined;
  const withLevel = all.find((d) => typeof d.min_level === 'number');
  const pick = withLevel ?? all[0];
  const trigger =
    isRecord(pick?.trigger) && typeof pick.trigger.name === 'string' ? pick.trigger.name : 'other';
  // Friendship is not a trigger of its own in PokéAPI: it is a level-up with `min_happiness`.
  const friendship = withLevel === undefined && typeof pick?.min_happiness === 'number';
  return {
    level: typeof withLevel?.min_level === 'number' ? withLevel.min_level : null,
    trigger: friendship ? 'friendship' : trigger,
  };
}

/** 4W: where a line splits and the forms of each other way, from that stage on. */
export interface RosterBranches {
  readonly at: number;
  readonly options: readonly (readonly string[])[];
}

export interface BuiltRoster {
  /** Line of each base: the forms after the base, in order (as `roster.json` writes them). */
  readonly lines: Readonly<Record<string, readonly string[]>>;
  /** 4W: how each form of `lines` is reached, in the same order (one entry per form after the base). */
  readonly evolution: Readonly<Record<string, readonly EvolutionVia[]>>;
  /**
   * 4W, block 7: the other ways each split line can go, so the game can take them (by place). For
   * a base, `at` is the stage of the split (2 or 3) and each option is its forms from that stage on.
   */
  readonly branches: Readonly<Record<string, RosterBranches>>;
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
    /** Species of the `exclude` list met in the chains (the first excluded form of each). */
    readonly excluded: number;
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
  const via = parseVia(raw);
  return {
    name: raw.species.name,
    children: next.map(readNode),
    ...(via === undefined ? {} : { via }),
  };
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
  let excluded = 0;
  const excludedNames = new Set(rules.exclude ?? []);

  const inRange = (name: string): boolean => {
    const info = species.get(name);
    return info !== undefined && info.id <= rules.maxPokedexId;
  };
  const isExcluded = (name: string): boolean => excludedNames.has(name);
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

  /** At a split, the child with the higher total (then the lower number): the line of always. */
  const bestOf = (options: readonly ChainNode[]): ChainNode =>
    options.reduce((a, b) => {
      const ta = statTotal(a.name);
      const tb = statTotal(b.name);
      return tb > ta || (tb === ta && dexOf(b.name) < dexOf(a.name)) ? b : a;
    });
  /** 4W: the forms of a branch not taken, from its first form on, at most `room` of them. */
  const tailFrom = (first: ChainNode, room: number): string[] => {
    const tail = [idOf(first.name)];
    let node = first;
    while (tail.length < room && node.children.length > 0) {
      const options = node.children.filter((c) => inRange(c.name) && !isExcluded(c.name));
      if (options.length === 0) break;
      node = bestOf(options);
      tail.push(idOf(node.name));
    }
    return tail;
  };
  /** The first split of the line being walked (4W): kept as its branches. */
  let split: RosterBranches | null = null;

  /** The linear path from a node: at a split the child with the higher total (then the lower number). */
  const pathFrom = (start: ChainNode): ChainNode[] => {
    const path = [start];
    let node = start;
    split = null;
    while (path.length < 3 && node.children.length > 0) {
      const reachable = node.children.filter((c) => inRange(c.name));
      outOfRange += node.children.length - reachable.length;
      const options = reachable.filter((c) => !isExcluded(c.name));
      excluded += reachable.length - options.length;
      if (options.length === 0) break;
      const best = bestOf(options);
      if (options.length > 1) {
        const others = options.filter((c) => c !== best);
        discarded.push({
          from: idOf(node.name),
          kept: idOf(best.name),
          dropped: others.map((c) => idOf(c.name)),
        });
        // 4W: the first split of a line is kept as its branches (the stage of the new form).
        split ??= { at: path.length + 1, options: others.map((c) => tailFrom(c, 3 - path.length)) };
      }
      path.push(best);
      node = best;
    }
    return path;
  };
  const branches: Record<string, RosterBranches> = {};
  const evolution: Record<string, readonly EvolutionVia[]> = {};

  /** Starts a line at `node`, or at its children when it is a baby form (each becomes a line). */
  const start = (node: ChainNode): void => {
    if (!inRange(node.name)) return;
    if (isExcluded(node.name)) {
      excluded += 1;
      return;
    }
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
    const [base, ...rest] = path.map((n) => idOf(n.name));
    if (base !== undefined) {
      lines[base] = rest;
      evolution[base] = path.slice(1).map((n) => n.via ?? { level: null, trigger: 'other' });
      const found = split as RosterBranches | null;
      if (found !== null) branches[base] = found;
    }
  };
  for (const root of chains) start(root);

  // 4W, block 7: the regional lines, after the rule; each form is reached the way the species it is
  // a form of is reached in its chain.
  const viaOf = new Map<string, EvolutionVia>();
  const walk = (node: ChainNode): void => {
    if (node.via !== undefined) viaOf.set(node.name, node.via);
    for (const child of node.children) walk(child);
  };
  for (const root of chains) walk(root);
  for (const [base, forms] of Object.entries(rules.regional ?? {})) {
    if (lines[base] !== undefined) continue;
    lines[base] = forms;
    evolution[base] = forms.map(
      (form) => viaOf.get(speciesNameOf(form)) ?? { level: null, trigger: 'other' },
    );
  }

  const dexByPokemon = new Map([...species.values()].map((info) => [info.pokemon, info.id]));
  // A regional line goes right after the line of its species (4W): the number plus a half.
  const dexOfId = (id: string): number =>
    dexByPokemon.get(id) ??
    (species.get(speciesNameOf(id))?.id ?? Number.MAX_SAFE_INTEGER - 1) + 0.5;
  const names = Object.keys(lines).sort((a, b) => dexOfId(a) - dexOfId(b));
  const sorted: Record<string, readonly string[]> = {};
  const sortedEvolution: Record<string, readonly EvolutionVia[]> = {};
  const sortedBranches: Record<string, RosterBranches> = {};
  for (const name of names) {
    sorted[name] = lines[name] ?? [];
    sortedEvolution[name] = evolution[name] ?? [];
    const found = branches[name];
    if (found !== undefined) sortedBranches[name] = found;
  }
  return {
    lines: sorted,
    evolution: sortedEvolution,
    branches: sortedBranches,
    discardedBranches: discarded.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)),
    counts: {
      lines: names.length,
      forms: names.reduce((sum, name) => sum + 1 + (lines[name]?.length ?? 0), 0),
      legendary,
      babies,
      outOfRange,
      excluded,
    },
  };
}
