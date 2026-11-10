import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../src/app/bestRun';
import {
  DEFAULT_VOLUMES,
  loadMuted,
  loadVolumes,
  MUTED_KEY,
  saveMuted,
  saveVolumes,
  VOLUMES_KEY,
} from '../../src/app/settings';

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

describe('volumes (4G-F)', () => {
  it('start with quiet cries and remember what was chosen, clamped to 0..1', () => {
    const store = memory();
    expect(loadVolumes(store)).toEqual(DEFAULT_VOLUMES);
    expect(DEFAULT_VOLUMES.cries).toBeLessThan(0.5);
    saveVolumes(store, { master: 0.5, effects: 0.25, cries: 0.1 });
    expect(loadVolumes(store)).toEqual({ master: 0.5, effects: 0.25, cries: 0.1 });
    store.setItem(VOLUMES_KEY, JSON.stringify({ master: 9, effects: -3, cries: 'x' }));
    expect(loadVolumes(store)).toEqual({ master: 1, effects: 0, cries: DEFAULT_VOLUMES.cries });
  });

  it('a broken, missing or blocked store gives the defaults and never throws', () => {
    expect(loadVolumes(null)).toEqual(DEFAULT_VOLUMES);
    const store = memory();
    store.setItem(VOLUMES_KEY, '{not json');
    expect(loadVolumes(store)).toEqual(DEFAULT_VOLUMES);
    const blocked: KeyValueStore = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('quota');
      },
    };
    expect(loadVolumes(blocked)).toEqual(DEFAULT_VOLUMES);
    expect(() => saveVolumes(blocked, DEFAULT_VOLUMES)).not.toThrow();
  });
});
