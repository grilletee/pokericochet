import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import { createRun, hashRun, type RunSummary, summarizeRun } from '../../src/domain';
import {
  COINS_FOR_WIN,
  COINS_PER_BOSS,
  COINS_PER_WAVE,
  coinsFor,
  drawGacha,
  emptyProfile,
  GACHA_COST,
  gachaPool,
  PITY,
  type Profile,
  REPEAT_CANDIES,
  recordRun,
} from '../../src/meta';

/** 4G-I, block 9 (Phase 5): the coins of a run and the gacha with its guarantee. */
const pool = gachaPool(gameConfig);

const rich = (seed: number, coins = 1e7): Profile => ({ ...emptyProfile(seed), coins });

describe('the pool of the gacha', () => {
  it('is the first of every line of the roster, without legendaries', () => {
    expect(pool.length).toBeGreaterThan(150);
    for (const final of gameConfig.boss?.finals ?? []) expect(pool).not.toContain(final);
    expect(pool).toContain('charmander');
    expect(pool).not.toContain('charizard');
    expect([...pool].sort()).toEqual(pool);
  });
});

describe('the gacha (property tests)', () => {
  it('never goes PITY draws in a row with nothing new while something new is left', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let p = rich(seed);
      let dry = 0;
      for (let i = 0; i < 400; i++) {
        const left = pool.filter((id) => p.owned[id] === undefined).length;
        const r = drawGacha(p, pool);
        if (!r.ok) throw new Error('no draw');
        if (r.isNew) dry = 0;
        else dry += 1;
        if (left > 0) expect(dry).toBeLessThan(PITY);
        p = r.profile;
      }
    }
  });

  it('a new Pokémon joins the collection; a repeat gives candies; every draw costs the same', () => {
    let p = rich(3, GACHA_COST * 50);
    for (let i = 0; i < 50; i++) {
      const r = drawGacha(p, pool);
      if (!r.ok) throw new Error('no draw');
      expect(r.profile.coins).toBe(p.coins - GACHA_COST);
      expect(r.profile.gacha.draws).toBe(p.gacha.draws + 1);
      if (r.isNew) {
        expect(p.owned[r.species]).toBeUndefined();
        expect(r.profile.owned[r.species]).toEqual({ level: 1 });
        expect(r.profile.gacha.sinceNew).toBe(0);
      } else {
        expect(r.candies).toBe(REPEAT_CANDIES);
        expect(r.profile.candies[r.species]).toBe((p.candies[r.species] ?? 0) + REPEAT_CANDIES);
        expect(r.profile.gacha.sinceNew).toBe(p.gacha.sinceNew + 1);
      }
      expect(r.profile.seen).toContain(r.species);
      p = r.profile;
    }
    const poor = drawGacha(rich(3, GACHA_COST - 1), pool);
    expect(poor).toEqual({ ok: false, reason: 'coins' });
  });

  it('is a pure function of the profile: the same profile, the same draw; another seed, another', () => {
    const a = drawGacha(rich(10), pool);
    const b = drawGacha(rich(10), pool);
    expect(a).toEqual(b);
    const species = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const r = drawGacha(rich(seed), pool);
      if (r.ok) species.add(r.species);
    }
    expect(species.size).toBeGreaterThan(15);
  });

  it('with the whole pool owned it keeps giving candies, and never breaks', () => {
    const owned = Object.fromEntries(pool.map((id) => [id, { level: 1 }]));
    let p: Profile = { ...rich(4), owned, firstStarterChosen: true };
    for (let i = 0; i < 30; i++) {
      const r = drawGacha(p, pool);
      if (!r.ok) throw new Error('no draw');
      expect(r.isNew).toBe(false);
      p = r.profile;
    }
  });

  it('it never touches a run: a run made after drawing is the very same run', () => {
    const before = hashRun(createRun(gameConfig, 42, 'charmander'));
    let p = rich(42);
    for (let i = 0; i < 20; i++) {
      const r = drawGacha(p, pool);
      if (r.ok) p = r.profile;
    }
    expect(hashRun(createRun(gameConfig, 42, 'charmander'))).toBe(before);
  });
});

describe('the coins of a run (a pure function of its summary)', () => {
  const summary = (over: Partial<RunSummary>): RunSummary => ({
    ...summarizeRun(createRun(gameConfig, 1, 'pikachu'), gameConfig),
    ...over,
  });

  it('waves, bosses, the victory and the enemies count', () => {
    expect(
      coinsFor(summary({ wavesCleared: 0, bossesDefeated: 0, kills: 0, result: 'lost' })),
    ).toBe(0);
    expect(
      coinsFor(summary({ wavesCleared: 3, bossesDefeated: 1, kills: 45, result: 'lost' })),
    ).toBe(3 * COINS_PER_WAVE + COINS_PER_BOSS + 2);
    const win = coinsFor(
      summary({ wavesCleared: 7, bossesDefeated: 4, kills: 300, result: 'won' }),
    );
    expect(win).toBe(7 * COINS_PER_WAVE + 4 * COINS_PER_BOSS + COINS_FOR_WIN + 15);
    // A good run buys at least one draw; a won run, two.
    expect(win).toBeGreaterThanOrEqual(2 * GACHA_COST);
  });

  it('the profile keeps the coins and the numbers of every run', () => {
    const p = recordRun(
      emptyProfile(1),
      summary({ wavesCleared: 2, bossesDefeated: 1, result: 'won' }),
    );
    expect(p.coins).toBe(coinsFor(summary({ wavesCleared: 2, bossesDefeated: 1, result: 'won' })));
    expect(p.stats).toEqual({ runs: 1, wins: 1, bossesDefeated: 1 });
  });
});
