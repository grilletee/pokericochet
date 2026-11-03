import { describe, expect, it } from 'vitest';
import { PoliteFetcher } from '../../tools/fetch-data/cache';
import {
  buildFile,
  type GeneratedSpecies,
  parsePokemon,
  type Roster,
  rosterIds,
  serialize,
  validateRoster,
} from '../../tools/fetch-data/parse';

/** The part of a PokéAPI /pokemon response the tool reads (hand-written fixture). */
function apiResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 4,
    name: 'charmander',
    types: [{ slot: 1, type: { name: 'fire' } }],
    stats: [
      { base_stat: 39, stat: { name: 'hp' } },
      { base_stat: 52, stat: { name: 'attack' } },
      { base_stat: 43, stat: { name: 'defense' } },
      { base_stat: 65, stat: { name: 'speed' } },
    ],
    sprites: { front_default: 'https://example.test/4.png' },
    ...overrides,
  };
}

describe('fetch-data: parsing a PokéAPI response', () => {
  it('reads the first type, hp, attack and speed, and the sprite URL', () => {
    expect(parsePokemon('charmander', apiResponse())).toEqual({
      species: {
        id: 'charmander',
        pokedexId: 4,
        type: 'fire',
        baseStats: { hp: 39, attack: 52, speed: 65 },
      },
      spriteUrl: 'https://example.test/4.png',
    });
  });

  it('uses the type in slot 1 even when the list is out of order', () => {
    const parsed = parsePokemon(
      'oddish',
      apiResponse({
        types: [
          { slot: 2, type: { name: 'poison' } },
          { slot: 1, type: { name: 'grass' } },
        ],
      }),
    );
    expect(parsed.species.type).toBe('grass');
  });

  it('refuses a first type the game does not have, naming the species', () => {
    const response = apiResponse({ types: [{ slot: 1, type: { name: 'psychic' } }] });
    expect(() => parsePokemon('abra', response)).toThrow(/"abra".*"psychic"/);
  });

  it('refuses malformed responses with a message that says what is missing', () => {
    expect(() => parsePokemon('x', null)).toThrow(/not an object/);
    expect(() => parsePokemon('x', apiResponse({ id: 'four' }))).toThrow(/missing id/);
    expect(() => parsePokemon('x', apiResponse({ types: undefined }))).toThrow(/missing types/);
    expect(() => parsePokemon('x', apiResponse({ stats: undefined }))).toThrow(/missing stats/);
    expect(() => parsePokemon('x', apiResponse({ stats: [] }))).toThrow(/missing stat "hp"/);
    expect(() => parsePokemon('x', apiResponse({ sprites: { front_default: null } }))).toThrow(
      /no front_default sprite/,
    );
  });
});

describe('fetch-data: roster and output file', () => {
  const roster: Roster = {
    balls: ['a', 'b'],
    enemies: ['c', 'a'],
    boss: 'd',
    starters: ['a'],
  };
  const species = (id: string): GeneratedSpecies => ({
    id,
    pokedexId: 1,
    type: 'fire',
    baseStats: { hp: 1, attack: 2, speed: 3 },
  });

  it('lists every species once, in a stable order', () => {
    expect(rosterIds(roster)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('rejects duplicate roles and starters that are not balls', () => {
    expect(() => validateRoster(roster)).not.toThrow();
    expect(() => validateRoster({ ...roster, balls: ['a', 'a'] })).toThrow(/balls has duplicates/);
    expect(() => validateRoster({ ...roster, enemies: ['c', 'c'] })).toThrow(/enemies has dup/);
    expect(() => validateRoster({ ...roster, starters: ['z'] })).toThrow(/starter "z"/);
  });

  it('builds the file in roster order and fails loudly on a missing species', () => {
    const file = buildFile(roster, ['d', 'c', 'b', 'a'].map(species));
    expect(file.species.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(() => buildFile(roster, [species('a')])).toThrow(/no data for "b"/);
  });

  it('serializes deterministically, with no dates, ending in a newline', () => {
    const file = buildFile(roster, ['a', 'b', 'c', 'd'].map(species));
    const text = serialize(file);
    expect(serialize(file)).toBe(text);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(file);
    expect(text).not.toMatch(/20\d\d-\d\d-\d\d/);
  });
});

describe('fetch-data: cache and pauses', () => {
  function setup(downloads: Array<Uint8Array | Error>) {
    const files = new Map<string, Uint8Array>();
    const log: string[] = [];
    let call = 0;
    const fetcher = new PoliteFetcher(
      {
        exists: (p) => files.has(p),
        read: (p) => files.get(p) ?? new Uint8Array(),
        write: (p, d) => {
          files.set(p, d);
        },
        download: async (url) => {
          log.push(`GET ${url}`);
          const next = downloads[Math.min(call++, downloads.length - 1)];
          if (next instanceof Error) throw next;
          return next ?? new Uint8Array();
        },
        sleep: async (ms) => {
          log.push(`sleep ${ms}`);
        },
      },
      { delayMs: 100, retries: 2 },
    );
    return { fetcher, files, log };
  }
  const bytes = (...n: number[]) => Uint8Array.from(n);

  it('downloads once, stores in the cache, and never asks again', async () => {
    const { fetcher, files, log } = setup([bytes(1, 2)]);
    const first = await fetcher.get('u1', 'c1');
    const second = await fetcher.get('u1', 'c1');
    expect(first).toEqual({ data: bytes(1, 2), fromCache: false });
    expect(second).toEqual({ data: bytes(1, 2), fromCache: true });
    expect(files.get('c1')).toEqual(bytes(1, 2));
    expect(log).toEqual(['GET u1']);
    expect(fetcher.networkRequests).toBe(1);
  });

  it('pauses between real requests, but not before the first and not for cache hits', async () => {
    const { fetcher, log } = setup([bytes(1)]);
    await fetcher.get('u1', 'c1');
    await fetcher.get('u1', 'c1'); // cache hit
    await fetcher.get('u2', 'c2');
    await fetcher.get('u3', 'c3');
    expect(log).toEqual(['GET u1', 'sleep 100', 'GET u2', 'sleep 100', 'GET u3']);
  });

  it('retries a failure with a growing pause, then succeeds', async () => {
    const { fetcher, log } = setup([new Error('HTTP 503'), new Error('HTTP 503'), bytes(9)]);
    const result = await fetcher.get('u', 'c');
    expect(result.data).toEqual(bytes(9));
    expect(log).toEqual(['GET u', 'sleep 200', 'GET u', 'sleep 300', 'GET u']);
  });

  it('gives up after the retries, says why, and caches nothing', async () => {
    const { fetcher, files } = setup([new Error('HTTP 500')]);
    await expect(fetcher.get('u', 'c')).rejects.toThrow(/could not download u.*HTTP 500/);
    expect(files.size).toBe(0);
    expect(fetcher.networkRequests).toBe(3);
  });
});
