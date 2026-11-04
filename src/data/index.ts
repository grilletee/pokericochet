import type { GameConfig, SpeciesDef } from '../domain';
import { baseConfig } from './config';
import { MOVES_BY_BASE } from './moves';
import {
  ALL_SPECIES,
  BALL_SPECIES,
  ENEMY_SPECIES,
  EVOLUTION_FORMS,
  EVOLUTION_LINES,
} from './species';

export { baseConfig } from './config';
export { MOVE_INFO, MOVE_NAMES, MOVES_BY_BASE } from './moves';
export {
  ALL_SPECIES,
  ART_SPECIES_IDS,
  BALL_SPECIES,
  BOSS_SPECIES,
  ENEMY_SPECIES,
  EVOLUTION_FORMS,
  EVOLUTION_LINES,
  LEGENDARY_SPECIES,
  POKEMON_NAMES,
  STARTER_SPECIES,
} from './species';

const allSpecies: readonly SpeciesDef[] = ALL_SPECIES;

/** Complete configuration injected into the domain. */
export const gameConfig: GameConfig = {
  ...baseConfig,
  moves: { ...baseConfig.moves, byBase: MOVES_BY_BASE },
  species: Object.fromEntries(allSpecies.map((s) => [s.id, s])),
  enemySpecies: ENEMY_SPECIES.map((s) => s.id),
  ballSpecies: BALL_SPECIES.map((s) => s.id),
  lines: EVOLUTION_LINES,
  forms: EVOLUTION_FORMS,
};
