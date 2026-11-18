import type { GameConfig, SpeciesDef } from '../domain';
import { baseConfig } from './config';
import { PSEUDO_LINES } from './config/gacha';
import { paceOfLines } from './evolutionPace';
import { MOVE_TYPES, MOVES_BY_BASE } from './moves';
import {
  ALL_SPECIES,
  BALL_SPECIES,
  ENEMY_SPECIES,
  EVOLUTION_BRANCHES,
  EVOLUTION_FORMS,
  EVOLUTION_LINES,
  EVOLUTION_STEPS,
} from './species';

export { baseConfig } from './config';
export {
  BANNER_ROTATION,
  FIVE_STAR_LINES,
  GACHA_RULES,
  type GachaRules,
  generationOf,
  PSEUDO_LINES,
  REGIONS,
  type Region,
  STARTER_LINES,
  TYPE_BANNER_NAMES,
} from './config/gacha';
export { gameLevel, lineStageLevels, PACE, paceOfLines } from './evolutionPace';
export { MOVE_INFO, MOVE_NAMES, MOVE_TYPES, MOVES_BY_BASE } from './moves';
export {
  ALL_SPECIES,
  ART_SPECIES_IDS,
  BALL_SPECIES,
  BOSS_SPECIES,
  ENEMY_SPECIES,
  EVOLUTION_FORMS,
  EVOLUTION_LINES,
  LEGENDARY_SPECIES,
  POKEDEX_IDS,
  POKEMON_NAMES,
  STARTER_SPECIES,
} from './species';

const allSpecies: readonly SpeciesDef[] = ALL_SPECIES;

/** Complete configuration injected into the domain. */
export const gameConfig: GameConfig = {
  ...baseConfig,
  moves: { ...baseConfig.moves, byBase: MOVES_BY_BASE, types: MOVE_TYPES },
  species: Object.fromEntries(allSpecies.map((s) => [s.id, s])),
  enemySpecies: ENEMY_SPECIES.map((s) => s.id),
  ballSpecies: BALL_SPECIES.map((s) => s.id),
  lines: EVOLUTION_LINES,
  // 4W (block 7): the split lines (Eevee, Ralts...) take a branch by the place where they evolve.
  branches: EVOLUTION_BRANCHES,
  forms: EVOLUTION_FORMS,
  // 4W (block 1): each line evolves at its own pace, from its real evolution levels.
  team: { ...baseConfig.team, lineStageLevels: paceOfLines(EVOLUTION_STEPS, PSEUDO_LINES) },
};
