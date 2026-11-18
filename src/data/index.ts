import type { GameConfig, SpeciesDef } from '../domain';
import { baseConfig } from './config';
import { FIVE_STAR_LINES, GACHA_RULES, PSEUDO_LINES } from './config/gacha';
import { paceOfLines } from './evolutionPace';
import { MOVE_DEFAULTS, MOVE_TYPES, MOVES_BY_BASE } from './moves';
import {
  ALL_SPECIES,
  BALL_SPECIES,
  ENEMY_SPECIES,
  EVOLUTION_BRANCHES,
  EVOLUTION_FORMS,
  EVOLUTION_LINES,
  EVOLUTION_STEPS,
  LEGENDARY_SPECIES,
} from './species';

export { baseConfig } from './config';
export {
  BANNER_NAMES,
  BANNER_ROTATION,
  FIVE_STAR_LINES,
  GACHA_RULES,
  type GachaRules,
  generationOf,
  type LegendRules,
  PSEUDO_LINES,
  REGIONS,
  type Region,
  SHOWCASE_LINES,
  STARTER_LINES,
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

/**
 * 4X: a legendary (★6, from the key banner) can start a run. The generated table has no moves for
 * them (they were only bosses), so each one uses the default ladder of its first type, the same
 * moves any line falls back to (ADR-039). Their lines of one form keep the common stages.
 */
const LEGEND_MOVES: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  LEGENDARY_SPECIES.flatMap((id) => {
    const type = allSpecies.find((s) => s.id === id)?.type;
    const ladder = type === undefined ? undefined : MOVE_DEFAULTS[type];
    return ladder === undefined || MOVES_BY_BASE[id] !== undefined ? [] : [[id, ladder]];
  }),
);

/** Complete configuration injected into the domain. */
export const gameConfig: GameConfig = {
  ...baseConfig,
  capture: {
    ...baseConfig.capture,
    ...(baseJoin === undefined
      ? {}
      : { join: { ...baseJoin, excluded: JOIN_EXCLUDED, rare: JOIN_RARE } }),
  },
  moves: { ...baseConfig.moves, byBase: { ...MOVES_BY_BASE, ...LEGEND_MOVES }, types: MOVE_TYPES },
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
