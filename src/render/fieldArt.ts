import type { Texture } from 'pixi.js';
import { hexRgb, makeCanvas, PixelWriter, textureOf } from './paint';

/**
 * The deck the launcher rides on, under the line of defence (4V, block 1): plates of dark metal
 * with a lit edge, seams, rivets and a rail at the height of the launcher, and the line itself as
 * dashes of the red of danger on top. One texture of `w` x `h` art pixels whose first three rows
 * are the line (they sit just above the deck).
 */
export const DECK_LINE_ROWS = 3;

export function deckTexture(w: number, h: number, railY: number): Texture {
  const writer = new PixelWriter(makeCanvas(w, h + DECK_LINE_ROWS));
  const ink = hexRgb('#0b0d1a');
  const tones = ['#12162a', '#171c36', '#1c2342', '#232c50'].map(hexRgb);
  const edge = hexRgb('#6f82b8');
  const lip = hexRgb('#3a4a7c');
  const top = DECK_LINE_ROWS;
  for (let x = 0; x < w; x++) {
    // The line of defence: dashes of the danger red with their darker underside.
    if (x % 8 < 6) {
      writer.put(x, 0, hexRgb('#ff6a5a'));
      writer.put(x, 1, hexRgb('#ff4a3a'));
      writer.put(x, 2, hexRgb('#8a1e1a'));
    }
    for (let y = top; y < h + top; y++) {
      const row = y - top;
      const plate = Math.floor(x / 24);
      const seam = x % 24 === 0;
      if (row === 0) writer.put(x, y, edge);
      else if (row === 1) writer.put(x, y, lip);
      else if (row === h - 1) writer.put(x, y, x % 4 < 2 ? lip : ink);
      else if (seam) writer.put(x, y, ink);
      else if (x % 24 === 1) writer.put(x, y, tones[3] ?? ink);
      else if (Math.abs(row - railY) <= 1) {
        // The rail: a groove with a tick every few pixels.
        writer.put(x, y, row === railY ? (x % 6 === 0 ? lip : ink) : (tones[3] ?? ink));
      } else {
        const tone = (plate + (row > railY ? 1 : 0)) % 2 === 0 ? 1 : 2;
        const dither = (x + row) % 2 === 0 && row % 3 === 0 ? 1 : 0;
        writer.put(x, y, tones[Math.max(0, tone - dither)] ?? ink);
      }
    }
    // Rivets at the corners of each plate.
    if (x % 24 === 3 || x % 24 === 21) {
      writer.put(x, top + 3, edge);
      writer.put(x, top + 4, ink);
      writer.put(x, top + h - 4, lip);
    }
  }
  return textureOf(writer.done());
}
