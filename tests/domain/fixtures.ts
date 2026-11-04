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

/** Real base stats of four starters and a few wild species (test fixture, not game data). */
const SPECIES: readonly SpeciesDef[] = [
  { id: 'charmander', type: 'fire', baseStats: { hp: 39, attack: 52, speed: 65 } },
  { id: 'squirtle', type: 'water', baseStats: { hp: 44, attack: 48, speed: 43 } },
  { id: 'bulbasaur', type: 'grass', baseStats: { hp: 45, attack: 49, speed: 45 } },
  { id: 'pikachu', type: 'electric', baseStats: { hp: 35, attack: 55, speed: 90 } },
  { id: 'vulpix', type: 'fire', baseStats: { hp: 38, attack: 41, speed: 65 } },
  { id: 'psyduck', type: 'water', baseStats: { hp: 50, attack: 52, speed: 55 } },
  { id: 'gyarados', type: 'water', baseStats: { hp: 95, attack: 125, speed: 81 } },
];

export const config: GameConfig = {
  ...baseConfig,
  species: Object.fromEntries(SPECIES.map((s) => [s.id, s])),
  enemySpecies: ['vulpix', 'psyduck', 'bulbasaur', 'pikachu'],
  ballSpecies: ['charmander', 'squirtle', 'bulbasaur', 'pikachu', 'vulpix', 'psyduck'],
};

/** Same config with spawning disabled, no boss and no aim jitter, for hand-built scenarios. */
const { boss: _boss, ...configWithoutBoss } = config;

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
