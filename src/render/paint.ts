import { Texture } from 'pixi.js';

/**
 * The painter's kit of the 4V art direction ("Cartucho luminoso", see the art bible in the vault):
 * small canvases painted one art pixel at a time with closed colour ramps and ordered dithering, and
 * stepped glows for the additive light. Everything here runs once per texture, never per frame.
 */

/** Art pixels of the playing field are this many arena units wide (4V: 2; the 4G-D art used 4). */
export const FIELD_PIXEL = 2;
/** The tile of a scene: 240 x 360 art pixels = the 480 x 720 arena. */
export const SCENE_W = 240;
export const SCENE_H = 360;

export type Rgb = readonly [number, number, number];

export interface Painting {
  readonly c: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
}

export function makeCanvas(w: number, h: number): Painting {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g === null) throw new Error('no 2d canvas');
  g.imageSmoothingEnabled = false;
  return { c, g };
}

export function textureOf(c: HTMLCanvasElement): Texture {
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}

export function hexRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function numRgb(n: number): Rgb {
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function css(c: Rgb, alpha = 1): string {
  const [r, g, b] = c;
  return alpha >= 1
    ? `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
    : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
}

/** A ramp of `steps` tones from `dark` to `light` (the shading of one material). */
export function rampOf(dark: string, light: string, steps: number): Rgb[] {
  const a = hexRgb(dark);
  const b = hexRgb(light);
  return Array.from({ length: steps }, (_, i) => mixRgb(a, b, steps === 1 ? 0 : i / (steps - 1)));
}

/** The three tones of a type colour (shadow, base, light), as the bible defines them. */
export function typeRamp(color: number): [Rgb, Rgb, Rgb] {
  const base = numRgb(color);
  return [mixRgb(base, [8, 8, 20], 0.5), base, mixRgb(base, [255, 255, 255], 0.45)];
}

/** A small deterministic generator for the decoration (the render has no say in the game). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The 4 x 4 Bayer threshold of a pixel, in (0, 1): the ordered dither of every ramp. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(x: number, y: number): number {
  return ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
}

/**
 * A field of smooth noise in [0, 1] that repeats every `w` x `h` pixels (so a scene tiles), built
 * from `octaves` layers; `cellX` x `cellY` is the size of the biggest features (they must divide
 * the tile).
 */
export function noiseField(
  w: number,
  h: number,
  cellX: number,
  cellY: number,
  octaves: number,
  seed: number,
): Float32Array {
  const out = new Float32Array(w * h);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const cx = Math.max(2, cellX >> o);
    const cy = Math.max(2, cellY >> o);
    const nx = Math.max(1, Math.round(w / cx));
    const ny = Math.max(1, Math.round(h / cy));
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * ny;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * nx;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = hash2(x0 % nx, y0 % ny, seed + o);
        const b = hash2((x0 + 1) % nx, y0 % ny, seed + o);
        const c = hash2(x0 % nx, (y0 + 1) % ny, seed + o);
        const d = hash2((x0 + 1) % nx, (y0 + 1) % ny, seed + o);
        const i = y * w + x;
        out[i] = (out[i] ?? 0) + (a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) / total;
  return out;
}

/** Writes pixels straight into a canvas: `put(x, y, colour, alpha 0..255)`, then `done()`. */
export class PixelWriter {
  private readonly image: ImageData;
  private readonly data: Uint8ClampedArray;
  readonly w: number;
  readonly h: number;

  constructor(private readonly painting: Painting) {
    this.w = painting.c.width;
    this.h = painting.c.height;
    this.image = painting.g.getImageData(0, 0, this.w, this.h);
    this.data = this.image.data;
  }

  /** Sets a pixel; it wraps around the canvas, so what is painted on an edge tiles. */
  put(x: number, y: number, c: Rgb, alpha = 255): void {
    const px = ((x % this.w) + this.w) % this.w;
    const py = ((y % this.h) + this.h) % this.h;
    const i = (py * this.w + px) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = alpha;
  }

  /** Blends a colour over what is there (for shadows and films). */
  blend(x: number, y: number, c: Rgb, amount: number): void {
    const px = ((x % this.w) + this.w) % this.w;
    const py = ((y % this.h) + this.h) % this.h;
    const i = (py * this.w + px) * 4;
    if ((this.data[i + 3] ?? 0) === 0) {
      this.put(px, py, c, Math.round(amount * 255));
      return;
    }
    this.data[i] = (this.data[i] ?? 0) + (c[0] - (this.data[i] ?? 0)) * amount;
    this.data[i + 1] = (this.data[i + 1] ?? 0) + (c[1] - (this.data[i + 1] ?? 0)) * amount;
    this.data[i + 2] = (this.data[i + 2] ?? 0) + (c[2] - (this.data[i + 2] ?? 0)) * amount;
  }

  alphaAt(x: number, y: number): number {
    const px = ((x % this.w) + this.w) % this.w;
    const py = ((y % this.h) + this.h) % this.h;
    return this.data[(py * this.w + px) * 4 + 3] ?? 0;
  }

  /** A tone of a ramp for a value in [0, 1], dithered between the two nearest tones. */
  ramp(x: number, y: number, ramp: readonly Rgb[], value: number, alpha = 255): void {
    const v = Math.max(0, Math.min(0.9999, value)) * (ramp.length - 1);
    const base = Math.floor(v);
    const tone = v - base > bayer(x, y) ? base + 1 : base;
    this.put(x, y, ramp[Math.min(ramp.length - 1, tone)] ?? [0, 0, 0], alpha);
  }

  /**
   * A shaded lump (a canopy, a boulder, a mushroom cap): an ellipse lit from the top left with the
   * tones of `ramp`, a ragged edge of `jag` pixels and a dark rim, the way a pixel artist blocks a
   * round volume in.
   */
  lump(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    ramp: readonly Rgb[],
    jag: number,
    seed: number,
    rim = true,
  ): void {
    const ink = mixRgb(ramp[0] ?? [0, 0, 0], [6, 8, 20], 0.55);
    for (let dy = -ry - 1; dy <= ry + 1; dy++) {
      for (let dx = -rx - 1; dx <= rx + 1; dx++) {
        // Lobes instead of a clean ellipse: a canopy and a boulder are never round.
        const a = Math.atan2(dy, dx);
        const wobble =
          1 + jag * 0.5 * (Math.sin(a * 3 + seed) * 0.6 + Math.sin(a * 7 + seed * 1.7) * 0.4);
        const d = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)) / wobble;
        if (d > 1.08) continue;
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (d > 0.92) {
          if (!rim) continue;
          this.put(x, y, ink);
          continue;
        }
        // Light from the top left; the far side falls into the dark tones.
        const lit = 0.5 - (dx / rx) * 0.3 - (dy / ry) * 0.42 - d * d * 0.12;
        this.ramp(x, y, ramp, lit + (hash2(x, y, seed) - 0.5) * 0.12);
      }
    }
  }

  /** A soft dithered shadow on the ground under a prop (an ellipse of ink). */
  shadow(cx: number, cy: number, rx: number, ry: number, strength = 0.45): void {
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (d > 1) continue;
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (1 - d > bayer(x, y) * 0.9) this.blend(x, y, [6, 8, 20], strength);
      }
    }
  }

  /** Rows of characters as pixels; '.' is empty, other keys come from `colors`. */
  stamp(
    rows: readonly string[],
    x: number,
    y: number,
    colors: Readonly<Record<string, Rgb>>,
  ): void {
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const color = colors[row[dx] ?? '.'];
        if (color !== undefined) this.put(x + dx, y + dy, color);
      }
    });
  }

  done(): HTMLCanvasElement {
    this.painting.g.putImageData(this.image, 0, 0);
    return this.painting.c;
  }
}

const glowCache = new Map<string, Texture>();

/**
 * A stepped glow: a disc of light that falls off in `bands` dithered rings, white, to be tinted and
 * drawn in additive mode. It is the light of the art direction (no filters, no blur): `size` art
 * pixels across.
 */
export function glowTexture(size: number, bands = 4): Texture {
  const key = `${size}:${bands}`;
  const hit = glowCache.get(key);
  if (hit !== undefined) return hit;
  const writer = new PixelWriter(makeCanvas(size, size));
  const mid = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - mid) ** 2 + (y - mid) ** 2) / (size / 2);
      if (d >= 1) continue;
      const v = (1 - d) ** 2 * bands;
      const band = Math.floor(v) + (v - Math.floor(v) > bayer(x, y) ? 1 : 0);
      if (band <= 0) continue;
      writer.put(x, y, [255, 255, 255], Math.round((band / bands) * 255));
    }
  }
  const made = textureOf(writer.done());
  glowCache.set(key, made);
  return made;
}
