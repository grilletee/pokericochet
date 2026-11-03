import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../src/app/bestRun';
import { loadMuted, MUTED_KEY, saveMuted } from '../../src/app/settings';

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
};

describe('settings: mute switch', () => {
  it('is off by default and remembers the choice', () => {
    const store = memory();
    expect(loadMuted(store)).toBe(false);
    saveMuted(store, true);
    expect(store.data.get(MUTED_KEY)).toBe('1');
    expect(loadMuted(store)).toBe(true);
    saveMuted(store, false);
    expect(loadMuted(store)).toBe(false);
  });

  it('never throws when storage is missing or blocked', () => {
    const blocked: KeyValueStore = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('quota');
      },
    };
    expect(loadMuted(null)).toBe(false);
    expect(loadMuted(blocked)).toBe(false);
    expect(() => saveMuted(null, true)).not.toThrow();
    expect(() => saveMuted(blocked, true)).not.toThrow();
  });
});
