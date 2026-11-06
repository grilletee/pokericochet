import generated from './generated/moves.json';

/**
 * Moves generated from PokéAPI by tools/fetch-data (ADR-039): the move of every species line at
 * stage 1, 2 and 3 (chosen by rule, then signatures), and the name of each in Spanish.
 */
interface GeneratedMoves {
  readonly byBase: Readonly<Record<string, readonly string[]>>;
  readonly defaults: Readonly<Record<string, readonly string[]>>;
  readonly moves: Readonly<
    Record<string, { readonly name: string; readonly type: string; readonly power: number | null }>
  >;
}

const file = generated as GeneratedMoves;

/** Move id of stage 1, 2 and 3 for every ball and enemy line. */
export const MOVES_BY_BASE: Readonly<Record<string, readonly string[]>> = file.byBase;

/** The name of every move in Spanish (ADR-036, ADR-039). */
export const MOVE_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(file.moves).map(([id, move]) => [id, move.name]),
);

/** Type of every move the table uses, for the attack type of a stage (ADR-047). */
export const MOVE_TYPES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(file.moves).map(([id, move]) => [id, move.type]),
);

/** Type and power of every move the table uses. */
export const MOVE_INFO: Readonly<
  Record<string, { readonly type: string; readonly power: number | null }>
> = Object.fromEntries(
  Object.entries(file.moves).map(([id, move]) => [id, { type: move.type, power: move.power }]),
);
