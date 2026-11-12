import { baseConfig } from '../../src/data/config';
import {
  type Ball,
  type BallBody,
  type Command,
  createRun,
  type Enemy,
  type GameConfig,
  type GameType,
  type Run,
  type SpeciesDef,
  tick,
} from '../../src/domain';

/**
 * The three stats the fixtures care about are real (HP, Attack, Speed); the rest are plausible.
 * Special Attack is always under Attack, so the damage still reads off Attack (ADR-038).
 */
function stats(hp: number, attack: number, speed: number): SpeciesDef['baseStats'] {
  return { hp, attack, defense: 50, specialAttack: attack - 2, specialDefense: 50, speed };
}

/** Real base stats of four starters and a few wild species (test fixture, not game data). */
const SPECIES: readonly SpeciesDef[] = [
  { id: 'charmander', type: 'fire', baseStats: stats(39, 52, 65) },
  { id: 'squirtle', type: 'water', baseStats: stats(44, 48, 43) },
  { id: 'bulbasaur', type: 'grass', baseStats: stats(45, 49, 45) },
  { id: 'pikachu', type: 'electric', baseStats: stats(35, 55, 90) },
  { id: 'vulpix', type: 'fire', baseStats: stats(38, 41, 65) },
  { id: 'psyduck', type: 'water', baseStats: stats(50, 52, 55) },
  { id: 'gyarados', type: 'water', baseStats: stats(95, 125, 81) },
];

// The test species list is small: the final boss is a plain species (no legendary table) and there
// are no bosses between waves unless a test adds them.
const { byType: _legendaries, ...plainBoss } = baseConfig.boss ?? { species: 'gyarados' };
// The pool of a run (ADR-048) has its own tests on the real data; the small fixtures keep every
// species in the pool, as before.
// The boss fight (ADR-046) has its own tests too: the older ones are about a plain boss.
const { pool: _pool, bossFight: _fight, ...baseWithoutPool } = baseConfig;

export const config: GameConfig = {
  ...baseWithoutPool,
  // The starter bonus, the stage boost, the guard and the moves have their own tests; the rest of
  // the damage tests count on exact numbers: damage = Attack / 10 x level x type, a leak = its
  // threat, no move is cast (no species has one) and no ball is capped.
  team: { ...baseConfig.team, starterBonus: 0, stageGrowth: [1, 1, 1] },
  moves: { ...baseConfig.moves, byBase: {} },
  ball: { ...baseConfig.ball, speedCap: 9 },
  stats: {
    ...baseConfig.stats,
    // Attack / 10 exactly: 100 / 10 x (P / 100) for a power stat under 200.
    powerRef: 100,
    powerStatMin: 0,
    powerStatMax: 200,
    powerMultMin: 0,
    powerMultMax: 2,
    guardMax: 0,
    levelMultiplier: [1, 1.3, 1.6, 2, 2.4, 2.9, 3.5, 4.2],
    // The type damage the exact-number tests were written with (the game's own is calibrated).
    typeDamage: { fire: 1, water: 0.9, grass: 2.5, electric: 0.85 },
  },
  ...(baseConfig.boss === undefined ? {} : { boss: plainBoss as NonNullable<GameConfig['boss']> }),
  interludes: [],
  species: Object.fromEntries(SPECIES.map((s) => [s.id, s])),
  enemySpecies: ['vulpix', 'psyduck', 'bulbasaur', 'pikachu'],
  ballSpecies: ['charmander', 'squirtle', 'bulbasaur', 'pikachu', 'vulpix', 'psyduck'],
};

/** Same config with spawning disabled, no boss and no aim jitter, for hand-built scenarios. */
// No threat marks either (4G-G): they have their own tests with their own table.
const { boss: _boss, enemyThreat: _threat, ...configWithoutBoss } = config;

export const quietConfig: GameConfig = {
  ...configWithoutBoss,
  ball: { ...config.ball, aimJitter: 0, manualAimJitter: 0 },
  // No drops: the unit tests that kill enemies are about something else (captures have their own).
  capture: { ...config.capture, chance: 0 },
  waves: [],
};

export function makeBall(overrides: Partial<Ball> & { type?: GameType } = {}): Ball {
  const type = overrides.type ?? 'fire';
  return {
    id: 1,
    owner: 0,
    stage: 1,
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

/**
 * Command that moves with the assisted aim on (so scenarios fight without an aim input) and, if
 * the run waits for a card, picks the first offer.
 */
export function autoCommand(run: Run, moveX: -1 | 0 | 1 = 0): Command {
  return run.phase === 'levelup'
    ? { moveX, autoAim: true, action: { type: 'pick', index: 0 } }
    : { moveX, autoAim: true };
}

/** Advances a run (picking cards as needed) until `done` holds; fails loudly if it never does. */
export function advanceUntil(
  run: Run,
  cfg: GameConfig,
  done: (run: Run) => boolean,
  maxTicks = 5000,
): void {
  for (let i = 0; i < maxTicks; i++) {
    if (done(run)) return;
    tick(run, autoCommand(run, i % 80 < 40 ? 1 : -1), cfg);
  }
  throw new Error(`scenario not reached within ${maxTicks} ticks`);
}

export function makeEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 1,
    species: 'psyduck',
    type: 'water',
    hp: 1000,
    x: 240,
    y: 380,
    speed: 0,
    radius: quietConfig.enemy.radius,
    threat: 1,
    xp: 3,
    burnTicks: 0,
    burnDps: 0,
    slowTicks: 0,
    slow: 0,
    ...overrides,
  };
}

export function makeBody(overrides: Partial<BallBody> = {}): BallBody {
  return { slot: 0, x: 240, y: 400, vx: 0, vy: -6, pierce: 0, skipId: 0, ...overrides };
}

/** A run with one ball already in flight and the given enemies; no spawning. */
export function flyingRun(
  ball: Ball,
  enemies: Enemy[],
  body: BallBody = makeBody(),
  cfg: GameConfig = quietConfig,
): Run {
  const run = createRun(cfg, 1, 'charmander');
  run.loadout = [ball];
  run.cooldowns = [-1];
  run.bodies = [body];
  run.enemies = enemies;
  run.nextEnemyId = 100;
  return run;
}

/** A config like `quietConfig` with some sections replaced. */
export function withConfig(overrides: Partial<GameConfig>): GameConfig {
  return { ...quietConfig, ...overrides };
}
