import type { GameConfig } from './config';
import { type GameType, type Member, typesOfSpecies } from './types';

/**
 * The species a line shows at evolution stage `stage` (ADR-037): the base itself, or the form of
 * its line. A line with a single form keeps it at stage 3; a species without a line never changes.
 */
export function formAt(config: GameConfig, base: string, stage: number, branch?: string): string {
  // 4W, block 7: a Pokémon that took a branch shows the forms of that branch from its stage on.
  if (branch !== undefined) {
    const set = config.branches?.[base];
    if (set !== undefined && stage >= set.at) {
      const option = set.options.find((o) => o.forms[0] === branch);
      const form = option?.forms[Math.min(stage - set.at, option.forms.length - 1)];
      if (form !== undefined && config.species[form] !== undefined) return form;
    }
  }
  const line = config.lines?.[base];
  if (line === undefined || stage <= 1) return base;
  const form = line[Math.min(stage - 2, line.length - 1)];
  return form !== undefined && config.species[form] !== undefined ? form : base;
}

/**
 * The type a Pokémon attacks with at a stage (ADR-047): the type of the move it shows there, which
 * is always one of the species' own types, so a dual type brings coverage. Without a move table (or
 * a move of another type) it is the type of the species.
 */
export function attackTypeOf(
  config: GameConfig,
  base: string,
  stage: number,
  fallback: GameType,
  branch?: string,
): GameType {
  const move = config.moves.byBase[moveKeyOf(config, base, branch)]?.[stage - 1];
  const type = move === undefined ? undefined : config.moves.types?.[move];
  const species = config.species[formAt(config, base, stage, branch)];
  // A branch that changes the type (Flareon) falls back on the type of its form, not of its base.
  const back = branch !== undefined && species !== undefined ? species.type : fallback;
  if (type === undefined) return back;
  const own = species === undefined ? [back] : typesOfSpecies(species);
  return own.includes(type as GameType) ? (type as GameType) : back;
}

/** Base species and stage of an enemy species (an evolved form maps back to its line). */
export function baseOf(config: GameConfig, species: string): { base: string; level: number } {
  return config.forms?.[species] ?? { base: species, level: 1 };
}

/** What a step to `stage` is for a line (ADR-037): a new form, or a power-up of the same one. */
export type StageKind = 'evolve' | 'awaken' | 'peak';

/**
 * Why `stage` (2 or 3) of the line of `base` is a step: `evolve` when the form changes, otherwise
 * `awaken` at stage 2 and `peak` ("maximum power") at stage 3. Null for stage 1.
 */
export function stageKind(
  config: GameConfig,
  base: string,
  stage: number,
  branch?: string,
): StageKind | null {
  if (stage <= 1) return null;
  if (formAt(config, base, stage, branch) !== formAt(config, base, stage - 1, branch)) {
    return 'evolve';
  }
  return stage === 2 ? 'awaken' : 'peak';
}

/**
 * What one more level brings a Pokémon of the team in terms of stages (ADR-037): the kind of step
 * and the form it will show, or null if the level stays in the same stage or is the last one.
 * `place` (4W): the types of where it is now, so a split line tells the branch it will really take.
 */
export function nextStep(
  config: GameConfig,
  member: Pick<Member, 'species' | 'level' | 'branch'>,
  place: readonly GameType[] = [],
): { readonly kind: StageKind; readonly to: string } | null {
  const now = stageForLevel(config, member.level, member.species);
  const next = stageForLevel(config, member.level + 1, member.species);
  if (next <= now) return null;
  const set = config.branches?.[member.species];
  const branch =
    member.branch ??
    (set !== undefined && next >= set.at ? chooseBranch(config, member.species, place) : undefined);
  const kind = stageKind(config, member.species, next, branch);
  return kind === null ? null : { kind, to: formAt(config, member.species, next, branch) };
}

/** The species a Pokémon of the team shows now: the single answer to "what is it called/looks like". */
export function formOfMember(
  config: GameConfig,
  member: Pick<Member, 'species' | 'level' | 'branch'>,
): string {
  return formAt(
    config,
    member.species,
    stageForLevel(config, member.level, member.species),
    member.branch,
  );
}

/**
 * The way a split line goes for a Pokémon that reaches the stage of the split here (4W, block 7; a
 * documented rule, like the evolutions by place of the games): the branch whose type is the main
 * type of the place, else its second type; the line of always if none (or if the line of always is
 * the one of that type). Returns the first form of the branch; undefined for a line that does not
 * split. Pure: the same place gives the same branch.
 */
export function chooseBranch(
  config: GameConfig,
  base: string,
  place: readonly GameType[],
): string | undefined {
  const set = config.branches?.[base];
  if (set === undefined) return undefined;
  const usual = formAt(config, base, set.at);
  const usualDef = config.species[usual];
  const usualTypes = usualDef === undefined ? [] : typesOfSpecies(usualDef);
  for (const type of place) {
    if (usualTypes.includes(type)) return usual;
    const option = set.options.find((o) => o.types.includes(type));
    if (option !== undefined) return option.forms[0];
  }
  return usual;
}

/** Which list of moves a Pokémon uses: its branch's own (4W), or its line's. */
export function moveKeyOf(config: GameConfig, base: string, branch?: string): string {
  return branch !== undefined && config.moves.byBase[branch] !== undefined ? branch : base;
}

/**
 * The levels at which the line of `base` reaches stage 2 and stage 3 (4W, block 1): its own pace,
 * derived from the real evolution levels of PokéAPI (`team.lineStageLevels`), or the common
 * thresholds (`team.stageLevels`) for a line the data does not name.
 */
export function stageLevelsOf(config: GameConfig, base: string): readonly number[] {
  return config.team.lineStageLevels?.[base] ?? config.team.stageLevels;
}

/** Evolution stage (1..3) of a Pokémon of the line of `base` at `level`: one more per threshold. */
export function stageForLevel(config: GameConfig, level: number, base: string): number {
  let stage = 1;
  for (const from of stageLevelsOf(config, base)) if (level >= from) stage += 1;
  return stage;
}
