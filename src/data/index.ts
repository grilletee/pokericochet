import type { GameConfig, SpeciesDef } from '../domain';
import { baseConfig } from './config';
import { BALL_SPECIES, BOSS_SPECIES, ENEMY_SPECIES } from './species';

export { baseConfig } from './config';
export { BALL_SPECIES, BOSS_SPECIES, ENEMY_SPECIES } from './species';

const allSpecies: readonly SpeciesDef[] = [...BALL_SPECIES, ...ENEMY_SPECIES, BOSS_SPECIES];

/** Complete configuration injected into the domain. */
export const gameConfig: GameConfig = {
  ...baseConfig,
  species: Object.fromEntries(allSpecies.map((s) => [s.id, s])),
  enemySpecies: ENEMY_SPECIES.map((s) => s.id),
};
