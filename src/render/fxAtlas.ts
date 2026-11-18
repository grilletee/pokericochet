import { Rectangle, Texture } from 'pixi.js';
import { DIGIT_GLYPHS, DIGIT_H, DIGIT_W } from '../domain';
import { bayer, makeCanvas, PixelWriter, textureOf } from './paint';
import type { ParticleShape } from './sceneIds';
import { SHAPE_ROWS } from './shapes';

/**
 * One sheet with every small picture the effects of the field use (4V, performance): the shapes of
 * the particles, the ten digits of the damage numbers with a blank, and a stepped glow. They share
 * ONE texture source on purpose: a particle container draws a single source, and a sprite that
 * changes to a picture of the same source never makes PixiJS rebuild its draw list.
 */
/** A cell of a digit: the hand-drawn glyph (4W, `domain/digitFont.ts`) with a pixel of outline round it. */
export const GLYPH_W = DIGIT_W + 2;
export const GLYPH_H = DIGIT_H + 2;
/** The index of the empty glyph after the ten digits. */
export const BLANK = 10;
const GLOW = 24;

const GLYPHS: readonly (readonly string[])[] = '0123456789'
  .split('')
  .map((d) => DIGIT_GLYPHS[d] ?? []);

export interface FxAtlas {
  readonly shapes: Readonly<Record<ParticleShape, Texture>>;
  /** The digits 0-9 and the blank, white with a one-pixel ink outline. */
  readonly digits: readonly Texture[];
  readonly glow: Texture;
  /** A round pixel dot of `DISC` pixels across and a pixel ring of `RING` across. */
  readonly disc: Texture;
  readonly ring: Texture;
  /** A solid white square (the beams of light, stretched). */
  readonly solid: Texture;
}

export const DISC = 8;
export const RING = 16;
const DISC_ROWS = [
  '..eeee..',
  '.eeeeee.',
  'eeeeeeee',
  'eeeeeeee',
  'eeeeeeee',
  'eeeeeeee',
  '.eeeeee.',
  '..eeee..',
];
const RING_ROWS = [
  '....eeeeeeee....',
  '..eee......eee..',
  '.ee..........ee.',
  '.e............e.',
  'ee............ee',
  'e..............e',
  'e..............e',
  'e..............e',
  'e..............e',
  'e..............e',
  'e..............e',
  'ee............ee',
  '.e............e.',
  '.ee..........ee.',
  '..eee......eee..',
  '....eeeeeeee....',
];

let atlas: FxAtlas | null = null;

export function fxAtlas(): FxAtlas {
  if (atlas !== null) return atlas;
  const names = Object.keys(SHAPE_ROWS) as ParticleShape[];
  const cell = 8; // every shape fits in 7 x 7 with a pixel of margin
  const width = Math.max(names.length * cell, 11 * GLYPH_W, GLOW);
  const writer = new PixelWriter(makeCanvas(width, cell + GLYPH_H + GLOW + 2));
  const white = [255, 255, 255] as const;
  const frames = new Map<ParticleShape, Rectangle>();
  names.forEach((name, i) => {
    const rows = SHAPE_ROWS[name];
    writer.stamp(rows, i * cell, 0, { x: white });
    frames.set(name, new Rectangle(i * cell, 0, rows[0]?.length ?? 1, rows.length));
  });
  const digitY = cell + 1;
  GLYPHS.forEach((rows, n) => {
    const ox = n * GLYPH_W + 1;
    // The outline first: every lit pixel paints ink around itself.
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== 'x') continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++)
            writer.put(ox + x + dx, digitY + 1 + y + dy, [11, 13, 26]);
        }
      }
    });
    writer.stamp(rows, ox, digitY + 1, { x: white });
  });
  const glowY = digitY + GLYPH_H + 1;
  const mid = (GLOW - 1) / 2;
  for (let y = 0; y < GLOW; y++) {
    for (let x = 0; x < GLOW; x++) {
      const d = Math.hypot(x - mid, y - mid) / (GLOW / 2);
      if (d >= 1) continue;
      const v = (1 - d) ** 2 * 4;
      const band = Math.floor(v) + (v - Math.floor(v) > bayer(x, y) ? 1 : 0);
      if (band > 0) writer.put(x, glowY + y, white, Math.round((band / 4) * 255));
    }
  }
  const discX = GLOW + 2;
  const ringX = discX + DISC + 2;
  writer.stamp(DISC_ROWS, discX, glowY, { e: white });
  writer.stamp(RING_ROWS, ringX, glowY, { e: white });
  // A 4 x 4 solid cell; only its inner 2 x 2 is used, so stretching it never bleeds a neighbour.
  const solidX = ringX + RING + 2;
  writer.stamp(['xxxx', 'xxxx', 'xxxx', 'xxxx'], solidX, glowY, { x: white });
  const sheet = textureOf(writer.done());
  const cut = (frame: Rectangle): Texture => new Texture({ source: sheet.source, frame });
  const shapes = Object.fromEntries(
    names.map((name) => [name, cut(frames.get(name) ?? new Rectangle(0, 0, 1, 1))]),
  ) as Record<ParticleShape, Texture>;
  atlas = {
    shapes,
    digits: Array.from({ length: 11 }, (_, n) =>
      cut(new Rectangle(n * GLYPH_W, digitY, GLYPH_W, GLYPH_H)),
    ),
    glow: cut(new Rectangle(0, glowY, GLOW, GLOW)),
    disc: cut(new Rectangle(discX, glowY, DISC, DISC)),
    ring: cut(new Rectangle(ringX, glowY, RING, RING)),
    solid: cut(new Rectangle(solidX + 1, glowY + 1, 2, 2)),
  };
  return atlas;
}
