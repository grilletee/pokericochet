import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { createRng, createRun, nextFloat, nextInt, type RngState } from '../../src/domain';
import {
  addSeen,
  applyUpgrades,
  emptyProfile,
  exportProfile,
  importProfile,
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
      const keys = ['version', 'coins', 'owned', 'candies', 'seen', 'gacha', 'stats', 'collection'];
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
  expect(Number.isInteger(p.gacha.sinceNew) && p.gacha.sinceNew >= 0).toBe(true);
  if (Object.keys(p.owned).length > 0) expect(p.firstStarterChosen).toBe(true);
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

  it('a newer version is refused; an empty store gives a new profile with nothing owned', () => {
    expect(migrateProfile({ version: PROFILE_VERSION + 1, coins: 5 }, known, 1)).toBeNull();
    const fresh = emptyProfile(0);
    expectValid(fresh);
    expect(fresh.firstStarterChosen).toBe(false);
    expect(Object.keys(fresh.owned)).toHaveLength(0);
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
