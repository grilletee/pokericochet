/**
 * How big a ball looks, the same for every Pokémon (ADR-037). The sprites are 96 px squares but
 * the Pokémon inside fills between 30 and 94 px of it, so drawing every sprite at the same size
 * made one ball tiny and another one huge. The opaque box of the sprite is measured once and the
 * sprite is scaled so that this box, not the whole picture, is as wide as the ball of its stage:
 * what you see is what collides, and a stage-3 ball is always `radius 9 / radius 6` = x1.5 bigger
 * than a stage-1 one.
 */

/** The content of a ball is drawn this many times wider than its collision circle. */
export const BALL_CONTENT_SCALE = 1.5;

/** Side, in picture pixels, of the square box that holds every pixel with alpha above `threshold`. */
export function opaqueExtent(
  alpha: (x: number, y: number) => number,
  width: number,
  height: number,
  threshold = 20,
): number {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha(x, y) <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return Math.max(width, height); // empty picture: keep the whole of it
  return Math.max(maxX - minX + 1, maxY - minY + 1);
}

/**
 * Scale of a sprite whose opaque box is `extent` pixels wide so that the box measures the diameter
 * of a ball of `radius`, times `BALL_CONTENT_SCALE`.
 */
export function ballVisualScale(extent: number, radius: number): number {
  return (2 * radius * BALL_CONTENT_SCALE) / Math.max(1, extent);
}

/** Diameter, in arena pixels, that the content of a ball of `radius` is drawn at. */
export function ballVisualSize(radius: number): number {
  return 2 * radius * BALL_CONTENT_SCALE;
}
