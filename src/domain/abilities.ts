import type { GameConfig } from './config';
import type { Effect, GameType } from './types';

/** `list[index]`, or its last element when the list is shorter (a table may stop at stage 2). */
function atOrLast<T>(list: readonly T[], index: number): T | undefined {
  return list[Math.min(index, list.length - 1)];
}

/**
 * What a ball of this species does at this stage (ADR-031): the signature of the species if it
 * has one for that stage, otherwise the table of its type, otherwise the generic one. Pure; the
 * result is a fresh array that the caller may keep.
 */
export function abilitiesFor(
  config: GameConfig,
  species: string,
  type: GameType,
  stage: number,
): Effect[] {
  const index = Math.max(0, stage - 1);
  const { abilities } = config;
  const signature = abilities.signatures[species];
  const own = signature === undefined ? undefined : atOrLast(signature, index);
  const table = own ?? atOrLast(abilities.byType[type] ?? abilities.generic, index) ?? [];
  return table.map((effect) => ({ ...effect }));
}
