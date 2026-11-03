import { describe, expect, it } from 'vitest';
import {
  cloneRng,
  createRng,
  deriveRng,
  imul32,
  nextFloat,
  nextInt,
  nextU32,
} from '../../src/domain';

/** Independent reference: textbook sfc32 + splitmix32 seeding, written with Math.imul. */
function referenceSequence(seed: number, count: number): number[] {
  const mix = (s: number): number => {
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) | 0;
  };
  let s = seed >>> 0;
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    s = (s + 0x9e3779b9) | 0;
    words.push(mix(s));
  }
  let [a = 0, b = 0, c = 0, d = 0] = words;
  const next = (): number => {
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i++) next();
  return Array.from({ length: count }, next);
}

function take(count: number, seed: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => nextU32(rng));
}

describe('rng', () => {
  it('reproduces the same sequence for the same seed', () => {
    expect(take(200, 12345)).toEqual(take(200, 12345));
  });

  it('produces different sequences for different seeds', () => {
    expect(take(10, 1)).not.toEqual(take(10, 2));
  });

  it('matches a golden sequence (guards against accidental algorithm changes)', () => {
    expect(take(5, 12345)).toEqual([1412780458, 2987940632, 2018378644, 3139918275, 1108503181]);
  });

  it('agrees with an independent reference implementation for many seeds', () => {
    for (const seed of [0, 1, 2, 42, 12345, 0x7fffffff, 0xffffffff, 987654321]) {
      expect(take(1000, seed)).toEqual(referenceSequence(seed, 1000));
    }
  });

  it('imul32 equals Math.imul (which the domain may not use)', () => {
    const rng = createRng(1);
    for (let i = 0; i < 20000; i++) {
      const a = nextU32(rng) | 0;
      const b = nextU32(rng) | 0;
      expect(imul32(a, b)).toBe(Math.imul(a, b));
    }
    expect(imul32(-1, -1)).toBe(1);
    expect(imul32(0x7fffffff, 0x7fffffff)).toBe(Math.imul(0x7fffffff, 0x7fffffff));
  });

  it('treats the seed as an unsigned 32-bit integer', () => {
    expect(take(5, -1)).toEqual(take(5, 0xffffffff));
  });

  it('returns floats in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 5000; i++) {
      const x = nextFloat(rng);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('returns integers in [0, n) and reaches every value', () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = nextInt(rng, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('has a roughly uniform mean', () => {
    const rng = createRng(2024);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += nextFloat(rng);
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.01);
  });

  it('continues identically from a cloned state', () => {
    const rng = createRng(5);
    for (let i = 0; i < 10; i++) nextU32(rng);
    const copy = cloneRng(rng);
    expect([nextU32(rng), nextU32(rng)]).toEqual([nextU32(copy), nextU32(copy)]);
  });

  describe('substreams', () => {
    it('are reproducible per (seed, label)', () => {
      const a = deriveRng(42, 'spawn');
      const b = deriveRng(42, 'spawn');
      expect([nextU32(a), nextU32(a)]).toEqual([nextU32(b), nextU32(b)]);
    });

    it('differ between labels and between seeds', () => {
      const spawn = nextU32(deriveRng(42, 'spawn'));
      expect(nextU32(deriveRng(42, 'aim'))).not.toBe(spawn);
      expect(nextU32(deriveRng(43, 'spawn'))).not.toBe(spawn);
    });

    it('are independent: consuming one does not move another', () => {
      const spawn = deriveRng(42, 'spawn');
      const aim = deriveRng(42, 'aim');
      const aimFirst = nextU32(cloneRng(aim));
      for (let i = 0; i < 100; i++) nextU32(spawn);
      expect(nextU32(aim)).toBe(aimFirst);
    });
  });
});
