// Generates the local data the game loads. This tool is the ONLY place allowed to call PokéAPI
// (the game never does at runtime; ADR-005, ADR-018).
//
//   pnpm fetch-data               species JSON + sprites
//   pnpm fetch-data -- --no-sprites
//   pnpm fetch-data -- --delay 1000
//
// Outputs:
//   src/data/generated/species.json   small, deterministic, committed to the repo
//   src/assets/sprites/<id>.png       PokeAPI/sprites front sprites, git-ignored, fetched per build
// Raw responses are cached in tools/fetch-data/.cache/ (git-ignored); a cached file is never
// requested again, and real requests are spaced by --delay ms (default 700).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type FetchDeps, PoliteFetcher } from './cache';
import {
  buildFile,
  type GeneratedSpecies,
  parsePokemon,
  type Roster,
  rosterIds,
  serialize,
  validateRoster,
} from './parse';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const cacheDir = resolve(here, '.cache');
const spriteDir = resolve(root, 'src/assets/sprites');
const outFile = resolve(root, 'src/data/generated/species.json');
const API = 'https://pokeapi.co/api/v2/pokemon';
const USER_AGENT = 'pokericochet-fetch-data (non-profit fan project; caches every response)';

const args = process.argv.slice(2);
const withSprites = !args.includes('--no-sprites');
const delayIndex = args.indexOf('--delay');
const delayMs = delayIndex >= 0 ? Number(args[delayIndex + 1]) : 700;

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
const fetcher = new PoliteFetcher(deps, { delayMs, retries: 2 });

const roster = JSON.parse(readFileSync(resolve(here, 'roster.json'), 'utf8')) as Roster;
validateRoster(roster);

const species: GeneratedSpecies[] = [];
for (const id of rosterIds(roster)) {
  const { data, fromCache } = await fetcher.get(`${API}/${id}`, resolve(cacheDir, `${id}.json`));
  const parsed = parsePokemon(id, JSON.parse(new TextDecoder().decode(data)));
  species.push(parsed.species);
  console.log(`${fromCache ? 'cache  ' : 'fetched'} ${id} (#${parsed.species.pokedexId})`);

  if (withSprites) {
    const target = resolve(spriteDir, `${id}.png`);
    const sprite = await fetcher.get(parsed.spriteUrl, resolve(cacheDir, `${id}.png`));
    if (!existsSync(target)) deps.write(target, sprite.data);
  }
}

deps.write(outFile, new TextEncoder().encode(serialize(buildFile(roster, species))));
console.log(
  `wrote ${outFile} (${species.length} species), ${fetcher.networkRequests} network requests`,
);
