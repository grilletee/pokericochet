import type { GachaRules } from '../data';
import {
  baseOf,
  createRng,
  type GameConfig,
  type GameType,
  nextInt,
  type RngState,
  typesOfSpecies,
} from '../domain';
import { type BannerProgress, MAX_BANNER_KEYS, MAX_HISTORY, type Profile } from './profile';

/**
 * The gacha (4G-J, block 1; ADR-057; 4X, block 2). Coins of the runs buy draws of Pokémon for the
 * collection; since 4X it is the ONLY way to keep a Pokémon for good.
 *
 * - Rarity of a line: ★5 the starters and pseudo-legendaries (a list in the data), ★4 the lines whose
 *   last form is strong (its base-stat total), ★3 the rest. The legendaries are ★6 and never in the
 *   coin gacha: only the key banner gives them (`drawLegend`).
 * - Guarantees, shared by every banner (the pity is the profile's, not the banner's): a ★4 or better
 *   at the latest every `fourEvery` draws; the ★5 has a low base chance, grows from `softFrom` (soft
 *   pity) and is certain at `hardAt` (hard pity). On a pseudo-legendary or starter banner a ★5 is its
 *   featured one half the time (the 50/50); a lost 50/50 is paid back by the next ★5 of the same
 *   family, whatever week it is (the debt carries over).
 * - Banners (4X, 19th playtest): a permanent standard one and three weekly ones by the real date: a
 *   pseudo-legendary, a starter and two "Pokémon con estilo" (★4), plus the legendary one (keys).
 *
 * It has its OWN seeded stream (seed and position in the profile): it never touches a run and a run
 * never touches it. Every probability is an integer in basis points: pure integer arithmetic.
 */

export type Stars = 3 | 4 | 5;
/** 4X: a legendary of the key banner. */
export type AnyStars = Stars | 6;
const BP = 10_000;

/** The Pokémon the gacha can give: every first of a line of the roster, no legendaries. Sorted. */
export function gachaPool(config: GameConfig): readonly string[] {
  const legendary = new Set(config.boss?.finals ?? []);
  return Object.keys(config.species)
    .filter((id) => baseOf(config, id).base === id && !legendary.has(id))
    .filter((id) => config.lines === undefined || config.lines[id] !== undefined)
    .sort();
}

/** The last form of a line (the base itself for a line of one). */
export function lineFinal(config: GameConfig, base: string): string {
  const line = config.lines?.[base] ?? [];
  return line[line.length - 1] ?? base;
}

export interface CatalogEntry {
  /** The first of its line: what the collection keeps. */
  readonly species: string;
  /** ★3-★5 in the coin catalogue; 4X: ★6 for the legendaries the app adds for the Pokédex. */
  readonly stars: AnyStars;
  /** The types of its line (base and last form), the first type first. */
  readonly types: readonly GameType[];
  /** Its last form: the banner shows it big. */
  readonly final: string;
  readonly dex: number;
  readonly gen: number;
}

export interface CatalogInput {
  readonly rules: GachaRules;
  readonly fiveStar: readonly string[];
  readonly dexOf: (species: string) => number;
  /** 4W: with the species too, so a regional form counts in its own region (Vulpix de Alola). */
  readonly genOf: (dex: number, species: string) => number;
}

/** Every Pokémon of the gacha with its stars, types and region, in Pokédex order. */
export function buildCatalog(config: GameConfig, input: CatalogInput): readonly CatalogEntry[] {
  const five = new Set(input.fiveStar);
  const total = (id: string): number => {
    const stats = config.species[id]?.baseStats;
    return stats === undefined
      ? 0
      : stats.hp +
          stats.attack +
          stats.defense +
          stats.specialAttack +
          stats.specialDefense +
          stats.speed;
  };
  return gachaPool(config)
    .flatMap((species): CatalogEntry[] => {
      const base = config.species[species];
      if (base === undefined) return [];
      const final = lineFinal(config, species);
      const last = config.species[final] ?? base;
      const stars: Stars = five.has(species)
        ? 5
        : total(final) >= input.rules.fourStarFinalTotal
          ? 4
          : 3;
      const dex = input.dexOf(species);
      return [
        {
          species,
          stars,
          types: [...new Set([...typesOfSpecies(base), ...typesOfSpecies(last)])],
          final,
          dex,
          gen: input.genOf(dex, species),
        },
      ];
    })
    .sort((a, b) => a.dex - b.dex || (a.species < b.species ? -1 : 1));
}

// ---------------------------------------------------------------------------------------- banners

/** 4X: the kinds of banner; the three weekly ones are families (their 50/50 debt carries over). */
export type BannerKind = 'standard' | 'pseudo' | 'starter' | 'showcase';
export type BannerFamily = Exclude<BannerKind, 'standard'>;

export interface Banner {
  /** Unique per banner and week (`pseudo@3`); the standard one is `standard`. */
  readonly key: string;
  readonly kind: BannerKind;
  /** The family whose progress (the 50/50 debt) it shares; none for the standard one. */
  readonly family?: BannerFamily;
  readonly name: string;
  /** The featured ★5 (one on a pseudo-legendary or starter banner) and featured ★4. */
  readonly featured5: readonly string[];
  readonly featured4: readonly string[];
  /** The share of the ★4 that are its featured ones (the showcase banner has more). */
  readonly featured4Share?: number;
  /** What a draw that is not a featured one picks from, by stars (★5: the "other ★5" of the 50/50). */
  readonly pool: Readonly<Record<Stars, readonly string[]>>;
  /** Days until it rotates out, counting today (null for the standard one). */
  readonly endsInDays: number | null;
}

export interface BannerInput {
  readonly rotation: {
    readonly epochDay: number;
    readonly periodDays: number;
    /** Featured ★4 of a pseudo-legendary or starter banner, and featured lines of the showcase one. */
    readonly featured4: number;
    readonly showcase: number;
  };
  readonly names: Readonly<Record<BannerKind | 'legend', string>>;
  /** The lines that take turns as the featured one of each weekly banner, in their order. */
  readonly pseudo: readonly string[];
  readonly starters: readonly string[];
  readonly showcase: readonly string[];
  /** The legendaries of the key banner, in their order. */
  readonly legends: readonly string[];
  /** The share of the ★4 that are featured on the showcase banner (basis points). */
  readonly showcaseShare: number;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

const byStars = (entries: readonly CatalogEntry[], stars: Stars): string[] =>
  entries.filter((e) => e.stars === stars).map((e) => e.species);

/** The week of a day (days since 1970-01-01, UTC): banners change when it does. */
export function bannerPeriod(input: BannerInput, day: number): number {
  return Math.floor((day - input.rotation.epochDay) / input.rotation.periodDays);
}

/** Days until the week of `day` ends, counting `day` (7 on its first day, 1 on its last). */
export function daysLeft(input: BannerInput, day: number): number {
  return input.rotation.periodDays - mod(day - input.rotation.epochDay, input.rotation.periodDays);
}

/**
 * The first day of the next week (days since 1970-01-01): the moment the countdown of a weekly
 * banner reaches (it starts at 00:00 UTC that day).
 */
export function weekEndsDay(input: BannerInput, day: number): number {
  return day + daysLeft(input, day);
}

/** `count` different entries of `list` from turn `turn` on (wrapping). */
function take(list: readonly string[], turn: number, count: number): string[] {
  if (list.length === 0) return [];
  return [
    ...new Set(
      Array.from(
        { length: Math.min(count, list.length) },
        (_, j) => list[mod(turn * count + j, list.length)] as string,
      ),
    ),
  ];
}

/**
 * The banners open on a day (4X): the standard one first, then the pseudo-legendary of the week, the
 * starter of the week and the two "Pokémon con estilo" of the week. A featured ★5 brings two ★4 that
 * share a type with it as its featured ★4. Pure: the same day, the same banners.
 */
export function activeBanners(
  catalog: readonly CatalogEntry[],
  input: BannerInput,
  day: number,
): readonly Banner[] {
  const week = bannerPeriod(input, day);
  const endsInDays = daysLeft(input, day);
  const all: Record<Stars, string[]> = {
    3: byStars(catalog, 3),
    4: byStars(catalog, 4),
    5: byStars(catalog, 5),
  };
  const entryOf = new Map(catalog.map((e) => [e.species, e]));
  const banners: Banner[] = [
    {
      key: 'standard',
      kind: 'standard',
      name: input.names.standard,
      featured5: [],
      featured4: [],
      pool: all,
      endsInDays: null,
    },
  ];
  const otherFives = (featured: readonly string[]): string[] => {
    const rest = all[5].filter((s) => !featured.includes(s));
    return rest.length > 0 ? rest : all[5];
  };
  const fourLeft = (featured: readonly string[]): string[] => {
    const rest = all[4].filter((s) => !featured.includes(s));
    return rest.length > 0 ? rest : all[4];
  };
  const weekly = (family: 'pseudo' | 'starter', lines: readonly string[]): void => {
    const fives = lines.filter((id) => entryOf.get(id)?.stars === 5);
    if (fives.length === 0) return;
    const star = fives[mod(week, fives.length)] as string;
    const types = entryOf.get(star)?.types ?? [];
    const kin = all[4].filter((s) => entryOf.get(s)?.types.some((t) => types.includes(t)));
    const featured4 = take(
      kin.length >= input.rotation.featured4 ? kin : all[4],
      week,
      input.rotation.featured4,
    );
    banners.push({
      key: `${family}@${week}`,
      kind: family,
      family,
      name: input.names[family],
      featured5: [star],
      featured4,
      pool: { 3: all[3], 4: fourLeft(featured4), 5: otherFives([star]) },
      endsInDays,
    });
  };
  weekly('pseudo', input.pseudo);
  weekly('starter', input.starters);
  // The showcase: lines whose stars are ★4 (a fan favourite of ★3 cannot be a featured ★4).
  const showcase = input.showcase.filter((id) => entryOf.get(id)?.stars === 4);
  if (showcase.length > 0) {
    const featured4 = take(showcase, week, input.rotation.showcase);
    banners.push({
      key: `showcase@${week}`,
      kind: 'showcase',
      family: 'showcase',
      name: input.names.showcase,
      featured5: [],
      featured4,
      featured4Share: input.showcaseShare,
      pool: { 3: all[3], 4: fourLeft(featured4), 5: all[5] },
      endsInDays,
    });
  }
  return banners;
}

/** 4X: the legendary banner of a week: one featured legendary (★6), opened with keys. */
export interface LegendBanner {
  readonly key: string;
  readonly name: string;
  readonly featured: string;
  readonly endsInDays: number;
  /** What a key gives when it is not the legendary: a ★5 or a ★4 of the whole catalogue. */
  readonly pool: Readonly<Record<4 | 5, readonly string[]>>;
}

/** The legendary banner of a day, or null without legendaries. Pure. */
export function legendBanner(
  catalog: readonly CatalogEntry[],
  input: BannerInput,
  day: number,
): LegendBanner | null {
  if (input.legends.length === 0) return null;
  const week = bannerPeriod(input, day);
  return {
    key: `legend@${week}`,
    name: input.names.legend,
    featured: input.legends[mod(week, input.legends.length)] as string,
    endsInDays: daysLeft(input, day),
    pool: { 4: byStars(catalog, 4), 5: byStars(catalog, 5) },
  };
}

// ------------------------------------------------------------------------------------------- draws

/** The ★5 chance of a draw that is the `n`-th since the last ★5 (basis points). */
export function fiveChance(rules: GachaRules, n: number): number {
  if (n >= rules.hardAt) return BP;
  if (n >= rules.softFrom)
    return Math.min(BP, rules.rate5 + rules.softStep * (n - rules.softFrom + 1));
  return rules.rate5;
}

/** Why a draw came out as it did: luck, the soft or hard pity, the ★4 guarantee or the featured one. */
export type PullReason = 'luck' | 'soft' | 'hard' | 'four' | 'featured';

export interface Pull {
  readonly species: string;
  readonly stars: Stars;
  readonly isNew: boolean;
  /** Candies of a repeat (0 for a new one). */
  readonly candies: number;
  /** A featured Pokémon of the banner. */
  readonly featured: boolean;
  readonly reason: PullReason;
}

export type DrawResult =
  | { readonly ok: true; readonly profile: Profile; readonly pulls: readonly Pull[] }
  | { readonly ok: false; readonly reason: 'coins' | 'empty' };

/** The stream of draw number `draws` (stateless: seed + position). */
function streamAt(seed: number, draws: number): RngState {
  return createRng((seed ^ Math.imul(draws + 1, 0x9e3779b1)) >>> 0);
}

const nonEmpty = (banner: Banner, first: readonly string[]): readonly string[] => {
  if (first.length > 0) return first;
  for (const list of [banner.pool[3], banner.pool[4], banner.pool[5], banner.featured5]) {
    if (list.length > 0) return list;
  }
  return [];
};

/** One draw on a banner, already paid. */
function drawOne(
  profile: Profile,
  banner: Banner,
  rules: GachaRules,
): { profile: Profile; pull: Pull } | null {
  const g = profile.gacha;
  const rng = streamAt(g.seed, g.draws);
  const n5 = g.pity5 + 1;
  const n4 = g.pity4 + 1;
  const limited = banner.featured5.length > 0;
  // 4X: the progress is the family's (pseudo, starter, showcase), so a debt crosses the weeks.
  const progressKey = banner.family ?? banner.key;
  const progress: BannerProgress = g.banners[progressKey] ?? { draws: 0, won: false };
  // 4V: a lost 50/50 is paid back. The ★5 after one that was not the featured one, on a banner of
  // the same family, is the featured one for sure.
  const owed = limited && rules.lostHalfPaysBack && progress.owed === true;
  // Always three numbers, in this order: the ★5 roll, the ★4 roll, the featured roll.
  const roll5 = nextInt(rng, BP);
  const roll4 = nextInt(rng, BP);
  const rollShare = nextInt(rng, BP);
  let stars: Stars;
  let featured = false;
  let reason: PullReason = 'luck';
  let from: readonly string[];
  if (roll5 < fiveChance(rules, n5)) {
    stars = 5;
    featured = limited && (owed || rollShare < rules.featuredShare);
    from = featured ? banner.featured5 : banner.pool[5];
    if (owed) reason = 'featured';
    else if (n5 >= rules.hardAt) reason = 'hard';
    else if (n5 >= rules.softFrom && roll5 >= rules.rate5) reason = 'soft';
  } else if (n4 >= rules.fourEvery || roll4 < rules.rate4) {
    stars = 4;
    const share = banner.featured4Share ?? rules.featured4Share;
    featured = banner.featured4.length > 0 && rollShare < share;
    from = featured ? banner.featured4 : banner.pool[4];
    if (roll4 >= rules.rate4) reason = 'four';
  } else {
    stars = 3;
    from = banner.pool[3];
  }
  const list = nonEmpty(banner, from);
  const species = list[nextInt(rng, list.length)];
  if (species === undefined) return null;
  const isNew = profile.owned[species] === undefined;
  const candies = isNew ? 0 : rules.repeatCandies[stars];
  const banners: Record<string, BannerProgress> = { ...g.banners };
  if (banner.family !== undefined) {
    delete banners[progressKey];
    // A ★5 settles the debt either way: the featured one pays it, another one opens it.
    const owes = limited && (stars === 5 ? !featured : progress.owed === true);
    banners[progressKey] = {
      draws: progress.draws + 1,
      won: progress.won || (stars === 5 && featured),
      ...(owes ? { owed: true } : {}),
    };
    const keys = Object.keys(banners);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_BANNER_KEYS)))
      delete banners[old];
  }
  const next: Profile = {
    ...profile,
    owned: isNew ? { ...profile.owned, [species]: { level: 1 } } : profile.owned,
    candies: isNew
      ? profile.candies
      : { ...profile.candies, [species]: (profile.candies[species] ?? 0) + candies },
    seen: profile.seen.includes(species) ? profile.seen : [...profile.seen, species].sort(),
    gacha: {
      seed: g.seed,
      draws: g.draws + 1,
      pity5: stars === 5 ? 0 : n5,
      pity4: stars >= 4 ? 0 : n4,
      banners,
      history: [
        { species, stars, banner: banner.name, featured, n: g.draws + 1 },
        ...g.history,
      ].slice(0, Math.min(rules.historySize, MAX_HISTORY)),
    },
  };
  return { profile: next, pull: { species, stars, isNew, candies, featured, reason } };
}

/**
 * `count` draws on a banner (1 or `rules.multi`), paid all at once. Pure: the same profile and banner
 * give the same draws; a x10 is exactly ten draws of one.
 */
export function drawGacha(
  profile: Profile,
  banner: Banner,
  rules: GachaRules,
  count = 1,
): DrawResult {
  const n = Math.max(1, Math.floor(count));
  if (profile.coins < rules.cost * n) return { ok: false, reason: 'coins' };
  let current: Profile = { ...profile, coins: profile.coins - rules.cost * n };
  const pulls: Pull[] = [];
  for (let i = 0; i < n; i++) {
    const done = drawOne(current, banner, rules);
    if (done === null) return { ok: false, reason: 'empty' };
    current = done.profile;
    pulls.push(done.pull);
  }
  return { ok: true, profile: current, pulls };
}

// ------------------------------------------------------------------------------- what the screen shows

export interface PityView {
  /** Draws since the last ★5, and how many are left to the certain one (1 = the next). */
  readonly sinceFive: number;
  readonly toFive: number;
  /** Draws left to the guaranteed ★4 or better (1 = the next). */
  readonly toFour: number;
  /** The soft pity is on for the next draw. */
  readonly soft: boolean;
  /** The ★5 chance of the next draw (basis points). */
  readonly nextFiveChance: number;
  /**
   * The 50/50 was lost on a banner of this family: its next ★5 is the featured one for sure (4V; 4X:
   * whatever week it comes in).
   */
  readonly featuredOwed: boolean;
  /**
   * 4X: draws left to the featured ★5 at the very worst (two hard pities, or one when it is owed);
   * null on a banner without a featured ★5.
   */
  readonly worstToFeatured: number | null;
}

export function pityView(profile: Profile, banner: Banner, rules: GachaRules): PityView {
  const g = profile.gacha;
  const progress = g.banners[banner.family ?? banner.key];
  const limited = banner.featured5.length > 0;
  const n5 = g.pity5 + 1;
  const owed = limited && rules.lostHalfPaysBack && progress?.owed === true;
  const toFive = Math.max(1, rules.hardAt - g.pity5);
  return {
    sinceFive: g.pity5,
    toFive,
    toFour: Math.max(1, rules.fourEvery - g.pity4),
    soft: n5 >= rules.softFrom,
    nextFiveChance: fiveChance(rules, n5),
    featuredOwed: owed,
    // No guarantee without the payback; with it, this ★5 or, if the 50/50 is lost, the next one.
    worstToFeatured:
      !limited || !rules.lostHalfPaysBack ? null : owed ? toFive : toFive + rules.hardAt,
  };
}

// ------------------------------------------------------------------------------ legendary keys

export interface LegendPull {
  readonly species: string;
  readonly stars: AnyStars;
  readonly isNew: boolean;
  readonly candies: number;
  /** True for the legendary of the week (★6). */
  readonly legendary: boolean;
}

export type LegendResult =
  | { readonly ok: true; readonly profile: Profile; readonly pull: LegendPull }
  | { readonly ok: false; readonly reason: 'keys' | 'empty' };

/** The ★6 chance of the `n`-th key since the last legendary (basis points). */
export function legendChance(rules: GachaRules, n: number): number {
  const legend = rules.legend;
  if (n >= legend.hardAt) return BP;
  if (n >= legend.softFrom) {
    return Math.min(BP, legend.rate6 + legend.softStep * (n - legend.softFrom + 1));
  }
  return legend.rate6;
}

/** What the key banner shows of a profile: keys, fragments towards the next one and the pity. */
export interface LegendView {
  readonly keys: number;
  /** Fragments towards the next key (0..keyFragments-1) and how many make one. */
  readonly fragments: number;
  readonly perKey: number;
  /** The ★6 chance of the next key, and keys left to the certain one (1 = the next). */
  readonly nextChance: number;
  readonly toLegend: number;
}

export function legendView(profile: Profile, rules: GachaRules): LegendView {
  const per = Math.max(1, rules.legend.keyFragments);
  return {
    keys: Math.floor(profile.legend.fragments / per),
    fragments: profile.legend.fragments % per,
    perKey: per,
    nextChance: legendChance(rules, profile.legend.pity + 1),
    toLegend: Math.max(1, rules.legend.hardAt - profile.legend.pity),
  };
}

/** The key banner's own stream (a different salt: it never shares a number with the coin gacha). */
function legendStreamAt(seed: number, draws: number): RngState {
  return createRng((seed ^ 0x6c65676e ^ Math.imul(draws + 1, 0x85ebca6b)) >>> 0);
}

/**
 * One key on the legendary banner (4X): it costs `keyFragments` fragments. The legendary of the week
 * comes with `legendChance` (its own pity, certain at `hardAt` keys); otherwise a ★5
 * (`consolation5` of the time) or a ★4 of the whole catalogue. It never moves the coin gacha's pity.
 * Pure: the same profile and banner give the same draw.
 */
export function drawLegend(
  profile: Profile,
  banner: LegendBanner,
  rules: GachaRules,
): LegendResult {
  const cost = Math.max(1, rules.legend.keyFragments);
  if (profile.legend.fragments < cost) return { ok: false, reason: 'keys' };
  const rng = legendStreamAt(profile.gacha.seed, profile.legend.draws);
  const n = profile.legend.pity + 1;
  // Always three numbers: the ★6 roll, the ★5-or-★4 roll, the pick.
  const roll6 = nextInt(rng, BP);
  const roll5 = nextInt(rng, BP);
  const legendary = roll6 < legendChance(rules, n);
  const stars: AnyStars = legendary ? 6 : roll5 < rules.legend.consolation5 ? 5 : 4;
  const list = legendary ? [banner.featured] : stars === 5 ? banner.pool[5] : banner.pool[4];
  const species = list.length === 0 ? undefined : list[nextInt(rng, list.length)];
  if (species === undefined) return { ok: false, reason: 'empty' };
  const isNew = profile.owned[species] === undefined;
  const candies = isNew ? 0 : rules.repeatCandies[stars];
  const g = profile.gacha;
  const next: Profile = {
    ...profile,
    owned: isNew ? { ...profile.owned, [species]: { level: 1 } } : profile.owned,
    candies: isNew
      ? profile.candies
      : { ...profile.candies, [species]: (profile.candies[species] ?? 0) + candies },
    seen: profile.seen.includes(species) ? profile.seen : [...profile.seen, species].sort(),
    legend: {
      fragments: profile.legend.fragments - cost,
      draws: profile.legend.draws + 1,
      pity: legendary ? 0 : n,
    },
    gacha: {
      ...g,
      history: [
        {
          species,
          stars,
          banner: banner.name,
          featured: legendary,
          n: g.draws + profile.legend.draws + 1,
        },
        ...g.history,
      ].slice(0, Math.min(rules.historySize, MAX_HISTORY)),
    },
  };
  return { ok: true, profile: next, pull: { species, stars, isNew, candies, legendary } };
}

export interface RateTable {
  /** The base chances of the rules (fractions). */
  readonly base: Readonly<Record<Stars, number>>;
  /** The long-run share of each rarity with the pity included (fractions): what a player gets. */
  readonly overall: Readonly<Record<Stars, number>>;
  /** The mean number of draws between two ★5. */
  readonly drawsPerFive: number;
}

/**
 * The probabilities the screen shows, from the same rules the draw uses: the long-run shares come
 * from the stationary distribution of the pity counters (a Markov chain over `hardAt × fourEvery`
 * states), so the table and the draw can never disagree.
 */
export function rateTable(rules: GachaRules): RateTable {
  const S5 = rules.hardAt;
  const S4 = rules.fourEvery;
  let dist = new Float64Array(S5 * S4);
  dist[0] = 1;
  let five = 0;
  let four = 0;
  for (let step = 0; step < 4000; step++) {
    const next = new Float64Array(S5 * S4);
    five = 0;
    four = 0;
    for (let i = 0; i < S5; i++) {
      for (let j = 0; j < S4; j++) {
        const p = dist[i * S4 + j] ?? 0;
        if (p === 0) continue;
        const p5 = fiveChance(rules, i + 1) / BP;
        const p4 = j + 1 >= S4 ? 1 : rules.rate4 / BP;
        five += p * p5;
        four += p * (1 - p5) * p4;
        next[0] = (next[0] ?? 0) + p * p5;
        const i2 = Math.min(i + 1, S5 - 1);
        next[i2 * S4] = (next[i2 * S4] ?? 0) + p * (1 - p5) * p4;
        const j2 = Math.min(j + 1, S4 - 1);
        next[i2 * S4 + j2] = (next[i2 * S4 + j2] ?? 0) + p * (1 - p5) * (1 - p4);
      }
    }
    dist = next;
  }
  return {
    base: { 5: rules.rate5 / BP, 4: rules.rate4 / BP, 3: 1 - (rules.rate5 + rules.rate4) / BP },
    overall: { 5: five, 4: four, 3: 1 - five - four },
    drawsPerFive: five > 0 ? 1 / five : Number.POSITIVE_INFINITY,
  };
}
