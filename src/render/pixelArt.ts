import { Texture } from 'pixi.js';

/**
 * Pixel art drawn by code (4G-D, direction A): the backdrops of the biomes, the effects of the boss
 * attacks and the launcher. Everything is painted on small canvases one art pixel at a time and
 * scaled up with nearest-neighbour filtering, so every pixel of the game has the same size. The art
 * is original: no sprite, tile or rip of the official games is used or imitated.
 */

/** Art pixels are this many arena units wide on screen. */
export const ART_PIXEL = 4;
/** The tile of a backdrop layer: 120 x 180 art pixels = 480 x 720 arena units. */
export const TILE_W = 120;
export const TILE_H = 180;

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
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}

/** A small deterministic generator for the decoration (the render has no say in the game). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draws a sprite written as rows of characters; '.' is empty, other keys come from `colors`. */
function stamp(
  g: CanvasRenderingContext2D,
  rows: readonly string[],
  x: number,
  y: number,
  colors: Readonly<Record<string, string>>,
): void {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const color = colors[row[dx] ?? '.'];
      if (color === undefined) continue;
      g.fillStyle = color;
      g.fillRect(x + dx, y + dy, 1, 1);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Backdrops
// ---------------------------------------------------------------------------------------------

/** The families of biome a main type belongs to, by the code of the type (the order of GAME_TYPES). */
const GROUP_OF_TYPE = [
  'meadow', // normal
  'rocky', // fighting
  'sea', // flying
  'mystic', // poison
  'rocky', // ground
  'rocky', // rock
  'meadow', // bug
  'mystic', // ghost
  'storm', // steel
  'ember', // fire
  'sea', // water
  'meadow', // grass
  'storm', // electric
  'mystic', // psychic
  'sea', // ice
  'ember', // dragon
  'mystic', // dark
  'meadow', // fairy
] as const;
export type BackdropGroup = (typeof GROUP_OF_TYPE)[number];

interface Look {
  /** Base colours of the three layers, far to near, and the accent of the second type. */
  readonly far: readonly [string, string];
  readonly mid: readonly [string, string];
  readonly near: readonly [string, string];
  readonly decor: Readonly<Record<string, string>>;
}

const LOOKS: Record<BackdropGroup, Look> = {
  meadow: {
    far: ['#3d8f4a', '#44a053'],
    mid: ['#2f7d4a', '#35895a'],
    near: ['#276b3f', '#2d7a48'],
    decor: {
      a: '#1f5a36',
      b: '#2f7d4a',
      c: '#6bd05a',
      d: '#ffd75a',
      e: '#ff7fb0',
      f: '#f6f3e8',
      g: '#8a5a32',
    },
  },
  ember: {
    far: ['#3a1418', '#46181c'],
    mid: ['#4a1a14', '#5a2218'],
    near: ['#2a0e10', '#331214'],
    decor: {
      a: '#14090a',
      b: '#5a2218',
      c: '#ff6a2a',
      d: '#ffb04a',
      e: '#ffe27a',
      f: '#8a2a1a',
      g: '#2a0e10',
    },
  },
  sea: {
    far: ['#1f56a8', '#2562b8'],
    mid: ['#2f78d0', '#3a86dc'],
    near: ['#1d4f98', '#235aa6'],
    decor: {
      a: '#14397a',
      b: '#5fb0ff',
      c: '#8ef0ff',
      d: '#f6f3e8',
      e: '#dff4ff',
      f: '#2f78d0',
      g: '#0f2a5a',
    },
  },
  storm: {
    far: ['#171a38', '#1c2046'],
    mid: ['#262b5a', '#2d3366'],
    near: ['#14172b', '#1a1e3a'],
    decor: {
      a: '#0b0d1d',
      b: '#3f4690',
      c: '#ffd75a',
      d: '#fff2a0',
      e: '#8ef0ff',
      f: '#5a62b0',
      g: '#262b5a',
    },
  },
  rocky: {
    far: ['#7a5232', '#845a38'],
    mid: ['#6a4428', '#744c2e'],
    near: ['#583820', '#623e24'],
    decor: {
      a: '#3a2412',
      b: '#8a5a38',
      c: '#d99a5a',
      d: '#ffd28a',
      e: '#ff9a4a',
      f: '#a8744a',
      g: '#2a180c',
    },
  },
  mystic: {
    far: ['#241540', '#2c1a4e'],
    mid: ['#33205c', '#3c2668'],
    near: ['#1c1033', '#231440'],
    decor: {
      a: '#0f0820',
      b: '#5a3a8a',
      c: '#8a5acb',
      d: '#ff7fb0',
      e: '#e8d8ff',
      f: '#7a52b8',
      g: '#2c1a4e',
    },
  },
};

/** What each family scatters on each layer: rows of art plus how many and how big the gap. */
interface Decor {
  readonly rows: readonly string[];
  readonly count: number;
}

const TREE = ['..aa..', '.abba.', 'abbbba', 'abbcba', '.abba.', '..gg..', '..gg..'];
const BUSH = ['.aaa.', 'abbba', 'abcba', '.aaa.'];
const FLOWER = ['.d.', 'dfd', '.d.', '.c.'];
const FLOWER2 = ['.e.', 'efe', '.e.', '.c.'];
const ROCK = ['..bb..', '.bffb.', 'bfffbb', 'aaaaaa'];
const CRYSTAL = ['..d..', '.dcd.', '.dcd.', 'dcccd', 'dcccd', '.aaa.'];
const EMBER = ['d', 'c'];
const SPARK = ['e', 'e'];
const WAVE = ['..bbbb..', '.bddddb.', 'b......b'];
const CLOUD = ['..eeee..', '.eeeeeee', 'eeeeeeee', '.eeeeee.'];
const SHARD = ['..e..', '.ece.', '.ece.', 'ecccc', 'aaaaa'];
const PYLON = ['.bbbb.', '..bb..', '.b..b.', '.b..b.', 'bb..bb', 'b....b'];
const BOLT = ['.cc', 'cc.', '.cc', 'cc.', 'c..'];
const MOUNT = ['....bb....', '...bffb...', '..bfffbb..', '.bffffffb.', 'bfffffffbb', 'aaaaaaaaaa'];
const STONE = ['.ff.', 'ffff', 'ffff', 'aaaa'];
const GRAVE = ['.bbb.', 'bbfbb', 'bbfbb', 'bbbbb', 'aaaaa'];
const MUSH = ['.ddd.', 'ddfdd', '.fff.', '..f..'];
const VENT = ['.c.c.', 'ccdcc', 'abbba'];
const LAVA = ['..c..', '.ccc.', 'ccdcc', '.ccc.'];

const DECOR: Record<BackdropGroup, { far: Decor[]; mid: Decor[]; near: Decor[] }> = {
  meadow: {
    far: [{ rows: CLOUD, count: 3 }],
    mid: [
      { rows: TREE, count: 7 },
      { rows: BUSH, count: 6 },
    ],
    near: [
      { rows: FLOWER, count: 10 },
      { rows: FLOWER2, count: 8 },
      { rows: ROCK, count: 2 },
    ],
  },
  ember: {
    far: [{ rows: MOUNT, count: 3 }],
    mid: [
      { rows: VENT, count: 5 },
      { rows: LAVA, count: 3 },
    ],
    near: [
      { rows: EMBER, count: 26 },
      { rows: ROCK, count: 3 },
    ],
  },
  sea: {
    far: [{ rows: CLOUD, count: 4 }],
    mid: [{ rows: WAVE, count: 9 }],
    near: [
      { rows: SHARD, count: 4 },
      { rows: WAVE, count: 6 },
    ],
  },
  storm: {
    far: [{ rows: CLOUD, count: 2 }],
    mid: [{ rows: PYLON, count: 6 }],
    near: [
      { rows: BOLT, count: 5 },
      { rows: SPARK, count: 22 },
    ],
  },
  rocky: {
    far: [{ rows: MOUNT, count: 4 }],
    mid: [
      { rows: STONE, count: 8 },
      { rows: ROCK, count: 5 },
    ],
    near: [
      { rows: CRYSTAL, count: 4 },
      { rows: STONE, count: 8 },
    ],
  },
  mystic: {
    far: [{ rows: CLOUD, count: 3 }],
    mid: [
      { rows: GRAVE, count: 6 },
      { rows: MUSH, count: 4 },
    ],
    near: [
      { rows: CRYSTAL, count: 5 },
      { rows: SPARK, count: 18 },
    ],
  },
};

/** One layer of a backdrop: a field of two dithered tones with the decoration scattered on it. */
function layer(
  group: BackdropGroup,
  which: 'far' | 'mid' | 'near',
  accent: string,
  seed: number,
): Texture {
  const { c, g } = canvas(TILE_W, TILE_H);
  const look = LOOKS[group];
  const [dark, light] = look[which];
  const random = rng(seed * 31 + (which === 'far' ? 1 : which === 'mid' ? 2 : 3));
  g.fillStyle = dark;
  g.fillRect(0, 0, TILE_W, TILE_H);
  // The field: a checker of the lighter tone in patches, so the plain colour has texture.
  g.fillStyle = light;
  for (let y = 0; y < TILE_H; y += 2) {
    for (let x = (y / 2) % 2; x < TILE_W; x += 2) {
      if (random() < (which === 'far' ? 0.5 : which === 'mid' ? 0.22 : 0.12))
        g.fillRect(x, y, 1, 1);
    }
  }
  const colors = { ...look.decor, d: which === 'near' ? accent : (look.decor.d ?? accent) };
  const wrap = (rows: readonly string[], x: number, y: number): void => {
    // Drawn again one tile up and down so a sprite on the edge continues seamlessly.
    for (const oy of [-TILE_H, 0, TILE_H]) stamp(g, rows, x, y + oy, colors);
  };
  for (const decor of DECOR[group][which]) {
    for (let i = 0; i < decor.count; i++) {
      const w = decor.rows[0]?.length ?? 1;
      wrap(decor.rows, Math.floor(random() * (TILE_W - w)), Math.floor(random() * TILE_H));
    }
  }
  return toTexture(c);
}

export interface BackdropTextures {
  readonly far: Texture;
  readonly mid: Texture;
  readonly near: Texture;
  readonly group: BackdropGroup;
}

const backdropCache = new Map<string, BackdropTextures>();

/** The three layers of the backdrop of a biome: its family by main type and an accent by second type. */
export function backdropFor(
  mainCode: number,
  secondCode: number,
  accentOf: (code: number) => string,
): BackdropTextures {
  const group = GROUP_OF_TYPE[mainCode] ?? 'meadow';
  const key = `${group}:${secondCode}`;
  const cached = backdropCache.get(key);
  if (cached !== undefined) return cached;
  const accent = accentOf(secondCode);
  const seed = mainCode * 97 + secondCode * 13 + 5;
  const made: BackdropTextures = {
    far: layer(group, 'far', accent, seed),
    mid: layer(group, 'mid', accent, seed),
    near: layer(group, 'near', accent, seed),
    group,
  };
  backdropCache.set(key, made);
  return made;
}

// ---------------------------------------------------------------------------------------------
// Effects of the attacks of a boss
// ---------------------------------------------------------------------------------------------

/** Lighter and darker versions of a colour, for the body and the edge of an effect. */
function shade(hex: number, k: number): string {
  const r = Math.max(0, Math.min(255, Math.round(((hex >> 16) & 255) * k)));
  const gr = Math.max(0, Math.min(255, Math.round(((hex >> 8) & 255) * k)));
  const b = Math.max(0, Math.min(255, Math.round((hex & 255) * k)));
  return `rgb(${r},${gr},${b})`;
}

export interface FxSet {
  /** Animated frames of a beam (tall), a falling orb, a patch of floor, a gust band and a warning. */
  readonly beam: readonly Texture[];
  readonly orb: readonly Texture[];
  readonly patch: readonly Texture[];
  readonly gust: readonly Texture[];
  readonly warn: Texture;
  readonly particle: Texture;
}

const fxCache = new Map<number, FxSet>();
export const FX_FRAMES = 4;

/** All the effect textures of one colour (the type of the boss), built once. */
export function fxFor(color: number): FxSet {
  const hit = fxCache.get(color);
  if (hit !== undefined) return hit;
  const light = shade(color, 1.25);
  const body = shade(color, 1);
  const dark = shade(color, 0.55);
  const white = '#fff7e0';

  // A beam: 12 art pixels wide and 24 tall, tiled upwards. Core of light, body, dark edge and
  // sparks that climb frame by frame.
  const beam: Texture[] = [];
  for (let f = 0; f < FX_FRAMES; f++) {
    const { c, g } = canvas(12, 24);
    for (let y = 0; y < 24; y++) {
      g.fillStyle = dark;
      g.fillRect(0, y, 12, 1);
      g.fillStyle = body;
      g.fillRect(1, y, 10, 1);
      g.fillStyle = light;
      g.fillRect(3, y, 6, 1);
      g.fillStyle = white;
      g.fillRect(5, y, 2, 1);
      // A ragged edge that moves with the frame.
      if ((y + f * 2) % 6 < 2) {
        g.fillStyle = dark;
        g.fillRect(1, y, 1, 1);
        g.fillRect(10, y, 1, 1);
      }
    }
    for (let k = 0; k < 3; k++) {
      g.fillStyle = white;
      g.fillRect(2 + ((k * 5 + f) % 8), (24 - ((f * 6 + k * 8) % 24)) % 24, 1, 2);
    }
    beam.push(toTexture(c));
  }

  // An orb: 12 x 12 with a lit side that turns.
  const orb: Texture[] = [];
  const ORB = [
    '....dddd....',
    '..ddbbbbdd..',
    '.dbbllllbbd.',
    '.dblwwwllbd.',
    'dbllwwwwllbd',
    'dbllwwwlllbd',
    'dbbllllllbbd',
    'dbbbllllbbbd',
    '.dbbbbbbbbd.',
    '.ddbbbbbbdd.',
    '..dddddddd..',
    '....dddd....',
  ];
  for (let f = 0; f < FX_FRAMES; f++) {
    const { c, g } = canvas(12, 18);
    stamp(g, ORB, 0, 0, { d: dark, b: body, l: light, w: white });
    // The trail: pixels that shorten and shift with the frame.
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k % 2 === 0 ? body : dark;
      g.fillRect(3 + ((k * 3 + f) % 7), 12 + k + (f % 2), 2, 1);
    }
    orb.push(toTexture(c));
  }

  // A patch of floor: 16 x 8, a bubbling surface.
  const patch: Texture[] = [];
  for (let f = 0; f < FX_FRAMES; f++) {
    const { c, g } = canvas(16, 8);
    g.fillStyle = dark;
    g.fillRect(0, 0, 16, 8);
    g.fillStyle = body;
    g.fillRect(0, 2, 16, 6);
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k % 2 === 0 ? light : white;
      g.fillRect(((k * 5 + f * 3) % 14) + 1, 2 + ((k + f) % 4), 2, 1);
    }
    g.fillStyle = light;
    g.fillRect(0, 0, 16, 1);
    patch.push(toTexture(c));
  }

  // A gust: 16 x 8 of streaks that slide.
  const gust: Texture[] = [];
  for (let f = 0; f < FX_FRAMES; f++) {
    const { c, g } = canvas(16, 8);
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k % 2 === 0 ? light : body;
      g.fillRect((k * 6 + f * 4) % 16, k * 2, 7, 1);
    }
    gust.push(toTexture(c));
  }

  // The warning: a hatched field with a dotted edge, drawn in the colour of the attack.
  const w = canvas(12, 12);
  w.g.fillStyle = body;
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) if ((x + y) % 4 === 0) w.g.fillRect(x, y, 1, 1);
  w.g.fillStyle = light;
  for (let y = 0; y < 12; y += 2) {
    w.g.fillRect(0, y, 1, 1);
    w.g.fillRect(11, y, 1, 1);
  }
  const warn = toTexture(w.c);

  const p = canvas(2, 2);
  p.g.fillStyle = white;
  p.g.fillRect(0, 0, 2, 2);
  const particle = toTexture(p.c);

  const made: FxSet = { beam, orb, patch, gust, warn, particle };
  fxCache.set(color, made);
  return made;
}

// ---------------------------------------------------------------------------------------------
// The launcher of the player
// ---------------------------------------------------------------------------------------------

/** The launcher: a chunky pixel cannon-capsule, 16 x 16 art pixels, original shape. */
export function launcherTexture(): Texture {
  const { c, g } = canvas(16, 16);
  const rows = [
    '.......dd.......',
    '......dwwd......',
    '.....dwllwd.....',
    '.....dlbbld.....',
    '....dllbblld....',
    '....dlbbbbld....',
    '...dllbbbblld...',
    '...dlbbccbbld...',
    '..dllbbccbblld..',
    '..dlbbbccbbbld..',
    '.dllbbbbbbbblld.',
    '.dlbbbbbbbbbbld.',
    'dllbbbbbbbbbblld',
    'dddddddddddddddd',
    '.dyyyyyyyyyyyyd.',
    '..dddddddddddd..',
  ];
  stamp(g, rows, 0, 0, {
    d: '#14172b',
    w: '#f6f3e8',
    l: '#9aa6c0',
    b: '#4a5578',
    c: '#ffd75a',
    y: '#2b3a73',
  });
  return toTexture(c);
}

/** Draws a small canvas scaled up by a whole number, without smoothing, into a new one. */
function upscale(small: HTMLCanvasElement, k: number): HTMLCanvasElement {
  const { c, g } = canvas(small.width * k, small.height * k);
  g.drawImage(small, 0, 0, c.width, c.height);
  return c;
}

/** A round pixel dot (an octagon): 8 art pixels drawn 8 times bigger (64 x 64), the base of small effects. */
export function dotTexture(): Texture {
  const { c, g } = canvas(8, 8);
  stamp(
    g,
    [
      '..eeee..',
      '.eeeeee.',
      'eeeeeeee',
      'eeeeeeee',
      'eeeeeeee',
      'eeeeeeee',
      '.eeeeee.',
      '..eeee..',
    ],
    0,
    0,
    { e: '#ffffff' },
  );
  return toTexture(upscale(c, 8));
}

/** A pixel ring: an octagon outline of 16 art pixels drawn 4 times bigger (64 x 64). */
export function ringTexture(): Texture {
  const { c, g } = canvas(16, 16);
  stamp(
    g,
    [
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
    ],
    0,
    0,
    { e: '#ffffff' },
  );
  return toTexture(upscale(c, 4));
}
