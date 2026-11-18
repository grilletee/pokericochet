import { describe, expect, it } from 'vitest';
import {
  BANNER_NAMES,
  BANNER_ROTATION,
  FIVE_STAR_LINES,
  GACHA_RULES,
  gameConfig,
  generationOf,
  LEGENDARY_SPECIES,
  POKEDEX_IDS,
  PSEUDO_LINES,
  SHOWCASE_LINES,
  STARTER_LINES,
  STARTER_SPECIES,
} from '../../src/data';
import { createRun, type RunSummary, summarizeRun } from '../../src/domain';
import {
  activeBanners,
  buildCatalog,
  CAUGHT_CANDIES,
  coinsFor,
  drawGacha,
  drawLegend,
  economyPlan,
  emptyProfile,
  FRAGMENTS_PER_LEGEND,
  featuredDrawDistribution,
  featuredDrawsMean,
  featuredDrawsQuantile,
  featuredDrawsWorst,
  legendBanner,
  legendChance,
  legendView,
  type Profile,
  RUNS_PER_DAY,
  recordRun,
  rewardsFor,
} from '../../src/meta';

/**
 * 4X, block 2: the scarce economy (decision 3: the featured ★5 for sure in ~3 weeks of 4 runs a
 * day), the legendary keys (★6, own pity) and what a run leaves. Property tests over thousands of
 * draws, and the numbers of the economy table worked out exactly.
 */
const rules = GACHA_RULES;
const catalog = buildCatalog(gameConfig, {
  rules,
  fiveStar: FIVE_STAR_LINES,
  dexOf: (id) => POKEDEX_IDS[id] ?? 0,
  genOf: generationOf,
});
const input = {
  rotation: BANNER_ROTATION,
  names: BANNER_NAMES,
  pseudo: PSEUDO_LINES,
  starters: STARTER_LINES.filter((id) => !STARTER_SPECIES.includes(id)),
  showcase: SHOWCASE_LINES,
  legends: LEGENDARY_SPECIES,
  showcaseShare: rules.showcase4Share,
};
const day = BANNER_ROTATION.epochDay + 10;
const legend = legendBanner(catalog, input, day);
if (legend === null) throw new Error('a legendary banner');

/** The mean coins of a run of the bot that dodges with these rewards (4X bench: 200 runs, 185). */
const MEASURED_COINS_PER_RUN = 185;

describe('the economy, worked out exactly (decision 3)', () => {
  it('the chance of the featured ★5 on each draw adds up to 1 and ends at two hard pities', () => {
    const dist = featuredDrawDistribution(rules);
    const total = dist.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(dist.length - 1).toBeLessThanOrEqual(featuredDrawsWorst(rules));
    expect(featuredDrawsWorst(rules)).toBe(2 * rules.hardAt);
    // The quantiles grow and the median is under the mean of a long tail.
    const q = [0.1, 0.25, 0.5, 0.75, 0.9, 1].map((x) => featuredDrawsQuantile(rules, x));
    for (let i = 1; i < q.length; i++) expect(q[i]).toBeGreaterThanOrEqual(q[i - 1] ?? 0);
    expect(q.at(-1)).toBe(featuredDrawsWorst(rules));
    expect(featuredDrawsMean(rules)).toBeGreaterThan(rules.softFrom);
  });

  it('matches the gacha itself: thousands of real draws give the same distribution', () => {
    const dist = featuredDrawDistribution(rules);
    const pseudo = activeBanners(catalog, input, day).find((b) => b.kind === 'pseudo');
    if (pseudo === undefined) throw new Error('pseudo banner');
    const N = 1500;
    const counts: number[] = [];
    for (let seed = 1; seed <= N; seed++) {
      let p: Profile = { ...emptyProfile(seed * 6151), coins: 1e9 };
      for (let k = 1; k <= 2 * rules.hardAt; k++) {
        const out = drawGacha(p, pseudo, rules);
        if (!out.ok) throw new Error(out.reason);
        p = out.profile;
        const pull = out.pulls[0];
        if (pull?.stars === 5 && pull.featured) {
          counts.push(k);
          break;
        }
      }
    }
    expect(counts).toHaveLength(N);
    const mean = counts.reduce((a, b) => a + b, 0) / N;
    expect(Math.abs(mean - featuredDrawsMean(rules)) / featuredDrawsMean(rules)).toBeLessThan(0.05);
    // The share by the median of the model is about one half.
    const median = featuredDrawsQuantile(rules, 0.5);
    const byMedian = counts.filter((k) => k <= median).length / N;
    expect(byMedian).toBeGreaterThan(0.45);
    expect(byMedian).toBeLessThan(0.6);
    expect(dist.slice(0, median + 1).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(0.5);
  }, 60_000);

  it('the plan: the featured ★5 for sure in about three weeks of four runs a day', () => {
    const plan = economyPlan(rules, MEASURED_COINS_PER_RUN, RUNS_PER_DAY);
    expect(plan.drawsPerRun).toBeCloseTo(1.85, 6);
    // At the very worst (two hard pities): about three weeks.
    expect(plan.worstDays).toBeGreaterThan(18);
    expect(plan.worstDays).toBeLessThan(24);
    // Half the players have it in about a week and a half.
    expect(plan.medianDays).toBeGreaterThan(7);
    expect(plan.medianDays).toBeLessThan(14);
    // A weekly banner (28 runs) is not enough to be sure of its featured one: you choose.
    expect(plan.worstRuns).toBeGreaterThan(7 * RUNS_PER_DAY * 2);
  });

  it('a won run pays a few draws, a lost one about one or two', () => {
    const summary = (over: Partial<RunSummary>): RunSummary => ({
      ...summarizeRun(createRun(gameConfig, 1, 'pikachu'), gameConfig),
      ...over,
    });
    const won = coinsFor(
      summary({ wavesCleared: 7, bossesDefeated: 4, kills: 300, result: 'won' }),
    );
    const lost = coinsFor(
      summary({ wavesCleared: 3, bossesDefeated: 2, kills: 160, result: 'lost' }),
    );
    expect(won / rules.cost).toBeGreaterThan(3);
    expect(won / rules.cost).toBeLessThan(5);
    expect(lost / rules.cost).toBeGreaterThan(1);
    expect(lost / rules.cost).toBeLessThan(2.5);
  });
});

describe('the legendary keys (★6, decision 4X-2)', { timeout: 60_000 }, () => {
  it('the chance climbs with its own pity and is certain at `hardAt` keys', () => {
    const l = rules.legend;
    expect(legendChance(rules, 1)).toBe(l.rate6);
    expect(legendChance(rules, l.softFrom)).toBe(l.rate6 + l.softStep);
    expect(legendChance(rules, l.hardAt)).toBe(10_000);
    for (let n = 1; n < l.hardAt; n++) {
      expect(legendChance(rules, n + 1)).toBeGreaterThanOrEqual(legendChance(rules, n));
    }
  });

  it('(property) never more than `hardAt` keys without the legendary; each key costs its fragments', () => {
    let legendaries = 0;
    let longest = 0;
    for (let seed = 1; seed <= 400; seed++) {
      let p: Profile = {
        ...emptyProfile(seed * 92821),
        legend: { fragments: rules.legend.keyFragments * 20, draws: 0, pity: 0 },
      };
      let since = 0;
      for (let k = 0; k < 20; k++) {
        const before = p;
        const out = drawLegend(p, legend, rules);
        if (!out.ok) throw new Error(out.reason);
        p = out.profile;
        expect(p.legend.fragments).toBe(before.legend.fragments - rules.legend.keyFragments);
        expect(p.legend.draws).toBe(before.legend.draws + 1);
        // It never moves the coin gacha: its pity and stream position stay.
        expect(p.gacha.pity5).toBe(before.gacha.pity5);
        expect(p.gacha.draws).toBe(before.gacha.draws);
        expect(p.coins).toBe(before.coins);
        const pull = out.pull;
        if (pull.legendary) {
          expect(pull.stars).toBe(6);
          expect(pull.species).toBe(legend.featured);
          legendaries += 1;
          since = 0;
        } else {
          expect([4, 5]).toContain(pull.stars);
          expect(legend.pool[pull.stars as 4 | 5]).toContain(pull.species);
          since += 1;
          longest = Math.max(longest, since);
        }
        expect(since).toBeLessThan(rules.legend.hardAt);
      }
    }
    expect(longest).toBe(rules.legend.hardAt - 1);
    expect(legendaries).toBeGreaterThan(400);
  }, 60_000);

  it('a key that is not there is refused; a legendary joins the collection and can start a run', () => {
    expect(drawLegend(emptyProfile(1), legend, rules)).toEqual({ ok: false, reason: 'keys' });
    let p: Profile = {
      ...emptyProfile(7),
      legend: { fragments: rules.legend.keyFragments * rules.legend.hardAt, draws: 0, pity: 0 },
    };
    let got: string | null = null;
    for (let k = 0; k < rules.legend.hardAt && got === null; k++) {
      const out = drawLegend(p, legend, rules);
      if (!out.ok) throw new Error(out.reason);
      p = out.profile;
      if (out.pull.legendary) got = out.pull.species;
    }
    if (got === null) throw new Error('the legendary comes at the hard pity');
    expect(p.owned[got]).toEqual({ level: 1 });
    expect(p.gacha.history[0]).toMatchObject({ species: got, stars: 6, featured: true });
    // A legendary starter: moves of its type, a run that plays.
    const run = createRun(gameConfig, 3, got);
    expect(run.team[0]?.species).toBe(got);
    expect(gameConfig.moves.byBase[got]).toHaveLength(3);
  });

  it('the view of the keys: whole keys, fragments towards the next one, the pity', () => {
    const p: Profile = { ...emptyProfile(1), legend: { fragments: 7, draws: 2, pity: 2 } };
    const view = legendView(p, rules);
    expect(view.keys).toBe(Math.floor(7 / rules.legend.keyFragments));
    expect(view.fragments).toBe(7 % rules.legend.keyFragments);
    expect(view.toLegend).toBe(rules.legend.hardAt - 2);
    expect(view.nextChance).toBe(legendChance(rules, 3));
  });

  it('is pure: the same profile and banner give the same draw', () => {
    const p: Profile = { ...emptyProfile(31), legend: { fragments: 9, draws: 4, pity: 1 } };
    expect(drawLegend(p, legend, rules)).toEqual(drawLegend(p, legend, rules));
  });
});

describe('what a run leaves (4X: nothing of it joins the collection)', () => {
  const summary = (over: Partial<RunSummary>): RunSummary => ({
    ...summarizeRun(createRun(gameConfig, 1, 'pikachu'), gameConfig),
    ...over,
  });

  it('a won run gives a fragment of a key; a lost one none', () => {
    const won = recordRun(emptyProfile(1), summary({ result: 'won', wavesCleared: 7 }));
    expect(won.legend.fragments).toBe(FRAGMENTS_PER_LEGEND);
    const lost = recordRun(emptyProfile(1), summary({ result: 'lost', wavesCleared: 7 }));
    expect(lost.legend.fragments).toBe(0);
  });

  it('a captured boss marks the Pokédex; one you have gives its candies; none joins', () => {
    const p: Profile = {
      ...emptyProfile(1),
      owned: { pikachu: { level: 1 }, machop: { level: 2 } },
    };
    const run = summary({ bossesCaught: ['geodude', 'machop'], wavesCleared: 3 });
    const rewards = rewardsFor(p, run, 'pikachu');
    expect(rewards.caught).toEqual([
      { species: 'geodude', candies: 0 },
      { species: 'machop', candies: CAUGHT_CANDIES },
    ]);
    const after = recordRun(p, run, 'pikachu');
    expect(after.owned.geodude).toBeUndefined();
    expect(after.caught).toEqual({ geodude: 1, machop: 1 });
    expect(after.seen).toContain('geodude');
    expect(after.candies.machop).toBe(CAUGHT_CANDIES);
    // A second capture counts again.
    expect(recordRun(after, run, 'pikachu').caught).toEqual({ geodude: 2, machop: 2 });
  });
});
