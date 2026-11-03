import type { Effect, GameType, SpeciesDef } from './types';

/**
 * Everything the simulation reads but never owns. It is injected (ADR-006): the domain does not
 * import JSON or game-data files. Numbers are initial values, not balanced yet.
 */
export interface GameConfig {
  readonly arena: {
    readonly width: number;
    readonly height: number;
    /** An enemy whose y reaches this line hurts the player. */
    readonly defenseLineY: number;
  };
  readonly player: {
    readonly y: number;
    readonly speed: number;
    readonly margin: number;
    readonly maxHp: number;
  };
  readonly ball: {
    readonly radius: number;
    readonly cooldownTicks: number;
    /** Max sideways deviation of the aim, as tan(angle). 0.176 is about 10 degrees. */
    readonly aimJitter: number;
    /** Pixels per tick; must stay below the smallest enemy radius to avoid tunnelling. */
    readonly speedMin: number;
    readonly speedMax: number;
  };
  readonly enemy: {
    readonly radius: number;
    readonly threat: number;
    /** A new enemy every N ticks; 0 disables spawning. */
    readonly spawnIntervalTicks: number;
    readonly speedMin: number;
    readonly speedMax: number;
    readonly hpScale: number;
  };
  readonly stats: {
    readonly damageDivisor: number;
    /** Damage multiplier indexed by level - 1. */
    readonly levelMultiplier: readonly number[];
    readonly speedStatMin: number;
    readonly speedStatMax: number;
  };
  readonly grid: { readonly cellSize: number };
  /** typeChart[attacker][defender] */
  readonly typeChart: Readonly<Record<GameType, Readonly<Record<GameType, number>>>>;
  readonly typeEffects: Readonly<Record<GameType, Effect>>;
  readonly species: Readonly<Record<string, SpeciesDef>>;
  /** Species ids that spawn as wild enemies. */
  readonly enemySpecies: readonly string[];
}
