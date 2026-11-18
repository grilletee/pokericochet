import { DIGIT_GLYPHS, DIGIT_H, DIGIT_W, digitChars } from '../domain';

/**
 * Numbers of the interface in the game's own digits (4W, block 3; the same hand-drawn font as the
 * damage numbers of the field, `domain/digitFont.ts`): the HUD, the pity, the levels, the coins. A
 * small canvas, the glyphs in one colour with a one-pixel ink outline, scaled up with no smoothing.
 * Characters the font does not have are left out.
 */
const INK = '#0b0d1a';
const LIGHT = '#fff6e0';

/**
 * 4X: the outline of a number in `color`: ink, unless the number itself is dark (the price on the
 * light draw buttons of the gacha), where an ink outline merged the glyphs into blocks ("1■■").
 */
export function outlineFor(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (hex === undefined) return INK;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  // Perceived brightness (0..255): under a third it is a dark colour.
  return 0.299 * r + 0.587 * g + 0.114 * b < 85 ? LIGHT : INK;
}

/** The width and height in font pixels of `text` (with the outline). */
export function pixelNumberSize(text: string): { readonly w: number; readonly h: number } {
  const n = digitChars(text).length;
  return { w: n === 0 ? 0 : n * (DIGIT_W + 1) + 1, h: DIGIT_H + 2 };
}

/** Draws `text` into `canvas` (resizing it) in `color`, each font pixel `scale` CSS pixels. */
export function drawPixelNumber(
  canvas: HTMLCanvasElement,
  text: string,
  color: string,
  scale: number,
): void {
  const chars = digitChars(text);
  const { w, h } = pixelNumberSize(text);
  canvas.width = Math.max(1, w);
  canvas.height = h;
  canvas.style.width = `${Math.max(1, w) * scale}px`;
  canvas.style.height = `${h * scale}px`;
  canvas.setAttribute('aria-label', text);
  canvas.dataset.pixelNumber = text;
  const g = canvas.getContext('2d');
  if (g === null) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const paint = (fill: string, outline: boolean): void => {
    g.fillStyle = fill;
    chars.forEach((ch, i) => {
      const rows = DIGIT_GLYPHS[ch] ?? [];
      const ox = 1 + i * (DIGIT_W + 1);
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] !== 'x') continue;
          if (outline) g.fillRect(ox + x - 1, 1 + y - 1, 3, 3);
          else g.fillRect(ox + x, 1 + y, 1, 1);
        }
      });
    });
  };
  paint(outlineFor(color), true);
  paint(color, false);
}

/** A new canvas showing `text`. */
export function pixelNumber(text: string, color: string, scale = 2): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'inline-block';
  canvas.style.verticalAlign = 'middle';
  drawPixelNumber(canvas, text, color, scale);
  return canvas;
}
