import { describe, expect, it } from 'vitest';
import { anticipation, revealTiming } from '../../src/ui';

/** 4W, block 6 (18th playtest: "el gacha mucho más espectacular"). */
describe('the anticipation of a draw', () => {
  it('the sphere lands, then its colour climbs one rarity at a time up to the best, then it opens', () => {
    for (const best of [3, 4, 5] as const) {
      const a = anticipation(best);
      expect(a.shifts.map((s) => s.stars)).toEqual(best === 3 ? [] : best === 4 ? [4] : [4, 5]);
      const times = [a.landMs, ...a.shifts.map((s) => s.at), a.openMs];
      expect([...times].sort((x, y) => x - y)).toEqual(times);
      // Each colour is seen a moment before the next step (never two changes in one blink).
      for (let i = 1; i < times.length; i++) {
        expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(300);
      }
    }
  });

  it('a rarer draw lasts a little longer, and never too long', () => {
    expect(anticipation(4).openMs).toBeGreaterThan(anticipation(3).openMs);
    expect(anticipation(5).openMs).toBeGreaterThan(anticipation(4).openMs);
    expect(anticipation(5).openMs).toBeLessThanOrEqual(2200);
  });
});

describe('the rhythm of a x10', () => {
  it('the commons roll faster and faster; a ★4 waits a beat', () => {
    const t = revealTiming([3, 3, 3, 3, 3, 3, 3, 3, 4, 3]);
    const commons = [0, 1, 2, 3, 4, 5, 6, 7, 9].map((i) => t.flips[i] ?? 0);
    const gaps = commons.slice(1).map((v, i) => v - (commons[i] ?? 0));
    expect(gaps[gaps.length - 1]).toBeLessThan(gaps[0] ?? 0);
    const sorted = [...t.flips].sort((a, b) => a - b);
    const four = t.flips[8] ?? 0;
    const before = sorted[sorted.indexOf(four) - 1] ?? 0;
    expect(four - before).toBeGreaterThan(gaps[gaps.length - 1] ?? 0);
  });

  it('a ★5 has a screen of its own: the next card and the button wait for it', () => {
    const t = revealTiming([5, 3, 5]);
    expect(t.fiveScreenMs).toBeGreaterThanOrEqual(2000);
    const fives = [t.flips[0] ?? 0, t.flips[2] ?? 0].sort((a, b) => a - b);
    expect((fives[1] ?? 0) - (fives[0] ?? 0)).toBeGreaterThanOrEqual(t.fiveScreenMs);
    expect(t.doneMs).toBeGreaterThanOrEqual((fives[1] ?? 0) + t.fiveScreenMs);
    // Without a ★5 there is no wait of that kind.
    expect(revealTiming([3, 4]).doneMs).toBeLessThan(1500);
  });
});
