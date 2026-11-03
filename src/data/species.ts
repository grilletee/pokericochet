import type { SpeciesDef } from '../domain';
import generated from './generated/species.json';

/**
 * Species data generated from PokéAPI by tools/fetch-data (ADR-018): type = first listed type,
 * base stats hp / attack / speed. Which species play which role (ball, wild enemy, boss,
 * starter) is game design and lives in tools/fetch-data/roster.json, copied into the file.
 */
interface GeneratedFile {
  readonly roster: {
    readonly balls: readonly string[];
    readonly enemies: readonly string[];
    readonly boss: string;
    readonly starters: readonly string[];
  };
  readonly species: readonly (SpeciesDef & { readonly pokedexId: number })[];
}

const file = generated as GeneratedFile;
const byId = new Map(file.species.map((s) => [s.id, s]));

function species(id: string): SpeciesDef {
  const found = byId.get(id);
  if (found === undefined)
    throw new Error(`species "${id}" is missing from generated/species.json`);
  return { id: found.id, type: found.type, baseStats: found.baseStats };
}

/** The 8 species the player can use as balls (2 per type). */
export const BALL_SPECIES: readonly SpeciesDef[] = file.roster.balls.map(species);

/** The 8 wild species that spawn as enemies. */
export const ENEMY_SPECIES: readonly SpeciesDef[] = file.roster.enemies.map(species);

/** The final boss. */
export const BOSS_SPECIES: SpeciesDef = species(file.roster.boss);

/** The starters offered on the title screen, in order (keys 1-4). */
export const STARTER_SPECIES: readonly string[] = file.roster.starters;
