export type GameType = 'fire' | 'water' | 'grass' | 'electric';
export const GAME_TYPES: readonly GameType[] = ['fire', 'water', 'grass', 'electric'];

export type EffectKind = 'burn' | 'pierce' | 'drain' | 'chain';

export interface Effect {
  readonly kind: EffectKind;
  readonly strength: number;
}

/** Base data of a species. In the game it is generated from PokéAPI by tools/fetch-data. */
export interface SpeciesDef {
  readonly id: string;
  readonly type: GameType;
  readonly baseStats: { readonly hp: number; readonly attack: number; readonly speed: number };
}

/** A ball of the loadout. Immutable value: fusing produces a new one (ADR-003). */
export interface Ball {
  readonly id: number;
  readonly species: string;
  /** Type of the first ingredient; the only one used for effectiveness. */
  readonly type: GameType;
  /** 1..3. */
  readonly level: number;
  readonly hybrid: boolean;
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
}

/** A reward offered when the player levels up. */
export type Card =
  | { readonly kind: 'newBall'; readonly species: string }
  | { readonly kind: 'damage' }
  | { readonly kind: 'cadence' }
  | { readonly kind: 'vitality' }
  | { readonly kind: 'token' };

export interface PickAction {
  readonly type: 'pick';
  /** Index into the current offers. */
  readonly index: number;
}

/** Opens or closes the workshop. While it is open the simulation is paused (ADR-016). */
export interface WorkshopAction {
  readonly type: 'workshop';
  readonly open: boolean;
}

/** Fuses two balls of the loadout (workshop phase only), spending one fusion token. Order matters. */
export interface FuseAction {
  readonly type: 'fuse';
  /** Loadout slot of the first ingredient: the result keeps its id, species and type. */
  readonly a: number;
  /** Loadout slot of the second ingredient: it disappears. */
  readonly b: number;
}

/** Why a fusion was refused: the rules of `fuse` plus the two things only the run knows. */
export type FuseFailure =
  | 'same-ball'
  | 'hybrid-input'
  | 'max-level'
  | 'level-mismatch'
  | 'same-type-different-species'
  | 'level-too-low'
  | 'no-token'
  | 'bad-slot';

/** One command per tick: the player's input (ADR-004). */
export interface Command {
  readonly moveX: -1 | 0 | 1;
  /**
   * `pick` only means something in the level-up phase; `workshop` opens it (while playing) or
   * closes it; `fuse` only in the workshop phase.
   */
  readonly action?: PickAction | FuseAction | WorkshopAction;
}

export type GameEvent =
  | { readonly type: 'spawn'; readonly enemyId: number }
  | { readonly type: 'launch'; readonly ballId: number }
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
  | { readonly type: 'waveStart'; readonly index: number }
  | { readonly type: 'bossSpawn'; readonly enemyId: number }
  | { readonly type: 'bossSummon'; readonly count: number }
  | {
      readonly type: 'fuse';
      readonly ballId: number;
      readonly level: number;
      readonly hybrid: boolean;
    }
  | { readonly type: 'fuseFailed'; readonly error: FuseFailure }
  | { readonly type: 'won' }
  | { readonly type: 'lost' };
