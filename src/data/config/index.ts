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
    aimJitter: 0.2,
    manualAimJitter: 0.02,
    // The assisted aim is a weaker aid on purpose: it reloads slower and spreads more (ADR-021).
    autoCooldownMult: 1.15,
    speedMin: 6,
    speedMax: 9,
    minVerticalRatio: 0.2,
  },
  // Provisional values, tuned live with ?tune and measured with the bots (4B).
  pickup: {
    radius: 36,
    returnTicks: 300,
    returnPenaltyTicks: 60,
    dropSpeed: 2,
    captureTtlTicks: 480,
  },
  capture: { chance: 0.05, pityStep: 0.02, startMisses: 6, overflowDamageStep: 0.05 },
  enemy: {
    radius: 16,
    threat: 1,
    lanes: 7,
    speedMin: 0.2,
    speedMax: 0.5,
    speedVariation: 0.15,
    // Tuned with the balance harness (pnpm bench:balance); GDD-v0 does not fix enemy hp.
    hpScale: 0.68,
  },
  // The final boss (ADR-016). hpScale is PROVISIONAL, like enemy.hpScale: measured with bots,
  // to be revalidated with a human playtest (3E).
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
      spawnIntervalTicks: 140,
      speedScale: 0.8,
      hpScale: 0.6,
      types: ['fire'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 110,
      speedScale: 0.9,
      hpScale: 0.7,
      types: ['water'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 90,
      speedScale: 1.0,
      hpScale: 0.8,
      types: ['grass'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 70,
      speedScale: 1.05,
      hpScale: 0.9,
      types: ALL_TYPES,
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 58,
      speedScale: 1.1,
      hpScale: 1.0,
      types: ALL_TYPES,
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 50,
      speedScale: 1.2,
      hpScale: 1.15,
      types: ALL_TYPES,
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 44,
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
    // Bulbasaur within ~10 points of the other starters (ADR-015, measured with n = 25 and later
    // found noisy). Electric x0.85: with 200 runs per starter Pikachu was clearly above the rest
    // (81 % vs 47-72 %); x0.85 brings it to 65 % [58-71]. Grass stays at x2 until a human playtest.
    typeDamage: { fire: 1, water: 1, grass: 2, electric: 0.85 },
  },
  effects: { burnTicks: 180, drainPerHp: 15, chainRadius: 80 },
  progression: {
    levelCosts: [18, 25, 34, 45, 58, 72, 90, 112, 137, 166],
    hpPerXp: 10,
    lootChance: 0.1,
    lootMultiplier: 3,
  },
  cards: {
    offerCount: 3,
    // Safety valve for the frame budget (ADR-023), not the old limit of 4 that cut the entry.
    maxBalls: 24,
    weights: { newBall: 4, upgrade: 4, hybrid: 4 },
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
