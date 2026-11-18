import { describe, expect, it } from 'vitest';
import { swapTimes } from '../../src/ui/evolutionMoment';

/** 4W, block 6: the silhouettes of an evolution take turns, faster and faster, before the change. */
describe('the swaps of the evolution', () => {
  it('all happen before the change, ever closer together, never under the minimum gap', () => {
    const times = swapTimes(1000);
    expect(times.length).toBeGreaterThan(5);
    expect(times.every((t) => t < 1000 - 40)).toBe(true);
    const gaps = times.slice(1).map((t, i) => t - (times[i] ?? 0));
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i] ?? 0).toBeLessThanOrEqual((gaps[i - 1] ?? 0) + 1);
    }
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(54);
  });

  it('a very short moment has no swaps', () => {
    expect(swapTimes(200)).toEqual([]);
  });
});
