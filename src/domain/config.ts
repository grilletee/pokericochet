import type { Effect, GameType, MoveShapeKind, SpeciesDef } from './types';

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

/**
 * A biome (ADR-049, which replaces the themes of ADR-027): 2 or 3 types with a weight. Its species
 * are not written down: they come from the pool of the run, filtered by these types. A theme with
 * `species` (tests, hand-made scenarios) still uses that list instead.
 */
export interface ThemeDef {
  readonly id: string;
  readonly name: string;
  /** The main type: the first of `types`. It names the biome and picks its boss template. */
  readonly type: GameType;
  /** The types of the biome with their weight; a line enters if any of its types is here. */
  readonly types?: readonly { readonly type: GameType; readonly weight: number }[];
  /** Base species ids; unknown ones are ignored. Without it, the pool of the run is used. */
  readonly species?: readonly string[];
  /** Share of the wave's enemies drawn from the biome's own species, 0..1. */
  readonly purity: number;
}

/** The pool of species of a run (ADR-048): lines drawn per type with the `pool` stream. */
export interface PoolDef {
  /** Lines drawn for each of the 18 types (fewer if the roster has fewer). */
  readonly linesPerType: number;
  /** Lines that are always in the pool: the starters of the title screen. */
  readonly always: readonly string[];
  /** A biome needs at least this many lines in the pool (V3); the first wave also needs them fair. */
  readonly minBiomeLines: number;
}

/**
 * The verbs of a boss (ADR-053, which replaces the columns-only attacks of ADR-046). The player only
 * moves along the floor, so each is something to read and leave, to stand on or to answer:
 * `column` one column, `comb` columns with one gap, `sweep` a column that crosses part of the floor,
 * `rain` narrow columns one after another, `shot` a projectile that falls where the player was,
 * `zone` a patch of floor where balls cannot be collected, `gust` a wind that pushes the player,
 * `summon` reinforcements. All are announced for `telegraphTicks` (never under 60 for those that hurt).
 */
export interface BossAttackDef {
  readonly kind: 'column' | 'comb' | 'sweep' | 'rain' | 'shot' | 'zone' | 'gust' | 'summon';
  readonly width: number;
  /** `comb`: slots; `rain`: columns; `summon`: enemies; `shot`: shots in a row. */
  readonly count?: number;
  readonly telegraphTicks: number;
  readonly activeTicks: number;
  /** Health points of the leak it costs, before the guard of the team and the fury multiplier. */
  readonly damage: number;
  /** `sweep`: pixels per tick it moves; `shot`: pixels per tick it falls; `gust`: pixels per tick it pushes. */
  readonly speed?: number;
}

/** What a phase of a boss does: the normal one or the fury at half health (ADR-053). */
export interface BossPhaseDef {
  readonly attacks: readonly BossAttackDef[];
  /** Ticks between one round of attacks and the next. */
  readonly intervalTicks: number;
  /** Attacks launched per round. */
  readonly perRound: number;
  /** Multiplies the damage of every attack of the phase. */
  readonly damageMult: number;
  /**
   * The strong attack (ADR-054, which replaces the core of ADR-053): every `coreEvery` ticks the
   * boss stops and CHARGES it for `coreOpen` ticks, exposed (it is announced first and it glows), and
   * then launches `strong`. The names `core*` are historical: they mean "charge".
   */
  readonly coreEvery: number;
  readonly coreOpen: number;
  readonly strong: BossAttackDef;
}

/**
 * The mechanic of a legendary that no other boss has (ADR-054). `tide` squeezes the field from both
 * sides (Kyogre); `cracks` opens burning cracks in the floor (Groudon); `barrier` raises a barrier
 * that reflects balls (Mewtwo); `timeSlow` slows the player (Dialga); `portals` opens pairs of
 * portals that carry the player from one to the other (Palkia).
 */
export type BossMechanicDef =
  | { readonly kind: 'tide'; readonly maxSqueeze: number; readonly riseTicks: number }
  | {
      readonly kind: 'cracks';
      readonly everyTicks: number;
      readonly count: number;
      readonly lastTicks: number;
    }
  | { readonly kind: 'barrier'; readonly onTicks: number; readonly offTicks: number }
  | {
      readonly kind: 'timeSlow';
      readonly everyTicks: number;
      readonly lastTicks: number;
      readonly mult: number;
    }
  | { readonly kind: 'portals'; readonly everyTicks: number; readonly lastTicks: number }
  /** A volley of narrow lightning columns, each announced (Zapdos, Raikou; 4G-E). */
  | { readonly kind: 'storm'; readonly everyTicks: number; readonly count: number }
  /** A shower of falling fireballs, each announced where it will land (Moltres, Entei, Ho-Oh; 4G-E). */
  | { readonly kind: 'meteors'; readonly everyTicks: number; readonly count: number };

/** The pattern table of one boss: the normal phase and the fury, and its own mechanic if it has one. */
export interface BossPatternDef {
  readonly phases: readonly [BossPhaseDef, BossPhaseDef];
  readonly mechanic?: BossMechanicDef;
}

/**
 * Which ordinary enemies throw shots (4G-E, 12th playtest: "que algunos enemigos normales también
 * ataquen"): only types in `byType`, only one enemy in `shooterOneIn` (by id), each on its own clock.
 */
export interface EnemyFireDef {
  readonly byType: Readonly<Partial<Record<GameType, { readonly everyTicks: number }>>>;
  readonly shooterOneIn: number;
  /** Pixels per tick the shot falls from the enemy (the warning is `WARN_TICKS`, like every attack). */
  readonly speed: number;
  readonly width: number;
  /** Health points of a hit, before the guard of the team. */
  readonly damage: number;
  /** The most enemy shots on the field at once. */
  readonly maxAtOnce: number;
}

/**
 * The enemy that becomes a threat (4G-G, 14th playtest: "de vez en cuando un enemigo normal se marca
 * y tienes que dejar lo que haces para matarlo"). At a fixed rhythm one ordinary enemy is marked:
 * an aura and a countdown show over it, it can be killed in `hits` strong hits (its health is
 * lowered to that) and takes `markBonus` more damage; if it is alive when the countdown ends it
 * explodes in a column of danger under it. The explosion is a hazard like any other: announced for the
 * whole countdown and never without a way through (`isDodgeable`).
 */
export interface EnemyThreatDef {
  /** A new mark at most this often (ticks), while fewer than `maxAtOnce` are alive. */
  readonly everyTicks: number;
  readonly maxAtOnce: number;
  /** Ticks of countdown, at least `WARN_TICKS`. */
  readonly countdownTicks: number;
  /** The marked enemy dies in this many hits of the strongest ball of the team. */
  readonly hits: number;
  /** Extra damage the marked enemy takes (0.5 = +50 %). */
  readonly markBonus: number;
  /** Species that are chosen first, with the width of their blast and its damage. */
  readonly themed: Readonly<Record<string, { readonly width: number; readonly damage: number }>>;
  /** Any other enemy, when no themed one is on the field, on one mark in `otherOneIn`. */
  readonly other: {
    readonly width: number;
    readonly damage: number;
    readonly otherOneIn: number;
  };
}

/** The boss fight rules that do not depend on the boss (ADR-053). */
export interface BossFightDef {
  /** The fury starts when the boss is at or under this share of its health. */
  readonly rageAt: number;
  /** Damage multiplier while the boss is guarded (normal) and while it is exposed, charging its strong attack. */
  readonly closedMult: number;
  readonly openMult: number;
  /** An Ultimate that lands while the boss is exposed does this much extra. */
  readonly ultimateOpenBonus: number;
  /** Ticks the charge is announced before it starts. */
  readonly coreWarnTicks: number;
  /** Ticks of calm after the boss appears and after the fury starts. */
  readonly calmTicks: number;
  /** The most columns on the field at once. */
  readonly maxHazards: number;
  /** Pattern of a boss by species id; `byType` is the template of its main type; `default` the rest. */
  readonly bySpecies: Readonly<Record<string, BossPatternDef>>;
  readonly byType: Readonly<Partial<Record<GameType, BossPatternDef>>>;
  readonly default: BossPatternDef;
}

/** The final boss: it appears when the last wave ends and summons small enemies until it dies. */
export interface BossDef {
  readonly species: string;
  /**
   * If present, the species is drawn from this table by the `themes` stream (one legendary per
   * type, ADR-028) and the summons are of that type; `species` is then only the fallback.
   */
  readonly byType?: Readonly<Partial<Record<GameType, string>>>;
  /**
   * The legendaries that may be the final boss (4G-D: every one of generations 1-4 that fits, 37).
   * When present one is drawn with the `themes` stream; the summons are of its type.
   */
  readonly finals?: readonly string[];
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
  /**
   * Species by type, the fallback when the ended wave has no biome (ADR-028). With biomes the boss
   * is the champion of the biome of the wave that just ended (ADR-049) and this is not needed.
   */
  readonly byType?: Readonly<Partial<Record<GameType, string>>>;
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
   * Extra damage of the Pokémon the run began with, as a fraction (0.4 = +40 %): the first step of
   * "the starter is the identity of the run", which Phase 5 turns into passives (Vision).
   */
  readonly starterBonus: number;
  /** Collision radius of a ball by stage - 1; missing values use `ball.radius`. */
  readonly ballRadiusByStage: readonly number[];
  /**
   * Least growth of the damage from stage 1 by stage - 1 (ADR-037), e.g. [1, 1.2, 1.45]. A new form
   * brings part of it through its stats; a stage that keeps the form (an awakening, the maximum
   * power) makes up the rest, so a line without a form does not grow less than one with it.
   */
  readonly stageGrowth: readonly number[];
}

/** One shape of a move (ADR-039); sizes are arena pixels. */
export interface MoveShapeDef {
  readonly kind: MoveShapeKind;
  /** `burst`, `nova`: radius of the circle. */
  readonly radius?: number;
  /** `beam`, `cross`, `wave`: width of the column or the row. */
  readonly width?: number;
  /** `chain`: jumps after the first enemy. */
  readonly count?: number;
  /** Multiplier of the Pokémon's hit; replaces the one of the tier when set. */
  readonly power?: number;
}

/** Moves with a name, cast when a Pokémon's charge is full (ADR-039). */
export interface MovesDef {
  /** Hits to land before the move, by stage - 1. */
  readonly chargeByStage: readonly number[];
  /** Shape and strength of the generic move of tier 1, 2 and 3. */
  readonly tiers: readonly (MoveShapeDef & { readonly power: number })[];
  /** Per base species: the move id of stage 1, 2 and 3 (generated from PokéAPI, then reviewed). */
  readonly byBase: Readonly<Record<string, readonly string[]>>;
  /** Per base species and stage: a hand-made shape instead of the tier's; null keeps the tier's. */
  readonly signatures: Readonly<Record<string, readonly (MoveShapeDef | null)[]>>;
  /**
   * What a move does besides damage, by type of the Pokémon: burn (damage per second, as the burn
   * effect) and slow (fraction of speed lost). A type without an entry adds nothing.
   */
  readonly status: Readonly<Record<string, { readonly burn?: number; readonly slow?: number }>>;
  /**
   * Type of every move in `byBase` (generated from PokéAPI). The type of a Pokémon's balls at a
   * stage is the type of the move it shows there (ADR-047), so a dual type brings coverage.
   */
  readonly types?: Readonly<Record<string, string>>;
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
  readonly moves: MovesDef;
  readonly player: {
    readonly y: number;
    readonly speed: number;
    readonly margin: number;
    readonly maxHp: number;
    /**
     * Ticks of invulnerability to attacks of bosses and enemies after one of them hurts (4G-G, the
     * standard of the genre). A leak at the defence line neither gives nor respects it.
     */
    readonly hitInvulnTicks: number;
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
     * Fastest a ball may go whatever the Speed of its form (ADR-038): a very fast Pokémon must not
     * make balls impossible to follow or to pick up. Measured with the bot's pickup rate.
     */
    readonly speedCap: number;
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
    /**
     * Damage of a hit = powerRef / damageDivisor x the power multiplier of the form x ..., where the
     * multiplier maps the form's max(Attack, Special Attack) from [powerStatMin, powerStatMax] to
     * [powerMultMin, powerMultMax] (ADR-038): stats matter without one species dominating.
     */
    readonly powerRef: number;
    readonly powerStatMin: number;
    readonly powerStatMax: number;
    readonly powerMultMin: number;
    readonly powerMultMax: number;
    /**
     * Guard of the team (ADR-038): the mean of HP, Defense and Special Defense over the Pokémon,
     * mapped from [guardStatMin, guardStatMax] to [0, guardMax], cuts the damage of a leak.
     */
    readonly guardStatMin: number;
    readonly guardStatMax: number;
    readonly guardMax: number;
    /** Damage multiplier indexed by level - 1. */
    readonly levelMultiplier: readonly number[];
    readonly speedStatMin: number;
    readonly speedStatMax: number;
    /**
     * Base damage multiplier per ball type. All 1 follows GDD-v0 (damage = attack / 10); a
     * different value is a balance decision (see the balance harness).
     */
    readonly typeDamage: Readonly<Partial<Record<GameType, number>>>;
    /**
     * How the raw chart (0, 0.5, 1, 2 as in the games) is read (ADR-047): an immunity (0) counts as
     * `immune` (a deliberate departure from the games: a ball that does nothing is frustrating) and
     * the product over the defender's types is clamped to [min, max]. Missing = 0.25, 0.25, 3.
     */
    readonly typeScale?: { readonly immune: number; readonly min: number; readonly max: number };
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
    /** Poison: ticks it lasts and the most layers that add up (each hit adds one). */
    readonly poisonTicks?: number;
    readonly poisonMaxStacks?: number;
    /** Curse: ticks until the delayed damage lands and the most hits it can carry. */
    readonly curseTicks?: number;
    readonly curseMaxHits?: number;
    /** Ice: every `freezeEvery`-th hit stops the enemy for `haltTicks`; a stun stops it for `stunTicks`. */
    readonly freezeEvery?: number;
    readonly freezeTicks?: number;
    readonly stunTicks?: number;
    /** Mark: ticks it lasts and the most extra damage it can add up to (0.5 = +50 %). */
    readonly markTicks?: number;
    readonly markMax?: number;
    /** Fairy guard: ticks it lasts after a hit and the extra guard of the team meanwhile. */
    readonly guardTicks?: number;
    readonly guardBonus?: number;
  };
  /** The pool of species of each run (ADR-048). Without it every species is in the pool. */
  readonly pool?: PoolDef;
  /** Boss fights with patterns, shield, stun and phases (ADR-046). Without it a boss is a sponge. */
  readonly bossFight?: BossFightDef;
  /** Ordinary enemies that now and then throw something (4G-E); absent = nobody does. */
  readonly enemyFire?: EnemyFireDef;
  /** Ordinary enemies that are marked as a threat now and then (4G-G); none without it. */
  readonly enemyThreat?: EnemyThreatDef;
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
  /** typeChart[attacker][defender]: the raw values of the games (0, 0.5, 1, 2), all 18 x 18. */
  readonly typeChart: Readonly<Record<GameType, Readonly<Record<GameType, number>>>>;
  readonly species: Readonly<Record<string, SpeciesDef>>;
  /** Species ids that spawn as wild enemies. */
  readonly enemySpecies: readonly string[];
  /** Species ids the player can be offered as new balls. */
  readonly ballSpecies: readonly string[];
}
