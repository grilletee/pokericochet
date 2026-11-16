import { describe, expect, it } from 'vitest';
import {
  BANNER_ROTATION,
  FIVE_STAR_LINES,
  GACHA_RULES,
  type GachaRules,
  gameConfig,
  generationOf,
  POKEDEX_IDS,
  REGIONS,
  TYPE_BANNER_NAMES,
} from '../../src/data';
import { createRun, hashRun, type RunSummary, summarizeRun } from '../../src/domain';
import {
  activeBanners,
  type Banner,
  buildCatalog,
  CANDIES_PER_BOSS,
  CANDIES_PER_RUN,
  COINS_FOR_WIN,
  COINS_PER_BOSS,
  COINS_PER_WAVE,
  candiesFor,
  coinsFor,
  drawGacha,
  emptyProfile,
  fiveChance,
  gachaPool,
  KILLS_PER_COIN,
  type Profile,
  pityView,
  rateTable,
  recordRun,
} from '../../src/meta';

/** 4G-J, block 1 (ADR-057): rarities, guarantees, banners and the coins of a run. */
const rules = GACHA_RULES;
const catalog = buildCatalog(gameConfig, {
  rules,
  fiveStar: FIVE_STAR_LINES,
  dexOf: (id) => POKEDEX_IDS[id] ?? 0,
  genOf: generationOf,
});
const starsOf = new Map(catalog.map((e) => [e.species, e.stars]));
const input = { regions: REGIONS, typeNames: TYPE_BANNER_NAMES, rotation: BANNER_ROTATION };
const today = BANNER_ROTATION.epochDay + 3;
const banners = activeBanners(catalog, input, today);
const standard = banners[0] as Banner;
const limited = banners.filter((b) => b.featured5.length > 0);

const rich = (seed: number, coins = 1e9): Profile => ({ ...emptyProfile(seed), coins });

/** Draws `n` times one at a time, calling `see` with every pull. */
function drawMany(
  start: Profile,
  banner: Banner,
  n: number,
  see: (pull: { stars: number; featured: boolean; species: string }, i: number) => void,
  r: GachaRules = rules,
): Profile {
  let p = start;
  for (let i = 0; i < n; i++) {
    const out = drawGacha(p, banner, r);
    if (!out.ok) throw new Error(`no draw: ${out.reason}`);
    for (const pull of out.pulls) see(pull, i);
    p = out.profile;
  }
  return p;
}

describe('the catalogue of the gacha', () => {
  it('is the first of every line, without legendaries, each with its stars', () => {
    expect(catalog.length).toBe(gachaPool(gameConfig).length);
    for (const final of gameConfig.boss?.finals ?? []) expect(starsOf.has(final)).toBe(false);
    expect(starsOf.get('charmander')).toBe(5);
    expect(starsOf.get('dratini')).toBe(5);
    expect(starsOf.get('magikarp')).toBe(4); // Gyarados is strong
    expect(starsOf.get('caterpie')).toBe(3);
    expect(starsOf.has('charizard')).toBe(false);
    const count = (s: number): number => catalog.filter((e) => e.stars === s).length;
    // Commons are the most, then ★4, then ★5.
    expect(count(3)).toBeGreaterThan(count(4));
    expect(count(4)).toBeGreaterThan(count(5));
    for (const e of catalog) expect(e.gen).toBeGreaterThan(0);
  });
});

describe('the banners', () => {
  it('the standard one is always there, first, with the whole catalogue and nothing featured', () => {
    expect(standard.kind).toBe('standard');
    expect(standard.featured5).toEqual([]);
    expect(standard.endsInDays).toBeNull();
    const all = [...standard.pool[3], ...standard.pool[4], ...standard.pool[5]].sort();
    expect(all).toEqual(catalog.map((e) => e.species).sort());
  });

  it('a region and two types at once, each with one featured ★5 and 1-2 ★4 of its theme', () => {
    expect(limited.map((b) => b.kind)).toEqual(['region', 'type', 'type']);
    for (const b of limited) {
      expect(b.featured5).toHaveLength(1);
      expect(b.featured4.length).toBeGreaterThanOrEqual(1);
      expect(b.featured4.length + b.featured5.length).toBeLessThanOrEqual(3);
      for (const s of b.featured5) expect(starsOf.get(s)).toBe(5);
      for (const s of b.featured4) expect(starsOf.get(s)).toBe(4);
      const theme = catalog.filter((e) =>
        b.kind === 'region' ? e.gen === b.gen : e.types.includes(b.type ?? 'normal'),
      );
      for (const s of [...b.featured5, ...b.featured4]) {
        expect(theme.map((e) => e.species)).toContain(s);
      }
      expect(b.pool[5]).not.toContain(b.featured5[0]);
      expect(b.endsInDays).toBeGreaterThan(0);
      expect(b.endsInDays).toBeLessThanOrEqual(BANNER_ROTATION.periodDays);
    }
    expect(new Set(limited.map((b) => b.key)).size).toBe(3);
  });

  it('rotate: the same day gives the same banners; over the weeks every region comes', () => {
    expect(activeBanners(catalog, input, today)).toEqual(banners);
    const seen = new Set<number>();
    const featured = new Set<string>();
    for (let week = 0; week < 40; week++) {
      const day = BANNER_ROTATION.epochDay + week * BANNER_ROTATION.periodDays;
      const open = activeBanners(catalog, input, day);
      for (const b of open) if (b.gen !== undefined) seen.add(b.gen);
      for (const b of open) for (const s of b.featured5) featured.add(s);
      // Within one period the banners do not change.
      expect(activeBanners(catalog, input, day + BANNER_ROTATION.periodDays - 1)).toEqual(
        open.map((b) => ({ ...b, endsInDays: b.endsInDays === null ? null : 1 })),
      );
    }
    const regions = new Set(catalog.map((e) => e.gen));
    expect(seen.size).toBe(regions.size);
    expect(featured.size).toBeGreaterThan(8);
  });
});

describe('the guarantees (property tests, thousands of sequences)', () => {
  it('never more than `hardAt` draws without a ★5, nor `fourEvery` without a ★4 or better', () => {
    let longest5 = 0;
    let longest4 = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const banner = seed % 2 === 0 ? standard : (limited[seed % limited.length] as Banner);
      let since5 = 0;
      let since4 = 0;
      drawMany(rich(seed * 7919), banner, 400, (pull) => {
        since5 = pull.stars === 5 ? 0 : since5 + 1;
        since4 = pull.stars >= 4 ? 0 : since4 + 1;
        longest5 = Math.max(longest5, since5);
        longest4 = Math.max(longest4, since4);
        expect(since5).toBeLessThan(rules.hardAt);
        expect(since4).toBeLessThan(rules.fourEvery);
      });
    }
    // The hard pity is reached sometimes (the guarantee is real, not just luck).
    expect(longest5).toBeGreaterThan(rules.softFrom);
    expect(longest4).toBe(rules.fourEvery - 1);
  });

  it('the featured ★5 of a limited banner comes within `featuredAt` draws on it, always', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const banner = limited[seed % limited.length] as Banner;
      let got = -1;
      drawMany(rich(seed * 104729), banner, rules.featuredAt, (pull, i) => {
        if (got < 0 && pull.stars === 5 && pull.featured) got = i;
      });
      expect(got).toBeGreaterThanOrEqual(0);
      expect(got).toBeLessThan(rules.featuredAt);
    }
  });

  it('the pity is shared: draws on one banner count on another', () => {
    const [a, b] = limited as [Banner, Banner];
    let p = drawMany(rich(5), a, 30, () => {});
    const pity = p.gacha.pity5;
    expect(pityView(p, b, rules).sinceFive).toBe(pity);
    // ...but the featured guarantee belongs to each banner.
    expect(pityView(p, b, rules).toFeatured).toBe(rules.featuredAt);
    p = drawMany(p, b, 1, () => {});
    expect(p.gacha.banners[b.key]?.draws).toBe(1);
  });

  it('a ★5 is the featured one about half the time on a limited banner (the 50/50)', () => {
    let fives = 0;
    let featured = 0;
    for (let seed = 1; seed <= 40; seed++) {
      drawMany(rich(seed * 31), limited[0] as Banner, 200, (pull) => {
        if (pull.stars !== 5) return;
        fives += 1;
        if (pull.featured) featured += 1;
      });
    }
    expect(fives).toBeGreaterThan(100);
    expect(featured / fives).toBeGreaterThan(0.4);
    expect(featured / fives).toBeLessThan(0.7); // a bit over half: the 120 guarantee adds some
  });

  it('the long-run rates match the table the screen shows', () => {
    const table = rateTable(rules);
    let n = 0;
    const got = { 3: 0, 4: 0, 5: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      drawMany(rich(seed * 613), standard, 500, (pull) => {
        n += 1;
        got[pull.stars as 3 | 4 | 5] += 1;
      });
    }
    expect(got[5] / n).toBeGreaterThan(table.overall[5] * 0.8);
    expect(got[5] / n).toBeLessThan(table.overall[5] * 1.2);
    expect(got[4] / n).toBeGreaterThan(table.overall[4] * 0.9);
    expect(got[4] / n).toBeLessThan(table.overall[4] * 1.1);
    expect(table.overall[3] + table.overall[4] + table.overall[5]).toBeCloseTo(1, 9);
    // The pity makes the ★5 more common than its base chance.
    expect(table.overall[5]).toBeGreaterThan(table.base[5]);
    expect(table.drawsPerFive).toBeLessThan(rules.hardAt);
  });

  it('a ★5 also resets the ★4 counter (it is "a ★4 or better"); a ★3 adds to both', () => {
    let fives = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let p = rich(seed * 2203);
      for (let i = 0; i < 150; i++) {
        const before = p.gacha;
        const out = drawGacha(p, standard, rules);
        if (!out.ok) throw new Error(out.reason);
        const stars = out.pulls[0]?.stars;
        p = out.profile;
        if (stars === 5) {
          fives += 1;
          expect(p.gacha.pity4).toBe(0);
          expect(p.gacha.pity5).toBe(0);
        } else if (stars === 3) {
          expect(p.gacha.pity4).toBe(before.pity4 + 1);
          expect(p.gacha.pity5).toBe(before.pity5 + 1);
        }
      }
    }
    expect(fives).toBeGreaterThan(20);
  });

  it('the soft pity raises the chance step by step up to certain', () => {
    expect(fiveChance(rules, 1)).toBe(rules.rate5);
    expect(fiveChance(rules, rules.softFrom - 1)).toBe(rules.rate5);
    expect(fiveChance(rules, rules.softFrom)).toBe(rules.rate5 + rules.softStep);
    expect(fiveChance(rules, rules.softFrom + 2)).toBe(rules.rate5 + 3 * rules.softStep);
    expect(fiveChance(rules, rules.hardAt)).toBe(10_000);
    for (let n = 1; n < rules.hardAt; n++) {
      expect(fiveChance(rules, n + 1)).toBeGreaterThanOrEqual(fiveChance(rules, n));
    }
  });
});

describe('a draw', () => {
  it('a x10 is exactly ten draws of one, and costs ten', () => {
    const one = rich(77, rules.cost * rules.multi);
    const ten = drawGacha(one, limited[1] as Banner, rules, rules.multi);
    if (!ten.ok) throw new Error('no x10');
    expect(ten.pulls).toHaveLength(rules.multi);
    expect(ten.profile.coins).toBe(0);
    const singles: string[] = [];
    const end = drawMany(one, limited[1] as Banner, rules.multi, (pull) =>
      singles.push(pull.species),
    );
    expect(ten.pulls.map((p) => p.species)).toEqual(singles);
    expect(ten.profile).toEqual(end);
    expect(drawGacha(rich(1, rules.cost * rules.multi - 1), standard, rules, rules.multi)).toEqual({
      ok: false,
      reason: 'coins',
    });
  });

  it('a new one joins the collection; a repeat gives candies by its stars; the history keeps it', () => {
    let p = rich(3);
    for (let i = 0; i < 300; i++) {
      const out = drawGacha(p, standard, rules);
      if (!out.ok) throw new Error('no draw');
      const pull = out.pulls[0];
      if (pull === undefined) throw new Error('no pull');
      expect(starsOf.get(pull.species)).toBe(pull.stars);
      if (pull.isNew) {
        expect(p.owned[pull.species]).toBeUndefined();
        expect(out.profile.owned[pull.species]).toEqual({ level: 1 });
        expect(pull.candies).toBe(0);
      } else {
        expect(pull.candies).toBe(rules.repeatCandies[pull.stars]);
        expect(out.profile.candies[pull.species]).toBe(
          (p.candies[pull.species] ?? 0) + pull.candies,
        );
      }
      expect(out.profile.seen).toContain(pull.species);
      expect(out.profile.gacha.history[0]).toEqual({
        species: pull.species,
        stars: pull.stars,
        banner: standard.name,
        featured: false,
        n: p.gacha.draws + 1,
      });
      p = out.profile;
    }
    expect(p.gacha.history).toHaveLength(rules.historySize);
  });

  it('is a pure function of the profile and never touches a run', () => {
    const before = hashRun(createRun(gameConfig, 42, 'charmander'));
    const a = drawGacha(rich(10), limited[0] as Banner, rules, 10);
    const b = drawGacha(rich(10), limited[0] as Banner, rules, 10);
    expect(a).toEqual(b);
    expect(hashRun(createRun(gameConfig, 42, 'charmander'))).toBe(before);
  });

  it('with everything owned it keeps giving candies, and never breaks', () => {
    const owned = Object.fromEntries(catalog.map((e) => [e.species, { level: 1 }]));
    const p: Profile = { ...rich(4), owned, firstStarterChosen: true };
    drawMany(p, standard, 30, (pull) => expect(pull.featured).toBe(false));
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
    ).toBe(3 * COINS_PER_WAVE + COINS_PER_BOSS + Math.floor(45 / KILLS_PER_COIN));
    const win = coinsFor(
      summary({ wavesCleared: 7, bossesDefeated: 4, kills: 300, result: 'won' }),
    );
    expect(win).toBe(
      7 * COINS_PER_WAVE + 4 * COINS_PER_BOSS + COINS_FOR_WIN + Math.floor(300 / KILLS_PER_COIN),
    );
    // A won run pays for about a x10.
    expect(win).toBeGreaterThanOrEqual(rules.cost * rules.multi * 0.8);
  });

  it('the profile keeps the coins and the numbers of every run', () => {
    const p = recordRun(
      emptyProfile(1),
      summary({ wavesCleared: 2, bossesDefeated: 1, result: 'won' }),
    );
    expect(p.coins).toBe(coinsFor(summary({ wavesCleared: 2, bossesDefeated: 1, result: 'won' })));
    expect(p.stats).toEqual({ runs: 1, wins: 1, bossesDefeated: 1 });
  });

  it('the starter earns candies by playing (4G-J): per run once a wave is cleared, and per boss', () => {
    expect(candiesFor(summary({ wavesCleared: 0, bossesDefeated: 0 }))).toBe(0);
    expect(candiesFor(summary({ wavesCleared: 1, bossesDefeated: 0 }))).toBe(CANDIES_PER_RUN);
    expect(candiesFor(summary({ wavesCleared: 6, bossesDefeated: 3 }))).toBe(
      CANDIES_PER_RUN + 3 * CANDIES_PER_BOSS,
    );
    const mine: Profile = { ...emptyProfile(1), owned: { charmander: { level: 1 } } };
    const played = summary({ wavesCleared: 4, bossesDefeated: 2 });
    const after = recordRun(mine, played, 'charmander');
    expect(after.candies.charmander).toBe(candiesFor(played));
    // A Pokémon that is not in the collection earns nothing (and nothing else changes).
    expect(recordRun(mine, played, 'zubat').candies).toEqual({});
    expect(recordRun(mine, played).candies).toEqual({});
  });
});
