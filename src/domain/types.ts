/** The 18 types of the games (4H-B2, ADR-047), in the order PokéAPI lists them. */
export const GAME_TYPES = [
  'normal',
  'fighting',
  'flying',
  'poison',
  'ground',
  'rock',
  'bug',
  'ghost',
  'steel',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ice',
  'dragon',
  'dark',
  'fairy',
] as const;
export type GameType = (typeof GAME_TYPES)[number];

/**
 * What a ball can do when it hits, in seven families (ADR-047): damage over time (`burn`,
 * `burnArea`, `poison`, `curse`), jumps (`chain`), pierce (`pierce`), explosions (`splash`,
 * `blast`, `quake`, `push`), sustain (`drain`, `guard`), control (`slow`, `freeze`, `stun`, `mark`)
 * and direct damage (no effect: the type multiplier). `chain` may jump `count` times. `radius` is
 * in arena pixels.
 */
export type EffectKind =
  | 'burn'
  | 'pierce'
  | 'drain'
  | 'chain'
  | 'burnArea'
  | 'splash'
  | 'slow'
  | 'blast'
  | 'poison'
  | 'curse'
  | 'quake'
  | 'push'
  | 'guard'
  | 'freeze'
  | 'stun'
  | 'mark';

/** Shapes a move can take (ADR-039). */
export type MoveShapeKind = 'burst' | 'beam' | 'nova' | 'cross' | 'wave' | 'chain';

export interface Effect {
  readonly kind: EffectKind;
  readonly strength: number;
  /** Area of `burnArea`, `splash` and `blast`. */
  readonly radius?: number;
  /** Jumps of `chain` (default 1). */
  readonly count?: number;
}

/** The six base stats of the games (ADR-038). */
export interface BaseStats {
  readonly hp: number;
  readonly attack: number;
  readonly defense: number;
  readonly specialAttack: number;
  readonly specialDefense: number;
  readonly speed: number;
}

/** Base data of a species. In the game it is generated from PokéAPI by tools/fetch-data. */
export interface SpeciesDef {
  readonly id: string;
  /** The first type: a shortcut for `types[0]` (ADR-047). */
  readonly type: GameType;
  /** One or two types in the order of PokéAPI; a species without the list has only `type`. */
  readonly types?: readonly GameType[];
  readonly baseStats: BaseStats;
}

/** Every type of a species, the first one first. */
export function typesOfSpecies(species: SpeciesDef): readonly GameType[] {
  return species.types ?? [species.type];
}

/**
 * A Pokémon of the team (ADR-030): the unit the player grows. It owns its balls (`Ball.owner`),
 * which are derived from its level. `species` is the base of the line; the form it shows is
 * decided by its stage.
 */
export interface Member {
  readonly species: string;
  readonly type: GameType;
  /** 1..team.maxLevel. */
  level: number;
  /** The Pokémon the run began with: it has the starter bonus (`team.starterBonus`). */
  readonly starter: boolean;
  /** Damage and cadence cards taken for this Pokémon (ADR-032): they are lost if it is replaced. */
  damageUps: number;
  cadenceUps: number;
  /** Hits its balls have landed since its last move (ADR-039); it casts when it reaches the need. */
  charge: number;
}

/** A ball of the loadout. Immutable value: a level or stage change produces a new one (ADR-003). */
export interface Ball {
  readonly id: number;
  /** Index of its Pokémon in `run.team`; a ball without a Pokémon of that index has no upgrades. */
  readonly owner: number;
  /** Evolution stage 1..3 of its Pokémon: it picks the form, the radius and the effects. */
  readonly stage: number;
  readonly species: string;
  /** Type of the first ingredient; the only one used for effectiveness. */
  readonly type: GameType;
  /** Level of its Pokémon (for a hybrid built by hand, the level of the ball). */
  readonly level: number;
  readonly hybrid: boolean;
  /** Hybrids only: the second ingredient, kept for the card, the run summary and (later) synergies. */
  readonly secondSpecies?: string;
  readonly secondType?: GameType;
  readonly effects: readonly Effect[];
}

/** A ball in flight. `slot` is its index in the run's loadout. */
export interface BallBody {
  slot: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Enemies it can still pass through (type effect "pierce"). */
  pierce: number;
  /** Enemy it just passed through and must not hit again while still overlapping; 0 = none. */
  skipId: number;
}

export interface Enemy {
  id: number;
  species: string;
  type: GameType;
  hp: number;
  x: number;
  y: number;
  /** Pixels advanced downwards per tick. */
  speed: number;
  radius: number;
  /** Damage to the player when it crosses the defence line. */
  threat: number;
  /** Experience granted when it dies. */
  xp: number;
  /** Ticks of burning left, and the damage per second while burning. */
  burnTicks: number;
  burnDps: number;
  /** Ticks left slowed and the fraction of speed lost meanwhile (`slow`, ADR-031). */
  slowTicks: number;
  slow: number;
  /**
   * The state of the 4H-B2 effects, all optional so an enemy made by hand needs none of it (missing
   * = 0): the second type; poison layers, ticks left and damage per second per layer; the pending
   * curse (ticks until it lands and the damage it carries); ticks stopped by ice or a stun and the
   * hits counted towards the next freeze; the mark (ticks left and extra damage taken).
   */
  type2?: GameType;
  poisonTicks?: number;
  poisonStacks?: number;
  poisonDps?: number;
  curseTicks?: number;
  curseDamage?: number;
  haltTicks?: number;
  chill?: number;
  markTicks?: number;
  markBonus?: number;
  /** Ticks left of the trail a push leaves (only for the render, ADR-053). */
  pushTicks?: number;
}

/** A reward offered when the player levels up. */
export type Card =
  /** Recruits a Pokémon (only with a free place in the team). */
  | { readonly kind: 'newBall'; readonly species: string }
  /** +1 level for the Pokémon at `member` (ADR-031). */
  | { readonly kind: 'train'; readonly member: number }
  /** More damage / faster reload for one Pokémon (ADR-032). */
  | { readonly kind: 'power'; readonly member: number }
  | { readonly kind: 'cadence'; readonly member: number }
  /** Global: more health. */
  | { readonly kind: 'vitality' }
  /** Global and rare: more damage for the whole team. */
  | { readonly kind: 'team' }
  /**
   * A hybrid of two balls of the loadout, by slot (ADR-024). `a` is the first ingredient: the
   * result keeps its species and type. The run does not advance while the offer is open, so the
   * slots cannot change before the choice.
   */
  | { readonly kind: 'hybrid'; readonly a: number; readonly b: number };

export interface PickAction {
  readonly type: 'pick';
  /** Index into the current offers. */
  readonly index: number;
}

/**
 * Answer to the replace screen (ADR-030): `slot` is the Pokémon that leaves (or, if it is of the
 * same species as the capture, the one that gains a level); `release` lets the capture go.
 */
export type ReplaceAction =
  | { readonly type: 'replace'; readonly slot: number }
  | { readonly type: 'release' };

/**
 * Something lying on the floor (or falling to it) that the player picks up by moving over it
 * (ADR-022, ADR-023): a ball of the loadout that left the arena (`slot` >= 0), or the ball a
 * defeated enemy dropped (`slot` -1, `species` set).
 */
export interface Pickup {
  /** Loadout slot of the returning ball, or -1 for a captured species. */
  slot: number;
  /** Species of a captured ball; empty for a returning one. */
  species: string;
  type: GameType;
  x: number;
  y: number;
  /** Evolution stage of the captured ball: an enemy of a higher form gives a higher stage (ADR-027). */
  level: number;
  /** Ticks left on the floor before it joins the loadout on its own (counts only once landed). */
  ticks: number;
}

/** One command per tick: the player's input (ADR-004). */
export interface Command {
  readonly moveX: -1 | 0 | 1;
  /**
   * Point of the arena the player aims at; the balls leave the launcher towards it (ADR-021).
   * Omitted = keep the last one. Rounded to whole pixels and clamped to the arena.
   */
  readonly aimX?: number;
  readonly aimY?: number;
  /** Switches the assisted aim on or off; omitted = keep. */
  readonly autoAim?: boolean;
  /**
   * Place in the team of the Pokémon whose signature the player throws this tick (4F-D). Omitted =
   * none. It does nothing if that Pokémon's signature is not ready.
   */
  readonly cast?: number;
  /** `pick` only means something in the level-up phase, `replace` and `release` in the replace phase. */
  readonly action?: PickAction | ReplaceAction;
}

export type GameEvent =
  | { readonly type: 'spawn'; readonly enemyId: number }
  | { readonly type: 'launch'; readonly ballId: number }
  /** A ball left the arena at the bottom and now waits on the floor at `x`. */
  | { readonly type: 'drop'; readonly ballId: number; readonly x: number }
  /** The player picked a ball up; `late` = it came back on its own after waiting too long. */
  | {
      readonly type: 'collect';
      readonly ballId: number;
      readonly x: number;
      readonly late: boolean;
    }
  /** A defeated enemy let its ball fall at `x`, `y` (the player has not got it yet). */
  | {
      readonly type: 'captureDrop';
      readonly species: string;
      readonly level: number;
      /** The form of the enemy that dropped it, as drawn on the floor (ADR-036). */
      readonly form: string;
      readonly x: number;
      readonly y: number;
    }
  /** A captured ball joined the team (`ballId` 0: the team was full and it became damage). */
  | {
      readonly type: 'capture';
      readonly ballId: number;
      readonly species: string;
      readonly level: number;
      /** The form it joins as: what to call and draw it (ADR-036). */
      readonly form: string;
      readonly x: number;
      readonly late: boolean;
    }
  | {
      readonly type: 'hit';
      readonly ballId: number;
      readonly enemyId: number;
      readonly damage: number;
      readonly effectiveness: number;
      /** Position of the enemy that was hit, for visual effects. */
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: 'kill'; readonly enemyId: number; readonly x: number; readonly y: number }
  | {
      readonly type: 'chain';
      readonly fromX: number;
      readonly fromY: number;
      readonly toX: number;
      readonly toY: number;
    }
  | { readonly type: 'heal'; readonly amount: number }
  | { readonly type: 'leak'; readonly enemyId: number; readonly damage: number }
  | { readonly type: 'levelup'; readonly level: number }
  | { readonly type: 'pick'; readonly card: Card }
  /** A Pokémon gained a level (`source`: a card, a duplicate capture or the replace screen). */
  | {
      readonly type: 'train';
      readonly member: number;
      readonly species: string;
      readonly level: number;
      /** The form it shows after the level (ADR-036). */
      readonly form: string;
      readonly source: 'card' | 'capture';
    }
  /** The team is full and the player picked a capture up: the run waits for an answer (ADR-030). */
  | {
      readonly type: 'replaceOpen';
      readonly species: string;
      readonly stage: number;
      readonly form: string;
    }
  /** The Pokémon at `slot` left the team for `species`; the forms are what they are called now. */
  | {
      readonly type: 'replaced';
      readonly slot: number;
      readonly out: string;
      readonly species: string;
      readonly outForm: string;
      readonly form: string;
    }
  /** A capture was let go (the answer, or it expired with the team full). */
  | { readonly type: 'release'; readonly species: string; readonly form: string }
  /** `theme` is the id of the wave's theme, or '' for a wave without one (ADR-027). */
  | { readonly type: 'waveStart'; readonly index: number; readonly theme: string }
  /**
   * A boss entered: `number` is its place in the run (1..`interludes` for the bosses between waves,
   * then the final one), so the interface says "Jefe 2/3" or "Jefe final" (4F-E).
   */
  | {
      readonly type: 'bossSpawn';
      readonly enemyId: number;
      readonly species: string;
      readonly number: number;
      readonly interludes: number;
      readonly final: boolean;
    }
  | { readonly type: 'bossSummon'; readonly count: number }
  /** The boss is furious (phase 1) at half of its health (ADR-053): a message, never a pause. */
  | { readonly type: 'bossPhase'; readonly phase: number }
  /** A ground attack was announced: a column of `width` at `x` that strikes in `ticks` (ADR-046). */
  | {
      readonly type: 'bossTelegraph';
      readonly x: number;
      readonly width: number;
      readonly ticks: number;
      /** What it is (the verb: column, comb, shot...), so the UI can name it the first time (4G-F). */
      readonly kind: string;
      /** True when an ordinary enemy fires it (it comes out of that enemy), false for a boss. */
      readonly fromEnemy: boolean;
    }
  /**
   * The column struck; `hit` says whether the player stood in it. A moving column that catches the
   * player later reports it with a `leak` event of the boss instead.
   */
  | {
      readonly type: 'bossStrike';
      readonly x: number;
      readonly width: number;
      readonly hit: boolean;
    }
  /** The player lost `damage` health to a column of the boss (after the guard of the team). */
  | { readonly type: 'bossHurt'; readonly damage: number }
  /**
   * The player lost health, from any source (4G-G): the one event the feel of a hit hangs on (sound,
   * red flash, shake, floating number). `source` is where it came from; `x` where the player stood.
   */
  | {
      readonly type: 'playerHurt';
      readonly damage: number;
      readonly x: number;
      readonly source: 'leak' | 'boss' | 'shot';
    }
  /** The barrier of a legendary went up or down (reflects balls while it is up, ADR-054). */
  | { readonly type: 'bossBarrier'; readonly up: boolean }
  /** Dialga slowed the player's time (ADR-054). */
  | { readonly type: 'bossTimeSlow' }
  /** A portal carried the player from x `from` to x `to` (ADR-054). */
  | { readonly type: 'bossPortal'; readonly from: number; readonly to: number }
  /**
   * The boss started to charge its strong attack (`open`; exposed: the window for the Ultimate), is
   * about to (`warning`) or has launched it and closed again (ADR-054; the name is historical).
   */
  | { readonly type: 'bossCore'; readonly open: boolean; readonly warning: boolean }
  /** A boss died; `index` counts the bosses defeated so far, this one included (ADR-028). */
  | { readonly type: 'bossDefeated'; readonly species: string; readonly index: number }
  /**
   * A Pokémon reached a new stage (ADR-037): it evolved, awoke or reached its maximum power.
   * `from` and `to` are forms (equal when the form did not change); `ballId` is one of its balls.
   */
  | {
      readonly type: 'stage';
      readonly ballId: number;
      readonly member: number;
      readonly species: string;
      readonly kind: 'evolve' | 'awaken' | 'peak';
      /** Stage reached (2 or 3). */
      readonly stage: number;
      readonly from: string;
      readonly to: string;
    }
  /** A Pokémon cast its move (ADR-039): `move` is the id, `shape` what the render draws. */
  | {
      readonly type: 'move';
      readonly member: number;
      readonly species: string;
      /** True for the Pokémon the run began with: its moves get the label priority (ADR-039). */
      readonly starter: boolean;
      /** True when the player threw it (the starter's signature, 4F-D); false when it went off. */
      readonly manual: boolean;
      /** True when the shape is a hand-made signature of the line rather than the tier's. */
      readonly signature: boolean;
      readonly move: string;
      readonly tier: number;
      /** Type of the Pokémon that cast it (the colour of the shape). */
      readonly element: GameType;
      readonly shape: MoveShapeKind;
      /** Radius of a circle or width of a column or row, in arena pixels (what the render draws). */
      readonly size: number;
      readonly x: number;
      readonly y: number;
      /** Enemies the move reached. */
      readonly hits: number;
      /** Total damage it dealt (before the enemies' remaining health), for the balance harness. */
      readonly damage: number;
    }
  /** Legacy of the fusion rules (ADR-024), no longer emitted by the tick. */
  | {
      readonly type: 'evolve';
      readonly ballId: number;
      readonly species: string;
      /** Stage reached (2 or 3). */
      readonly level: number;
    }
  /** A hybrid card was chosen: `species` (first ingredient) absorbed `withSpecies`. */
  | {
      readonly type: 'hybrid';
      readonly ballId: number;
      readonly species: string;
      readonly withSpecies: string;
      readonly level: number;
    }
  | { readonly type: 'won' }
  | { readonly type: 'lost' };
