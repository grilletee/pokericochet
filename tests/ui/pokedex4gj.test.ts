import { describe, expect, it } from 'vitest';
import { cardBackground, type DexTile, dexNumber, filterDex, TYPE_COLORS } from '../../src/ui';

/** 4G-J, block 6: the card of a Pokémon and the filters of the visual Pokédex. */
const tile = (over: Partial<DexTile> & { species: string }): DexTile => ({
  state: 'owned',
  type: 'normal',
  level: 1,
  candies: 0,
  nextCost: 3,
  startLevel: 1,
  stats: undefined,
  ...over,
});

const tiles: DexTile[] = [
  tile({ species: 'charmander', types: ['fire'], gen: 1, dex: 4 }),
  tile({ species: 'bulbasaur', types: ['grass', 'poison'], gen: 1, dex: 1, state: 'seen' }),
  tile({ species: 'torchic', types: ['fire'], gen: 3, dex: 255, state: 'unknown' }),
  tile({ species: 'sprigatito', types: ['grass'], gen: 9, dex: 906 }),
];

describe('the card of a Pokémon', () => {
  it('wears the colours of its two types; grey if only seen; dark if unknown', () => {
    const owned = cardBackground(['grass', 'poison'], 'owned');
    expect(owned).toContain(TYPE_COLORS.grass);
    expect(owned).toContain(TYPE_COLORS.poison);
    expect(cardBackground(['fire'], 'owned')).toContain(TYPE_COLORS.fire);
    expect(cardBackground(['fire'], 'seen')).not.toContain(TYPE_COLORS.fire);
    expect(cardBackground(['fire'], 'unknown')).not.toBe(cardBackground(['fire'], 'seen'));
  });

  it('says its Pokédex number with three digits', () => {
    expect(dexNumber(4)).toBe('#004');
    expect(dexNumber(25)).toBe('#025');
    expect(dexNumber(906)).toBe('#906');
    expect(dexNumber(1025)).toBe('#1025');
  });
});

describe('the filters of the Pokédex', () => {
  it('by type (either of its types), by generation and "only mine", together', () => {
    const none = { type: null, gen: null, mine: false } as const;
    expect(filterDex(tiles, none)).toHaveLength(4);
    expect(filterDex(tiles, { ...none, type: 'fire' }).map((t) => t.species)).toEqual([
      'charmander',
      'torchic',
    ]);
    // A second type counts: Bulbasaur is also Poison.
    expect(filterDex(tiles, { ...none, type: 'poison' }).map((t) => t.species)).toEqual([
      'bulbasaur',
    ]);
    expect(filterDex(tiles, { ...none, gen: 1 })).toHaveLength(2);
    expect(filterDex(tiles, { ...none, type: 'grass', gen: 9 }).map((t) => t.species)).toEqual([
      'sprigatito',
    ]);
    expect(filterDex(tiles, { ...none, mine: true }).map((t) => t.species)).toEqual([
      'charmander',
      'sprigatito',
    ]);
    expect(filterDex(tiles, { type: 'water', gen: null, mine: false })).toEqual([]);
  });
});
