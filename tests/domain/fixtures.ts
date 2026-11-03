import { baseConfig } from '../../src/data/config';
import type { Ball, GameConfig, GameType, SpeciesDef } from '../../src/domain';

/** Real base stats of four starters and a few wild species (test fixture, not game data). */
const SPECIES: readonly SpeciesDef[] = [
  { id: 'charmander', type: 'fire', baseStats: { hp: 39, attack: 52, speed: 65 } },
  { id: 'squirtle', type: 'water', baseStats: { hp: 44, attack: 48, speed: 43 } },
  { id: 'bulbasaur', type: 'grass', baseStats: { hp: 45, attack: 49, speed: 45 } },
  { id: 'pikachu', type: 'electric', baseStats: { hp: 35, attack: 55, speed: 90 } },
  { id: 'vulpix', type: 'fire', baseStats: { hp: 38, attack: 41, speed: 65 } },
  { id: 'psyduck', type: 'water', baseStats: { hp: 50, attack: 52, speed: 55 } },
];

export const config: GameConfig = {
  ...baseConfig,
  species: Object.fromEntries(SPECIES.map((s) => [s.id, s])),
  enemySpecies: ['vulpix', 'psyduck', 'bulbasaur', 'pikachu'],
};

/** Same config with spawning disabled and no aim jitter, for hand-built scenarios. */
export const quietConfig: GameConfig = {
  ...config,
  ball: { ...config.ball, aimJitter: 0 },
  enemy: { ...config.enemy, spawnIntervalTicks: 0 },
};

export function makeBall(overrides: Partial<Ball> & { type?: GameType } = {}): Ball {
  const type = overrides.type ?? 'fire';
  return {
    id: 1,
    species: 'charmander',
    type,
    level: 1,
    hybrid: false,
    effects: [{ kind: 'burn', strength: 2 }],
    ...overrides,
  };
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
