import { Texture } from 'pixi.js';
import { STRIKE_FRAMES, STRIKE_H, STRIKE_W, strikeLook, strikeRows } from './bossArt';
import { arenaOf, drawFloor, FLOOR_H, FLOOR_W } from './legendArena';

/**
 * The textures of the boss looks of 4G-H, made from the pure pictures of `bossArt` (the strike of
 * each type) and `legendArena` (the arena of each legendary). Each is drawn once and cached.
 */

function shade(hex: number, k: number): string {
  const r = Math.max(0, Math.min(255, (((hex >> 16) & 255) * k + 0.5) | 0));
  const gr = Math.max(0, Math.min(255, (((hex >> 8) & 255) * k + 0.5) | 0));
  const b = Math.max(0, Math.min(255, ((hex & 255) * k + 0.5) | 0));
  return `rgb(${r},${gr},${b})`;
}

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g === null) throw new Error('no 2d canvas');
  g.imageSmoothingEnabled = false;
  return { c, g };
}

function toTexture(c: HTMLCanvasElement): Texture {
  const texture = Texture.from(c);
  texture.source.scaleMode = 'nearest';
  return texture;
}

const strikeCache = new Map<string, Texture[]>();

/** The four frames of the strike of a type, in its colour; made once per type and colour. */
export function strikeFrames(typeName: string, color: number): readonly Texture[] {
  const key = `${typeName}:${color}`;
  const hit = strikeCache.get(key);
  if (hit !== undefined) return hit;
  const { motif } = strikeLook(typeName);
  const palette: Record<string, string> = {
    d: shade(color, 0.5),
    b: shade(color, 1),
    l: shade(color, 1.35),
    w: '#fff7e0',
    k: 'rgba(18,8,30,0.85)',
  };
  const frames: Texture[] = [];
  for (let f = 0; f < STRIKE_FRAMES; f++) {
    const { c, g } = canvas(STRIKE_W, STRIKE_H);
    strikeRows(motif, f).forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const fill = palette[row[x] ?? '.'];
        if (fill === undefined) continue;
        g.fillStyle = fill;
        g.fillRect(x, y, 1, 1);
      }
    });
    frames.push(toTexture(c));
  }
  strikeCache.set(key, frames);
  return frames;
}

const arenaCache = new Map<string, Texture>();

/** The floor texture of the arena of a legendary, drawn once. */
export function legendArenaTexture(species: string, fury = false): Texture {
  const key = `${species}:${fury}`;
  const hit = arenaCache.get(key);
  if (hit !== undefined) return hit;
  const { c, g } = canvas(FLOOR_W, FLOOR_H);
  drawFloor(arenaOf(species, fury), (x, y, w, h, color) => {
    g.fillStyle = color;
    g.fillRect(x | 0, y | 0, w, h);
  });
  const made = toTexture(c);
  arenaCache.set(key, made);
  return made;
}
