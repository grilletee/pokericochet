import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../src/app/bestRun';
import {
  DEFAULT_ULTIMATE_KEY,
  isUltimateKey,
  keyLabel,
  loadUltimateKey,
  saveUltimateKey,
  ULTIMATE_KEY_KEY,
  ULTIMATE_KEYS,
} from '../../src/app/settings';
import { ultimateHint } from '../../src/ui/ultimateCue';

/** 4X, block 4 (the cousin: "el Ultimate con la tecla 1 es incómodo"): its key and its cue. */
function memory(initial: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('the key of the Ultimate', () => {
  it('is Q by default, next to the movement keys (never a number)', () => {
    expect(DEFAULT_ULTIMATE_KEY).toBe('KeyQ');
    expect(loadUltimateKey(memory())).toBe('KeyQ');
    expect(loadUltimateKey(null)).toBe('KeyQ');
    for (const key of ULTIMATE_KEYS) expect(key).toMatch(/^Key[A-Z]$/);
    // None of them moves the launcher (A/D and the arrows do).
    expect(ULTIMATE_KEYS).not.toContain('KeyA');
    expect(ULTIMATE_KEYS).not.toContain('KeyD');
  });

  it('the choice is remembered; anything else falls back to Q', () => {
    const store = memory();
    saveUltimateKey(store, 'KeyE');
    expect(loadUltimateKey(store)).toBe('KeyE');
    expect(loadUltimateKey(memory({ [ULTIMATE_KEY_KEY]: 'Digit1' }))).toBe('KeyQ');
    expect(loadUltimateKey(memory({ [ULTIMATE_KEY_KEY]: '' }))).toBe('KeyQ');
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadUltimateKey(broken)).toBe('KeyQ');
    expect(() => saveUltimateKey(broken, 'KeyF')).not.toThrow();
  });

  it('names its letter and recognises only its own codes', () => {
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('KeyW')).toBe('W');
    expect(isUltimateKey('KeyE')).toBe(true);
    expect(isUltimateKey('KeyZ')).toBe(false);
    expect(isUltimateKey(1)).toBe(false);
  });
});

describe('the cue of a ready Ultimate', () => {
  it('says how to throw it on a desktop and on a touch screen', () => {
    expect(ultimateHint(false, 'Q')).toBe('Pulsa Q o clic derecho');
    expect(ultimateHint(false, 'E')).toBe('Pulsa E o clic derecho');
    expect(ultimateHint(true, 'Q')).toContain('ULTI');
  });
});
