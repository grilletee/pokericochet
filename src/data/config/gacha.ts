import type { GameType } from '../../domain';

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
  /** On a limited banner, this draw on it gives its featured ★5 if it has not come yet. */
  readonly featuredAt: number;
  /** Share of the ★4 that are a featured ★4 of a limited banner. */
  readonly featured4Share: number;
  /** Candies a repeat gives, by its stars. */
  readonly repeatCandies: Readonly<Record<3 | 4 | 5, number>>;
  /** A line is ★4 when its last form has at least this base-stat total (strong final forms). */
  readonly fourStarFinalTotal: number;
  /** The draws the history keeps (newest first). */
  readonly historySize: number;
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
  featuredAt: 120,
  featured4Share: 5000,
  repeatCandies: { 3: 3, 4: 8, 5: 20 },
  fourStarFinalTotal: 500,
  historySize: 100,
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

/** The pseudo-legendaries, by the first of their line: ★5 in the gacha. */
export const PSEUDO_LINES: readonly string[] = [
  'dratini',
  'larvitar',
  'bagon',
  'beldum',
  'gible',
  'deino',
  'goomy',
  'jangmo-o',
  'dreepy',
  'frigibax',
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

/** The generation of a national Pokédex number (0 when it is out of every region). */
export function generationOf(dex: number): number {
  return REGIONS.find((r) => dex >= r.firstDex && dex <= r.lastDex)?.gen ?? 0;
}

/** The name of each type banner (they rotate; a type without ★5 lines never opens one). */
export const TYPE_BANNER_NAMES: Readonly<Record<GameType, string>> = {
  normal: 'Fuerza Tranquila',
  fire: 'Corazón Ígneo',
  water: 'Mareas Profundas',
  grass: 'Bosque Ancestral',
  electric: 'Tormenta Eléctrica',
  ice: 'Glaciar Eterno',
  fighting: 'Puño de Acero',
  poison: 'Niebla Tóxica',
  ground: 'Tierra Temblorosa',
  flying: 'Cielo Abierto',
  psychic: 'Mente Brillante',
  bug: 'Enjambre Dorado',
  rock: 'Roca Viva',
  ghost: 'Noche de Sombras',
  dragon: 'Rugido de Dragón',
  dark: 'Luna Oscura',
  steel: 'Forja Imparable',
  fairy: 'Brillo de Hada',
};

/**
 * The rotation: a new period every `periodDays` days from `epoch` (a UTC date, in days since
 * 1970-01-01). At once: the permanent standard banner, one region banner and `typeBanners` type banners.
 */
export const BANNER_ROTATION = {
  /** 2026-11-16, a Monday. */
  epochDay: 20_773,
  periodDays: 7,
  typeBanners: 2,
  /** How many ★4 lines a limited banner features. */
  featured4: 2,
} as const;
