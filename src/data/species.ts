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
    readonly legendaries: readonly string[];
    readonly starters: readonly string[];
    readonly lines: Readonly<Record<string, readonly string[]>>;
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

/** Every species of the generated file: bases, evolution forms, the boss and the legendaries. */
export const ALL_SPECIES: readonly SpeciesDef[] = file.species.map((s) => species(s.id));

/** The legendaries, one per type: the final boss is one of them and nothing else drops them. */
export const LEGENDARY_SPECIES: readonly string[] = file.roster.legendaries;

/** The final boss. */
export const BOSS_SPECIES: SpeciesDef = species(file.roster.boss);

/** The starters offered on the title screen, in order (keys 1-4). */
export const STARTER_SPECIES: readonly string[] = file.roster.starters;

/** Evolution forms after the base species, in order (tools/fetch-data/roster.json `lines`). */
export const EVOLUTION_LINES: Readonly<Record<string, readonly string[]>> = file.roster.lines;

/** Every species that has art: the playable and wild ones plus all their evolution forms. */
export const ART_SPECIES_IDS: readonly string[] = file.species.map((s) => s.id);

/**
 * The species whose art a ball of `level` shows (ADR-024): level 1 is the base species, level 2
 * the first form and level 3 the last one; a line with a single form keeps it at level 3.
 */
export function formOf(species: string, level: number): string {
  const line = EVOLUTION_LINES[species];
  if (line === undefined || level <= 1) return species;
  return line[Math.min(level - 2, line.length - 1)] ?? species;
}

/** Reverse of the evolution lines: a form -> its base species and the level it stands for. */
export const EVOLUTION_FORMS: Readonly<Record<string, { base: string; level: number }>> =
  Object.fromEntries(
    Object.entries(EVOLUTION_LINES).flatMap(([base, forms]) =>
      forms.map((form, index) => [form, { base, level: index + 2 }] as const),
    ),
  );
