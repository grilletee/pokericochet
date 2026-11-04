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
}

/** A reward offered when the player levels up. */
export type Card =
  | { readonly kind: 'newBall'; readonly species: string }
  | { readonly kind: 'damage' }
  | { readonly kind: 'cadence' }
  | { readonly kind: 'vitality' }
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
  /** Level of the ball it carries: a captured enemy of a higher tier gives a higher level (ADR-027). */
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
  /** `pick` only means something in the level-up phase. */
  readonly action?: PickAction;
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
      readonly x: number;
      readonly y: number;
    }
  /** A captured ball joined the team (`ballId` 0: the team was full and it became damage). */
  | {
      readonly type: 'capture';
      readonly ballId: number;
      readonly species: string;
      readonly level: number;
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
  /** `theme` is the id of the wave's theme, or '' for a wave without one (ADR-027). */
  | { readonly type: 'waveStart'; readonly index: number; readonly theme: string }
  | { readonly type: 'bossSpawn'; readonly enemyId: number }
  | { readonly type: 'bossSummon'; readonly count: number }
  /** A boss died; `index` counts the bosses defeated so far, this one included (ADR-028). */
  | { readonly type: 'bossDefeated'; readonly species: string; readonly index: number }
  /** Two equal balls merged on their own into one of the next level (ADR-024). */
  | {
      readonly type: 'evolve';
      readonly ballId: number;
      readonly species: string;
      /** Level the ball reached. */
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
