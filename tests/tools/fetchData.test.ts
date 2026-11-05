import { describe, expect, it } from 'vitest';
import { PoliteFetcher } from '../../tools/fetch-data/cache';
import {
  buildFile,
  chooseMoves,
  type GeneratedSpecies,
  type Learn,
  type MoveInfo,
  type MoveOverrides,
  movesReport,
  movesToFetch,
  parseMove,
  parseName,
  parsePokemon,
  type Roster,
  rosterIds,
  serialize,
  stageForms,
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
      { base_stat: 60, stat: { name: 'special-attack' } },
      { base_stat: 50, stat: { name: 'special-defense' } },
      { base_stat: 65, stat: { name: 'speed' } },
    ],
    moves: [
      {
        move: { name: 'scratch' },
        version_group_details: [
          { level_learned_at: 1, move_learn_method: { name: 'level-up' } },
          { level_learned_at: 4, move_learn_method: { name: 'level-up' } },
        ],
      },
      {
        move: { name: 'ember' },
        version_group_details: [
          { level_learned_at: 9, move_learn_method: { name: 'level-up' } },
          { level_learned_at: 0, move_learn_method: { name: 'machine' } },
        ],
      },
      {
        move: { name: 'cut' },
        version_group_details: [{ level_learned_at: 0, move_learn_method: { name: 'machine' } }],
      },
    ],
    sprites: { front_default: 'https://example.test/4.png' },
    ...overrides,
  };
}

describe('fetch-data: parsing a PokéAPI response', () => {
  it('reads the first type, the six stats, the level-up moves and the sprite URL', () => {
    expect(parsePokemon('charmander', apiResponse())).toEqual({
      species: {
        id: 'charmander',
        pokedexId: 4,
        type: 'fire',
        baseStats: {
          hp: 39,
          attack: 52,
          defense: 43,
          specialAttack: 60,
          specialDefense: 50,
          speed: 65,
        },
      },
      // The lowest level of each level-up move; machine-only moves are not learned by level.
      learnset: [
        { move: 'ember', level: 9 },
        { move: 'scratch', level: 1 },
      ],
      spriteUrl: 'https://example.test/4.png',
    });
  });

  it('sorts the learnset by move id whatever the order of the response', () => {
    const moves = [...(apiResponse().moves as unknown[])].reverse();
    expect(parsePokemon('x', apiResponse({ moves })).learnset.map((l) => l.move)).toEqual([
      'ember',
      'scratch',
    ]);
    expect(parsePokemon('x', apiResponse({ moves: undefined })).learnset).toEqual([]);
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
    expect(() =>
      parsePokemon('x', apiResponse({ stats: [{ base_stat: 5, stat: { name: 'hp' } }] })),
    ).toThrow(/missing stat "attack"/);
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
    legendaries: ['l'],
    starters: ['a'],
    lines: { a: ['a1', 'a2'], b: ['b1'], c: ['c1'] },
  };
  const species = (id: string): GeneratedSpecies => ({
    id,
    pokedexId: 1,
    name: id.toUpperCase(),
    type: 'fire',
    baseStats: { hp: 1, attack: 2, defense: 3, specialAttack: 4, specialDefense: 5, speed: 6 },
  });

  it('lists every species once, in a stable order', () => {
    expect(rosterIds(roster)).toEqual(['a', 'b', 'c', 'd', 'l', 'a1', 'a2', 'b1', 'c1']);
  });

  it('keeps the legendaries apart from every other role and from each other', () => {
    expect(() => validateRoster({ ...roster, legendaries: ['l', 'l'] })).toThrow(
      /legendaries has dup/,
    );
    expect(() => validateRoster({ ...roster, legendaries: ['a'] })).toThrow(/legendary "a"/);
    expect(() => validateRoster({ ...roster, legendaries: ['d'] })).toThrow(/legendary "d"/);
  });

  it('allows lines of none, one or two forms, and no more (ADR-037)', () => {
    const lines = roster.lines;
    expect(() => validateRoster({ ...roster, lines: { ...lines, b: [] } })).not.toThrow();
    expect(() => validateRoster({ ...roster, lines: { a: ['a1'], c: ['c1'] } })).not.toThrow();
    expect(() => validateRoster({ ...roster, lines: { ...lines, b: ['x', 'y', 'z'] } })).toThrow(
      /"b"\] needs at most two/,
    );
    expect(() => validateRoster({ ...roster, lines: { ...lines, a: ['b'] } })).toThrow(
      /also a base species/,
    );
    expect(() => validateRoster({ ...roster, lines: { ...lines, a: ['a1', 'd'] } })).toThrow(
      /form "d" of "a"/,
    );
    expect(() => validateRoster({ ...roster, lines: { ...lines, d: ['d1'] } })).toThrow(
      /not a ball or an enemy/,
    );
  });

  it('rejects duplicate roles and starters that are not balls', () => {
    expect(() => validateRoster(roster)).not.toThrow();
    expect(() => validateRoster({ ...roster, balls: ['a', 'a'] })).toThrow(/balls has duplicates/);
    expect(() => validateRoster({ ...roster, enemies: ['c', 'c'] })).toThrow(/enemies has dup/);
    expect(() => validateRoster({ ...roster, starters: ['z'] })).toThrow(/starter "z"/);
  });

  it('builds the file in roster order and fails loudly on a missing species', () => {
    const all = ['a', 'b', 'c', 'd', 'l', 'a1', 'a2', 'b1', 'c1'];
    const file = buildFile(roster, [...all].reverse().map(species));
    expect(file.species.map((s) => s.id)).toEqual(all);
    expect(() => buildFile(roster, [species('a')])).toThrow(/no data for "b"/);
  });

  it('serializes deterministically, with no dates, ending in a newline', () => {
    const file = buildFile(roster, ['a', 'b', 'c', 'd', 'l', 'a1', 'a2', 'b1', 'c1'].map(species));
    const text = serialize(file);
    expect(serialize(file)).toBe(text);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(file);
    expect(text).not.toMatch(/20\d\d-\d\d-\d\d/);
  });
});

describe('fetch-data: Spanish names and moves (ADR-036, ADR-039)', () => {
  const names = (...pairs: [string, string][]) => ({
    names: pairs.map(([language, name]) => ({ language: { name: language }, name })),
  });

  it('takes the Spanish name, else the English one (flagged), else the id (flagged)', () => {
    expect(parseName('ember', names(['en', 'Ember'], ['es', 'Ascuas']))).toEqual({
      name: 'Ascuas',
      fallback: false,
    });
    expect(parseName('ember', names(['en', 'Ember']))).toEqual({ name: 'Ember', fallback: true });
    expect(parseName('ember', names(['es', '']))).toEqual({ name: 'ember', fallback: true });
    expect(parseName('ember', null)).toEqual({ name: 'ember', fallback: true });
  });

  it('reads a move: name, type, power (null if it does no damage) and class', () => {
    const raw = {
      ...names(['es', 'Ascuas']),
      type: { name: 'fire' },
      power: 40,
      damage_class: { name: 'special' },
    };
    expect(parseMove('ember', raw)).toEqual({
      id: 'ember',
      name: 'Ascuas',
      type: 'fire',
      power: 40,
      damageClass: 'special',
    });
    expect(parseMove('growl', { ...raw, power: null }).power).toBeNull();
    expect(() => parseMove('x', null)).toThrow(/not an object/);
    expect(() => parseMove('x', { ...raw, type: undefined })).toThrow(/missing type/);
    expect(() => parseMove('x', { ...raw, damage_class: undefined })).toThrow(/damage_class/);
  });

  it('shows the forms of a line at stages 1, 2 and 3, repeating the last one (ADR-037)', () => {
    expect(stageForms('a', ['a1', 'a2'])).toEqual(['a', 'a1', 'a2']);
    expect(stageForms('a', ['a1'])).toEqual(['a', 'a1', 'a1']);
    expect(stageForms('a', [])).toEqual(['a', 'a', 'a']);
    expect(stageForms('a', undefined)).toEqual(['a', 'a', 'a']);
  });

  const info = (id: string, type: string, power: number | null): MoveInfo => ({
    id,
    name: id.toUpperCase(),
    type,
    power,
    damageClass: 'special',
  });
  const infos: Record<string, MoveInfo> = Object.fromEntries(
    [
      info('ember', 'fire', 40),
      info('fire-fang', 'fire', 65),
      info('flamethrower', 'fire', 90),
      info('flame-wheel', 'fire', 60),
      info('fire-blast', 'fire', 110),
      info('overheat', 'fire', 130),
      info('growl', 'fire', null),
      info('surf', 'water', 90),
    ].map((m) => [m.id, m]),
  );
  const learn = (...ids: string[]): Learn[] => ids.map((move, level) => ({ move, level }));
  const overrides: MoveOverrides = {
    defaults: {
      fire: ['ember', 'flamethrower', 'fire-blast'],
      water: ['w1', 'w2', 'w3'],
      grass: ['g1', 'g2', 'g3'],
      electric: ['e1', 'e2', 'e3'],
    },
    signatures: { sig: ['ember', null, 'overheat'] },
  };

  it('picks, per stage, the strongest move of the type inside the tier band, by level-up', () => {
    const chosen = chooseMoves(
      'a',
      'fire',
      ['a', 'a1', 'a2'],
      {
        a: learn('ember', 'flame-wheel', 'growl', 'surf', 'flamethrower'),
        a1: learn('ember', 'fire-fang', 'flamethrower'),
        a2: learn('flamethrower', 'fire-blast', 'overheat'),
      },
      infos,
      overrides,
    );
    // Stage 1: flame-wheel (60) beats ember (40); flamethrower (90) is out of the band, surf is
    // another type and growl does no damage. Stage 2: the 61-95 band holds fire-fang and
    // flamethrower. Stage 3: overheat (130) is the strongest of 96+.
    expect(chosen.moves).toEqual(['flame-wheel', 'flamethrower', 'overheat']);
    expect(chosen.sources).toEqual(['auto', 'auto', 'auto']);
  });

  it('keeps each tier inside its power band: 30-60, 61-95 and 96 or more', () => {
    const wide: Record<string, MoveInfo> = {
      ...infos,
      p98: info('p98', 'fire', 98),
      p62: info('p62', 'fire', 62),
    };
    // Stage 1 knows only fire-fang (65): above the band of tier 1, so the default move is used.
    const first = chooseMoves(
      'a',
      'fire',
      ['a', 'a', 'a'],
      { a: learn('fire-fang') },
      wide,
      overrides,
    );
    expect(first.moves[0]).toBe('ember');
    expect(first.sources[0]).toBe('default');
    // Power 98 belongs to tier 3 (96+) and 62 to tier 2, never to the tier below.
    const bands = chooseMoves(
      'a',
      'fire',
      ['a', 'a', 'a'],
      { a: learn('p98', 'p62') },
      wide,
      overrides,
    );
    expect(bands.moves).toEqual(['ember', 'p62', 'p98']);
    expect(bands.sources).toEqual(['default', 'auto', 'auto']);
  });

  it('ignores the moves of another type, however strong', () => {
    const wide: Record<string, MoveInfo> = { ...infos, 'water-95': info('water-95', 'water', 95) };
    const chosen = chooseMoves(
      'a',
      'fire',
      ['a', 'a', 'a'],
      { a: learn('water-95', 'flamethrower') },
      wide,
      overrides,
    );
    expect(chosen.moves[1]).toBe('flamethrower');
  });

  it('breaks a tie on power by the lower move id', () => {
    const tied = { ...infos, 'a-tie': info('a-tie', 'fire', 90) };
    const chosen = chooseMoves(
      'a',
      'fire',
      ['a', 'a', 'a'],
      { a: learn('flamethrower', 'a-tie') },
      tied,
      overrides,
    );
    expect(chosen.moves[1]).toBe('a-tie');
  });

  it('falls back to the default move of the type when a band is empty or the form has none', () => {
    const chosen = chooseMoves(
      'a',
      'fire',
      ['a', 'a1', 'a1'],
      { a: learn('growl') },
      infos,
      overrides,
    );
    expect(chosen.moves).toEqual(['ember', 'flamethrower', 'fire-blast']);
    expect(chosen.sources).toEqual(['default', 'default', 'default']);
  });

  it('uses a signature where there is one and the automatic choice for a null', () => {
    const chosen = chooseMoves(
      'sig',
      'fire',
      ['sig', 'sig1', 'sig1'],
      { sig: learn('flame-wheel'), sig1: learn('fire-fang') },
      infos,
      overrides,
    );
    expect(chosen.moves).toEqual(['ember', 'fire-fang', 'overheat']);
    expect(chosen.sources).toEqual(['signature', 'auto', 'signature']);
  });

  it('never repeats or lowers the power of the tier before', () => {
    // A signature of power 90 at tier 1 leaves nothing in the 61-95 band that is stronger than it.
    const strong: MoveOverrides = { ...overrides, signatures: { a: ['flamethrower', null, null] } };
    const chosen = chooseMoves(
      'a',
      'fire',
      ['a', 'a', 'a'],
      { a: learn('fire-fang', 'flamethrower') },
      infos,
      strong,
    );
    expect(chosen.moves[1]).toBe('flamethrower'); // the default, as the 61-95 band has no stronger move
    expect(chosen.sources[1]).toBe('default');
  });

  it('lists the moves to fetch once, sorted, with the defaults and the signatures', () => {
    const ids = movesToFetch({ a: learn('surf', 'ember'), b: learn('ember') }, overrides);
    expect(ids).toEqual([...new Set(ids)].sort());
    expect(ids).toContain('surf');
    expect(ids).toContain('overheat'); // a signature
    expect(ids).toContain('w2'); // a default
    expect(ids.filter((id) => id === 'ember')).toHaveLength(1);
  });

  it('writes the review table, one row per species and stage', () => {
    const chosen = chooseMoves('sig', 'fire', ['sig', 'sig', 'sig'], {}, infos, overrides);
    const text = movesReport([{ base: 'sig', forms: ['sig', 'sig', 'sig'], chosen }], infos);
    expect(text).toContain('| sig | 1 | sig | ember | EMBER | 40 | signature |');
    expect(text.trimEnd().split('\n')).toHaveLength(4 + 3);
    expect(text.endsWith('\n')).toBe(true);
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

  it('waits four times longer after a 429 (Too Many Requests)', async () => {
    const { fetcher, log } = setup([new Error('HTTP 429'), bytes(1)]);
    await fetcher.get('u', 'c');
    expect(log).toEqual(['GET u', 'sleep 800', 'GET u']);
  });
});

describe('fetch-data: concurrent workers (4H-B1, ADR-048)', () => {
  /** A download that stays open until the test lets it finish, so the overlap can be measured. */
  function gated(concurrency?: number) {
    const files = new Map<string, Uint8Array>();
    const sleeps: number[] = [];
    const open: Array<() => void> = [];
    let inFlight = 0;
    let peak = 0;
    let started = 0;
    const fetcher = new PoliteFetcher(
      {
        exists: (p) => files.has(p),
        read: (p) => files.get(p) ?? new Uint8Array(),
        write: (p, d) => {
          files.set(p, d);
        },
        download: () => {
          started += 1;
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          return new Promise<Uint8Array>((resolve) => {
            open.push(() => {
              inFlight -= 1;
              resolve(Uint8Array.from([1]));
            });
          });
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      },
      { delayMs: 500, retries: 0, ...(concurrency === undefined ? {} : { concurrency }) },
    );
    const settle = async (): Promise<void> => {
      await new Promise((done) => setTimeout(done, 0));
    };
    return {
      fetcher,
      sleeps,
      settle,
      get peak() {
        return peak;
      },
      get started() {
        return started;
      },
      finishOne: () => open.shift()?.(),
    };
  }

  it('never has more downloads open than its workers, and the rest wait their turn', async () => {
    const g = gated(4);
    const all = Promise.all(Array.from({ length: 10 }, (_, i) => g.fetcher.get(`u${i}`, `c${i}`)));
    await g.settle();
    expect(g.started).toBe(4);
    g.finishOne();
    await g.settle();
    expect(g.started).toBe(5); // a worker that finished took the next one
    for (let i = 0; i < 9; i++) {
      g.finishOne();
      await g.settle();
    }
    await all;
    expect(g.started).toBe(10);
    expect(g.peak).toBe(4);
  });

  it('each worker pauses before its own second request and never before its first', async () => {
    const g = gated(4);
    const all = Promise.all(Array.from({ length: 8 }, (_, i) => g.fetcher.get(`u${i}`, `c${i}`)));
    await g.settle();
    expect(g.sleeps).toEqual([]); // the first four go out at once: 4 workers, 4 first requests
    for (let i = 0; i < 8; i++) {
      g.finishOne();
      await g.settle();
    }
    await all;
    expect(g.sleeps).toEqual([500, 500, 500, 500]); // the second round of each worker
  });

  it('lets two callers that ask for the same file share one download', async () => {
    const g = gated(4);
    const a = g.fetcher.get('u', 'same');
    const b = g.fetcher.get('u', 'same');
    await g.settle();
    expect(g.started).toBe(1);
    g.finishOne();
    expect(await a).toEqual(await b);
    expect(g.fetcher.networkRequests).toBe(1);
  });

  it('forgets a download that failed, so asking again tries again', async () => {
    let calls = 0;
    const fetcher = new PoliteFetcher(
      {
        exists: () => false,
        read: () => new Uint8Array(),
        write: () => {},
        download: async () => {
          calls += 1;
          if (calls === 1) throw new Error('HTTP 500');
          return Uint8Array.from([7]);
        },
        sleep: async () => {},
      },
      { delayMs: 1, retries: 0, concurrency: 2 },
    );
    await expect(fetcher.get('u', 'c')).rejects.toThrow(/HTTP 500/);
    expect((await fetcher.get('u', 'c')).data).toEqual(Uint8Array.from([7]));
  });

  it('is sequential by default, as before (no concurrency asked for)', async () => {
    const g = gated(undefined);
    const all = Promise.all([g.fetcher.get('a', 'ca'), g.fetcher.get('b', 'cb')]);
    await g.settle();
    expect(g.started).toBe(1);
    g.finishOne();
    await g.settle();
    g.finishOne();
    await all;
    expect(g.peak).toBe(1);
    expect(g.sleeps).toEqual([500]);
  });
});
