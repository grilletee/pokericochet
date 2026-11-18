import { type BranchSet, type SpeciesDef, typesOfSpecies } from '../domain';
import type { EvolutionStep } from './evolutionPace';
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
    /** 4W: how each form of `lines` is reached in the games (minimum level and trigger). */
    readonly evolution?: Readonly<Record<string, readonly EvolutionStep[]>>;
    /** 4W, block 7: the other ways a split line can go, from the stage of the split. */
    readonly branches?: Readonly<
      Record<string, { readonly at: number; readonly options: readonly (readonly string[])[] }>
    >;
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

/** The national Pokédex number of every species (4G-J: the region banners and the Pokédex filters). */
export const POKEDEX_IDS: Readonly<Record<string, number>> = Object.fromEntries(
  file.species.map((s) => [s.id, s.pokedexId]),
);

/** The legendaries, one per type: the final boss is one of them and nothing else drops them. */
export const LEGENDARY_SPECIES: readonly string[] = file.roster.legendaries;

/** The final boss. */
export const BOSS_SPECIES: SpeciesDef = species(file.roster.boss);

/** The starters offered on the title screen, in order (keys 1-4). */
export const STARTER_SPECIES: readonly string[] = file.roster.starters;

/** How each form of a line is reached in the games (4W): minimum level and trigger, in order. */
export const EVOLUTION_STEPS: Readonly<Record<string, readonly EvolutionStep[]>> =
  file.roster.evolution ?? {};

/** Evolution forms after the base species, in order (tools/fetch-data/roster.json `lines`). */
export const EVOLUTION_LINES: Readonly<Record<string, readonly string[]>> = file.roster.lines;

/**
 * 4W, block 7: the branches of the split lines, with the types of the first form of each (the game
 * picks a branch by the type of the place). Forms without data are left out.
 */
export const EVOLUTION_BRANCHES: Readonly<Record<string, BranchSet>> = Object.fromEntries(
  Object.entries(file.roster.branches ?? {}).map(([base, set]) => [
    base,
    {
      at: set.at,
      options: set.options.flatMap((forms) => {
        const first = forms[0] === undefined ? undefined : byId.get(forms[0]);
        if (first === undefined || forms.some((f) => !byId.has(f))) return [];
        return [{ forms, types: typesOfSpecies(first) }];
      }),
    },
  ]),
);

/** Every species that has art: the playable and wild ones plus all their evolution forms. */
export const ART_SPECIES_IDS: readonly string[] = file.species.map((s) => s.id);

/** Reverse of the evolution lines: a form -> its base species and the stage it stands for. */
export const EVOLUTION_FORMS: Readonly<Record<string, { base: string; level: number }>> =
  Object.fromEntries(
    Object.entries(EVOLUTION_LINES).flatMap(([base, forms]) =>
      forms.map((form, index) => [form, { base, level: index + 2 }] as const),
    ),
  );
