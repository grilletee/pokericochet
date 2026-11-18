import { describe, expect, it } from 'vitest';
import { gameConfig, STARTER_SPECIES } from '../../src/data';
import { createRng, createRun, nextFloat, nextInt, type RngState } from '../../src/domain';
import {
  addSeen,
  applyUpgrades,
  emptyProfile,
  exportProfile,
  importProfile,
  MAX_BANNER_KEYS,
  MAX_HISTORY,
  MAX_PERMANENT_LEVEL,
  migrateProfile,
  PROFILE_VERSION,
  type Profile,
  SAVE_MARK,
  startLevelFor,
} from '../../src/meta';

/** 4G-I, block 7 (Phase 5, ADR-025): the persistent profile, its versions and its migrations. */
const species = Object.keys(gameConfig.species);
const known = (id: string): boolean => gameConfig.species[id] !== undefined;
/** 4X: the classic starters every profile owns. */
const CLASSICS = STARTER_SPECIES;

/** A random JSON-like value: numbers of every kind, strings, lists, objects, null. */
function randomValue(rng: RngState, depth: number): unknown {
  const pick = nextInt(rng, depth > 2 ? 6 : 8);
  switch (pick) {
    case 0:
      return null;
    case 1:
      return [-5, 0, 3, 1e12, Number.NaN, 2.5, -0.1][nextInt(rng, 7)];
    case 2:
      return ['', 'x', 'charmander', 'pikachu', 'missingno', 'v'][nextInt(rng, 6)];
    case 3:
      return nextFloat(rng) < 0.5;
    case 4:
      return species[nextInt(rng, species.length)];
    case 5:
      return Array.from({ length: nextInt(rng, 4) }, () => randomValue(rng, depth + 1));
    default: {
      const keys = [
        'version',
        'coins',
        'owned',
        'candies',
        'seen',
        'gacha',
        'stats',
        'collection',
        // 4X: the captured bosses and the keys.
        'caught',
        'legend',
      ];
      const out: Record<string, unknown> = {};
      for (const key of keys) if (nextFloat(rng) < 0.6) out[key] = randomValue(rng, depth + 1);
      if (nextFloat(rng) < 0.5) {
        const owned: Record<string, unknown> = {};
        for (let i = 0; i < 3; i++) {
          owned[species[nextInt(rng, species.length)] ?? 'x'] = { level: randomValue(rng, 3) };
        }
        out.owned = owned;
      }
      return out;
    }
  }
}

/** Everything a valid profile of the current version must be. */
function expectValid(p: Profile): void {
  expect(p.version).toBe(PROFILE_VERSION);
  expect(Number.isInteger(p.coins) && p.coins >= 0).toBe(true);
  for (const [id, owned] of Object.entries(p.owned)) {
    expect(known(id)).toBe(true);
    expect(Number.isInteger(owned.level)).toBe(true);
    expect(owned.level).toBeGreaterThanOrEqual(1);
    expect(owned.level).toBeLessThanOrEqual(MAX_PERMANENT_LEVEL);
    expect(p.seen).toContain(id);
  }
  for (const [id, n] of Object.entries(p.candies)) {
    expect(known(id)).toBe(true);
    expect(Number.isInteger(n) && n > 0).toBe(true);
  }
  expect([...p.seen].sort()).toEqual(p.seen);
  expect(new Set(p.seen).size).toBe(p.seen.length);
  expect(p.gacha.seed).toBeGreaterThan(0);
  expect(Number.isInteger(p.gacha.draws) && p.gacha.draws >= 0).toBe(true);
  expect(Number.isInteger(p.gacha.pity5) && p.gacha.pity5 >= 0).toBe(true);
  expect(Number.isInteger(p.gacha.pity4) && p.gacha.pity4 >= 0).toBe(true);
  expect(Object.keys(p.gacha.banners).length).toBeLessThanOrEqual(MAX_BANNER_KEYS);
  expect(p.gacha.history.length).toBeLessThanOrEqual(MAX_HISTORY);
  for (const pull of p.gacha.history) {
    expect(known(pull.species)).toBe(true);
    expect([3, 4, 5, 6]).toContain(pull.stars);
  }
  // 4X: the captured bosses and the legendary keys.
  for (const [id, n] of Object.entries(p.caught)) {
    expect(known(id)).toBe(true);
    expect(Number.isInteger(n) && n > 0).toBe(true);
  }
  for (const n of [p.legend.fragments, p.legend.draws, p.legend.pity]) {
    expect(Number.isInteger(n) && n >= 0).toBe(true);
  }
}

describe('the profile and its migrations (property tests)', () => {
  it('any stored value becomes a valid profile of the current version, and never throws', () => {
    const rng = createRng(2026);
    for (let i = 0; i < 3000; i++) {
      const raw = randomValue(rng, 0);
      const profile = migrateProfile(raw, known, 77);
      if (profile === null) {
        // Only a profile of a NEWER version is refused.
        expect((raw as { version?: number }).version ?? 0).toBeGreaterThan(PROFILE_VERSION);
        continue;
      }
      expectValid(profile);
    }
  });

  it('migrating twice is migrating once (a saved profile reads back the same)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const once = migrateProfile(randomValue(rng, 0), known, 5);
      if (once === null) continue;
      const twice = migrateProfile(JSON.parse(JSON.stringify(once)), known, 999);
      expect(twice).toEqual(once);
    }
  });

  it('export and import give back the same profile', () => {
    const rng = createRng(11);
    for (let i = 0; i < 300; i++) {
      const p = migrateProfile(randomValue(rng, 0), known, 3);
      if (p === null) continue;
      const back = importProfile(exportProfile(p), known, 1234);
      expect(back).toEqual({ profile: p });
    }
    expect(importProfile('{bad', known, 1)).toHaveProperty('error');
    expect(importProfile('{"coins": 5}', known, 1)).toHaveProperty('error'); // not ours
    expect(importProfile(JSON.stringify({ game: SAVE_MARK, version: 99 }), known, 1)).toEqual({
      error: 'El guardado es de una versión más nueva del juego.',
    });
  });

  it('version 0 (no version, a plain list of species) migrates to version 1', () => {
    const p = migrateProfile(
      { coins: 120, collection: ['charmander', 'pikachu', 'missingno'] },
      known,
      9,
    );
    expect(p?.owned).toEqual({ charmander: { level: 1 }, pikachu: { level: 1 } });
    expect(p?.coins).toBe(120);
    expect(p?.firstStarterChosen).toBe(true);
    expect(p?.seen).toEqual(['charmander', 'pikachu']);
  });

  it('version 1 (4G-I) migrates to the current one: the collection stays, the pity starts at 0 (4G-J)', () => {
    const v1 = {
      version: 1,
      coins: 340,
      owned: { charmander: { level: 4 }, zubat: { level: 1 } },
      candies: { charmander: 7 },
      seen: ['charmander', 'zubat', 'pikachu'],
      firstStarterChosen: true,
      gacha: { seed: 991, draws: 17, sinceNew: 6 },
      stats: { runs: 5, wins: 1, bossesDefeated: 6 },
    };
    const p = migrateProfile(v1, known, 1);
    expect(p?.version).toBe(PROFILE_VERSION);
    expect(p?.owned).toEqual(v1.owned);
    expect(p?.candies).toEqual(v1.candies);
    expect(p?.coins).toBe(340);
    expect(p?.gacha).toEqual({
      seed: 991,
      draws: 17,
      pity5: 0,
      pity4: 0,
      banners: {},
      history: [],
    });
    expect(p?.stats).toEqual(v1.stats);
  });

  it('a lost 50/50 survives a save and a load; an older save owes nothing (4V)', () => {
    const p = emptyProfile(3);
    const saved: Profile = {
      ...p,
      gacha: {
        ...p.gacha,
        banners: {
          'type:fire:3': { draws: 12, won: false, owed: true },
          'gen:1:3': { draws: 4, won: true },
        },
      },
    };
    const back = migrateProfile(JSON.parse(JSON.stringify(saved)), known, 1);
    expect(back?.gacha.banners['type:fire:3']).toEqual({ draws: 12, won: false, owed: true });
    expect(back?.gacha.banners['gen:1:3']).toEqual({ draws: 4, won: true });
    // Garbage in the flag is not a debt.
    const odd = JSON.parse(JSON.stringify(saved));
    odd.gacha.banners['type:fire:3'].owed = 'yes';
    expect(migrateProfile(odd, known, 1)?.gacha.banners['type:fire:3']?.owed).toBeUndefined();
  });

  it('a newer version is refused; an empty store gives a new profile with the classics only', () => {
    expect(migrateProfile({ version: PROFILE_VERSION + 1, coins: 5 }, known, 1)).toBeNull();
    const fresh = emptyProfile(0);
    expectValid(fresh);
    expect(fresh.firstStarterChosen).toBe(false);
    expect(Object.keys(fresh.owned)).toHaveLength(0);
    // 4X (decision 4): a new player owns the four classics, and nothing else.
    const classic = emptyProfile(0, CLASSICS);
    expectValid(classic);
    expect(Object.keys(classic.owned).sort()).toEqual([...CLASSICS].sort());
    expect(migrateProfile(null, known, 0, CLASSICS)?.owned).toEqual(classic.owned);
  });

  it('4X: version 2 migrates to 3 without losing anything; the classics join; the old debts go', () => {
    const v2 = {
      version: 2,
      coins: 9100,
      owned: { bagon: { level: 6 }, zubat: { level: 2 }, charmander: { level: 9 } },
      candies: { bagon: 11, zubat: 3 },
      seen: ['bagon', 'zubat', 'charmander', 'rattata'],
      firstStarterChosen: true,
      gacha: {
        seed: 4242,
        draws: 210,
        pity5: 37,
        pity4: 4,
        banners: { 'type-fire@0': { draws: 30, won: false, owed: true } },
        history: [{ species: 'bagon', stars: 5, banner: 'Rugido', featured: true, n: 200 }],
      },
      stats: { runs: 40, wins: 3, bossesDefeated: 70 },
    };
    const p = migrateProfile(v2, known, 1, CLASSICS);
    if (p === null) throw new Error('migrates');
    expectValid(p);
    expect(p.version).toBe(3);
    // Nothing anyone had is lost: levels, candies, coins, the pity and the history.
    for (const [id, owned] of Object.entries(v2.owned)) expect(p.owned[id]).toEqual(owned);
    expect(p.candies).toEqual(v2.candies);
    expect(p.coins).toBe(9100);
    expect(p.gacha.pity5).toBe(37);
    expect(p.gacha.pity4).toBe(4);
    expect(p.gacha.draws).toBe(210);
    expect(p.gacha.history).toEqual(v2.gacha.history);
    expect(p.stats).toEqual(v2.stats);
    // The classics join (Charmander keeps its level 9); the old region and type debts go.
    for (const id of CLASSICS) expect(p.owned[id]).toBeDefined();
    expect(p.owned.charmander).toEqual({ level: 9 });
    expect(p.gacha.banners).toEqual({});
    // The new parts start empty.
    expect(p.caught).toEqual({});
    expect(p.legend).toEqual({ fragments: 0, draws: 0, pity: 0 });
    expect(p.firstStarterChosen).toBe(true);
  });

  it('4X (property): a migration never loses an owned Pokémon, its level, its candies or coins', () => {
    const rng = createRng(4242);
    for (let i = 0; i < 2000; i++) {
      const raw = randomValue(rng, 0);
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
      const record = raw as Record<string, unknown>;
      const version = typeof record.version === 'number' ? record.version : 0;
      const p = migrateProfile(raw, known, 3, CLASSICS);
      if (p === null) continue;
      expectValid(p);
      // Every classic is owned, whatever the save said.
      for (const id of CLASSICS) expect(p.owned[id]).toBeDefined();
      // A known species owned with a valid level keeps exactly that level.
      const owned = record.owned;
      if (version >= 1 && typeof owned === 'object' && owned !== null && !Array.isArray(owned)) {
        for (const [id, value] of Object.entries(owned as Record<string, unknown>)) {
          if (!known(id)) continue;
          const level = (value as { level?: unknown } | null)?.level;
          if (Number.isInteger(level) && (level as number) >= 1 && (level as number) <= 10) {
            expect(p.owned[id]?.level).toBe(level);
          } else {
            expect(p.owned[id]).toBeDefined();
          }
        }
      }
      // Valid coins are kept to the coin.
      if (Number.isInteger(record.coins) && (record.coins as number) >= 0) {
        expect(p.coins).toBe(Math.min(record.coins as number, 1_000_000_000));
      }
      // And migrating again changes nothing.
      expect(migrateProfile(JSON.parse(JSON.stringify(p)), known, 99, CLASSICS)).toEqual(p);
    }
  });

  it('4X: the captured bosses and the keys survive a save and a load, and garbage is dropped', () => {
    const p: Profile = {
      ...emptyProfile(5, CLASSICS),
      caught: { machop: 2, geodude: 1 },
      legend: { fragments: 4, draws: 3, pity: 2 },
    };
    const back = migrateProfile(JSON.parse(JSON.stringify(p)), known, 1, CLASSICS);
    expect(back?.caught).toEqual({ machop: 2, geodude: 1 });
    expect(back?.legend).toEqual({ fragments: 4, draws: 3, pity: 2 });
    const odd = JSON.parse(JSON.stringify(p));
    odd.caught = { machop: -3, missingno: 4, geodude: 'x' };
    odd.legend = { fragments: 'lots', pity: -1 };
    const fixed = migrateProfile(odd, known, 1, CLASSICS);
    expect(fixed?.caught).toEqual({});
    expect(fixed?.legend).toEqual({ fragments: 0, draws: 0, pity: 0 });
  });

  it('the Pokédex adds what was seen, once', () => {
    const p = addSeen(emptyProfile(1), ['pikachu', 'zubat', 'pikachu']);
    expect(p.seen).toEqual(['pikachu', 'zubat']);
    expect(addSeen(p, ['zubat'])).toBe(p);
  });
});

describe('aplicarMejoras: the only seam between the profile and the run (ADR-025)', () => {
  it('the starter begins at the level its permanent level gives: 1, 2 at 4, 3 at 7, 4 at 10', () => {
    expect([1, 3, 4, 6, 7, 9, 10].map(startLevelFor)).toEqual([1, 1, 2, 2, 3, 3, 4]);
  });

  it('without the starter in the collection the config is the very same object', () => {
    expect(applyUpgrades(gameConfig, emptyProfile(1), 'pikachu')).toBe(gameConfig);
  });

  it('it returns a new config and the shipped one is untouched; the run starts at that level', () => {
    const profile: Profile = { ...emptyProfile(1), owned: { pikachu: { level: 7 } } };
    const before = JSON.stringify(gameConfig.team);
    const upgraded = applyUpgrades(gameConfig, profile, 'pikachu');
    expect(JSON.stringify(gameConfig.team)).toBe(before);
    expect(upgraded.team.starterLevel).toBe(3);
    const run = createRun(upgraded, 5, 'pikachu');
    expect(run.team[0]?.level).toBe(3);
    // Same config, same seed: the same run (the profile changed nothing else).
    expect(createRun(upgraded, 5, 'pikachu').rng).toEqual(run.rng);
    expect(createRun(gameConfig, 5, 'pikachu').team[0]?.level).toBe(1);
  });
});
