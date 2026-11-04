import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  BALL_CONTENT_SCALE,
  ballVisualScale,
  ballVisualSize,
  opaqueExtent,
} from '../../src/render/artBox';

/** A picture of `size` x `size` with a filled rectangle: the pixels of the "Pokémon". */
function picture(_size: number, x0: number, y0: number, x1: number, y1: number) {
  return (x: number, y: number) => (x >= x0 && x <= x1 && y >= y0 && y <= y1 ? 255 : 0);
}

describe('the opaque box of a sprite (ADR-037)', () => {
  it('measures the visible pixels, not the picture: a small Pokémon in a big margin', () => {
    expect(opaqueExtent(picture(96, 30, 30, 64, 64), 96, 96)).toBe(35); // like Magnemite
    expect(opaqueExtent(picture(96, 8, 4, 87, 83), 96, 96)).toBe(80); // like Charizard
  });

  it('takes the larger side of the box', () => {
    expect(opaqueExtent(picture(96, 10, 10, 19, 59), 96, 96)).toBe(50);
    expect(opaqueExtent(picture(96, 10, 10, 59, 19), 96, 96)).toBe(50);
  });

  it('ignores almost transparent pixels (anti-aliasing) and keeps the whole picture if it is empty', () => {
    const faint = (x: number, y: number) =>
      x === 0 && y === 0 ? 10 : x === 40 && y === 40 ? 255 : 0;
    expect(opaqueExtent(faint, 96, 96)).toBe(1);
    expect(opaqueExtent(() => 0, 96, 64)).toBe(96);
    // A pixel exactly at the threshold does not count; one above it does.
    const at = (alpha: number) => (x: number, y: number) => (x < 10 && y < 10 ? alpha : 0);
    expect(opaqueExtent(at(20), 96, 96)).toBe(96);
    expect(opaqueExtent(at(21), 96, 96)).toBe(10);
  });
});

describe('every ball grows the same (ADR-037)', () => {
  const radii = gameConfig.team.ballRadiusByStage;

  it('the visible size of the content is the same for a tiny and a huge sprite', () => {
    for (const radius of radii) {
      const tiny = 35 * ballVisualScale(35, radius);
      const huge = 80 * ballVisualScale(80, radius);
      expect(tiny).toBeCloseTo(ballVisualSize(radius), 9);
      expect(huge).toBeCloseTo(tiny, 9);
    }
  });

  it('stage 3 is always x1.5 the stage 1, whatever the sprite', () => {
    for (const extent of [30, 35, 58, 80, 94]) {
      const first = ballVisualScale(extent, radii[0] as number);
      const last = ballVisualScale(extent, radii[2] as number);
      expect(last / first).toBeCloseTo(1.5, 9);
      expect(extent * last).toBeCloseTo(2 * (radii[2] as number) * BALL_CONTENT_SCALE, 9);
    }
  });

  it('grows with each stage and never divides by zero', () => {
    const sizes = radii.map((radius) => ballVisualSize(radius));
    expect(sizes[1] as number).toBeGreaterThan(sizes[0] as number);
    expect(sizes[2] as number).toBeGreaterThan(sizes[1] as number);
    expect(Number.isFinite(ballVisualScale(0, 6))).toBe(true);
  });
});
