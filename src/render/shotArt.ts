import { Texture } from 'pixi.js';
import { GAME_TYPES } from '../domain';

/**
 * The projectile of each type (4G-G, 14th playtest: "el ataque sigue siendo genérico"): a spark, an
 * ember, a bubble, a leaf, a rock, a shadow... drawn by code, 12 x 18 art pixels (the shape on top
 * and a short trail), four frames. The shape is what tells the attack apart from far away; the
 * colour is the type's. Original pixel art, no franchise art. Render only.
 */

export const SHOT_FRAMES = 4;

/** 12 x 12 shapes. d = edge, b = body, l = light, w = white core, y = a second tone. */
const SHAPES: Readonly<Record<string, readonly string[]>> = {
  // A bolt of lightning.
  electric: [
    '....ddddd...',
    '...dwwwwd...',
    '..dwwbbd....',
    '.dwwbbd.....',
    'dwwbbwwwwd..',
    'ddddbbwwd...',
    '....dbbwd...',
    '....dwbd....',
    '...dwwd.....',
    '...dwd......',
    '..dwd.......',
    '..dd........',
  ],
  // A flame: an ember falling.
  fire: [
    '.....bb.....',
    '....bbl.....',
    '...bbll.b...',
    '..bbllwlb...',
    '..bllwwlbb..',
    '.bbllwwwlb..',
    '.bllwwwwlb..',
    '.bllwwwwlb..',
    '.dbllwwlbd..',
    '..dbllllbd..',
    '...ddbbdd...',
    '....dddd....',
  ],
  // A bubble: a ring with a shine, empty inside.
  water: [
    '....dddd....',
    '..ddbbbbdd..',
    '.dbbllllbbd.',
    '.dbl....lbd.',
    'dbl.ww...lbd',
    'dbl.w....lbd',
    'db........bd',
    'dbl......lbd',
    '.dbl....lbd.',
    '.dbbllllbbd.',
    '..ddbbbbdd..',
    '....dddd....',
  ],
  // A leaf, with its vein.
  grass: [
    '..........dd',
    '.......ddbbd',
    '.....ddbblbd',
    '...ddbbllbd.',
    '..dbbllwlbd.',
    '.dbblwwlbbd.',
    '.dbllwlbbd..',
    'dbllllbbd...',
    'dblbbbdd....',
    'dbbdd.......',
    '.dd.........',
    '............',
  ],
  // A rock, angular and heavy.
  rock: [
    '...dddd.....',
    '..dbbbbdd...',
    '.dbllbbbbd..',
    '.dblwlbbbbd.',
    'dbbllbbbbbd.',
    'dbbbbbbbbbd.',
    'dbbbbbbbbd..',
    '.dbbbbbbbd..',
    '.dbbbbbdd...',
    '..ddbbbd....',
    '....dddd....',
    '............',
  ],
  // A shadow with two eyes.
  ghost: [
    '...dddddd...',
    '..dbbbbbbd..',
    '.dbbbbbbbbd.',
    '.dbwwbbwwbd.',
    '.dbwdbbwdbd.',
    '.dbbbbbbbbd.',
    '.dbbbddbbbd.',
    '.dbbbbbbbbd.',
    '.dbdbbbbdbd.',
    '..d.dbbd.d..',
    '.....dd.....',
    '............',
  ],
  // A drop of poison.
  poison: [
    '.....dd.....',
    '....dbbd....',
    '...dbllbd...',
    '...dbllbd...',
    '..dbblwlbd..',
    '.dbbllwlbbd.',
    '.dbbllllbbd.',
    '.dbbbllbbbd.',
    '..dbbbbbbd..',
    '...ddbbdd...',
    '....dddd....',
    '............',
  ],
  // An eye of psychic energy.
  psychic: [
    '...dddddd...',
    '..dbbbbbbd..',
    '.dbllllllbd.',
    'dbl.wwww.lbd',
    'db.wddddw.bd',
    'dbwwdwwdwwbd',
    'dbwwdwwdwwbd',
    'db.wddddw.bd',
    'dbl.wwww.lbd',
    '.dbllllllbd.',
    '..dbbbbbbd..',
    '...dddddd...',
  ],
  // A diamond fang of draconic energy.
  dragon: [
    '.....dd.....',
    '....dbbd....',
    '...dbllbd...',
    '..dbllwlbd..',
    '.dbllwwwlbd.',
    'dbllwwwwwlbd',
    '.dbllwwwlbd.',
    '..dbllwlbd..',
    '...dbllbd...',
    '....dbbd....',
    '.....dd.....',
    '............',
  ],
};
// The ground throws rocks too.
const ALIAS: Readonly<Record<string, string>> = { ground: 'rock' };

function shade(hex: number, k: number): string {
  const r = Math.max(0, Math.min(255, (((hex >> 16) & 255) * k + 0.5) | 0));
  const g = Math.max(0, Math.min(255, (((hex >> 8) & 255) * k + 0.5) | 0));
  const b = Math.max(0, Math.min(255, ((hex & 255) * k + 0.5) | 0));
  return `rgb(${r},${g},${b})`;
}

const cache = new Map<string, Texture[]>();

/** True when the type has a projectile of its own (otherwise the render draws the generic orb). */
export function hasShotShape(typeName: string): boolean {
  return (ALIAS[typeName] ?? typeName) in SHAPES;
}

/** The four frames of the projectile of a type, in the colour given; built once per type. */
export function shotFrames(typeCode: number, color: number): readonly Texture[] {
  const name = GAME_TYPES[typeCode] ?? 'normal';
  const key = `${name}:${color}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const rows = SHAPES[ALIAS[name] ?? name];
  const frames: Texture[] = [];
  if (rows === undefined) {
    cache.set(key, frames);
    return frames;
  }
  const palette = {
    d: shade(color, 0.5),
    b: shade(color, 1),
    l: shade(color, 1.3),
    w: '#fff7e0',
  };
  for (let f = 0; f < SHOT_FRAMES; f++) {
    const c = document.createElement('canvas');
    c.width = 12;
    c.height = 18;
    const g = c.getContext('2d');
    if (g === null) throw new Error('no 2d canvas');
    g.imageSmoothingEnabled = false;
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const code = row[dx] ?? '.';
        const fill = palette[code as keyof typeof palette];
        if (fill === undefined) continue;
        g.fillStyle = fill;
        g.fillRect(dx, dy, 1, 1);
      }
    });
    // The trail: pixels that shorten and shift with the frame, in the body colour.
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k % 2 === 0 ? palette.b : palette.d;
      g.fillRect(3 + ((k * 3 + f) % 7), 12 + k + (f % 2), 2, 1);
    }
    const texture = Texture.from(c);
    texture.source.scaleMode = 'nearest';
    frames.push(texture);
  }
  cache.set(key, frames);
  return frames;
}

/**
 * How an enemy that is charging a shot shows it (its own warning on its body): the pace of its
 * blink in ticks, how big its ring is (times the radius) and whether it fades or flashes. The colour
 * is the type's. Electric flickers fast, fire wobbles, water breathes slowly, rock is a heavy steady
 * glow, a ghost fades in and out.
 */
export function chargeLook(typeName: string): { blink: number; ring: number; fade: boolean } {
  switch (typeName) {
    case 'electric':
      return { blink: 2, ring: 1.15, fade: false };
    case 'fire':
      return { blink: 4, ring: 1.35, fade: false };
    case 'water':
      return { blink: 9, ring: 1.3, fade: true };
    case 'grass':
      return { blink: 7, ring: 1.25, fade: true };
    case 'rock':
    case 'ground':
      return { blink: 14, ring: 1.45, fade: false };
    case 'ghost':
      return { blink: 11, ring: 1.3, fade: true };
    case 'psychic':
      return { blink: 6, ring: 1.4, fade: true };
    case 'poison':
      return { blink: 8, ring: 1.3, fade: true };
    case 'dragon':
      return { blink: 3, ring: 1.5, fade: false };
    default:
      return { blink: 5, ring: 1.25, fade: false };
  }
}
