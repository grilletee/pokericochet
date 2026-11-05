import type { GameConfig, GameType, MovesDef } from '../../domain';

/**
 * Game rules as data, kept out of the domain (ADR-005, ADR-006). Initial values, not balanced.
 * Species and the move of each species (generated from PokéAPI by tools/fetch-data) are merged in
 * later.
 */
const ALL_TYPES: readonly GameType[] = ['fire', 'water', 'grass', 'electric'];

export const baseConfig: Omit<
  GameConfig,
  'species' | 'enemySpecies' | 'ballSpecies' | 'lines' | 'forms' | 'moves'
> & { readonly moves: Omit<MovesDef, 'byBase'> } = {
  // Moves with a real name, cast when a Pokémon has landed enough hits (ADR-039). PROVISIONAL:
  // the charge, the strength and the sizes are calibrated with the bots (M11-M13) and ?tune.
  moves: {
    // Measured with 40 runs per starter (pnpm bench:fun): casts 10/8/6 and strengths 1.5/2.5/4 made
    // the moves 54 % of the damage and 25 labels a minute; 16/13/11 and 0.7/1.2/1.9 give 29 %
    // (target 15-35 %), 17 labels a minute (10-25) and the starter's signature 5 times a minute.
    chargeByStage: [16, 13, 11],
    tiers: [
      { kind: 'burst', radius: 56, power: 0.7 },
      { kind: 'beam', width: 44, power: 1.2 },
      { kind: 'nova', radius: 110, power: 1.9 },
    ],
    // The signatures of the four starters (ADR-039): a cross, a wave, a long beam, a long chain.
    signatures: {
      // From stage 2 every starter has one (4F-D); the player throws it, it never goes off alone.
      // Powers measured with the active bot (M7, M17): the first set (2 / 1.7 / 2 at stage 2) gave
      // Squirtle 50 % and Bulbasaur 66 %; these give 57 % and 59 % (150 runs per starter), and
      // throwing the signature is worth about 11 points of win rate for the bot.
      charmander: [
        null,
        { kind: 'cross', width: 36, power: 1.8 },
        { kind: 'cross', width: 48, power: 2.8 },
      ],
      squirtle: [
        null,
        { kind: 'wave', width: 56, power: 2.2 },
        { kind: 'wave', width: 72, power: 3.4 },
      ],
      bulbasaur: [
        null,
        { kind: 'beam', width: 56, power: 1.6 },
        { kind: 'beam', width: 72, power: 2.5 },
      ],
      pikachu: [
        { kind: 'chain', count: 1, power: 1 },
        { kind: 'chain', count: 3, power: 1.7 },
        { kind: 'chain', count: 5, power: 2.4 },
      ],
    },
    status: {
      fire: { burn: 2 },
      water: { slow: 0.3 },
      grass: { slow: 0.4 },
      electric: { slow: 0.6 },
    },
  },
  // Hybrids are off (ADR-033): the code and its tests stay, the card is never offered.
  hybrid: { enabled: false },
  // A team of up to six Pokémon, each firing balls that grow with its level (ADR-030, ADR-031).
  // PROVISIONAL like the rest: calibrated with the bots (M1-M10) and ?tune in 4F-B.
  team: {
    maxMembers: 6,
    maxLevel: 8,
    ballsByLevel: [1, 1, 2, 2, 2, 3, 3, 3],
    stageLevels: [3, 6],
    starterBonus: 0.6,
    ballRadiusByStage: [6, 7, 9],
    // A stage that keeps the form is worth as much as one that changes it (ADR-037): the damage of
    // every line grows at least x1.2 at stage 2 and x1.45 at stage 3, which is what the lines of
    // three forms bring by their stats (measured by M14 of the fun bench).
    stageGrowth: [1, 1.2, 1.45],
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
    // 4F-C: at the new difficulty the old values (0.3 and x1.8) left the assisted aim at 4 % wins
    // against 51 % by hand (47 points); the author plays with it when there are many enemies, so it
    // must stay viable. 0.2 and x1.25 give 26 % against 52 % (M4: 25 points, target >= 15).
    aimJitter: 0.2,
    manualAimJitter: 0.02,
    // The assisted aim is a weaker aid on purpose: it reloads slower and spreads more (ADR-021).
    autoCooldownMult: 1.25,
    speedMin: 6,
    speedMax: 9,
    // No form may make the ball faster than this (ADR-038); measured with the bot's pickup rate.
    speedCap: 8.4,
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
    // 4F-C: stats of the form, moves and the stage growth add damage, so 0.88 -> 1.72 (bot win 98 %
    // with 0.88 and 93 % with the moves; 52 % at 1.6, 52 % at 1.65 and 43 % [38-48] at 1.72, 80 runs
    // per starter, active bot, with the starter and aim settings of this file).
    // 4F-D: -10 % at the author's request (1.72 -> 1.55); with the signature thrown by the bot it
    // wins 59 % [56-62] (48 % without the signature), above the 35-50 % window of the bot; the
    // author tunes the final value with ?tune ("Vida enemiga").
    hpScale: 1.55,
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
      spawnIntervalTicks: 215,
      speedScale: 0.8,
      hpScale: 0.55,
      tier: 1,
      types: ALL_TYPES,
      themes: ['fire-pack', 'water-pond', 'grass-garden', 'electric-meadow', 'growlithe-pack'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 110,
      speedScale: 0.9,
      hpScale: 0.85,
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
      hpScale: 1.7,
      tier: 2,
      types: ALL_TYPES,
      themes: ['fire-pack', 'water-pond', 'grass-forest', 'electric-storm'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 58,
      speedScale: 1.1,
      hpScale: 2.4,
      tier: 2,
      types: ALL_TYPES,
      themes: ['fire-starters', 'water-tide', 'grass-garden', 'voltorb-army'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 54,
      speedScale: 1.2,
      hpScale: 2.8,
      tier: 3,
      types: ALL_TYPES,
      themes: ['fire-volcano', 'water-shore', 'grass-forest', 'electric-meadow'],
    },
    {
      durationTicks: 3600,
      spawnIntervalTicks: 48,
      speedScale: 1.3,
      hpScale: 3.1,
      tier: 3,
      types: ALL_TYPES,
      themes: ['growlithe-pack', 'water-tide', 'grass-garden', 'electric-storm'],
    },
  ],
  stats: {
    damageDivisor: 10,
    // The real stats of the form decide the damage (ADR-038): max(Attack, Special Attack) from 40
    // to 135 gives x0.75 to x1.75 on top of powerRef / damageDivisor (Charmander: 5.3, as before).
    powerRef: 55,
    powerStatMin: 40,
    powerStatMax: 135,
    powerMultMin: 0.75,
    powerMultMax: 1.75,
    // Mean of HP, Defense and Special Defense of the team: 40 -> no guard, 100 -> 35 %.
    guardStatMin: 40,
    guardStatMax: 100,
    guardMax: 0.35,
    // The stats of a new form already bring part of the growth, so the table is divided by the
    // mean form growth (about x1.2 at stage 2 and x1.45 at stage 3) from the 4F-B table
    // [1, 1.3, 1.6, 2, 2.4, 2.9, 3.5, 4.2]; still strictly growing, so every level matters.
    levelMultiplier: [1, 1.3, 1.35, 1.7, 2, 2.1, 2.5, 3],
    speedStatMin: 20,
    speedStatMax: 130,
    // Damage = attack / damageDivisor * typeDamage. Grass has no offensive effect (it only
    // heals), so it gets x2 base damage: the smallest value measured (1.5, 1.75, 2) that puts
    // Bulbasaur within ~10 points of the other starters (ADR-015, measured with n = 25 and later
    // found noisy). Electric x0.85: with 200 runs per starter Pikachu was clearly above the rest
    // (81 % vs 47-72 %); x0.85 brings it to 65 % [58-71]. Grass stays at x2 until a human playtest.
    // 4F-C: with the real stats of the forms the four starters moved apart (Pikachu 40 % against
    // 47-57 %, Bulbasaur above the rest). Electric 0.85 -> 1.35, grass 2.5 -> 2.3, fire 1 -> 1.05:
    // 46 / 46 / 40 / 39 % (80 runs each), a spread of 8 points (target <= 10, error about 8).
    // 4F-D: with the signature thrown by hand (and 10 % less enemy hp) Squirtle trailed the rest
    // (51 % against 62 %: a spread of 11-12 points, 300 runs per starter) and signature powers
    // did not move it. Water 0.9 -> 1.0 and grass 2.3 -> 2.1 give 61 / 59 / 60 / 58 %, a spread of 3.
    // 4F-E: the stage 3 captures (level 6) and the new wave curve moved the starters apart again
    // (Squirtle 51 %, Bulbasaur 68 %): water 1.0 -> 1.15, grass 2.1 -> 1.95, electric 1.35 -> 1.3
    // give 65 / 62 / 65 / 65 % (300 runs per starter), a spread of 4.
    typeDamage: { fire: 1.05, water: 1.15, grass: 1.95, electric: 1.3 },
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
