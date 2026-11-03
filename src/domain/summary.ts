import type { GameConfig } from './config';
import type { Run } from './run';

export interface RunSummary {
  readonly seed: number;
  readonly starter: string;
  readonly result: 'won' | 'lost' | 'ongoing';
  /** Waves fully survived (the boss does not count as a wave). */
  readonly wavesCleared: number;
  readonly wavesTotal: number;
  readonly bossReached: boolean;
  readonly kills: number;
  readonly level: number;
  readonly ticks: number;
  readonly balls: readonly {
    readonly species: string;
    readonly level: number;
    readonly hybrid: boolean;
  }[];
  /** Orders runs: a win beats any defeat, then more waves, then more kills. */
  readonly score: number;
}

export const WIN_SCORE = 100_000;
export const WAVE_SCORE = 10_000;
export const KILL_SCORE = 100;

/** Pure digest of a run for the results screen and the best-run record. */
export function summarizeRun(run: Run, config: GameConfig): RunSummary {
  const wavesTotal = config.waves.length;
  const wavesCleared = Math.min(run.wave.index, wavesTotal);
  const result = run.phase === 'won' ? 'won' : run.phase === 'lost' ? 'lost' : 'ongoing';
  return {
    seed: run.seed,
    starter: run.starter,
    result,
    wavesCleared,
    wavesTotal,
    bossReached: run.boss.spawned,
    kills: run.kills,
    level: run.player.level,
    ticks: run.tickCount,
    balls: run.loadout.map((b) => ({ species: b.species, level: b.level, hybrid: b.hybrid })),
    score: (result === 'won' ? WIN_SCORE : 0) + wavesCleared * WAVE_SCORE + run.kills * KILL_SCORE,
  };
}
