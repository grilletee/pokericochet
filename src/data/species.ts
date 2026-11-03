import type { SpeciesDef } from '../domain';

/**
 * PROVISIONAL species table, typed by hand so that the vertical slice can be played before the
 * data pipeline exists. Stage 3D replaces it with JSON generated from PokéAPI by
 * tools/fetch-data (same `SpeciesDef` shape, type = first listed type). Do not rely on these
 * numbers being exact.
 */
const sp = (
  id: string,
  type: SpeciesDef['type'],
  hp: number,
  attack: number,
  speed: number,
): SpeciesDef => ({ id, type, baseStats: { hp, attack, speed } });

/** The 8 species the player can use as balls (2 per type). */
export const BALL_SPECIES: readonly SpeciesDef[] = [
  sp('charmander', 'fire', 39, 52, 65),
  sp('vulpix', 'fire', 38, 41, 65),
  sp('squirtle', 'water', 44, 48, 43),
  sp('psyduck', 'water', 50, 52, 55),
  sp('bulbasaur', 'grass', 45, 49, 45),
  sp('oddish', 'grass', 45, 50, 30),
  sp('pikachu', 'electric', 35, 55, 90),
  sp('magnemite', 'electric', 25, 35, 45),
];

/** The 8 wild species that spawn as enemies. */
export const ENEMY_SPECIES: readonly SpeciesDef[] = [
  sp('growlithe', 'fire', 55, 70, 60),
  sp('ponyta', 'fire', 50, 85, 90),
  sp('poliwag', 'water', 40, 50, 90),
  sp('horsea', 'water', 30, 40, 60),
  sp('bellsprout', 'grass', 50, 75, 40),
  sp('exeggcute', 'grass', 60, 40, 40),
  sp('voltorb', 'electric', 40, 30, 100),
  sp('electabuzz', 'electric', 65, 83, 105),
];

/** The final boss. */
export const BOSS_SPECIES: SpeciesDef = sp('gyarados', 'water', 95, 125, 81);

/** The starters offered on the title screen, in order (keys 1-4). */
export const STARTER_SPECIES: readonly string[] = [
  'charmander',
  'squirtle',
  'bulbasaur',
  'pikachu',
];
