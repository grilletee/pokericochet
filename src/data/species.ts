import type { SpeciesDef } from '../domain';
import generated from './generated/species.json';

/**
 * Species data generated from PokéAPI by tools/fetch-data (ADR-018): its one or two types
 * (`type` = the first, ADR-047), the six base stats (ADR-038) and the name in Spanish (ADR-036).
 * Which species play which role (ball, wild enemy, boss, starter) lives in
 * tools/fetch-data/roster.json, which the tool builds by rule (ADR-048) and copies into the file.
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
  readonly species: readonly (SpeciesDef & {
    readonly pokedexId: number;
    readonly name: string;
  })[];
}

const file = generated as GeneratedFile;
const byId = new Map(file.species.map((s) => [s.id, s]));

function species(id: string): SpeciesDef {
  const found = byId.get(id);
  if (found === undefined)
    throw new Error(`species "${id}" is missing from generated/species.json`);
  return {
    id: found.id,
    type: found.type,
    types: found.types ?? [found.type],
    baseStats: found.baseStats,
  };
}

/** Every line the player can be offered as a ball (the run's pool decides which ones, ADR-048). */
export const BALL_SPECIES: readonly SpeciesDef[] = file.roster.balls.map(species);

/** Every line that can spawn as a wild enemy (again, filtered by the pool of the run). */
export const ENEMY_SPECIES: readonly SpeciesDef[] = file.roster.enemies.map(species);

/** Every species of the generated file: bases, evolution forms, the boss and the legendaries. */
export const ALL_SPECIES: readonly SpeciesDef[] = file.species.map((s) => species(s.id));

/** The name of every species in Spanish (ADR-036): the only source of what a Pokémon is called. */
export const POKEMON_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  file.species.map((s) => [s.id, s.name]),
);

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

/** Reverse of the evolution lines: a form -> its base species and the stage it stands for. */
export const EVOLUTION_FORMS: Readonly<Record<string, { base: string; level: number }>> =
  Object.fromEntries(
    Object.entries(EVOLUTION_LINES).flatMap(([base, forms]) =>
      forms.map((form, index) => [form, { base, level: index + 2 }] as const),
    ),
  );
