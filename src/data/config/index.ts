import type { GameConfig, GameType } from '../../domain';

/**
 * Game rules as data, kept out of the domain (ADR-005, ADR-006). Initial values, not balanced.
 * Species (generated from PokéAPI by tools/fetch-data) are merged in later.
 */
const ALL_TYPES: readonly GameType[] = ['fire', 'water', 'grass', 'electric'];

export const baseConfig: Omit<GameConfig, 'species' | 'enemySpecies' | 'ballSpecies'> = {
  arena: { width: 480, height: 720, defenseLineY: 640 },
  player: { y: 680, speed: 5, margin: 20, maxHp: 10 },
  ball: {
    radius: 6,
    cooldownTicks: 72,
    aimJitter: 0.176,
    speedMin: 6,
    speedMax: 9,
    minVerticalRatio: 0.2,
  },
  enemy: {
    radius: 16,
    threat: 1,
    lanes: 7,
    speedMin: 0.2,
    speedMax: 0.5,
    speedVariation: 0.15,
    // Tuned with the balance harness (pnpm bench:balance); GDD-v0 does not fix enemy hp.
    hpScale: 0.45,
  },
  // The final boss (ADR-016). Provisional numbers, tuned with the balance harness.
  boss: {
    species: 'gyarados',
    hpScale: 30,
    speed: 0.12,
    radius: 40,
    summonIntervalTicks: 600,
    summonCount: 4,
    summonSpeedScale: 1,
    summonHpScale: 0.8,
  },
  // 7 waves of 60 s (3600 ticks). Waves 1-3 each bring one type; 4-7 mix all four (GDD-v0).
  waves: [
    {
      durationTicks: 3600,
      spawnIntervalTicks: 150,
      speedScale: 0.8,
      hpScale: 0.6,
      types: ['fire'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 130,
      speedScale: 0.9,
      hpScale: 0.7,
      types: ['water'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 115,
      speedScale: 1.0,
      hpScale: 0.8,
      types: ['grass'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 100,
      speedScale: 1.05,
      hpScale: 0.9,
      types: ALL_TYPES,
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 90,
      speedScale: 1.1,
      hpScale: 1.0,
      types: ALL_TYPES,
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 80,
      speedScale: 1.2,
      hpScale: 1.15,
      types: ALL_TYPES,
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 70,
      speedScale: 1.3,
      hpScale: 1.3,
      types: ALL_TYPES,
    },
  ],
  stats: {
    damageDivisor: 10,
    levelMultiplier: [1, 1.5, 2.25],
    speedStatMin: 20,
    speedStatMax: 130,
    // Damage = attack / damageDivisor * typeDamage. Grass has no offensive effect (it only
    // heals), so it gets x2 base damage: the smallest value measured (1.5, 1.75, 2) that puts
    // Bulbasaur within ~10 points of the other starters (ADR-015).
    typeDamage: { fire: 1, water: 1, grass: 2, electric: 1 },
  },
  effects: { burnTicks: 180, drainPerHp: 15, chainRadius: 80 },
  progression: {
    levelCosts: [18, 25, 34, 45, 58, 72, 90, 112, 137, 166],
    hpPerXp: 10,
    lootChance: 0.1,
    lootMultiplier: 3,
    tokensPerWave: 1,
  },
  cards: {
    offerCount: 3,
    maxBalls: 4,
    weights: { newBall: 4, upgrade: 4, token: 2 },
    damageStep: 0.15,
    cadenceFactor: 0.9,
    cadenceFloor: 0.4,
    vitalityHp: 2,
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
