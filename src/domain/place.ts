import type { GameConfig } from './config';
import type { Run } from './run';
import type { GameType } from './types';

/**
 * The types of the place where the run is now (4W, block 7): the biome of the wave in progress,
 * heaviest type first (the same order as `themeTypes`, which the screens use). A split line takes
 * its branch from them (`chooseBranch`). Empty when the wave has no biome. Pure.
 */
export function placeTypes(run: Run, config: GameConfig): readonly GameType[] {
  const id = run.waveThemes[Math.min(run.wave.index, run.waveThemes.length - 1)] ?? '';
  const def = config.themes?.[id];
  if (def === undefined) return [];
  if (def.types === undefined) return [def.type];
  return def.types
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.weight - a.entry.weight || a.index - b.index)
    .map((s) => s.entry.type);
}
