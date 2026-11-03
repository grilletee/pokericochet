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
}

/** One command per tick: the player's only input (ADR-004). Actions come in the next phase. */
export interface Command {
  readonly moveX: -1 | 0 | 1;
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
  | { readonly type: 'leak'; readonly enemyId: number; readonly damage: number }
  | { readonly type: 'lost' };
