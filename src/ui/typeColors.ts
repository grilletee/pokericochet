import type { GameType } from '../domain';

/** Colour of each of the 18 types in the DOM (cards, team bar, title screen, cartel). */
export const TYPE_COLORS: Record<GameType, string> = {
  normal: '#c9c5a0',
  fighting: '#d0584a',
  flying: '#a4b8f0',
  poison: '#b55cc0',
  ground: '#e0c068',
  rock: '#c2b068',
  bug: '#a8c030',
  ghost: '#8570b8',
  steel: '#b8b8d0',
  fire: '#f08030',
  water: '#6890f0',
  grass: '#78c850',
  electric: '#f8d030',
  psychic: '#f9689a',
  ice: '#98e0e0',
  dragon: '#7c52f8',
  dark: '#8a7060',
  fairy: '#f4a8c8',
};
