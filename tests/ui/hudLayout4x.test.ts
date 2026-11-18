import { describe, expect, it } from 'vitest';
import { HUD_DIGIT_SCALE } from '../../src/ui/hud';
import { pixelNumberSize } from '../../src/ui/pixelNumber';
import { TEAM_GAP, teamTop } from '../../src/ui/teamBar';

/**
 * 4X, block 5 (19th playtest: "PS, Nv y el número al lado se ven raros, encimados"): the team bar
 * stands under the HUD whatever its height, and the digits of the HUD are drawn at a whole scale.
 */
describe('the team bar under the HUD', () => {
  it('always below its bottom, with a gap, for any height of the HUD', () => {
    for (const bottom of [0, 58, 101.4, 113, 160, 240.7]) {
      const top = teamTop(bottom);
      expect(top).toBeGreaterThanOrEqual(bottom + TEAM_GAP);
      expect(Number.isInteger(top)).toBe(true);
    }
    // The fixed offsets of before (112 px on a desktop, 58 px in the side panel of a phone) were under
    // the bottom of a HUD that had grown: that was the overlap.
    expect(teamTop(115)).toBeGreaterThan(112);
    expect(teamTop(113)).toBeGreaterThan(58);
  });
});

describe('the digits of the HUD', () => {
  it('a whole scale: every font pixel the same number of screen pixels', () => {
    expect(Number.isInteger(HUD_DIGIT_SCALE)).toBe(true);
    const { w, h } = pixelNumberSize('99/10');
    expect(Number.isInteger(w * HUD_DIGIT_SCALE)).toBe(true);
    expect(Number.isInteger(h * HUD_DIGIT_SCALE)).toBe(true);
  });
});
