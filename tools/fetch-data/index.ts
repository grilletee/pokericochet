// Generates the local data the game loads. This tool is the ONLY place allowed to call PokéAPI
// (the game never does at runtime; ADR-005, ADR-018).
//
//   pnpm fetch-data               species + moves JSON + sprites
//   pnpm fetch-data -- --no-sprites
//   pnpm fetch-data -- --delay 1000
//
// Outputs:
//   src/data/generated/species.json   small, deterministic, committed to the repo
//   src/data/generated/moves.json     the move of each species and stage (ADR-039), committed
//   src/data/generated/moves-report.md  review table of the automatic move choices, committed
//   src/assets/sprites/<id>.png       PokeAPI/sprites front sprites, git-ignored, fetched per build
// Raw responses are cached in tools/fetch-data/.cache/ (git-ignored); a cached file is never
// requested again, and real requests are spaced by --delay ms (default 700).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type FetchDeps, PoliteFetcher } from './cache';
import {
  buildFile,
  chooseMoves,
  type GeneratedMoves,
  type GeneratedSpecies,
  type Learn,
  type MoveInfo,
  type MoveOverrides,
  movesReport,
  movesToFetch,
  parseCryUrl,
  parseMove,
  parseName,
  parsePokemon,
  type Roster,
  regionalName,
  rosterIds,
  serialize,
  stageForms,
  validateRoster,
  validateVersionGroups,
} from './parse';
import {
  baseStatTotal,
  buildRoster,
  namesNeedingStats,
  parseChain,
  parseSpeciesInfo,
  type RosterRules,
} from './rosterRules';
import { ALL_TYPES, buildTypeChart } from './typechart';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const cacheDir = resolve(here, '.cache');
const spriteDir = resolve(root, 'src/assets/sprites');
const generatedDir = resolve(root, 'src/data/generated');
const API = 'https://pokeapi.co/api/v2';
const USER_AGENT = 'pokebounce-fetch-data (non-profit fan project; caches every response)';

const args = process.argv.slice(2);
const withSprites = !args.includes('--no-sprites');
const withCries = !args.includes('--no-cries');
const cryDir = resolve(root, 'src/assets/cries');
const numberArg = (flag: string, fallback: number): number => {
  const at = args.indexOf(flag);
  const value = at >= 0 ? Number(args[at + 1]) : fallback;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${flag} needs a number`);
  return value;
};
// 4 workers with 500 ms between the requests of each: about 6 requests a second at most (ADR-048).
const delayMs = numberArg('--delay', 500);
const concurrency = Math.max(1, Math.floor(numberArg('--concurrency', 4)));
const rosterMode = args.includes('--roster');
const startedAt = Date.now();

const deps: FetchDeps = {
  exists: (path) => existsSync(path),
  read: (path) => readFileSync(path),
  write: (path, data) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  },
  download: async (url) => {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  },
  sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
};
const fetcher = new PoliteFetcher(deps, { delayMs, retries: 2, concurrency });

async function getJson(url: string, cacheFile: string): Promise<unknown> {
  const { data } = await fetcher.get(url, resolve(cacheDir, cacheFile));
  return JSON.parse(new TextDecoder().decode(data));
}

/** The roster rule (ADR-048): builds the candidate roster of generations 1-4 and stops. */
async function buildRosterCandidate(): Promise<void> {
  const rules = JSON.parse(readFileSync(resolve(here, 'roster.rules.json'), 'utf8')) as RosterRules;
  const ids = Array.from({ length: rules.maxPokedexId }, (_, i) => i + 1);
  const infos = await Promise.all(
    ids.map(async (id) =>
      parseSpeciesInfo(await getJson(`${API}/pokemon-species/${id}`, `rs-${id}.json`)),
    ),
  );
  const byName = new Map(infos.map((info) => [info.name, info]));
  const chainIds = [...new Set(infos.map((info) => info.chainId))].sort((a, b) => a - b);
  const chains = await Promise.all(
    chainIds.map(async (id) =>
      parseChain(await getJson(`${API}/evolution-chain/${id}`, `chain-${id}.json`)),
    ),
  );
  // Only the children of a split need their stats to choose a branch.
  const needed = [...new Set(chains.flatMap((chain) => namesNeedingStats(chain.root)))];
  const totals = new Map<string, number>();
  await Promise.all(
    needed.map(async (name) => {
      const pokemon = byName.get(name)?.pokemon ?? name;
      totals.set(
        name,
        baseStatTotal(pokemon, await getJson(`${API}/pokemon/${pokemon}`, `${pokemon}.json`)),
      );
    }),
  );
  const built = buildRoster(
    rules,
    chains.map((chain) => chain.root),
    byName,
    (name) => totals.get(name) ?? 0,
  );
  deps.write(
    resolve(here, 'roster.generated.json'),
    new TextEncoder().encode(serialize({ rules, ...built })),
  );
  // What the game reads (ADR-048): every line of the rule is both a ball and a wild species; the
  // run's pool decides which ones a game uses. Starters, legendaries and the fallback boss are
  // curated in `roster.rules.json`.
  const bases = Object.keys(built.lines);
  const generated: Roster = {
    balls: bases,
    enemies: bases,
    boss: rules.boss ?? 'lugia',
    legendaries: rules.legendaries ?? [],
    starters: rules.starters ?? [],
    lines: built.lines,
    evolution: built.evolution,
    branches: built.branches,
  };
  validateRoster(generated);
  deps.write(resolve(here, 'roster.json'), new TextEncoder().encode(serialize(generated)));
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(
    `roster candidate: ${built.counts.lines} lines, ${built.counts.forms} forms ` +
      `(${built.counts.legendary} legendary/mythical, ${built.counts.babies} babies, ` +
      `${built.discardedBranches.length} branches dropped); ` +
      `${fetcher.networkRequests} network requests in ${seconds} s with ${concurrency} workers`,
  );
}
if (rosterMode) {
  await buildRosterCandidate();
  process.exit(0);
}

const roster = JSON.parse(readFileSync(resolve(here, 'roster.json'), 'utf8')) as Roster;
const overrides = JSON.parse(
  readFileSync(resolve(here, 'moves-overrides.json'), 'utf8'),
) as MoveOverrides;
validateRoster(roster);
if (overrides.versionGroups === undefined) {
  throw new Error('moves-overrides.json has no "versionGroups" (the games whose moves count)');
}
validateVersionGroups(overrides.versionGroups);

// Every species of the roster is fetched by the workers at once; the results keep the roster order,
// so the files never depend on which response came first.
const learnsets: Record<string, readonly Learn[]> = {};
const spanishMissing: string[] = [];
const loaded = await Promise.all(
  rosterIds(roster).map(async (id) => {
    const { data, fromCache } = await fetcher.get(
      `${API}/pokemon/${id}`,
      resolve(cacheDir, `${id}.json`),
    );
    const rawPokemon: unknown = JSON.parse(new TextDecoder().decode(data));
    const parsed = parsePokemon(id, rawPokemon, overrides.versionGroups);
    const local = parseName(
      id,
      await getJson(`${API}/pokemon-species/${parsed.species.pokedexId}`, `species-${id}.json`),
    );
    console.log(
      `${fromCache ? 'cache  ' : 'fetched'} ${id} (#${parsed.species.pokedexId}) ${local.name}`,
    );
    if (withSprites) {
      const target = resolve(spriteDir, `${id}.png`);
      const sprite = await fetcher.get(parsed.spriteUrl, resolve(cacheDir, `${id}.png`));
      if (!existsSync(target)) deps.write(target, sprite.data);
    }
    // The cry (PokeAPI/cries), for the bosses' entrance: cached like the rest, kept out of the repo.
    const cryUrl = withCries ? parseCryUrl(rawPokemon) : undefined;
    if (cryUrl !== undefined) {
      const cryTarget = resolve(cryDir, `${id}.ogg`);
      try {
        const cry = await fetcher.get(cryUrl, resolve(cacheDir, `${id}.ogg`));
        if (!existsSync(cryTarget)) deps.write(cryTarget, cry.data);
      } catch {
        console.warn(`no cry for ${id}`);
      }
    }
    return { id, parsed, local };
  }),
);
const species: GeneratedSpecies[] = [];
for (const { id, parsed, local } of loaded) {
  if (local.fallback) spanishMissing.push(id);
  // 4W: a regional form says its region ("Vulpix de Alola").
  species.push({ ...parsed.species, name: regionalName(id, local.name) });
  learnsets[id] = parsed.learnset;
}
// 4W-fix: a missing Spanish name stops the tool instead of putting the English one in the game.
if (spanishMissing.length > 0) {
  throw new Error(`no Spanish name in PokéAPI for ${spanishMissing.join(', ')}`);
}

// Moves: only the forms that can show up at some stage of a ball or enemy line matter.
const bases = [...new Set([...roster.balls, ...roster.enemies])];
const used: Record<string, readonly Learn[]> = {};
/** The learnset of a form, which must have been read above: never an empty stand-in (4W-fix). */
const learnsetOf = (form: string): readonly Learn[] => {
  const learnset = learnsets[form];
  if (learnset === undefined) throw new Error(`no PokéAPI data for "${form}" (not in the roster)`);
  return learnset;
};
for (const base of bases) {
  for (const form of stageForms(base, roster.lines[base])) used[form] = learnsetOf(form);
}
/** 4W, block 7: the forms each branch shows at stages 1-3 (the line's before the split). */
const branchForms = Object.entries(roster.branches ?? {}).flatMap(([base, set]) => {
  const line = stageForms(base, roster.lines[base]);
  return set.options.map((option) => {
    const forms = [1, 2, 3].map((stage) =>
      stage < set.at
        ? (line[stage - 1] ?? base)
        : (option[Math.min(stage - set.at, option.length - 1)] ?? base),
    ) as [string, string, string];
    return { key: option[0] ?? base, forms };
  });
});
for (const { forms } of branchForms) for (const form of forms) used[form] = learnsetOf(form);
const moveIds = movesToFetch(used, overrides);
const parsedMoves = await Promise.all(
  moveIds.map(async (id) => parseMove(id, await getJson(`${API}/move/${id}`, `move-${id}.json`))),
);
const infos: Record<string, MoveInfo> = Object.fromEntries(parsedMoves.map((m) => [m.id, m]));

// The 18x18 type chart (ADR-047): the raw values of PokéAPI, for the 4H-B2 to read.
const typeResponses: Record<string, unknown> = {};
await Promise.all(
  ALL_TYPES.map(async (type) => {
    typeResponses[type] = await getJson(`${API}/type/${type}`, `type-${type}.json`);
  }),
);
deps.write(
  resolve(generatedDir, 'typeChart.json'),
  new TextEncoder().encode(serialize(buildTypeChart(typeResponses))),
);

const speciesById = new Map(species.map((s) => [s.id, s]));
const byBase: Record<string, readonly string[]> = {};
const rows = bases.map((base) => {
  const forms = stageForms(base, roster.lines[base]);
  const types = speciesById.get(base)?.types;
  if (types === undefined) throw new Error(`no data for "${base}"`);
  const chosen = chooseMoves(base, types, forms, used, infos, overrides);
  byBase[base] = chosen.moves;
  return { base, forms, chosen };
});
// 4W, block 7: each branch has its own moves, under the key of its first form (Flareon's are fire).
for (const { key, forms } of branchForms) {
  const types = speciesById.get(key)?.types;
  if (types === undefined) throw new Error(`no data for "${key}"`);
  const chosen = chooseMoves(key, types, forms, used, infos, overrides);
  byBase[key] = chosen.moves;
  rows.push({ base: key, forms, chosen });
}
const usedMoves = new Set([
  ...Object.values(byBase).flat(),
  ...Object.values(overrides.defaults).flat(),
]);
const moves: GeneratedMoves['moves'] = Object.fromEntries(
  [...usedMoves].sort().map((id) => {
    const info = infos[id];
    if (info === undefined) throw new Error(`no data for move "${id}"`);
    return [id, { name: info.name, type: info.type, power: info.power }] as const;
  }),
);
const generatedMoves: GeneratedMoves = { byBase, defaults: overrides.defaults, moves };

deps.write(
  resolve(generatedDir, 'species.json'),
  new TextEncoder().encode(serialize(buildFile(roster, species))),
);
deps.write(
  resolve(generatedDir, 'moves.json'),
  new TextEncoder().encode(serialize(generatedMoves)),
);
deps.write(
  resolve(generatedDir, 'moves-report.md'),
  new TextEncoder().encode(movesReport(rows, infos)),
);
console.log(
  `wrote ${generatedDir} (${species.length} species, ${usedMoves.size} moves, 18 types), ` +
    `${fetcher.networkRequests} network requests in ${((Date.now() - startedAt) / 1000).toFixed(0)} s`,
);
