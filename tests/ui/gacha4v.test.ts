import { describe, expect, it } from 'vitest';
import { GACHA_RULES } from '../../src/data';
import { pityMeters, RARITY_COLORS, revealTiming, shadeHex } from '../../src/ui';

/** 4V, block 3: the pity panel and the rhythm of the reveal, as pure functions. */
describe('the pity panel', () => {
  const worst = 2 * GACHA_RULES.hardAt;
  const calm = {
    toFive: 80,
    toFour: 10,
    soft: false,
    nextFiveChance: 80,
    worstToFeatured: worst,
    sinceFive: 0,
  };

  it('a counter per guarantee, a third only on a limited banner, all empty at the start', () => {
    const limited = pityMeters(calm, GACHA_RULES, true);
    expect(limited.map((m) => m.id)).toEqual(['five', 'four', 'featured']);
    expect(pityMeters(calm, GACHA_RULES, false).map((m) => m.id)).toEqual(['five', 'four']);
    for (const m of limited) expect(m.fill).toBe(0);
    expect(limited.map((m) => m.value)).toEqual(['80', '10', String(worst)]);
    expect(limited[0]?.color).toBe(RARITY_COLORS[5]);
    expect(limited[1]?.segments).toBe(GACHA_RULES.fourEvery);
  });

  it('the bars fill as the draws go, and are full on the draw that is sure', () => {
    const near = pityMeters(
      { ...calm, toFive: 1, toFour: 1, worstToFeatured: 1, soft: true, nextFiveChance: 10_000 },
      GACHA_RULES,
      true,
    );
    const [five, four, featured] = near;
    expect(five?.fill).toBeCloseTo(1 - 1 / GACHA_RULES.hardAt, 9);
    expect(four?.fill).toBeCloseTo(1 - 1 / GACHA_RULES.fourEvery, 9);
    // 4X: the featured one counts the worst case, two hard pities.
    expect(featured?.fill).toBeCloseTo(1 - 1 / worst, 9);
    // The soft pity and the next ★4 sure are "hot" (they blink).
    expect(five?.hot).toBe(true);
    expect(five?.note).toContain('100 %');
    expect(four?.hot).toBe(true);
  });

  it('a lost 50/50 shows as "sure" and full (4X: it carries over the weeks)', () => {
    const owed = pityMeters(
      { ...calm, worstToFeatured: 70, featuredOwed: true },
      GACHA_RULES,
      true,
    )[2];
    expect(owed?.value).toBe('Seguro');
    expect(owed?.fill).toBe(1);
    expect(owed?.hot).toBe(true);
    const fresh = pityMeters(calm, GACHA_RULES, true)[2];
    expect(fresh?.hot).toBe(false);
    expect(fresh?.note).toContain('como muy tarde');
  });
});

describe('the rhythm of a reveal', () => {
  it('every card turns once, one after another, the rarest last', () => {
    const drawn = [5, 3, 4, 3, 3, 3, 3, 4, 3, 3] as const;
    const t = revealTiming(drawn);
    expect(t.flips).toHaveLength(10);
    expect(new Set(t.flips).size).toBe(10);
    // All the ★3 before any ★4, all the ★4 before the ★5.
    const when = (s: number): number[] => t.flips.filter((_, i) => drawn[i] === s);
    expect(Math.max(...when(3))).toBeLessThan(Math.min(...when(4)));
    expect(Math.max(...when(4))).toBeLessThan(Math.min(...when(5)));
    // Within a rarity, in the order they were drawn.
    expect(t.flips[1]).toBeLessThan(t.flips[3] ?? 0);
    expect(t.flips[2]).toBeLessThan(t.flips[7] ?? 0);
    // The ★5 waits a beat longer than a normal step; the button comes after the last card.
    const gaps = [...t.flips].sort((a, b) => a - b);
    const lastGap = (gaps[9] ?? 0) - (gaps[8] ?? 0);
    expect(lastGap).toBeGreaterThan((gaps[1] ?? 0) - (gaps[0] ?? 0));
    expect(t.doneMs).toBeGreaterThan(Math.max(...t.flips));
    // The hint of a rare card comes before it turns, never before the cards are dealt.
    expect(t.hintMs).toBeGreaterThan(0);
    expect(Math.min(...t.flips)).toBeGreaterThanOrEqual(t.hintMs);
  });

  it('a single draw turns soon; a whole x10 of commons in under two seconds', () => {
    expect(revealTiming([3]).flips[0]).toBeLessThan(500);
    expect(revealTiming(new Array(10).fill(3)).doneMs).toBeLessThan(2000);
  });
});

describe('the shades of a colour', () => {
  it('darker below 1, towards white above 1, the same at 1', () => {
    expect(shadeHex('#808080', 1)).toBe('#808080');
    expect(shadeHex('#808080', 0.5)).toBe('#404040');
    expect(shadeHex('#808080', 2)).toBe('#ffffff');
    expect(shadeHex('#000000', 1.5)).toBe('#808080');
  });
});
