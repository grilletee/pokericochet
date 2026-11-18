import { describe, expect, it } from 'vitest';
import {
  activeFilters,
  type DexItem,
  EMPTY_QUERY,
  foldName,
  matchesText,
  queryDex,
  sortDex,
} from '../../src/ui/dexQuery';

/** 4W, block 5 (18th playtest: "la Pokédex necesita búsqueda y filtros"). */
const item = (over: Partial<DexItem> & { species: string; dex: number }): DexItem => ({
  state: 'owned',
  types: ['normal'],
  level: 1,
  candies: 0,
  nextCost: 3,
  ...over,
});

const ITEMS: DexItem[] = [
  item({
    species: 'charmander',
    dex: 4,
    types: ['fire'],
    gen: 1,
    stars: 5,
    level: 3,
    candies: 10,
    nextCost: 9,
    final: 'charizard',
  }),
  item({ species: 'squirtle', dex: 7, types: ['water'], gen: 1, stars: 5 }),
  item({
    species: 'pidgey',
    dex: 16,
    types: ['normal', 'flying'],
    gen: 1,
    stars: 3,
    state: 'seen',
    nextCost: Number.POSITIVE_INFINITY,
  }),
  item({
    species: 'mr-mime',
    dex: 122,
    types: ['psychic', 'fairy'],
    gen: 1,
    stars: 4,
    state: 'seen',
    nextCost: Number.POSITIVE_INFINITY,
  }),
  item({
    species: 'bagon',
    dex: 371,
    types: ['dragon'],
    gen: 3,
    stars: 5,
    level: 2,
    candies: 1,
    nextCost: 6,
  }),
  item({
    species: 'eevee',
    dex: 133,
    types: ['normal'],
    gen: 1,
    stars: 4,
    state: 'unknown',
    nextCost: Number.POSITIVE_INFINITY,
  }),
];
const names = (items: readonly DexItem[]): string[] => items.map((i) => i.species);

describe('search by name', () => {
  it('ignores case, accents, spaces and signs', () => {
    expect(foldName('Mr. Mime')).toBe('mrmime');
    expect(foldName('Pokémon Ñ')).toBe('pokemonn');
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, text: 'CHAR' }))).toEqual(['charmander']);
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, text: 'mr mime' }))).toEqual(['mr-mime']);
  });

  it('finds a Pokémon by the last form of its line, and by its number', () => {
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, text: 'charizard' }))).toEqual(['charmander']);
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, text: '#004' }))).toEqual(['charmander']);
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, text: '371' }))).toEqual(['bagon']);
  });

  it('never gives away the name of one you have not met: an unknown one only by number', () => {
    const eevee = ITEMS.find((i) => i.species === 'eevee');
    if (eevee === undefined) throw new Error('fixture');
    expect(matchesText(eevee, 'eevee')).toBe(false);
    expect(matchesText(eevee, '133')).toBe(true);
    // The last form of a line is only searched in the ones you own.
    const seen = item({ species: 'charmander', dex: 4, state: 'seen', final: 'charizard' });
    expect(matchesText(seen, 'charizard')).toBe(false);
  });
});

describe('filters that add up', () => {
  it('type, region and rarity together', () => {
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, type: 'normal' }))).toEqual(['pidgey', 'eevee']);
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, gen: 3 }))).toEqual(['bagon']);
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, stars: 5, gen: 1 }))).toEqual([
      'charmander',
      'squirtle',
    ]);
    expect(queryDex(ITEMS, { ...EMPTY_QUERY, stars: 3, type: 'fire' })).toEqual([]);
  });

  it('owned, seen and missing', () => {
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, state: 'owned' }))).toEqual([
      'charmander',
      'squirtle',
      'bagon',
    ]);
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, state: 'seen' }))).toEqual([
      'pidgey',
      'mr-mime',
    ]);
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, state: 'missing' }))).toEqual([
      'pidgey',
      'mr-mime',
      'eevee',
    ]);
  });

  it('a raised permanent level, and candies enough for the next one', () => {
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, raised: true }))).toEqual([
      'charmander',
      'bagon',
    ]);
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, canLevel: true }))).toEqual(['charmander']);
    expect(names(queryDex(ITEMS, { ...EMPTY_QUERY, raised: true, text: 'bag' }))).toEqual([
      'bagon',
    ]);
  });
});

describe('order', () => {
  it('by number, by level, by rarity and by name; ties keep the number', () => {
    expect(names(sortDex(ITEMS, 'number'))).toEqual([
      'charmander',
      'squirtle',
      'pidgey',
      'mr-mime',
      'eevee',
      'bagon',
    ]);
    expect(names(sortDex(ITEMS, 'level')).slice(0, 3)).toEqual(['charmander', 'bagon', 'squirtle']);
    expect(names(sortDex(ITEMS, 'rarity')).slice(0, 3)).toEqual([
      'charmander',
      'squirtle',
      'bagon',
    ]);
    const byName = names(sortDex(ITEMS, 'name'));
    expect(byName.at(-1)).toBe('eevee'); // the unknown one, without a name, goes last
    expect(byName.slice(0, 2)).toEqual(['bagon', 'charmander']);
  });

  it('never changes the list it is given', () => {
    const copy = [...ITEMS];
    sortDex(ITEMS, 'rarity');
    expect(ITEMS).toEqual(copy);
  });
});

describe('the clear button counts the filters on', () => {
  it('each filter and the search count one', () => {
    expect(activeFilters(EMPTY_QUERY)).toBe(0);
    expect(activeFilters({ ...EMPTY_QUERY, text: '  ' })).toBe(0);
    expect(
      activeFilters({
        ...EMPTY_QUERY,
        text: 'a',
        type: 'fire',
        gen: 1,
        stars: 5,
        state: 'owned',
        raised: true,
        canLevel: true,
      }),
    ).toBe(7);
  });
});
