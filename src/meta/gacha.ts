import type { GachaRules, Region } from '../data';
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
 * The gacha (4G-J, block 1; ADR-057). Coins of the runs buy draws of Pokémon for the collection.
 *
 * - Rarity of a line: ★5 the starters and pseudo-legendaries (a list in the data), ★4 the lines whose
 *   last form is strong (its base-stat total), ★3 the rest. Legendaries are never in it (bosses only).
 * - Guarantees, shared by every banner (the pity is the profile's, not the banner's): a ★4 or better
 *   at the latest every `fourEvery` draws; the ★5 has a low base chance, grows from `softFrom` (soft
 *   pity) and is certain at `hardAt` (hard pity). On a limited banner a ★5 is its featured one half
 *   the time (the 50/50), and the `featuredAt`-th draw on that banner gives it if it has not come.
 * - Banners: a permanent standard one and limited ones that rotate every period (a region and some
 *   types), each with one featured ★5 and some featured ★4.
 *
 * It has its OWN seeded stream (seed and position in the profile): it never touches a run and a run
 * never touches it. Every probability is an integer in basis points: pure integer arithmetic.
 */

export type Stars = 3 | 4 | 5;
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
  readonly stars: Stars;
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
  readonly genOf: (dex: number) => number;
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
          gen: input.genOf(dex),
        },
      ];
    })
    .sort((a, b) => a.dex - b.dex || (a.species < b.species ? -1 : 1));
}

// ---------------------------------------------------------------------------------------- banners

export type BannerKind = 'standard' | 'region' | 'type';

export interface Banner {
  /** Unique per banner and period: the progress of a limited banner is kept under it. */
  readonly key: string;
  readonly kind: BannerKind;
  readonly name: string;
  readonly gen?: number;
  readonly type?: GameType;
  /** The featured ★5 (one on a limited banner, none on the standard one) and featured ★4. */
  readonly featured5: readonly string[];
  readonly featured4: readonly string[];
  /** What a draw that is not a featured one picks from, by stars (★5: the "other ★5" of the 50/50). */
  readonly pool: Readonly<Record<Stars, readonly string[]>>;
  /** Days until it rotates out (null for the standard one). */
  readonly endsInDays: number | null;
}

export interface BannerInput {
  readonly regions: readonly Region[];
  readonly typeNames: Readonly<Record<GameType, string>>;
  readonly rotation: {
    readonly epochDay: number;
    readonly periodDays: number;
    readonly typeBanners: number;
    readonly featured4: number;
  };
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

const byStars = (entries: readonly CatalogEntry[], stars: Stars): string[] =>
  entries.filter((e) => e.stars === stars).map((e) => e.species);

/** The period of a day (days since 1970-01-01, UTC): banners change when it does. */
export function bannerPeriod(input: BannerInput, day: number): number {
  return Math.floor((day - input.rotation.epochDay) / input.rotation.periodDays);
}

/**
 * The banners open on a day: the standard one first, then one region and `typeBanners` types. Only a
 * theme with at least one ★5 and enough ★4 opens a banner. Pure: the same day, the same banners.
 */
export function activeBanners(
  catalog: readonly CatalogEntry[],
  input: BannerInput,
  day: number,
): readonly Banner[] {
  const period = bannerPeriod(input, day);
  const endsInDays =
    input.rotation.periodDays - mod(day - input.rotation.epochDay, input.rotation.periodDays);
  const all: Record<Stars, string[]> = {
    3: byStars(catalog, 3),
    4: byStars(catalog, 4),
    5: byStars(catalog, 5),
  };
  const banners: Banner[] = [
    {
      key: 'standard',
      kind: 'standard',
      name: 'Pokédex Abierta',
      featured5: [],
      featured4: [],
      pool: all,
      endsInDays: null,
    },
  ];
  const want4 = input.rotation.featured4;
  const opens = (entries: readonly CatalogEntry[]): boolean =>
    byStars(entries, 5).length > 0 && byStars(entries, 4).length >= want4;
  const limited = (
    kind: 'region' | 'type',
    id: string,
    name: string,
    entries: readonly CatalogEntry[],
    turn: number,
    extra: { gen?: number; type?: GameType },
  ): Banner => {
    const fives = byStars(entries, 5);
    const fours = byStars(entries, 4);
    const featured5 = [fives[mod(turn, fives.length)] as string];
    const featured4 = [
      ...new Set(
        Array.from(
          { length: want4 },
          (_, j) => fours[mod(turn * want4 + j, fours.length)] as string,
        ),
      ),
    ];
    const pick = (list: readonly string[], fallback: readonly string[]): string[] =>
      list.length > 0 ? [...list] : [...fallback];
    const threes = byStars(entries, 3);
    return {
      key: `${kind}-${id}@${period}`,
      kind,
      name,
      ...extra,
      featured5,
      featured4,
      pool: {
        3: pick(threes, all[3]),
        4: pick(
          fours.filter((s) => !featured4.includes(s)),
          all[4].filter((s) => !featured4.includes(s)),
        ),
        5: pick(
          all[5].filter((s) => !featured5.includes(s)),
          all[5],
        ),
      },
      endsInDays,
    };
  };
  const regions = input.regions.filter((r) => opens(catalog.filter((e) => e.gen === r.gen)));
  if (regions.length > 0) {
    const region = regions[mod(period, regions.length)] as Region;
    banners.push(
      limited(
        'region',
        String(region.gen),
        `Viaje a ${region.name}`,
        catalog.filter((e) => e.gen === region.gen),
        Math.floor(period / regions.length),
        { gen: region.gen },
      ),
    );
  }
  const types = (Object.keys(input.typeNames) as GameType[]).filter((t) =>
    opens(catalog.filter((e) => e.types.includes(t))),
  );
  const count = Math.min(input.rotation.typeBanners, types.length);
  for (let k = 0; k < count; k++) {
    const turn = period * input.rotation.typeBanners + k;
    const type = types[mod(turn, types.length)] as GameType;
    banners.push(
      limited(
        'type',
        type,
        input.typeNames[type],
        catalog.filter((e) => e.types.includes(type)),
        Math.floor(turn / types.length),
        { type },
      ),
    );
  }
  return banners;
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
  const progress: BannerProgress = g.banners[banner.key] ?? { draws: 0, won: false };
  const bannerDraw = progress.draws + 1;
  const forceFeatured = limited && !progress.won && bannerDraw >= rules.featuredAt;
  // Always three numbers, in this order: the ★5 roll, the ★4 roll, the featured roll.
  const roll5 = nextInt(rng, BP);
  const roll4 = nextInt(rng, BP);
  const rollShare = nextInt(rng, BP);
  let stars: Stars;
  let featured = false;
  let reason: PullReason = 'luck';
  let from: readonly string[];
  if (forceFeatured || roll5 < fiveChance(rules, n5)) {
    stars = 5;
    featured = limited && (forceFeatured || rollShare < rules.featuredShare);
    from = featured ? banner.featured5 : banner.pool[5];
    if (forceFeatured) reason = 'featured';
    else if (n5 >= rules.hardAt) reason = 'hard';
    else if (n5 >= rules.softFrom && roll5 >= rules.rate5) reason = 'soft';
  } else if (n4 >= rules.fourEvery || roll4 < rules.rate4) {
    stars = 4;
    featured = banner.featured4.length > 0 && rollShare < rules.featured4Share;
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
  if (limited) {
    delete banners[banner.key];
    banners[banner.key] = { draws: bannerDraw, won: progress.won || (stars === 5 && featured) };
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
  /** Draws left on this banner to its guaranteed featured ★5; null when spent or not a limited one. */
  readonly toFeatured: number | null;
}

export function pityView(profile: Profile, banner: Banner, rules: GachaRules): PityView {
  const g = profile.gacha;
  const progress = g.banners[banner.key];
  const limited = banner.featured5.length > 0;
  const n5 = g.pity5 + 1;
  return {
    sinceFive: g.pity5,
    toFive: Math.max(1, rules.hardAt - g.pity5),
    toFour: Math.max(1, rules.fourEvery - g.pity4),
    soft: n5 >= rules.softFrom,
    nextFiveChance: fiveChance(rules, n5),
    toFeatured:
      !limited || progress?.won === true
        ? null
        : Math.max(1, rules.featuredAt - (progress?.draws ?? 0)),
  };
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
