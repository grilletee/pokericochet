import type { GameConfig } from '../../domain';

/**
 * Game rules as data, kept out of the domain (ADR-005, ADR-006). Initial values, not balanced.
 * Species (generated from PokéAPI by tools/fetch-data) are merged in later.
 */
export const baseConfig: Omit<GameConfig, 'species' | 'enemySpecies'> = {
  arena: { width: 480, height: 720, defenseLineY: 640 },
  player: { y: 680, speed: 5, margin: 20, maxHp: 10 },
  ball: { radius: 6, cooldownTicks: 72, aimJitter: 0.176, speedMin: 6, speedMax: 9 },
  enemy: {
    radius: 16,
    threat: 1,
    spawnIntervalTicks: 45,
    speedMin: 0.2,
    speedMax: 0.5,
    hpScale: 1,
  },
  stats: {
    damageDivisor: 10,
    levelMultiplier: [1, 1.5, 2.25],
    speedStatMin: 20,
    speedStatMax: 130,
  },
  grid: { cellSize: 48 },
  // typeChart[attacker][defender]: x2 and x0.5 as in GDD-v0.
  typeChart: {
    fire: { fire: 0.5, water: 0.5, grass: 2, electric: 1 },
    water: { fire: 2, water: 0.5, grass: 0.5, electric: 1 },
    grass: { fire: 0.5, water: 2, grass: 0.5, electric: 1 },
    electric: { fire: 1, water: 2, grass: 0.5, electric: 0.5 },
  },
  // One effect per type. The behaviours themselves arrive with the vertical slice.
  typeEffects: {
    fire: { kind: 'burn', strength: 2 },
    water: { kind: 'pierce', strength: 1 },
    grass: { kind: 'drain', strength: 1 },
    electric: { kind: 'chain', strength: 0.5 },
  },
};
