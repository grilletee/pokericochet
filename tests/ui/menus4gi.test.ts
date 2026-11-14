import { describe, expect, it } from 'vitest';
import { BACKDROP_H, BACKDROP_W, backdropFrame, LOGO_SPHERE } from '../../src/ui';

/** 4G-I, block 5 (16th playtest: "el inicio es muy feo"): the pure parts of the title screen. */
describe('the logo and the animated night of the title', () => {
  it('the sphere of the logo is 12 x 12 and is the glass sphere of the game, not a franchise ball', () => {
    expect(LOGO_SPHERE).toHaveLength(12);
    for (const row of LOGO_SPHERE) expect(row).toHaveLength(12);
    const pixels = LOGO_SPHERE.join('');
    // No white band across it and no button: the codes of a two-tone ball are not used.
    expect(pixels).not.toMatch(/[rk]/);
    expect(
      LOGO_SPHERE.some((row) => /^o+$/.test(row.replaceAll('.', '')) && row.includes('oooooo')),
    ).toBe(false);
  });

  it('the spheres of the night bounce inside the picture, and they move', () => {
    for (const ms of [0, 1000, 5000, 60_000, 600_000]) {
      for (const s of backdropFrame(ms)) {
        expect(s.x - s.r).toBeGreaterThanOrEqual(-1e-9);
        expect(s.x + s.r).toBeLessThanOrEqual(BACKDROP_W + 1e-9);
        expect(s.y - s.r).toBeGreaterThanOrEqual(0);
        expect(s.y + s.r).toBeLessThanOrEqual(BACKDROP_H);
      }
    }
    const a = backdropFrame(0);
    const b = backdropFrame(800);
    expect(a.some((s, i) => s.x !== b[i]?.x || s.y !== b[i]?.y)).toBe(true);
    expect(new Set(a.map((s) => s.color)).size).toBe(a.length);
  });
});
