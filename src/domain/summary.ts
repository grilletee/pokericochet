import type { GameConfig } from './config';
import { formOfMember } from './forms';
import type { Run } from './run';
import { stageOf } from './team';

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
  /**
   * The Pokémon of the team at the end (ADR-030): species of the line, the form it shows (what to
   * call it, ADR-036), level and evolution stage.
   */
  readonly team: readonly {
    readonly species: string;
    readonly form: string;
    readonly level: number;
    readonly stage: number;
  }[];
  /** Bosses defeated, the final one included, and how many there are in a run (4F-E). */
  readonly bossesDefeated: number;
  readonly bossesTotal: number;
  /** The wave the run was in when it ended, 1-based and at most `wavesTotal`: what the HUD showed. */
  readonly waveReached: number;
  /** Balls captured during the run (line species and level): the input of the rewards (ADR-025). */
  readonly captured: readonly { readonly species: string; readonly level: number }[];
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
    team: run.team.map((m) => ({
      species: m.species,
      form: formOfMember(config, m),
      level: m.level,
      stage: stageOf(config, m.level),
    })),
    bossesDefeated: run.boss.defeated,
    bossesTotal: (config.interludes ?? []).length + (config.boss === undefined ? 0 : 1),
    waveReached: Math.min(run.wave.index + 1, Math.max(1, wavesTotal)),
    captured: run.captured.map((c) => ({ ...c })),
    score: (result === 'won' ? WIN_SCORE : 0) + wavesCleared * WAVE_SCORE + run.kills * KILL_SCORE,
  };
}
