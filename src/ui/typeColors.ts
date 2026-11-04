import type { GameType } from '../domain';

/** Colour of each type in the DOM (cards, team bar, title screen). */
export const TYPE_COLORS: Record<GameType, string> = {
  fire: '#f08030',
  water: '#6890f0',
  grass: '#78c850',
  electric: '#f8d030',
};
