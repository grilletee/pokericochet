import type { GameConfig } from './config';
import type { Member } from './types';

/**
 * The species a line shows at evolution stage `stage` (ADR-037): the base itself, or the form of
 * its line. A line with a single form keeps it at stage 3; a species without a line never changes.
 */
export function formAt(config: GameConfig, base: string, stage: number): string {
  const line = config.lines?.[base];
  if (line === undefined || stage <= 1) return base;
  const form = line[Math.min(stage - 2, line.length - 1)];
  return form !== undefined && config.species[form] !== undefined ? form : base;
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
export function stageKind(config: GameConfig, base: string, stage: number): StageKind | null {
  if (stage <= 1) return null;
  if (formAt(config, base, stage) !== formAt(config, base, stage - 1)) return 'evolve';
  return stage === 2 ? 'awaken' : 'peak';
}

/**
 * What one more level brings a Pokémon of the team in terms of stages (ADR-037): the kind of step
 * and the form it will show, or null if the level stays in the same stage or is the last one.
 */
export function nextStep(
  config: GameConfig,
  member: Pick<Member, 'species' | 'level'>,
): { readonly kind: StageKind; readonly to: string } | null {
  const now = stageForLevel(config, member.level);
  const next = stageForLevel(config, member.level + 1);
  if (next <= now) return null;
  const kind = stageKind(config, member.species, next);
  return kind === null ? null : { kind, to: formAt(config, member.species, next) };
}

/** The species a Pokémon of the team shows now: the single answer to "what is it called/looks like". */
export function formOfMember(
  config: GameConfig,
  member: Pick<Member, 'species' | 'level'>,
): string {
  return formAt(config, member.species, stageForLevel(config, member.level));
}

/** Evolution stage (1..3) of a level: one more for each threshold reached. */
export function stageForLevel(config: GameConfig, level: number): number {
  let stage = 1;
  for (const from of config.team.stageLevels) if (level >= from) stage += 1;
  return stage;
}
