import type { GameConfig } from './config';
import type { Run } from './run';
import type { GameType } from './types';
import { GAME_TYPES } from './types';
import { isBossAlive } from './waves';

/** The next boss and how long until it appears (ADR-050). */
export interface BossAdvice {
  /** 1-based number among the bosses between waves; for the final boss, the number of interludes + 1. */
  readonly number: number;
  /** How many bosses appear between waves. */
  readonly interludes: number;
  readonly final: boolean;
  /** Ticks of wave clock until it appears (0 when it is about to). */
  readonly ticks: number;
}

/**
 * What the player needs to read about the wave in progress (ADR-050, 4H-B1): data only, computed
 * from the run and the type chart, so the cartel, the strip and the arrows of the team bar draw it
 * without any game logic of their own.
 */
export interface WaveAdvice {
  /** 0-based wave in progress; the last one while the final boss is on the field. */
  readonly index: number;
  readonly total: number;
  /** Id of the theme of the wave ('' = none). */
  readonly theme: string;
  /** Types of the enemies the theme brings (empty without a theme). */
  readonly types: readonly GameType[];
  /** Attack types that hit the wave's types harder than normal, strongest first. */
  readonly effective: readonly GameType[];
  /** Attack types that hit them softer than normal, weakest first. */
  readonly resisted: readonly GameType[];
  /** Ticks left of the wave in progress. */
  readonly ticksLeft: number;
  /** Length of the wave in progress, for a progress bar. */
  readonly ticksTotal: number;
  /** The next boss to come, or null while one is on the field or none is left. */
  readonly boss: BossAdvice | null;
}

/**
 * Mean effectiveness of an attack type against a list of defending types (1 when the list is
 * empty). The team bar uses it for its arrow: above 1 good, below 1 poor.
 */
export function matchup(
  config: GameConfig,
  attack: GameType,
  defenders: readonly GameType[],
): number {
  if (defenders.length === 0) return 1;
  let sum = 0;
  for (const defender of defenders) sum += config.typeChart[attack][defender];
  return sum / defenders.length;
}

/** Attack types that hit `defenders` harder (`effective`, strongest first) or softer than normal. */
export function typeAdvice(
  config: GameConfig,
  defenders: readonly GameType[],
): { readonly effective: readonly GameType[]; readonly resisted: readonly GameType[] } {
  const scored = GAME_TYPES.map((type) => ({ type, value: matchup(config, type, defenders) }));
  return {
    effective: scored
      .filter((s) => s.value > 1)
      .sort((a, b) => b.value - a.value)
      .map((s) => s.type),
    resisted: scored
      .filter((s) => s.value < 1)
      .sort((a, b) => a.value - b.value)
      .map((s) => s.type),
  };
}

/** The types a theme brings (empty for an unknown theme or none). */
export function themeTypes(config: GameConfig, themeId: string): readonly GameType[] {
  const def = config.themes?.[themeId];
  return def === undefined ? [] : [def.type];
}

/** Wave clock ticks from now until the end of wave `last` (inclusive). */
function ticksThrough(run: Run, config: GameConfig, last: number): number {
  let ticks = 0;
  for (let i = run.wave.index; i <= last; i++) ticks += config.waves[i]?.durationTicks ?? 0;
  return Math.max(0, ticks - run.wave.tick);
}

export function waveAdvice(run: Run, config: GameConfig): WaveAdvice {
  const total = config.waves.length;
  const index = Math.min(run.wave.index, Math.max(0, total - 1));
  const theme = run.waveThemes[index] ?? '';
  const types = themeTypes(config, theme);
  const { effective, resisted } = typeAdvice(config, types);

  const interludes = config.interludes ?? [];
  const finished = run.wave.index >= total;
  let boss: BossAdvice | null = null;
  if (!isBossAlive(run) && !run.boss.spawned) {
    const next = interludes[run.boss.next];
    if (next !== undefined) {
      boss = {
        number: run.boss.next + 1,
        interludes: interludes.length,
        final: false,
        // 0 once the wave that brings it has started: there is nothing left to count.
        ticks: ticksThrough(run, config, next.after - 1),
      };
    } else if (config.boss !== undefined) {
      boss = {
        number: interludes.length + 1,
        interludes: interludes.length,
        final: true,
        ticks: finished ? 0 : ticksThrough(run, config, total - 1),
      };
    }
  }
  const wave = config.waves[index];
  return {
    index,
    total,
    theme,
    types,
    effective,
    resisted,
    ticksLeft: finished || wave === undefined ? 0 : Math.max(0, wave.durationTicks - run.wave.tick),
    ticksTotal: wave?.durationTicks ?? 0,
    boss,
  };
}
