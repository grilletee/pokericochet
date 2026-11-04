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

/** The team of up to six Pokémon (ADR-030, ADR-031, ADR-032). */
export interface TeamDef {
  readonly maxMembers: number;
  readonly maxLevel: number;
  /** Balls a Pokémon fires, indexed by level - 1; the last value repeats. */
  readonly ballsByLevel: readonly number[];
  /** Level from which each evolution stage starts: [stage 2, stage 3]. */
  readonly stageLevels: readonly number[];
  /**
   * Level a captured Pokémon joins with, by the stage of the enemy it came from (ADR-027, ADR-031):
   * 4F-B lets a captured late form arrive trained (the first entry), not at the start of its stage.
   */
  readonly captureLevels: readonly number[];
  /**
   * Extra damage of the Pokémon the run began with, as a fraction (0.4 = +40 %): the first step of
   * "the starter is the identity of the run", which Phase 5 turns into passives (Vision).
   */
  readonly starterBonus: number;
  /** Collision radius of a ball by stage - 1; missing values use `ball.radius`. */
  readonly ballRadiusByStage: readonly number[];
}

/** What a ball does, by type and stage, with signatures per species (ADR-031). */
export interface AbilitiesDef {
  /** Effects of stage 1, 2 and 3 (index stage - 1) for each type id. */
  readonly byType: Readonly<Record<string, readonly (readonly Effect[])[]>>;
  /** Per base species and stage; `null` = the effects of its type. */
  readonly signatures: Readonly<Record<string, readonly (readonly Effect[] | null)[]>>;
  /** For a type without a table, so a new type works from the first day (ADR-035). */
  readonly generic: readonly (readonly Effect[])[];
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
  /** Hybrids are off by default (ADR-033); the code and its tests stay. */
  readonly hybrid: { readonly enabled: boolean };
  readonly team: TeamDef;
  readonly abilities: AbilitiesDef;
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
    /**
     * The chance is multiplied by this when the team is full (< 1): every capture then asks for a
     * decision, so fewer of them keep the pauses of the replace screen rare (ADR-030, M10).
     */
    readonly fullTeamChanceMult: number;
  };
  readonly enemy: {
    readonly radius: number;
    readonly threat: number;
    /** Extra damage of a leak per evolution form above the first (ADR-032). */
    readonly threatPerTier: number;
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
    /** Ticks an enemy stays slowed. */
    readonly slowTicks: number;
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
    /** Relative odds of each kind of offer; a kind that cannot be played has no odds. */
    readonly weights: {
      readonly newBall: number;
      readonly train: number;
      readonly power: number;
      readonly cadence: number;
      readonly vitality: number;
      readonly team: number;
      /** Only counts while hybrids are enabled and a pair exists (ADR-024, ADR-033). */
      readonly hybrid: number;
    };
    /** power card: the Pokémon's damage multiplier gains this per card. */
    readonly powerStep: number;
    /** team card: the damage multiplier of the whole team gains this. */
    readonly damageStep: number;
    /** cadence card: the Pokémon's cooldown multiplier is this to the power of the cards taken... */
    readonly cadenceFactor: number;
    /** ...but never under this. */
    readonly cadenceFloor: number;
    /** power and cadence cards a Pokémon accepts. */
    readonly upgradeCap: number;
    readonly vitalityHp: number;
  };
  readonly grid: { readonly cellSize: number };
  /** typeChart[attacker][defender] */
  readonly typeChart: Readonly<Record<GameType, Readonly<Record<GameType, number>>>>;
  readonly species: Readonly<Record<string, SpeciesDef>>;
  /** Species ids that spawn as wild enemies. */
  readonly enemySpecies: readonly string[];
  /** Species ids the player can be offered as new balls. */
  readonly ballSpecies: readonly string[];
}
