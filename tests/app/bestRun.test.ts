import { describe, expect, it } from 'vitest';
import {
  BEST_RUN_KEY,
  type BestRun,
  isBetter,
  type KeyValueStore,
  loadBestRun,
  parseBestRun,
  saveIfBest,
  toBestRun,
} from '../../src/app/bestRun';
import type { RunSummary } from '../../src/domain';

function summary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    seed: 123,
    starter: 'charmander',
    result: 'lost',
    wavesCleared: 3,
    wavesTotal: 7,
    bossReached: false,
    kills: 40,
    level: 5,
    ticks: 6000,
    balls: [{ species: 'charmander', level: 1, hybrid: false }],
    score: 30_000 + 4000,
    ...overrides,
  };
}

class FakeStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const throwing: KeyValueStore = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('quota');
  },
};

describe('best run: ordering', () => {
  const base = toBestRun(summary());
  it('a higher score is better; a lower one is not', () => {
    expect(isBetter({ ...base, score: base.score + 1 }, base)).toBe(true);
    expect(isBetter({ ...base, score: base.score - 1 }, base)).toBe(false);
  });
  it('on equal score the faster run is better, and an identical run is not', () => {
    expect(isBetter({ ...base, ticks: base.ticks - 1 }, base)).toBe(true);
    expect(isBetter({ ...base, ticks: base.ticks + 1 }, base)).toBe(false);
    expect(isBetter(base, base)).toBe(false);
  });
  it('anything beats no record', () => {
    expect(isBetter(base, null)).toBe(true);
  });
});

describe('best run: parsing what is in storage', () => {
  const valid: BestRun = toBestRun(summary());
  it('round-trips a valid record', () => {
    expect(parseBestRun(JSON.stringify(valid))).toEqual(valid);
  });
  it('rejects missing, corrupt or malformed data without throwing', () => {
    expect(parseBestRun(null)).toBeNull();
    expect(parseBestRun('')).toBeNull();
    expect(parseBestRun('{not json')).toBeNull();
    expect(parseBestRun('42')).toBeNull();
    expect(parseBestRun('null')).toBeNull();
    expect(parseBestRun(JSON.stringify({ ...valid, result: 'draw' }))).toBeNull();
    expect(parseBestRun(JSON.stringify({ ...valid, starter: 7 }))).toBeNull();
    expect(parseBestRun(JSON.stringify({ ...valid, score: -1 }))).toBeNull();
    expect(parseBestRun(JSON.stringify({ ...valid, kills: 'many' }))).toBeNull();
    const { seed: _seed, ...withoutSeed } = valid;
    expect(parseBestRun(JSON.stringify(withoutSeed))).toBeNull();
  });
  it('drops unknown extra fields', () => {
    const parsed = parseBestRun(JSON.stringify({ ...valid, junk: 1 }));
    expect(parsed).toEqual(valid);
    expect(parsed).not.toHaveProperty('junk');
  });
});

describe('best run: saving', () => {
  it('stores the first run, with its seed, and reports it as a new best', () => {
    const store = new FakeStore();
    const result = saveIfBest(store, summary({ seed: 777 }));
    expect(result.isNewBest).toBe(true);
    expect(result.best.seed).toBe(777);
    expect(loadBestRun(store)?.seed).toBe(777);
    expect(store.data.has(BEST_RUN_KEY)).toBe(true);
  });

  it('keeps the old record when the new run is worse, and replaces it when it is better', () => {
    const store = new FakeStore();
    saveIfBest(store, summary({ seed: 1, score: 50_000 }));
    const worse = saveIfBest(store, summary({ seed: 2, score: 10_000 }));
    expect(worse.isNewBest).toBe(false);
    expect(worse.best.seed).toBe(1);
    expect(loadBestRun(store)?.seed).toBe(1);
    const better = saveIfBest(store, summary({ seed: 3, score: 160_000, result: 'won' }));
    expect(better.isNewBest).toBe(true);
    expect(loadBestRun(store)).toMatchObject({ seed: 3, result: 'won' });
  });

  it('replaces a corrupt record', () => {
    const store = new FakeStore();
    store.setItem(BEST_RUN_KEY, '{oops');
    expect(saveIfBest(store, summary()).isNewBest).toBe(true);
    expect(loadBestRun(store)).not.toBeNull();
  });

  it('never throws when storage is missing or blocked', () => {
    expect(loadBestRun(null)).toBeNull();
    expect(loadBestRun(throwing)).toBeNull();
    expect(() => saveIfBest(null, summary())).not.toThrow();
    const blocked = saveIfBest(throwing, summary({ seed: 9 }));
    expect(blocked.best.seed).toBe(9);
  });
});
