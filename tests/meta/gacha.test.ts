import { describe, expect, it } from 'vitest';
import {
  BANNER_NAMES,
  BANNER_ROTATION,
  FIVE_STAR_LINES,
  GACHA_RULES,
  type GachaRules,
  gameConfig,
  generationOf,
  LEGENDARY_SPECIES,
  POKEDEX_IDS,
  PSEUDO_LINES,
  SHOWCASE_LINES,
  STARTER_LINES,
  STARTER_SPECIES,
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
  legendBanner,
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
const input = {
  rotation: BANNER_ROTATION,
  names: BANNER_NAMES,
  pseudo: PSEUDO_LINES,
  starters: STARTER_LINES.filter((id) => !STARTER_SPECIES.includes(id)),
  showcase: SHOWCASE_LINES,
  legends: LEGENDARY_SPECIES,
  showcaseShare: GACHA_RULES.showcase4Share,
};
const today = BANNER_ROTATION.epochDay + 3;
const banners = activeBanners(catalog, input, today);
const standard = banners[0] as Banner;
/** The weekly banners with a featured ★5: the pseudo-legendary and the starter of the week. */
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

  it('4X: a pseudo-legendary, a starter and two "con estilo" a week, each of its family', () => {
    expect(banners.map((b) => b.kind)).toEqual(['standard', 'pseudo', 'starter', 'showcase']);
    const [, pseudo, starter, showcase] = banners as [Banner, Banner, Banner, Banner];
    expect(PSEUDO_LINES).toContain(pseudo.featured5[0]);
    expect(STARTER_LINES).toContain(starter.featured5[0]);
    // The four classics are everyone's: never the starter of the week.
    expect(STARTER_SPECIES).not.toContain(starter.featured5[0]);
    for (const b of [pseudo, starter]) {
      expect(b.family).toBe(b.kind);
      expect(b.featured5).toHaveLength(1);
      expect(starsOf.get(b.featured5[0] ?? '')).toBe(5);
      expect(b.featured4).toHaveLength(BANNER_ROTATION.featured4);
      for (const s of b.featured4) expect(starsOf.get(s)).toBe(4);
      expect(b.pool[5]).not.toContain(b.featured5[0]);
      expect(b.endsInDays).toBeGreaterThan(0);
      expect(b.endsInDays).toBeLessThanOrEqual(BANNER_ROTATION.periodDays);
    }
    // The showcase: two hand-picked lines of ★4, featured more often than the usual ★4.
    expect(showcase.featured5).toEqual([]);
    expect(showcase.featured4).toHaveLength(BANNER_ROTATION.showcase);
    for (const s of showcase.featured4) {
      expect(SHOWCASE_LINES).toContain(s);
      expect(starsOf.get(s)).toBe(4);
    }
    expect(showcase.featured4Share).toBe(GACHA_RULES.showcase4Share);
  });

  it('rotate by the week of the real date: the same week, the same banners; every pseudo comes', () => {
    expect(activeBanners(catalog, input, today)).toEqual(banners);
    const pseudos = new Set<string>();
    const starters = new Set<string>();
    for (let week = 0; week < 40; week++) {
      const day = BANNER_ROTATION.epochDay + week * BANNER_ROTATION.periodDays;
      const open = activeBanners(catalog, input, day);
      for (const b of open) {
        if (b.kind === 'pseudo') pseudos.add(b.featured5[0] ?? '');
        if (b.kind === 'starter') starters.add(b.featured5[0] ?? '');
      }
      // Within one week the banners do not change (only the days left do).
      expect(activeBanners(catalog, input, day + BANNER_ROTATION.periodDays - 1)).toEqual(
        open.map((b) => ({ ...b, endsInDays: b.endsInDays === null ? null : 1 })),
      );
      // And the next week brings another pseudo-legendary.
      const next = activeBanners(catalog, input, day + BANNER_ROTATION.periodDays);
      expect(next[1]?.featured5).not.toEqual(open[1]?.featured5);
    }
    expect(pseudos.size).toBe(PSEUDO_LINES.filter((id) => starsOf.get(id) === 5).length);
    expect(starters.size).toBeGreaterThan(20);
  });

  it('the legendary banner: one legendary a week, never in the coin banners', () => {
    const legend = legendBanner(catalog, input, today);
    expect(legend).not.toBeNull();
    expect(LEGENDARY_SPECIES).toContain(legend?.featured);
    for (const b of banners) {
      for (const list of [b.featured5, b.featured4, b.pool[3], b.pool[4], b.pool[5]]) {
        for (const s of list) expect(LEGENDARY_SPECIES).not.toContain(s);
      }
    }
    const next = legendBanner(catalog, input, today + BANNER_ROTATION.periodDays);
    expect(next?.featured).not.toBe(legend?.featured);
  });

  it('the showcase features only ★4, whatever its hand-picked list holds', () => {
    // A list with fan favourites of ★3 among them: those are never its featured ★4.
    const threes = catalog.filter((e) => e.stars === 3).map((e) => e.species);
    const mixed = { ...input, showcase: [...threes.slice(0, 12), ...SHOWCASE_LINES] };
    let weeks = 0;
    for (let w = 0; w < 40; w++) {
      const showcase = activeBanners(catalog, mixed, today + w * BANNER_ROTATION.periodDays).find(
        (b) => b.kind === 'showcase',
      );
      if (showcase === undefined) throw new Error('the showcase is always open');
      weeks += 1;
      for (const s of showcase.featured4) expect(starsOf.get(s), `week ${w}: ${s}`).toBe(4);
    }
    expect(weeks).toBe(40);
  });

  it("the showcase's own share of featured ★4 is the one that counts, not the general one", () => {
    const showcase = banners.find((b) => b.kind === 'showcase');
    if (showcase === undefined) throw new Error('the showcase is open');
    expect(showcase.featured4Share).not.toBe(rules.featured4Share);
    // At the two ends the share decides every ★4 alone: always featured, never featured.
    const BP = 10_000;
    for (const [share, expected] of [
      [BP, true],
      [0, false],
    ] as const) {
      let fours = 0;
      drawMany(rich(11), { ...showcase, featured4Share: share }, 300, (pull) => {
        if (pull.stars !== 4) return;
        fours += 1;
        expect(showcase.featured4.includes(pull.species)).toBe(expected);
        expect(pull.featured).toBe(expected);
      });
      expect(fours).toBeGreaterThan(20);
    }
  });
});

// Thousands of draws per test: slow under the parallel suite (4X: they timed out at 5 s).
describe('the guarantees (property tests, thousands of sequences)', { timeout: 60_000 }, () => {
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

  it('4X: the featured ★5 comes within two hard pities, always, even when the weeks change', () => {
    // The banners of the weeks the draws cross (a new week every 20 draws).
    const weeks = Array.from({ length: Math.ceil((2 * rules.hardAt) / 20) }, (_, w) =>
      activeBanners(catalog, input, today + w * BANNER_ROTATION.periodDays),
    );
    for (let seed = 1; seed <= 300; seed++) {
      let p = rich(seed * 104729);
      let got = -1;
      for (let i = 0; i < 2 * rules.hardAt && got < 0; i++) {
        // The banner (and its featured one) changes with the week; the debt stays.
        const week = weeks[Math.floor(i / 20)] ?? [];
        const banner = week.find((b) => b.kind === (seed % 2 === 0 ? 'pseudo' : 'starter'));
        if (banner === undefined) throw new Error('weekly banner');
        const out = drawGacha(p, banner, rules);
        if (!out.ok) throw new Error(out.reason);
        p = out.profile;
        const pull = out.pulls[0];
        if (pull?.stars === 5 && pull.featured) {
          got = i;
          expect(banner.featured5).toContain(pull.species);
        }
      }
      expect(got).toBeGreaterThanOrEqual(0);
      expect(got).toBeLessThan(2 * rules.hardAt);
    }
  }, 60_000);

  it("the pity is shared: draws on one banner count on another; the progress is the family's", () => {
    const [a, b] = limited as [Banner, Banner];
    let p = drawMany(rich(5), a, 30, () => {});
    const pity = p.gacha.pity5;
    expect(pityView(p, b, rules).sinceFive).toBe(pity);
    expect(pityView(p, b, rules).worstToFeatured).toBe(rules.hardAt - pity + rules.hardAt);
    p = drawMany(p, b, 1, () => {});
    expect(p.gacha.banners[b.family ?? '']?.draws).toBe(1);
    expect(p.gacha.banners[a.family ?? '']?.draws).toBe(30);
    expect(p.gacha.banners[b.key]).toBeUndefined();
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
    // 4V: a lost 50/50 is paid back, so in the long run two ★5 of three are the featured one
    // (a chain lost / won / won-or-lost: 1/3 owed, 2/3 at 50 %).
    expect(featured / fives).toBeGreaterThan(0.58);
    expect(featured / fives).toBeLessThan(0.76);
  });

  it('without the payback (a rule of the data) the 50/50 is half and half again', () => {
    const plain: GachaRules = { ...rules, lostHalfPaysBack: false };
    let fives = 0;
    let featured = 0;
    for (let seed = 1; seed <= 40; seed++) {
      drawMany(
        rich(seed * 31),
        limited[0] as Banner,
        200,
        (pull) => {
          if (pull.stars !== 5) return;
          fives += 1;
          if (pull.featured) featured += 1;
        },
        plain,
      );
    }
    expect(featured / fives).toBeGreaterThan(0.4);
    expect(featured / fives).toBeLessThan(0.62);
  });

  it('after a lost 50/50, the next ★5 on that banner is ALWAYS the featured one (property)', () => {
    let losses = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const banner = limited[seed % limited.length] as Banner;
      let owed = false;
      drawMany(rich(seed * 7727), banner, 260, (pull) => {
        if (pull.stars !== 5) return;
        if (owed) expect(pull.featured).toBe(true);
        owed = !pull.featured;
        if (owed) losses += 1;
      });
    }
    // The property was really put to the test: hundreds of lost 50/50.
    expect(losses).toBeGreaterThan(200);
  }, 60_000);

  it('the debt is of its family: a ★5 on another family does not pay it nor open it there', () => {
    const [a, b] = limited as [Banner, Banner];
    // Find a seed that loses the 50/50 on `a` at its first ★5.
    for (let seed = 1; seed <= 400; seed++) {
      let p = rich(seed * 53);
      let lost = false;
      for (let i = 0; i < 90 && !lost; i++) {
        const out = drawGacha(p, a, rules);
        if (!out.ok) throw new Error(out.reason);
        p = out.profile;
        const pull = out.pulls[0];
        if (pull?.stars === 5) {
          if (pull.featured) break;
          lost = true;
        }
      }
      if (!lost) continue;
      expect(pityView(p, a, rules).featuredOwed).toBe(true);
      expect(pityView(p, b, rules).featuredOwed).toBe(false);
      // Draw on `b` until its ★5: `a` still owes it.
      for (let i = 0; i < 90; i++) {
        const out = drawGacha(p, b, rules);
        if (!out.ok) throw new Error(out.reason);
        p = out.profile;
        if (out.pulls[0]?.stars === 5) break;
      }
      expect(pityView(p, a, rules).featuredOwed).toBe(true);
      // 4X: next week's banner of the same family owes it too, with its own featured one.
      const nextWeek = activeBanners(catalog, input, today + BANNER_ROTATION.periodDays).find(
        (x) => x.family === a.family,
      ) as Banner;
      expect(nextWeek.featured5).not.toEqual(a.featured5);
      expect(pityView(p, nextWeek, rules).featuredOwed).toBe(true);
      // And there the next ★5 is its featured one, which settles the debt.
      for (let i = 0; i < 90; i++) {
        const out = drawGacha(p, nextWeek, rules);
        if (!out.ok) throw new Error(out.reason);
        p = out.profile;
        const pull = out.pulls[0];
        if (pull?.stars === 5) {
          expect(pull.featured).toBe(true);
          expect(nextWeek.featured5).toContain(pull.species);
          break;
        }
      }
      expect(pityView(p, a, rules).featuredOwed).toBe(false);
      return;
    }
    throw new Error('no seed lost the 50/50');
  });

  it('the standard banner never owes anything', () => {
    let p = rich(99);
    p = drawMany(p, standard, 300, () => {});
    expect(pityView(p, standard, rules).featuredOwed).toBe(false);
    expect(p.gacha.banners[standard.key]).toBeUndefined();
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
    // 4X (a scarce economy): a won run pays for about four draws, never for a x10.
    expect(win).toBeGreaterThanOrEqual(rules.cost * 3);
    expect(win).toBeLessThan(rules.cost * rules.multi * 0.6);
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
