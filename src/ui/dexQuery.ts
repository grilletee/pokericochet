import type { GameType } from '../domain';
import { pokemonName } from './names';

/**
 * Search, filters and order of a grid of Pokémon (4W, block 5; 18th playtest: "la Pokédex necesita
 * búsqueda y filtros, y lo mismo al elegir con quién jugar"). Pure: the Pokédex and the choice of a
 * starter both ask this which cards to show and in which order.
 */
export interface DexItem {
  readonly species: string;
  readonly state: 'owned' | 'seen' | 'unknown';
  readonly types: readonly GameType[];
  readonly dex: number;
  readonly gen?: number;
  readonly stars?: 3 | 4 | 5;
  /** Permanent level (0 when not owned). */
  readonly level: number;
  readonly candies: number;
  /** Candies the next permanent level costs (Infinity at the top or when not owned). */
  readonly nextCost: number;
  /** The last form of its line: searching "charizard" finds Charmander. */
  readonly final?: string;
}

export type DexStateFilter = 'all' | 'owned' | 'seen' | 'missing';
export type DexSort = 'number' | 'level' | 'rarity' | 'name';

export interface DexQuery {
  readonly text: string;
  readonly type: GameType | null;
  readonly gen: number | null;
  readonly stars: 3 | 4 | 5 | null;
  readonly state: DexStateFilter;
  /** Only the ones whose permanent level is above 1. */
  readonly raised: boolean;
  /** Only the ones with candies enough for their next level. */
  readonly canLevel: boolean;
}

export const EMPTY_QUERY: DexQuery = {
  text: '',
  type: null,
  gen: null,
  stars: null,
  state: 'all',
  raised: false,
  canLevel: false,
};

/** Lower case, no accents, no spaces or signs: "Mr. Mime" and "mrmime" are the same. */
export function foldName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Whether the search text finds this Pokémon: its name, its id, the last form of its line or its
 * number ("4", "#004"). An unknown one ("???") is only found by its number, so a search never gives
 * away a name you have not seen.
 */
export function matchesText(item: DexItem, text: string): boolean {
  const wanted = foldName(text);
  if (wanted === '') return true;
  if (/^#?\d+$/.test(text.trim())) return item.dex === Number(text.trim().replace('#', ''));
  if (item.state === 'unknown') return false;
  const names = [item.species, pokemonName(item.species)];
  if (item.state === 'owned' && item.final !== undefined) {
    names.push(item.final, pokemonName(item.final));
  }
  return names.some((name) => foldName(name).includes(wanted));
}

/** The items the query keeps, in their order. Every filter adds to the others. */
export function queryDex<T extends DexItem>(items: readonly T[], query: DexQuery): T[] {
  return items.filter(
    (item) =>
      matchesText(item, query.text) &&
      (query.type === null || item.types.includes(query.type)) &&
      (query.gen === null || item.gen === query.gen) &&
      (query.stars === null || item.stars === query.stars) &&
      (query.state === 'all' ||
        (query.state === 'owned' && item.state === 'owned') ||
        (query.state === 'seen' && item.state === 'seen') ||
        (query.state === 'missing' && item.state !== 'owned')) &&
      (!query.raised || (item.state === 'owned' && item.level > 1)) &&
      (!query.canLevel || (item.state === 'owned' && item.candies >= item.nextCost)),
  );
}

/** How far the player got with it: owned first, then seen, then unknown. */
const knownRank = (item: DexItem): number =>
  item.state === 'owned' ? 0 : item.state === 'seen' ? 1 : 2;

/**
 * The items in the order asked; ties keep the Pokédex number. By level and by rarity the highest
 * comes first; by name, the unknown ones go last (they have no name to show).
 */
export function sortDex<T extends DexItem>(items: readonly T[], sort: DexSort): T[] {
  const byDex = (a: DexItem, b: DexItem): number => a.dex - b.dex;
  const sorted = [...items];
  switch (sort) {
    case 'level':
      return sorted.sort((a, b) => b.level - a.level || knownRank(a) - knownRank(b) || byDex(a, b));
    case 'rarity':
      return sorted.sort(
        (a, b) => (b.stars ?? 0) - (a.stars ?? 0) || knownRank(a) - knownRank(b) || byDex(a, b),
      );
    case 'name':
      return sorted.sort(
        (a, b) =>
          Number(a.state === 'unknown') - Number(b.state === 'unknown') ||
          foldName(pokemonName(a.species)).localeCompare(foldName(pokemonName(b.species))) ||
          byDex(a, b),
      );
    default:
      return sorted.sort(byDex);
  }
}

/** How many filters are on (the search counts as one), for the "Limpiar (3)" button. */
export function activeFilters(query: DexQuery): number {
  return (
    Number(query.text.trim() !== '') +
    Number(query.type !== null) +
    Number(query.gen !== null) +
    Number(query.stars !== null) +
    Number(query.state !== 'all') +
    Number(query.raised) +
    Number(query.canLevel)
  );
}
