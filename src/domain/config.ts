import type { Effect, GameType, SpeciesDef } from './types';

/** One wave of the run (7 of them, ~60 s each). */
export interface WaveDef {
  readonly durationTicks: number;
  /** A new enemy every N ticks. */
  readonly spawnIntervalTicks: number;
  /** Multiplies the speed an enemy gets from its species. */
  readonly speedScale: number;
  /** Multiplies the hp an enemy gets from its species. */
  readonly hpScale: number;
  /** Only species of these types spawn in this wave. */
  readonly types: readonly GameType[];
  /** Ids of the themes this wave may get; the run draws one at its start (ADR-027). */
  readonly themes?: readonly string[];
  /** Evolution form of the enemies: 1 = base species, 2 = first form, 3 = last form. Default 1. */
  readonly tier?: number;
}

/** A themed wave (ADR-027): most of its enemies come from `species`, the rest from the wave's types. */
export interface ThemeDef {
  readonly id: string;
  readonly name: string;
  readonly type: GameType;
  /** Base species ids; unknown ones are ignored. */
  readonly species: readonly string[];
  /** Share of the wave's enemies drawn from `species`, 0..1. */
  readonly purity: number;
}

/** The final boss: it appears when the last wave ends and summons small enemies until it dies. */
export interface BossDef {
  readonly species: string;
  /**
   * If present, the species is drawn from this table by the `themes` stream (one legendary per
   * type, ADR-028) and the summons are of that type; `species` is then only the fallback.
   */
  readonly byType?: Readonly<Partial<Record<GameType, string>>>;
  /** Multiplies species hp * enemy.hpScale. */
  readonly hpScale: number;
  /** Pixels advanced downwards per tick. */
  readonly speed: number;
  readonly radius: number;
  readonly summonIntervalTicks: number;
  readonly summonCount: number;
  /** The summoned enemies are of any type, with these multipliers on their species values. */
  readonly summonSpeedScale: number;
  readonly summonHpScale: number;
}

/**
 * A boss between waves (ADR-028): it appears when `after` waves are over, the wave clock stops while
 * it lives, and its death heals the player and drops a guaranteed capture of its own species. The
 * species is the one of the type of the wave that just ended.
 */
export interface InterludeDef extends Omit<BossDef, 'species' | 'byType'> {
  readonly after: number;
  readonly byType: Readonly<Record<GameType, string>>;
  readonly healHp: number;
}

/**
 * Everything the simulation reads but never owns. It is injected (ADR-006): the domain does not
 * import JSON or game-data files. Numbers are initial values, tuned with the balance harness.
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
    /**
     * Max sideways deviation of the assisted (auto) aim, as tan(angle). 0.176 is about 10 degrees.
     */
    readonly aimJitter: number;
    /** Same for the manual aim: the player's precision is the player's. */
    readonly manualAimJitter: number;
    /** The assisted aim reloads this many times slower (>= 1): an accessibility aid (ADR-021). */
    readonly autoCooldownMult: number;
    /** Pixels per tick; must stay below the smallest enemy radius to avoid tunnelling. */
    readonly speedMin: number;
    readonly speedMax: number;
    /**
     * After every bounce, |vy| / speed is at least this, so a ball cannot ricochet between the
     * walls without ever coming down (anti-stall).
     */
    readonly minVerticalRatio: number;
  };
  /** Pickups on the floor (ADR-022, ADR-023). */
  readonly pickup: {
    /** The launcher collects what lies within this distance. */
    readonly radius: number;
    /** A dropped ball that nobody picks up comes back after this many ticks... */
    readonly returnTicks: number;
    /** ...with this extra reload. */
    readonly returnPenaltyTicks: number;
    /** Pixels per tick of a captured ball falling to the floor. */
    readonly dropSpeed: number;
    /** A captured ball joins on its own after this many ticks on the floor. */
    readonly captureTtlTicks: number;
  };
  readonly capture: {
    /** Chance that a defeated enemy (not the boss) drops its ball. */
    readonly chance: number;
    /**
     * Bad-luck protection: every kill without a drop adds this to the chance of the next one, and
     * a drop resets it. It is what keeps the entry of balls from drying up (the playtest).
     */
    readonly pityStep: number;
    /** The run starts as if this many kills had already missed: the first ball comes early. */
    readonly startMisses: number;
    /** Damage multiplier gained when a capture arrives with the team at `cards.maxBalls`. */
    readonly overflowDamageStep: number;
  };
  readonly enemy: {
    readonly radius: number;
    readonly threat: number;
    /** Enemies spawn in one of this many vertical lanes. */
    readonly lanes: number;
    readonly speedMin: number;
    readonly speedMax: number;
    /** Each enemy gets its speed times a random factor in [1 - v, 1 + v]. */
    readonly speedVariation: number;
    readonly hpScale: number;
  };
  /** Without a boss the run is won when the last wave is gone and nothing is left alive. */
  readonly boss?: BossDef;
  /** Bosses between waves, in order of `after` (ADR-028). */
  readonly interludes?: readonly InterludeDef[];
  /** Wave themes by id (ADR-027). */
  readonly themes?: Readonly<Record<string, ThemeDef>>;
  /** Evolution forms after the base species, in order, for every ball and enemy line. */
  readonly lines?: Readonly<Record<string, readonly string[]>>;
  /** Reverse of `lines`: which base species and level an evolved form stands for. */
  readonly forms?: Readonly<Record<string, { readonly base: string; readonly level: number }>>;
  /** Wave table. An empty table means no enemies at all and no way to win (used in tests). */
  readonly waves: readonly WaveDef[];
  readonly stats: {
    readonly damageDivisor: number;
    /** Damage multiplier indexed by level - 1. */
    readonly levelMultiplier: readonly number[];
    readonly speedStatMin: number;
    readonly speedStatMax: number;
    /**
     * Base damage multiplier per ball type. All 1 follows GDD-v0 (damage = attack / 10); a
     * different value is a balance decision (see the balance harness).
     */
    readonly typeDamage: Readonly<Record<GameType, number>>;
  };
  readonly effects: {
    /** Duration of the burn status. */
    readonly burnTicks: number;
    /** Drain strength needed (summed over hits) to heal 1 hp. */
    readonly drainPerHp: number;
    /** Max distance, centre to centre, at which a chain jumps to a second enemy. */
    readonly chainRadius: number;
  };
  readonly progression: {
    /** xp needed to go from level n to n + 1, indexed by n - 1; the last value repeats. */
    readonly levelCosts: readonly number[];
    /** An enemy is worth species hp / hpPerXp experience (at least 1). */
    readonly hpPerXp: number;
    /** Chance that a kill is "rich" and gives `lootMultiplier` times the experience. */
    readonly lootChance: number;
    readonly lootMultiplier: number;
  };
  readonly cards: {
    readonly offerCount: number;
    /** Safety valve of the team size for the frame budget, not a rule to play against (ADR-023). */
    readonly maxBalls: number;
    /** Relative odds of each kind of offer. */
    readonly weights: {
      readonly newBall: number;
      readonly upgrade: number;
      /** Only counts while a hybrid is possible (ADR-024). */
      readonly hybrid: number;
    };
    /** damage card: damage multiplier += this. */
    readonly damageStep: number;
    /** cadence card: cooldown multiplier *= this (below 1), never under `cadenceFloor`. */
    readonly cadenceFactor: number;
    readonly cadenceFloor: number;
    readonly vitalityHp: number;
  };
  readonly grid: { readonly cellSize: number };
  /** typeChart[attacker][defender] */
  readonly typeChart: Readonly<Record<GameType, Readonly<Record<GameType, number>>>>;
  readonly typeEffects: Readonly<Record<GameType, Effect>>;
  readonly species: Readonly<Record<string, SpeciesDef>>;
  /** Species ids that spawn as wild enemies. */
  readonly enemySpecies: readonly string[];
  /** Species ids the player can be offered as new balls. */
  readonly ballSpecies: readonly string[];
}
