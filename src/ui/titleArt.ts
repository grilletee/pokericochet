/**
 * The logo of the title screen (4G-I): the name of the game written small in the pixel font of the
 * game (Pixelify Sans, OFL, see LICENSES-ASSETS.md) and scaled up without smoothing, with a dark
 * outline, a drop shadow and a warm two-tone fill, and a glass sphere of our own beside it. Drawn by
 * code: no franchise logo, no traced art. The sphere is pure data (`LOGO_SPHERE`) so it is tested.
 */

/**
 * The sphere of the logo, 12 x 12: the glass sphere of the balls of THIS game (no band, no button:
 * nothing of a franchise ball), with a streak of light that says it ricochets. o outline, b body,
 * d deep, l light, w glint, y streak.
 */
export const LOGO_SPHERE: readonly string[] = [
  '....oooo....',
  '..oobbbboo..',
  '.obwwlbbbbo.',
  '.obwllbbbdo.',
  'oblllbbbbddo',
  'obllbbbbbddo',
  'obbbbbbbddyo',
  'obbbbbbddyyo',
  '.obbbbddyyo.',
  '.obddddyyyo.',
  '..oodddyoo..',
  '....oooo....',
];

const SPHERE_COLORS: Readonly<Record<string, string>> = {
  o: '#14172b',
  b: '#4a8ae8',
  d: '#2a4a9a',
  l: '#9ad0ff',
  w: '#ffffff',
  y: '#ffd75a',
};

/** Width of the small canvas the text is written on, before scaling (art pixels per letter ~6). */
function textWidth(title: string): number {
  return Math.max(60, title.length * 7 + 8);
}

/**
 * Draws the logo into a new canvas (art pixels) and returns it; the caller scales it with CSS
 * (`image-rendering: pixelated`). `font` is the CSS family of the pixel font.
 */
export function drawLogo(title: string, font: string): HTMLCanvasElement {
  const w = 16 + textWidth(title);
  const h = 22;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g === null) return c;
  g.imageSmoothingEnabled = false;
  LOGO_SPHERE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = SPHERE_COLORS[row[x] ?? '.'];
      if (color === undefined) continue;
      g.fillStyle = color;
      g.fillRect(x + 1, y + 5, 1, 1);
    }
  });
  g.font = `12px ${font}`;
  g.textBaseline = 'top';
  const x0 = 15;
  const y0 = 4;
  // Shadow, outline, then the fill in two tones (light on top).
  g.fillStyle = '#05060f';
  g.fillText(title, x0 + 1, y0 + 2);
  g.fillStyle = '#14172b';
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    g.fillText(title, x0 + dx, y0 + dy);
  }
  const fill = g.createLinearGradient(0, y0, 0, y0 + 12);
  fill.addColorStop(0, '#fff2a8');
  fill.addColorStop(0.5, '#ffd75a');
  fill.addColorStop(0.51, '#f0a030');
  fill.addColorStop(1, '#e8703a');
  g.fillStyle = fill;
  g.fillText(title, x0, y0);
  // Pixel art: no half pixels. Every pixel becomes all or nothing.
  const image = g.getImageData(0, 0, w, h);
  for (let i = 3; i < image.data.length; i += 4)
    image.data[i] = (image.data[i] ?? 0) > 110 ? 255 : 0;
  g.putImageData(image, 0, 0);
  return c;
}
