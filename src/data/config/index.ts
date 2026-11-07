import {
  GAME_TYPES,
  type GameConfig,
  type GameType,
  type MovesDef,
  type ThemeDef,
} from '../../domain';
import typeChartFile from '../generated/typeChart.json';
import { bossFight } from './bosses';

/**
 * Game rules as data, kept out of the domain (ADR-005, ADR-006). Initial values, not balanced.
 * Species and the move of each species (generated from PokéAPI by tools/fetch-data) are merged in
 * later.
 */
const ALL_TYPES: readonly GameType[] = GAME_TYPES;

/** One biome (ADR-049): its types, the first (the heaviest) being the main one. */
function biome(
  id: string,
  name: string,
  types: readonly [GameType, GameType] | readonly [GameType, GameType, GameType],
): ThemeDef {
  return {
    id,
    name,
    type: types[0],
    types: types.map((type, index) => ({ type, weight: 3 - index })),
    purity: 0.8,
  };
}

/**
 * The 14 biomes of ADR-049: every one of the 18 types is in at least one. The main type of each is
 * the one of the first table of the ADR; the other two were chosen by a search among thematic
 * options so that T1 holds (the mean effectiveness of each attack type over the biomes within
 * +-15 % of the global mean, measured by `tests/data/typeBalance.test.ts`): the first table had
 * Rock at +19 %, Ice at +16 %, Normal at -20 % and Poison at -15 %.
 */
const BIOMES: readonly ThemeDef[] = [
  biome('meadow', 'Pradera', ['normal', 'fairy', 'fighting']),
  biome('forest', 'Bosque', ['grass', 'fairy', 'poison']),
  biome('volcano', 'Volcán', ['fire', 'poison', 'dragon']),
  biome('coast', 'Costa', ['water', 'ice', 'flying']),
  biome('swamp', 'Pantano', ['water', 'poison', 'bug']),
  biome('storm', 'Tormenta', ['electric', 'dragon', 'ice']),
  biome('cave', 'Cueva', ['rock', 'ground', 'poison']),
  biome('frozen-peak', 'Cumbre helada', ['ice', 'water', 'fighting']),
  biome('dojo', 'Dojo', ['fighting', 'normal', 'dark']),
  biome('ruins', 'Ruinas', ['psychic', 'ground', 'steel']),
  biome('haunted-house', 'Casa encantada', ['ghost', 'psychic', 'poison']),
  biome('power-plant', 'Central eléctrica', ['electric', 'normal', 'fighting']),
  biome('fairy-glade', 'Claro de hadas', ['fairy', 'normal', 'grass']),
  biome('dragon-sky', 'Cielo del dragón', ['dragon', 'ice', 'ground']),
];
const BIOME_IDS: readonly string[] = BIOMES.map((b) => b.id);

export const baseConfig: Omit<
  GameConfig,
  'species' | 'enemySpecies' | 'ballSpecies' | 'lines' | 'forms' | 'moves'
> & { readonly moves: Omit<MovesDef, 'byBase' | 'types'> } = {
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
      // 4H-B1 (U1): the four are worth the same, measured as the damage of one cast, burn included,
      // in 24 fixed situations (`pnpm bench:ultimates`). The cross hits on two axes and burns, so
      // it was worth half as much again as the average (eighth playtest: "Charizard is broken").
      charmander: [
        null,
        { kind: 'cross', width: 36, power: 1.2 },
        { kind: 'cross', width: 48, power: 1.85 },
      ],
      squirtle: [
        null,
        { kind: 'wave', width: 56, power: 2.4 },
        { kind: 'wave', width: 72, power: 3.35 },
      ],
      bulbasaur: [
        null,
        { kind: 'beam', width: 56, power: 1.65 },
        { kind: 'beam', width: 72, power: 2.5 },
      ],
      pikachu: [
        { kind: 'chain', count: 1, power: 1 },
        { kind: 'chain', count: 3, power: 2.35 },
        { kind: 'chain', count: 5, power: 4.0 },
      ],
    },
    status: {
      fire: { burn: 2 },
      water: { slow: 0.3 },
      grass: { slow: 0.4 },
      electric: { slow: 0.6 },
      ice: { slow: 0.5 },
      poison: { burn: 1 },
      ghost: { slow: 0.3 },
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
      // The other 14 types (4H-B2, ADR-047): a row of data each, in the seven families. Provisional,
      // calibrated with the type-balance bench (T2).
      // direct: a base damage a little higher (typeDamage) and no effect.
      normal: [[], [], []],
      dragon: [[], [], []],
      // damage over time
      poison: [
        [{ kind: 'poison', strength: 0.5 }],
        [{ kind: 'poison', strength: 0.7 }],
        [
          { kind: 'poison', strength: 0.9 },
          { kind: 'slow', strength: 0.2 },
        ],
      ],
      ghost: [
        [{ kind: 'curse', strength: 0.8 }],
        [{ kind: 'curse', strength: 1.1 }],
        [{ kind: 'curse', strength: 1.5 }],
      ],
      // jumps: more of them than Electric, weaker
      bug: [
        [{ kind: 'chain', strength: 0.3, count: 2 }],
        [{ kind: 'chain', strength: 0.35, count: 3 }],
        [{ kind: 'chain', strength: 0.4, count: 4 }],
      ],
      // pierce
      flying: [
        [{ kind: 'pierce', strength: 1 }],
        [{ kind: 'pierce', strength: 2 }],
        [{ kind: 'pierce', strength: 3 }],
      ],
      steel: [
        [{ kind: 'pierce', strength: 0.5 }],
        [{ kind: 'pierce', strength: 1 }],
        [{ kind: 'pierce', strength: 1.5 }],
      ],
      // explosions
      rock: [
        [{ kind: 'blast', strength: 0.6, radius: 60 }],
        [{ kind: 'blast', strength: 0.8, radius: 72 }],
        [{ kind: 'blast', strength: 1, radius: 84 }],
      ],
      ground: [
        [{ kind: 'quake', strength: 0.45, radius: 28 }],
        [{ kind: 'quake', strength: 0.6, radius: 32 }],
        [{ kind: 'quake', strength: 0.75, radius: 36 }],
      ],
      fighting: [
        [
          { kind: 'splash', strength: 0.3, radius: 40 },
          { kind: 'push', strength: 18 },
        ],
        [
          { kind: 'splash', strength: 0.4, radius: 44 },
          { kind: 'push', strength: 26 },
        ],
        [
          { kind: 'splash', strength: 0.5, radius: 48 },
          { kind: 'push', strength: 34 },
        ],
      ],
      // sustain
      fairy: [
        [
          { kind: 'drain', strength: 0.6 },
          { kind: 'guard', strength: 1 },
        ],
        [
          { kind: 'drain', strength: 0.7 },
          { kind: 'guard', strength: 1 },
        ],
        [
          { kind: 'drain', strength: 0.9 },
          { kind: 'guard', strength: 1 },
        ],
      ],
      // control
      ice: [
        [
          { kind: 'slow', strength: 0.3 },
          { kind: 'freeze', strength: 1 },
        ],
        [
          { kind: 'slow', strength: 0.4 },
          { kind: 'freeze', strength: 1 },
        ],
        [
          { kind: 'slow', strength: 0.5 },
          { kind: 'freeze', strength: 1 },
        ],
      ],
      psychic: [
        [{ kind: 'stun', strength: 1 }],
        [
          { kind: 'stun', strength: 1 },
          { kind: 'splash', strength: 0.25, radius: 40 },
        ],
        [
          { kind: 'stun', strength: 1 },
          { kind: 'splash', strength: 0.4, radius: 48 },
        ],
      ],
      dark: [
        [{ kind: 'mark', strength: 0.06 }],
        [{ kind: 'mark', strength: 0.08 }],
        [{ kind: 'mark', strength: 0.1 }],
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
  capture: { chance: 0.0625, pityStep: 0.025, startMisses: 6, fullTeamChanceMult: 0.07 },
  enemy: {
    radius: 16,
    threat: 1,
    // A leak hurts more with the form of the enemy: 1, 3, 5 (ADR-032).
    threatPerTier: 2,
    lanes: 7,
    // 4H-B2: -10 % (0.2 / 0.5 before) after the 9th playtest, where the author had to lower speed
    // and health with ?tune; the author, not the bot, is the difficulty reference (ADR-052).
    speedMin: 0.18,
    speedMax: 0.45,
    speedVariation: 0.15,
    // Tuned with the balance harness (pnpm bench:balance); GDD-v0 does not fix enemy hp.
    // 4F-C: stats of the form, moves and the stage growth add damage, so 0.88 -> 1.72 (bot win 98 %
    // with 0.88 and 93 % with the moves; 52 % at 1.6, 52 % at 1.65 and 43 % [38-48] at 1.72, 80 runs
    // per starter, active bot, with the starter and aim settings of this file).
    // 4F-D: -10 % at the author's request (1.72 -> 1.55); with the signature thrown by the bot it
    // wins 59 % [56-62] (48 % without the signature), above the 35-50 % window of the bot; the
    // author tunes the final value with ?tune ("Vida enemiga").
    // 4H-B2: -20 % (1.55 -> 1.24), same reason; the bot is only a detector of abrupt changes now.
    hpScale: 1.24,
  },
  // The final boss (ADR-016, ADR-028): a legendary of the type drawn by the run's seed. hpScale is
  // PROVISIONAL like the rest of the curve (4D-B): measured with bots (time to kill), to be
  // validated with a human playtest. `species` is only the fallback if the table is not used.
  // 4H-B2: the final boss is a legendary drawn by type among the 15 types that have one (the roster
  // rule keeps legendaries out of every line, so they only ever come as final bosses, ADR-048).
  boss: {
    species: 'lugia',
    byType: {
      fire: 'moltres',
      water: 'kyogre',
      grass: 'virizion',
      electric: 'zapdos',
      ice: 'articuno',
      psychic: 'mewtwo',
      rock: 'regirock',
      steel: 'registeel',
      dragon: 'rayquaza',
      ghost: 'giratina-altered',
      ground: 'groudon',
      dark: 'darkrai',
      normal: 'arceus',
      bug: 'genesect',
    },
    // 4G-C (ADR-053): 26 -> 110, clearly above the third boss between waves (the author: "a real
    // challenge you can die in"); only the open core lets most of the damage through, so the time of
    // the fight is set by the bench (B3). Slow and big, so it takes a long time to reach the line.
    hpScale: 46,
    speed: 0.04,
    radius: 72,
    summonIntervalTicks: 900,
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
      hpScale: 3, // 3.2 in the 4G-B: the first met a team of level 5; it lasts long enough through the core
      speed: 0.07,
      radius: 44,
      summonIntervalTicks: 1100,
      summonCount: 2,
      summonSpeedScale: 1,
      summonHpScale: 0.8,
      // 4G-C: a boss that now hurts gives back some health when it falls (it did not since ADR-032).
      healHp: 3,
    },
    {
      after: 4,
      byType: { fire: 'arcanine', water: 'gyarados', grass: 'exeggutor', electric: 'ampharos' },
      hpScale: 11.5, // 7 in the 4G-B
      speed: 0.075,
      radius: 52,
      summonIntervalTicks: 1000,
      summonCount: 3,
      summonSpeedScale: 1,
      summonHpScale: 0.8,
      healHp: 3,
    },
    {
      after: 6,
      byType: { fire: 'typhlosion', water: 'kingdra', grass: 'tangrowth', electric: 'luxray' },
      hpScale: 24, // 16 in the 4G-B
      speed: 0.08,
      radius: 58,
      summonIntervalTicks: 900,
      summonCount: 4,
      summonSpeedScale: 1,
      summonHpScale: 0.8,
      healHp: 4,
    },
  ],
  // The 14 biomes (ADR-049, which replaces the themes of ADR-027). They list no species: the pool of
  // the run, filtered by their types, gives them. The wave's `tier` picks the evolution form.
  themes: Object.fromEntries(BIOMES.map((b) => [b.id, b])),
  // 7 waves of 45 s (2700 ticks; 60 s before the 4H, eighth playtest "a bit long"): an explicit curve of density, health, speed and form (ADR-029).
  // Every wave may draw any of its themes; the general pool of its types fills the rest.
  waves: [
    {
      durationTicks: 2700,
      // Softer than the rest of the curve on purpose: the run starts with a single ball (M5, 4D).
      spawnIntervalTicks: 215,
      speedScale: 0.8,
      // Not lowered to keep M5 of the 4F-E (4H-B1): with waves of 45 s the pressure per second of the
      // first two waves is 27 % and 16 % above it, because the team grows within a shorter wave, but
      // softening them gave the assisted aim 62 % instead of 49 % (M4 of 15 points fell to 4).
      hpScale: 0.55,
      tier: 1,
      types: ALL_TYPES,
      themes: BIOME_IDS,
    },
    {
      durationTicks: 2700,
      spawnIntervalTicks: 110,
      speedScale: 0.9,
      hpScale: 0.85,
      tier: 1,
      types: ALL_TYPES,
      themes: BIOME_IDS,
    },
    {
      durationTicks: 2700,
      spawnIntervalTicks: 90,
      speedScale: 1.0,
      hpScale: 1.35,
      tier: 1,
      types: ALL_TYPES,
      themes: BIOME_IDS,
    },
    {
      durationTicks: 2700,
      spawnIntervalTicks: 70,
      speedScale: 1.05,
      hpScale: 1.7,
      tier: 2,
      types: ALL_TYPES,
      themes: BIOME_IDS,
    },
    {
      durationTicks: 2700,
      spawnIntervalTicks: 58,
      speedScale: 1.1,
      hpScale: 2.4,
      tier: 2,
      types: ALL_TYPES,
      themes: BIOME_IDS,
    },
    {
      durationTicks: 2700,
      spawnIntervalTicks: 54,
      speedScale: 1.2,
      hpScale: 2.8,
      tier: 3,
      types: ALL_TYPES,
      themes: BIOME_IDS,
    },
    {
      durationTicks: 2700,
      spawnIntervalTicks: 48,
      speedScale: 1.3,
      hpScale: 3.1,
      tier: 3,
      types: ALL_TYPES,
      themes: BIOME_IDS,
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
    // 4H-B2: the other 14 types start here and are calibrated by T2 (`pnpm bench:types`): the
    // types with a weak effect (direct, sustain) get more base damage, the strong ones a little less.
    typeDamage: {
      fire: 1.05,
      water: 1.15,
      grass: 1.95,
      electric: 1.3,
      normal: 1.35,
      dragon: 1.75,
      poison: 1.2,
      ghost: 1.1,
      bug: 1.3,
      flying: 1.15,
      steel: 1.3,
      rock: 1.05,
      ground: 1.15,
      fighting: 1.1,
      fairy: 1.9,
      ice: 1.2,
      psychic: 1.25,
      dark: 1.2,
    },
    // ADR-047: an immunity of the games (x0) counts x0.25 here, and the product over the two types
    // of a defender stays between x0.25 and x3 (a deliberate departure from the games).
    typeScale: { immune: 0.25, min: 0.25, max: 3 },
  },
  // Drain heals much less than in 4D: it gave back more than half of the health lost (ADR-032).
  effects: {
    burnTicks: 180,
    drainPerHp: 30,
    chainRadius: 80,
    slowTicks: 120,
    // 4H-B2 (ADR-047): poison lasts longer than burn and stacks up to five layers; a curse lands
    // after two seconds carrying at most three hits; ice stops every third hit for 1.5 s; a stun is
    // half a second and cannot be chained; a mark lasts 5 s and adds up to +50 %; the fairy guard
    // lasts 3 s after a hit and is worth +15 % of the guard of the team.
    poisonTicks: 360,
    poisonMaxStacks: 5,
    curseTicks: 120,
    curseMaxHits: 3,
    freezeEvery: 3,
    freezeTicks: 90,
    stunTicks: 30,
    markTicks: 300,
    markMax: 0.5,
    guardTicks: 180,
    guardBonus: 0.15,
  },
  // Boss fights: ground attacks, shield with a weak point, stun and three phases (4G-B, ADR-046).
  bossFight,
  // The pool of each run (ADR-048): 3 lines per type (about 40 of the 214), the four starters in.
  pool: {
    linesPerType: 3,
    always: ['charmander', 'squirtle', 'bulbasaur', 'pikachu'],
    minBiomeLines: 4,
  },
  progression: {
    // x0.8 of the 4F values, with the capture and loot chances x1.25: waves of 45 s instead of 60
    // (4H-B1) bring 25 % fewer kills per wave, so the growth per wave stays the same.
    levelCosts: [9, 12, 17, 22, 28, 34, 43, 54, 66, 80],
    hpPerXp: 10,
    lootChance: 0.125,
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
  // typeChart[attacker][defender]: the raw 18 x 18 table generated from PokéAPI (0, 0.5, 1, 2);
  // `stats.typeScale` softens it when it is read (ADR-047).
  typeChart: typeChartFile.chart as GameConfig['typeChart'],
};
