/**
 * The gacha as data (4G-J, block 1; ADR-057). Coins of the game only: no real money, no adverts.
 * Probabilities are integers in basis points (10000 = 100 %), so the draw is integer arithmetic on
 * the gacha's own seeded stream and never depends on floating point.
 */
export interface GachaRules {
  /** Coins for one draw; a x10 is `multi` draws at the same price each. */
  readonly cost: number;
  readonly multi: number;
  /** Base chance of a ★5 and of a ★4 (basis points). */
  readonly rate5: number;
  readonly rate4: number;
  /** A ★4 or better at the latest on this draw, counting since the last ★4 or ★5. */
  readonly fourEvery: number;
  /** Soft pity: from this draw since the last ★5, each draw adds `softStep` to the ★5 chance. */
  readonly softFrom: number;
  readonly softStep: number;
  /** Hard pity: this draw since the last ★5 is always a ★5. */
  readonly hardAt: number;
  /** Share of the ★5 that are the featured one of a limited banner (the 50/50). */
  readonly featuredShare: number;
  /**
   * 4V (author's request): a lost 50/50 is paid back. After a ★5 on a limited banner that was not
   * its featured one, the next ★5 on a banner of the same family is the featured one for sure. 4X:
   * the debt belongs to the family (pseudo-legendary, starters), so it carries over to next week's.
   */
  readonly lostHalfPaysBack: boolean;
  /** Share of the ★4 that are a featured ★4 of a limited banner. */
  readonly featured4Share: number;
  /** 4X: on the "Pokémon con estilo" banner, whose stars are ★4, they are this share of the ★4. */
  readonly showcase4Share: number;
  /** Candies a repeat gives, by its stars (a ★6 is a legendary of the key banner). */
  readonly repeatCandies: Readonly<Record<3 | 4 | 5 | 6, number>>;
  /** A line is ★4 when its last form has at least this base-stat total (strong final forms). */
  readonly fourStarFinalTotal: number;
  /** The draws the history keeps (newest first). */
  readonly historySize: number;
  /** 4X: the legendaries (★6), only with keys. */
  readonly legend: LegendRules;
}

/**
 * 4X (19th playtest: "los legendarios, como ★6, muy muy difíciles de conseguir"): a legendary is never
 * in the coin gacha. Defeating the final legendary of a run gives a fragment of a key; a key opens
 * one draw of the legendary banner, with its own pity. A draw that is not the legendary still gives
 * a ★5 or a ★4 (a key is never wasted).
 */
export interface LegendRules {
  /** Fragments that make a key (one fragment per final legendary defeated). */
  readonly keyFragments: number;
  /** Chance of the legendary per key (basis points), the soft pity and the hard pity (in keys). */
  readonly rate6: number;
  readonly softFrom: number;
  readonly softStep: number;
  readonly hardAt: number;
  /** When it is not the legendary: a ★5 this share of the time, else a ★4. */
  readonly consolation5: number;
}

export const GACHA_RULES: GachaRules = {
  cost: 100,
  multi: 10,
  rate5: 80,
  rate4: 800,
  fourEvery: 10,
  softFrom: 65,
  softStep: 500,
  hardAt: 80,
  featuredShare: 5000,
  lostHalfPaysBack: true,
  featured4Share: 5000,
  showcase4Share: 7000,
  repeatCandies: { 3: 3, 4: 8, 5: 20, 6: 40 },
  fourStarFinalTotal: 500,
  historySize: 100,
  // A legendary every 6 keys at the latest (18 legendaries defeated), 1 in 10 per key before the soft
  // pity. See the economy table of the 4X report.
  legend: {
    keyFragments: 3,
    rate6: 1000,
    softFrom: 4,
    softStep: 2500,
    hardAt: 6,
    consolation5: 3000,
  },
};

/**
 * The starters of every generation and Pikachu, in Pokédex order (4G-J, block 3): the first Pokémon is
 * one of them. They are ★5 in the gacha.
 */
export const STARTER_LINES: readonly string[] = [
  'bulbasaur',
  'charmander',
  'squirtle',
  'pikachu',
  'chikorita',
  'cyndaquil',
  'totodile',
  'treecko',
  'torchic',
  'mudkip',
  'turtwig',
  'chimchar',
  'piplup',
  'snivy',
  'tepig',
  'oshawott',
  'chespin',
  'fennekin',
  'froakie',
  'rowlet',
  'litten',
  'popplio',
  'grookey',
  'scorbunny',
  'sobble',
  'sprigatito',
  'fuecoco',
  'quaxly',
];

/**
 * The pseudo-legendaries, by the first of their line: ★5 in the gacha. 4X: Axew (Haxorus) joins them:
 * the author named it with Tyranitar, Hydreigon and Salamence for the weekly banner ("Haxorus...").
 */
export const PSEUDO_LINES: readonly string[] = [
  'dratini',
  'larvitar',
  'bagon',
  'beldum',
  'gible',
  'axew',
  'deino',
  'goomy',
  'jangmo-o',
  'dreepy',
  'frigibax',
];

/**
 * 4X (19th playtest: "otro de Pokémon que no son ni pseudolegendarios ni iniciales pero están
 * guapos"): the lines the "Pokémon con estilo" banner features, two a week. Hand-picked fan
 * favourites; a name that is not in the roster is ignored.
 */
export const SHOWCASE_LINES: readonly string[] = [
  'eevee',
  'lucario',
  'gastly',
  'ralts',
  'absol',
  'zorua',
  'growlithe',
  'vulpix',
  'magikarp',
  'lapras',
  'snorlax',
  'scyther',
  'shinx',
  'litwick',
  'sneasel',
  'houndour',
  'aron',
  'honedge',
  'rotom',
  'ditto',
  'sableye',
  'larvesta',
  'vulpix-alola',
  'growlithe-hisui',
  'noibat',
  'sinistea',
  'swablu',
  'charcadet',
  'mareep',
  'trapinch',
];

/**
 * ★5: the starters of every generation and the pseudo-legendaries. A name that is not in the roster is
 * ignored. The legendaries are never in the gacha (only bosses).
 */
export const FIVE_STAR_LINES: readonly string[] = [...STARTER_LINES, ...PSEUDO_LINES];

/** The regions, by national Pokédex number: a region banner and the generation filter use them. */
export interface Region {
  readonly gen: number;
  readonly name: string;
  readonly firstDex: number;
  readonly lastDex: number;
}

export const REGIONS: readonly Region[] = [
  { gen: 1, name: 'Kanto', firstDex: 1, lastDex: 151 },
  { gen: 2, name: 'Johto', firstDex: 152, lastDex: 251 },
  { gen: 3, name: 'Hoenn', firstDex: 252, lastDex: 386 },
  { gen: 4, name: 'Sinnoh', firstDex: 387, lastDex: 493 },
  { gen: 5, name: 'Teselia', firstDex: 494, lastDex: 649 },
  { gen: 6, name: 'Kalos', firstDex: 650, lastDex: 721 },
  { gen: 7, name: 'Alola', firstDex: 722, lastDex: 809 },
  { gen: 8, name: 'Galar', firstDex: 810, lastDex: 905 },
  { gen: 9, name: 'Paldea', firstDex: 906, lastDex: 1025 },
];

/**
 * The generation of a national Pokédex number (0 when it is out of every region). 4W, block 7: a
 * regional form (`vulpix-alola`, `ponyta-galar`, `growlithe-hisui`, `wooper-paldea`) counts in the
 * region of its form, not in the one of its number; Hisui is with Galar (both the 8th generation).
 */
export function generationOf(dex: number, species = ''): number {
  const regional = /-(alola|galar|hisui|paldea)(-|$)/.exec(species)?.[1];
  if (regional !== undefined) return regional === 'alola' ? 7 : regional === 'paldea' ? 9 : 8;
  return REGIONS.find((r) => dex >= r.firstDex && dex <= r.lastDex)?.gen ?? 0;
}

/**
 * 4X: the weekly rotation by the real date. A new week every `periodDays` days from `epochDay` (a
 * Monday, UTC, in days since 1970-01-01). At once: the permanent standard banner and three weekly
 * ones (a pseudo-legendary, a starter, two "Pokémon con estilo"); the legendary banner (keys) has
 * its own featured legendary every week.
 */
export const BANNER_ROTATION = {
  /** 2026-11-16, a Monday. */
  epochDay: 20_773,
  periodDays: 7,
  /** How many ★4 lines a pseudo-legendary or a starter banner features, and the showcase one. */
  featured4: 2,
  showcase: 2,
} as const;

/** The names of the banners (the featured Pokémon's name goes with them on the screen). */
export const BANNER_NAMES = {
  standard: 'Pokédex Abierta',
  pseudo: 'Rugido Pseudolegendario',
  starter: 'Compañeros de Viaje',
  showcase: 'Pokémon con Estilo',
  legend: 'Santuario Legendario',
} as const;
