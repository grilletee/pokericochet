import type { GameConfig, GameType } from '../../domain';

/**
 * Game rules as data, kept out of the domain (ADR-005, ADR-006). Initial values, not balanced.
 * Species (generated from PokéAPI by tools/fetch-data) are merged in later.
 */
const ALL_TYPES: readonly GameType[] = ['fire', 'water', 'grass', 'electric'];

export const baseConfig: Omit<
  GameConfig,
  'species' | 'enemySpecies' | 'ballSpecies' | 'lines' | 'forms'
> = {
  // Hybrids are off (ADR-033): the code and its tests stay, the card is never offered.
  hybrid: { enabled: false },
  // A team of up to six Pokémon, each firing balls that grow with its level (ADR-030, ADR-031).
  // PROVISIONAL like the rest: calibrated with the bots (M1-M10) and ?tune in 4F-B.
  team: {
    maxMembers: 6,
    maxLevel: 8,
    ballsByLevel: [1, 1, 2, 2, 2, 3, 3, 3],
    stageLevels: [3, 6],
    captureLevels: [1, 3, 4],
    starterBonus: 0.6,
    ballRadiusByStage: [6, 7, 9],
  },
  // What a ball does by type and stage; signatures per species; a generic table for any other
  // type, so a new type works from the first day (ADR-031, ADR-035).
  abilities: {
    byType: {
      fire: [
        [{ kind: 'burn', strength: 2 }],
        [
          { kind: 'burn', strength: 2.5 },
          { kind: 'burnArea', strength: 0.5, radius: 56 },
        ],
        [
          { kind: 'burn', strength: 3 },
          { kind: 'burnArea', strength: 0.6, radius: 64 },
          { kind: 'blast', strength: 0.8, radius: 56 },
        ],
      ],
      water: [
        [{ kind: 'pierce', strength: 1 }],
        [
          { kind: 'pierce', strength: 2 },
          { kind: 'splash', strength: 0.35, radius: 44 },
        ],
        [
          { kind: 'pierce', strength: 3 },
          { kind: 'splash', strength: 0.5, radius: 52 },
        ],
      ],
      grass: [
        [{ kind: 'drain', strength: 0.5 }],
        [
          { kind: 'drain', strength: 0.6 },
          { kind: 'slow', strength: 0.3 },
        ],
        [
          { kind: 'drain', strength: 0.8 },
          { kind: 'slow', strength: 0.45 },
        ],
      ],
      electric: [
        [{ kind: 'chain', strength: 0.5 }],
        [{ kind: 'chain', strength: 0.5, count: 2 }],
        [{ kind: 'chain', strength: 0.6, count: 3 }],
      ],
    },
    signatures: {
      charmander: [
        null,
        null,
        [
          { kind: 'burn', strength: 3.2 },
          { kind: 'burnArea', strength: 0.7, radius: 72 },
          { kind: 'blast', strength: 1.2, radius: 72 },
        ],
      ],
      squirtle: [
        null,
        null,
        [
          { kind: 'pierce', strength: 5 },
          { kind: 'splash', strength: 0.5, radius: 52 },
        ],
      ],
      bulbasaur: [
        null,
        null,
        [
          { kind: 'drain', strength: 0.8 },
          { kind: 'slow', strength: 0.5 },
          { kind: 'splash', strength: 0.4, radius: 48 },
        ],
      ],
      pikachu: [null, null, [{ kind: 'chain', strength: 0.7, count: 4 }]],
    },
    generic: [
      [],
      [{ kind: 'splash', strength: 0.2, radius: 36 }],
      [{ kind: 'splash', strength: 0.35, radius: 48 }],
    ],
  },
  arena: { width: 480, height: 720, defenseLineY: 640 },
  player: { y: 680, speed: 5, margin: 20, maxHp: 10 },
  ball: {
    radius: 6,
    cooldownTicks: 72,
    aimJitter: 0.3,
    manualAimJitter: 0.02,
    // The assisted aim is a weaker aid on purpose: it reloads slower and spreads more (ADR-021).
    autoCooldownMult: 1.8,
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
  // With the team full a new species is rarer: every capture then asks for a decision (ADR-030).
  capture: { chance: 0.05, pityStep: 0.02, startMisses: 6, fullTeamChanceMult: 0.07 },
  enemy: {
    radius: 16,
    threat: 1,
    // A leak hurts more with the form of the enemy: 1, 3, 5 (ADR-032).
    threatPerTier: 2,
    lanes: 7,
    speedMin: 0.2,
    speedMax: 0.5,
    speedVariation: 0.15,
    // Tuned with the balance harness (pnpm bench:balance); GDD-v0 does not fix enemy hp.
    hpScale: 0.88,
  },
  // The final boss (ADR-016, ADR-028): a legendary of the type drawn by the run's seed. hpScale is
  // PROVISIONAL like the rest of the curve (4D-B): measured with bots (time to kill), to be
  // validated with a human playtest. `species` is only the fallback if the table is not used.
  boss: {
    species: 'gyarados',
    byType: { fire: 'moltres', water: 'kyogre', grass: 'virizion', electric: 'zapdos' },
    hpScale: 44,
    speed: 0.12,
    radius: 40,
    summonIntervalTicks: 480,
    summonCount: 4,
    summonSpeedScale: 1,
    summonHpScale: 0.8,
  },
  // Bosses between waves (ADR-028): the species is the one of the type of the wave that just ended.
  // The first is only a little better than a normal enemy; each one is tougher than the last.
  interludes: [
    {
      after: 2,
      byType: { fire: 'rapidash', water: 'starmie', grass: 'victreebel', electric: 'electabuzz' },
      hpScale: 5.5,
      speed: 0.12,
      radius: 28,
      summonIntervalTicks: 600,
      summonCount: 2,
      summonSpeedScale: 1,
      summonHpScale: 0.8,
      healHp: 0, // bosses no longer heal (ADR-032): the reward is the capture
    },
    {
      after: 4,
      byType: { fire: 'arcanine', water: 'gyarados', grass: 'exeggutor', electric: 'ampharos' },
      hpScale: 12,
      speed: 0.13,
      radius: 34,
      summonIntervalTicks: 540,
      summonCount: 3,
      summonSpeedScale: 1,
      summonHpScale: 0.8,
      healHp: 0, // bosses no longer heal (ADR-032): the reward is the capture
    },
    {
      after: 6,
      byType: { fire: 'typhlosion', water: 'kingdra', grass: 'tangrowth', electric: 'luxray' },
      hpScale: 28,
      speed: 0.14,
      radius: 38,
      summonIntervalTicks: 480,
      summonCount: 4,
      summonSpeedScale: 1,
      summonHpScale: 0.8,
      healHp: 0, // bosses no longer heal (ADR-032): the reward is the capture
    },
  ],
  // Wave themes (ADR-027). Species are base forms; the wave's `tier` picks the evolution form.
  themes: {
    'fire-pack': {
      id: 'fire-pack',
      name: 'Manada de fuego',
      type: 'fire',
      species: ['growlithe', 'ponyta', 'numel', 'magmar'],
      purity: 0.8,
    },
    'fire-starters': {
      id: 'fire-starters',
      name: 'Iniciales ardientes',
      type: 'fire',
      species: ['cyndaquil', 'torchic', 'chimchar'],
      purity: 0.8,
    },
    'fire-volcano': {
      id: 'fire-volcano',
      name: 'Volcán',
      type: 'fire',
      species: ['slugma', 'magmar', 'numel'],
      purity: 0.8,
    },
    'growlithe-pack': {
      id: 'growlithe-pack',
      name: 'Manada de Growlithe',
      type: 'fire',
      species: ['growlithe'],
      purity: 0.9,
    },
    'water-tide': {
      id: 'water-tide',
      name: 'Marea',
      type: 'water',
      species: ['poliwag', 'horsea', 'krabby', 'staryu', 'goldeen'],
      purity: 0.8,
    },
    'water-pond': {
      id: 'water-pond',
      name: 'Estanque',
      type: 'water',
      species: ['poliwag', 'wooper', 'lotad', 'goldeen'],
      purity: 0.8,
    },
    'water-shore': {
      id: 'water-shore',
      name: 'Costa',
      type: 'water',
      species: ['shellder', 'krabby', 'staryu', 'horsea'],
      purity: 0.8,
    },
    'grass-garden': {
      id: 'grass-garden',
      name: 'Jardín',
      type: 'grass',
      species: ['bellsprout', 'hoppip', 'sunkern', 'chikorita'],
      purity: 0.8,
    },
    'grass-forest': {
      id: 'grass-forest',
      name: 'Bosque',
      type: 'grass',
      species: ['seedot', 'shroomish', 'tangela', 'exeggcute'],
      purity: 0.8,
    },
    'electric-storm': {
      id: 'electric-storm',
      name: 'Tormenta eléctrica',
      type: 'electric',
      species: ['voltorb', 'electabuzz', 'mareep', 'shinx'],
      purity: 0.8,
    },
    'electric-meadow': {
      id: 'electric-meadow',
      name: 'Pradera',
      type: 'electric',
      species: ['mareep', 'blitzle', 'helioptile'],
      purity: 0.8,
    },
    'voltorb-army': {
      id: 'voltorb-army',
      name: 'Ejército de Voltorb',
      type: 'electric',
      species: ['voltorb'],
      purity: 0.9,
    },
  },
  // 7 waves of 60 s (3600 ticks): an explicit curve of density, health, speed and form (ADR-029).
  // Every wave may draw any of its themes; the general pool of its types fills the rest.
  waves: [
    {
      durationTicks: 3600,
      // Softer than the rest of the curve on purpose: the run starts with a single ball (M5, 4D).
      spawnIntervalTicks: 260,
      speedScale: 0.8,
      hpScale: 0.45,
      tier: 1,
      types: ALL_TYPES,
      themes: ['fire-pack', 'water-pond', 'grass-garden', 'electric-meadow', 'growlithe-pack'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 110,
      speedScale: 0.9,
      hpScale: 0.6,
      tier: 1,
      types: ALL_TYPES,
      themes: ['fire-starters', 'water-tide', 'grass-forest', 'electric-storm', 'voltorb-army'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 90,
      speedScale: 1.0,
      hpScale: 1.35,
      tier: 1,
      types: ALL_TYPES,
      themes: ['fire-volcano', 'water-shore', 'grass-garden', 'electric-meadow'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 70,
      speedScale: 1.05,
      hpScale: 1.6,
      tier: 2,
      types: ALL_TYPES,
      themes: ['fire-pack', 'water-pond', 'grass-forest', 'electric-storm'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 58,
      speedScale: 1.1,
      hpScale: 2.3,
      tier: 2,
      types: ALL_TYPES,
      themes: ['fire-starters', 'water-tide', 'grass-garden', 'voltorb-army'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 50,
      speedScale: 1.2,
      hpScale: 3.1,
      tier: 3,
      types: ALL_TYPES,
      themes: ['fire-volcano', 'water-shore', 'grass-forest', 'electric-meadow'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 44,
      speedScale: 1.3,
      hpScale: 3.7,
      tier: 3,
      types: ALL_TYPES,
      themes: ['growlithe-pack', 'water-tide', 'grass-garden', 'electric-storm'],
    },
  ],
  stats: {
    damageDivisor: 10,
    levelMultiplier: [1, 1.3, 1.6, 2, 2.4, 2.9, 3.5, 4.2],
    speedStatMin: 20,
    speedStatMax: 130,
    // Damage = attack / damageDivisor * typeDamage. Grass has no offensive effect (it only
    // heals), so it gets x2 base damage: the smallest value measured (1.5, 1.75, 2) that puts
    // Bulbasaur within ~10 points of the other starters (ADR-015, measured with n = 25 and later
    // found noisy). Electric x0.85: with 200 runs per starter Pikachu was clearly above the rest
    // (81 % vs 47-72 %); x0.85 brings it to 65 % [58-71]. Grass stays at x2 until a human playtest.
    typeDamage: { fire: 1, water: 0.9, grass: 2.5, electric: 0.85 },
  },
  // Drain heals much less than in 4D: it gave back more than half of the health lost (ADR-032).
  effects: { burnTicks: 180, drainPerHp: 30, chainRadius: 80, slowTicks: 120 },
  progression: {
    levelCosts: [11, 15, 21, 27, 35, 43, 54, 67, 82, 100],
    hpPerXp: 10,
    lootChance: 0.1,
    lootMultiplier: 3,
  },
  cards: {
    offerCount: 3,
    // Relative odds; a card that cannot be played (a full team, every Pokémon at the cap) has none.
    weights: { newBall: 3, train: 8, power: 3, cadence: 3, vitality: 2, team: 1, hybrid: 0 },
    powerStep: 0.45,
    damageStep: 0.08,
    cadenceFactor: 0.85,
    cadenceFloor: 0.4,
    upgradeCap: 6,
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
};
