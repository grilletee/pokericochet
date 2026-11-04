/**
 * The names the game shows (ADR-036, ADR-039): Pokémon and moves in Spanish, generated from
 * PokéAPI by tools/fetch-data. The data layer owns them; the app hands them over once at start
 * (the UI may not import data). Everything on screen names a Pokémon through `pokemonName(form)`,
 * with the id of the form it shows now (`formOfMember` in the domain): never the base species.
 */
let pokemonNames: Readonly<Record<string, string>> = {};
let moveNames: Readonly<Record<string, string>> = {};

export function setNames(
  pokemon: Readonly<Record<string, string>>,
  moves: Readonly<Record<string, string>>,
): void {
  pokemonNames = pokemon;
  moveNames = moves;
}

function capitalized(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** The Spanish name of a species form; a readable version of the id if it is unknown. */
export function pokemonName(form: string): string {
  return pokemonNames[form] ?? capitalized(form);
}

/** The Spanish name of a move; a readable version of the id (dashes as spaces) if it is unknown. */
export function moveName(move: string): string {
  return moveNames[move] ?? capitalized(move.replaceAll('-', ' '));
}
