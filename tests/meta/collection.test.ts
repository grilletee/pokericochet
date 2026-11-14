import { describe, expect, it } from 'vitest';
import {
  dex,
  dexCounts,
  emptyProfile,
  levelUp,
  levelUpCost,
  MAX_PERMANENT_LEVEL,
  type Profile,
  startLevelFor,
} from '../../src/meta';

/** 4G-I, block 11 (Phase 5): the Pokédex and the candies. */
const pool = ['abra', 'bulbasaur', 'charmander', 'zubat'];

describe('the Pokédex', () => {
  it('owned, seen or unknown; with level, candies and the level it starts at', () => {
    const p: Profile = {
      ...emptyProfile(1),
      owned: { charmander: { level: 4 } },
      candies: { charmander: 5 },
      seen: ['charmander', 'zubat'],
      firstStarterChosen: true,
    };
    const entries = dex(p, pool);
    expect(entries.map((e) => e.state)).toEqual(['unknown', 'unknown', 'owned', 'seen']);
    const charmander = entries[2];
    expect(charmander).toMatchObject({
      level: 4,
      candies: 5,
      nextCost: levelUpCost(4),
      startLevel: startLevelFor(4),
    });
    expect(dexCounts(entries)).toEqual({ seen: 2, owned: 1, total: 4 });
  });
});

describe('the candies raise the permanent level', () => {
  it('costs 3 x level, needs enough candies, and stops at the top', () => {
    let p: Profile = {
      ...emptyProfile(1),
      owned: { abra: { level: 1 } },
      candies: { abra: 1000 },
      firstStarterChosen: true,
    };
    expect(levelUpCost(1)).toBe(3);
    expect(levelUpCost(MAX_PERMANENT_LEVEL)).toBe(Number.POSITIVE_INFINITY);
    let spent = 0;
    for (let level = 1; level < MAX_PERMANENT_LEVEL; level++) {
      const before = p.candies.abra ?? 0;
      p = levelUp(p, 'abra');
      expect(p.owned.abra?.level).toBe(level + 1);
      spent += before - (p.candies.abra ?? 0);
    }
    expect(spent).toBe([1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((s, l) => s + 3 * l, 0));
    expect(levelUp(p, 'abra')).toBe(p); // at the top
    const poor: Profile = { ...p, owned: { zubat: { level: 1 } }, candies: { zubat: 2 } };
    expect(levelUp(poor, 'zubat')).toBe(poor);
    expect(levelUp(poor, 'bulbasaur')).toBe(poor); // not owned
    // Spending every candy leaves no empty entry.
    const exact = levelUp({ ...poor, candies: { zubat: 3 } }, 'zubat');
    expect(exact.candies.zubat).toBeUndefined();
  });
});
