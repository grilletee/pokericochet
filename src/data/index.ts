import type { GameConfig, SpeciesDef } from '../domain';
import { baseConfig } from './config';
import {
  ALL_SPECIES,
  BALL_SPECIES,
  ENEMY_SPECIES,
  EVOLUTION_FORMS,
  EVOLUTION_LINES,
} from './species';

export { baseConfig } from './config';
export {
  ALL_SPECIES,
  ART_SPECIES_IDS,
  BALL_SPECIES,
  BOSS_SPECIES,
  ENEMY_SPECIES,
  EVOLUTION_FORMS,
  EVOLUTION_LINES,
  formOf,
  LEGENDARY_SPECIES,
  STARTER_SPECIES,
} from './species';

const allSpecies: readonly SpeciesDef[] = ALL_SPECIES;

/** Complete configuration injected into the domain. */
export const gameConfig: GameConfig = {
  ...baseConfig,
  species: Object.fromEntries(allSpecies.map((s) => [s.id, s])),
  enemySpecies: ENEMY_SPECIES.map((s) => s.id),
  ballSpecies: BALL_SPECIES.map((s) => s.id),
  lines: EVOLUTION_LINES,
  forms: EVOLUTION_FORMS,
};
