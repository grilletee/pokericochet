import type { RunSummary } from '../domain';

/** localStorage key (neutral on purpose: it must not change if the game is renamed); v1 = shape version. */
export const BEST_RUN_KEY = 'bestRun.v1';

/** What is kept of the best run: enough for the results screen and to replay it by seed. */
export interface BestRun {
  readonly score: number;
  readonly result: 'won' | 'lost' | 'ongoing';
  readonly wavesCleared: number;
  readonly wavesTotal: number;
  readonly kills: number;
  readonly ticks: number;
  readonly seed: number;
  readonly starter: string;
}

/** The part of the Storage interface the game uses, so tests can inject a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function toBestRun(summary: RunSummary): BestRun {
  return {
    score: summary.score,
    result: summary.result,
    wavesCleared: summary.wavesCleared,
    wavesTotal: summary.wavesTotal,
    kills: summary.kills,
    ticks: summary.ticks,
    seed: summary.seed,
    starter: summary.starter,
  };
}

/** A run is better with a higher score; on a tie, the faster one. */
export function isBetter(candidate: BestRun, current: BestRun | null): boolean {
  if (current === null) return true;
  if (candidate.score !== current.score) return candidate.score > current.score;
  return candidate.ticks < current.ticks;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Parses what was stored; anything that is not a well-formed record gives null. */
export function parseBestRun(text: string | null): BestRun | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.result !== 'won' && v.result !== 'lost' && v.result !== 'ongoing') return null;
  if (typeof v.starter !== 'string') return null;
  if (
    !isCount(v.score) ||
    !isCount(v.wavesCleared) ||
    !isCount(v.wavesTotal) ||
    !isCount(v.kills) ||
    !isCount(v.ticks) ||
    !isCount(v.seed)
  ) {
    return null;
  }
  return {
    score: v.score,
    result: v.result,
    wavesCleared: v.wavesCleared,
    wavesTotal: v.wavesTotal,
    kills: v.kills,
    ticks: v.ticks,
    seed: v.seed,
    starter: v.starter,
  };
}

/** The browser's localStorage, or null where it is missing or blocked (private mode, etc.). */
export function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadBestRun(store: KeyValueStore | null): BestRun | null {
  if (store === null) return null;
  try {
    return parseBestRun(store.getItem(BEST_RUN_KEY));
  } catch {
    return null;
  }
}

/**
 * Keeps the run if it beats the stored one. Storage failures never break the game: the run is
 * then just not saved, and `best` is whatever could be read.
 */
export function saveIfBest(
  store: KeyValueStore | null,
  summary: RunSummary,
): { best: BestRun; isNewBest: boolean } {
  const current = loadBestRun(store);
  const candidate = toBestRun(summary);
  if (!isBetter(candidate, current)) return { best: current ?? candidate, isNewBest: false };
  try {
    store?.setItem(BEST_RUN_KEY, JSON.stringify(candidate));
  } catch {
    // Full or blocked storage: play on without a record.
  }
  return { best: candidate, isNewBest: true };
}
