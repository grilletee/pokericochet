import type { GameConfig, SpeciesDef } from '../domain';
import { baseConfig } from './config';
import { FIVE_STAR_LINES, GACHA_RULES, PSEUDO_LINES } from './config/gacha';
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

const statsById = new Map(allSpecies.map((s) => [s.id, s.baseStats]));
const totalOf = (id: string): number => {
  const s = statsById.get(id);
  return s === undefined
    ? 0
    : s.hp + s.attack + s.defense + s.specialAttack + s.specialDefense + s.speed;
};

/**
 * 4X: who never asks to join (the ★5 of the gacha: starters and pseudo-legendaries, only from bosses
 * in a run) and who asks rarely (the ★4: a strong last form), from the same data as the gacha.
 */
const JOIN_EXCLUDED: readonly string[] = FIVE_STAR_LINES;
const JOIN_RARE: readonly string[] = Object.keys(EVOLUTION_LINES)
  .filter((base) => !JOIN_EXCLUDED.includes(base))
  .filter((base) => {
    const line = EVOLUTION_LINES[base] ?? [];
    return totalOf(line[line.length - 1] ?? base) >= GACHA_RULES.fourStarFinalTotal;
  })
  .sort();

const baseJoin = baseConfig.capture.join;

/** Complete configuration injected into the domain. */
export const gameConfig: GameConfig = {
  ...baseConfig,
  capture: {
    ...baseConfig.capture,
    ...(baseJoin === undefined
      ? {}
      : { join: { ...baseJoin, excluded: JOIN_EXCLUDED, rare: JOIN_RARE } }),
  },
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
