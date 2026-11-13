/**
 * The arena of each legendary (4G-H, 15th playtest: "que la arena cambie por legendario, no son
 * muchos"). The final fight already left the biome for a stage of its own (4G-F); now every one of
 * the 37 final bosses has its own: the depths of the sea for Kyogre, a field of magma for Groudon, the
 * sky above the clouds for Rayquaza, a clock of stars for Dialga, the reverse world for Giratina, a
 * laboratory for Mewtwo, a frozen hall for Articuno... Eleven kinds of floor, each with the palette of
 * its legendary and its own seed, and its own dust in the air (embers that rise, snow that falls,
 * motes that drift). No two are the same.
 *
 * This file is pure (a test checks that every final boss has its own); the texture is drawn from it
 * in `bossTextures`, once per legendary, 120 x 180 art pixels, tiled and scrolled slowly.
 */

export type ArenaFloor =
  | 'abyss'
  | 'magma'
  | 'cosmos'
  | 'void'
  | 'lab'
  | 'glacier'
  | 'ruins'
  | 'grove'
  | 'lake'
  | 'sky'
  | 'storm';

export interface ArenaSpec {
  readonly floor: ArenaFloor;
  /** The dark base, the main colour of the shapes and the colour that glows. */
  readonly base: number;
  readonly main: number;
  readonly glow: number;
  /** The dust in the air: how it moves and its two colours. */
  readonly motion: 'rise' | 'fall' | 'drift';
  readonly dust: readonly [number, number];
  readonly seed: number;
}

const A = (
  floor: ArenaFloor,
  base: number,
  main: number,
  glow: number,
  motion: ArenaSpec['motion'],
  dust: readonly [number, number],
  seed: number,
): ArenaSpec => ({ floor, base, main, glow, motion, dust, seed });

/** Every final boss and its arena. */
export const LEGEND_ARENAS: Readonly<Record<string, ArenaSpec>> = {
  kyogre: A('abyss', 0x020a24, 0x1f4fb8, 0xff4a5a, 'rise', [0x8fd3ff, 0xffffff], 1),
  lugia: A('abyss', 0x0a1226, 0x5d7fb0, 0xe8f0ff, 'rise', [0xdfe8ff, 0x8aa8d8], 2),
  suicune: A('lake', 0x061a26, 0x38b8c8, 0xc8a0ff, 'fall', [0xbff6ff, 0xc8a0ff], 3),
  manaphy: A('abyss', 0x041c30, 0x48a8e8, 0xffd84a, 'rise', [0xa8e4ff, 0xffd84a], 4),
  phione: A('abyss', 0x082030, 0x7cc4e4, 0xe4f8ff, 'rise', [0xe4f8ff, 0x7cc4e4], 5),
  groudon: A('magma', 0x140404, 0x8a1c10, 0xffb02a, 'rise', [0xff7a1a, 0xffd84a], 6),
  heatran: A('magma', 0x100808, 0x6e4a3a, 0xff6a10, 'rise', [0xff6a10, 0xb0a090], 7),
  entei: A('magma', 0x180c04, 0x8a5020, 0xffd060, 'rise', [0xffa040, 0xe8e0c0], 8),
  moltres: A('sky', 0x200a04, 0xd8601c, 0xffe060, 'rise', [0xffa030, 0xffe060], 9),
  'ho-oh': A('sky', 0x1c0c08, 0xd84020, 0x6ae070, 'rise', [0xffd040, 0xff6040], 10),
  dialga: A('cosmos', 0x040a1c, 0x3a5ab8, 0x8ee0ff, 'drift', [0x8ee0ff, 0xc8d4ff], 11),
  palkia: A('cosmos', 0x140818, 0xa86ab8, 0xffc8e8, 'drift', [0xffc8e8, 0xd0b0ff], 12),
  arceus: A('cosmos', 0x0c0a04, 0xb8a048, 0xfff4c0, 'fall', [0xfff4c0, 0xffd860], 13),
  'deoxys-normal': A('cosmos', 0x080810, 0xd86a20, 0x40d8c8, 'drift', [0x40d8c8, 0xff8a40], 14),
  jirachi: A('cosmos', 0x0a0c20, 0x4860b0, 0xfff070, 'fall', [0xfff070, 0x9ad0ff], 15),
  'giratina-altered': A('void', 0x08040c, 0x4a2a50, 0xd02020, 'drift', [0xd02020, 0xe0c060], 16),
  darkrai: A('void', 0x040408, 0x2a2a38, 0xd8304a, 'rise', [0x707088, 0xd8304a], 17),
  mewtwo: A('lab', 0x0c0814, 0x5a4880, 0xc890ff, 'drift', [0xc890ff, 0xffffff], 18),
  genesect: A('lab', 0x0c0814, 0x6a5a88, 0xff5a30, 'drift', [0xff5a30, 0xb0a0d0], 19),
  articuno: A('glacier', 0x061420, 0x5aa8d8, 0xe8fcff, 'fall', [0xe8fcff, 0x9ad8ff], 20),
  regice: A('glacier', 0x08121c, 0x7ab8d0, 0xfff4a0, 'fall', [0xd8f4ff, 0xfff4a0], 21),
  regirock: A('ruins', 0x140c06, 0x8a5a30, 0xffb040, 'fall', [0xc89060, 0xffb040], 22),
  registeel: A('ruins', 0x0c0c10, 0x60687a, 0xff5050, 'drift', [0xb8c0d0, 0xff5050], 23),
  regigigas: A('ruins', 0x101008, 0xb8b090, 0x40e070, 'fall', [0xf0ead0, 0x40e070], 24),
  celebi: A('grove', 0x04140a, 0x2a8a3a, 0xc8f070, 'drift', [0xc8f070, 0x9ae0ff], 25),
  'shaymin-land': A('grove', 0x08180a, 0x48a040, 0xff8ab8, 'fall', [0xff8ab8, 0xffffff], 26),
  virizion: A('grove', 0x061008, 0x3a7a30, 0xff70a0, 'fall', [0x90e050, 0xff70a0], 27),
  uxie: A('lake', 0x0a1020, 0x3a5a90, 0xffe060, 'drift', [0xffe060, 0x9ad0ff], 28),
  mesprit: A('lake', 0x140a1c, 0x5a4a90, 0xff90c8, 'drift', [0xff90c8, 0x9ad0ff], 29),
  azelf: A('lake', 0x08101c, 0x2a5aa0, 0xff5060, 'drift', [0x6ab0ff, 0xff5060], 30),
  cresselia: A('lake', 0x0c0818, 0x6a5aa8, 0xffe8a0, 'fall', [0xffe8a0, 0xd8b8ff], 31),
  mew: A('lake', 0x180a18, 0xb06aa8, 0xffd0f0, 'drift', [0xffd0f0, 0xa8e0ff], 32),
  rayquaza: A('sky', 0x020c08, 0x1a7a40, 0xffe050, 'rise', [0xffe050, 0x7cff9a], 33),
  latias: A('sky', 0x1a0c10, 0xc84a5a, 0xffffff, 'drift', [0xffffff, 0xff9aaa], 34),
  latios: A('sky', 0x0a0c1a, 0x3a5ac8, 0xffffff, 'drift', [0xffffff, 0x9ab0ff], 35),
  zapdos: A('storm', 0x0c0c08, 0x4a4a30, 0xffe030, 'fall', [0xffe030, 0xa0a0b0], 36),
  raikou: A('storm', 0x0c0814, 0x4a3a60, 0xffd040, 'fall', [0xffd040, 0xc0a0ff], 37),
};

/** The arena of a legendary; one of the same kind for anything not in the table. */
export function arenaOf(species: string): ArenaSpec {
  return (
    LEGEND_ARENAS[species] ??
    A('void', 0x08080c, 0x3a3a4a, 0xffffff, 'rise', [0xffffff, 0x9a9ab0], 99)
  );
}

/** The size of an arena tile, in art pixels. */
export const FLOOR_W = 120;
export const FLOOR_H = 180;
const W = FLOOR_W;
const H = FLOOR_H;

function rgb(hex: number, k = 1): string {
  const r = Math.max(0, Math.min(255, (((hex >> 16) & 255) * k + 0.5) | 0));
  const g = Math.max(0, Math.min(255, (((hex >> 8) & 255) * k + 0.5) | 0));
  const b = Math.max(0, Math.min(255, ((hex & 255) * k + 0.5) | 0));
  return `rgb(${r},${g},${b})`;
}

/** A blend of two colours, `t` of the way from a to b. */
function mix(a: number, b: number, t: number): number {
  const c = (s: number): number =>
    ((((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t + 0.5) | 0) << s;
  return c(16) | c(8) | c(0);
}

function rand(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type Pen = (x: number, y: number, w: number, h: number, color: string) => void;

/** Draws one floor into a pen; everything wraps so the tile repeats with no seam. */
export function drawFloor(spec: ArenaSpec, pen: Pen): void {
  const r = rand(spec.seed);
  const { base, main, glow } = spec;
  const dot = (x: number, y: number, color: string, w = 1, h = 1): void =>
    pen(((x % W) + W) % W, ((y % H) + H) % H, w, h, color);
  // A vertical gradient from the base to a little of the main colour: depth.
  for (let y = 0; y < H; y++) {
    const t = 0.5 + 0.5 * Math.sin((y / H) * Math.PI * 2);
    pen(0, y, W, 1, rgb(mix(base, main, 0.12 + 0.12 * t)));
  }
  switch (spec.floor) {
    case 'abyss': {
      // Waves of light from above (caustics) and long crests, a glow far below.
      for (let k = 0; k < 7; k++) {
        const y0 = ((k * H) / 7 + r() * 10) | 0;
        for (let x = 0; x < W; x++) {
          const y = y0 + Math.round(3 * Math.sin((x + k * 17) / 9));
          dot(x, y, rgb(main, 1.1));
          if (x % 3 === 0) dot(x, y - 1, rgb(main, 0.7));
        }
      }
      for (let k = 0; k < 60; k++) dot(r() * W, r() * H, rgb(mix(main, 0xffffff, 0.5)), 2, 1);
      for (let k = 0; k < 6; k++) dot(r() * W, r() * H, rgb(glow), 2, 2);
      break;
    }
    case 'magma': {
      // Black plates of basalt split by veins of lava.
      for (let k = 0; k < 16; k++) {
        let x = r() * W;
        let y = r() * H;
        for (let s = 0; s < 40; s++) {
          dot(x, y, rgb(glow), 2, 1);
          dot(x, y + 1, rgb(main, 1.2));
          x += r() < 0.5 ? 1 : -1;
          y += r() < 0.7 ? 1 : 0;
        }
      }
      for (let k = 0; k < 40; k++) dot(r() * W, r() * H, rgb(main, 0.6), 3, 2);
      for (let k = 0; k < 18; k++) dot(r() * W, r() * H, rgb(glow, 1.2), 1, 1);
      break;
    }
    case 'cosmos': {
      // A field of stars and two rings of light (a clock, a rift, a halo, by the palette).
      for (let k = 0; k < 120; k++) {
        const bright = r();
        dot(r() * W, r() * H, rgb(bright > 0.85 ? glow : mix(main, 0xffffff, bright * 0.6)));
      }
      for (const [cx, cy, rad] of [
        [W / 2, H / 3, 34],
        [W / 2, (H * 3) / 4, 22],
      ] as const) {
        for (let a = 0; a < 140; a++) {
          const ang = (a / 140) * Math.PI * 2;
          dot(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.6, rgb(main, 1.2));
          if (a % 12 === 0)
            dot(
              cx + Math.cos(ang) * (rad - 4),
              cy + Math.sin(ang) * (rad - 4) * 0.6,
              rgb(glow),
              2,
              2,
            );
        }
      }
      break;
    }
    case 'void': {
      // The reverse world: floating slabs upside down and torn lines of red.
      for (let k = 0; k < 9; k++) {
        const x = r() * W;
        const y = r() * H;
        const w = 10 + r() * 22;
        pen(x | 0, y | 0, w | 0, 3, rgb(main, 1.1));
        pen((x + 2) | 0, (y + 3) | 0, (w - 4) | 0, 2, rgb(main, 0.6));
      }
      for (let k = 0; k < 10; k++) {
        let x = r() * W;
        const y = r() * H;
        for (let s = 0; s < 18; s++) {
          dot(x, y + Math.round(2 * Math.sin(s / 2)), rgb(glow));
          x += 1;
        }
      }
      for (let k = 0; k < 30; k++) dot(r() * W, r() * H, rgb(mix(glow, 0xffffff, 0.3)));
      break;
    }
    case 'lab': {
      // Metal panels with circuits that glow.
      for (let y = 0; y < H; y += 20) pen(0, y, W, 1, rgb(main, 0.8));
      for (let x = 0; x < W; x += 24) pen(x, 0, 1, H, rgb(main, 0.8));
      for (let k = 0; k < 14; k++) {
        let x = (r() * W) | 0;
        let y = (r() * H) | 0;
        for (let s = 0; s < 24; s++) {
          dot(x, y, rgb(glow));
          if (r() < 0.5) x += 1;
          else y += 1;
        }
        dot(x - 1, y - 1, rgb(glow, 1.2), 3, 3);
      }
      break;
    }
    case 'glacier': {
      // A floor of ice: cracks of light and crystals.
      for (let k = 0; k < 12; k++) {
        let x = r() * W;
        let y = r() * H;
        const dx = r() < 0.5 ? 1 : -1;
        for (let s = 0; s < 26; s++) {
          dot(x, y, rgb(mix(main, 0xffffff, 0.6)));
          x += dx;
          y += r() < 0.5 ? 1 : 0;
        }
      }
      for (let k = 0; k < 10; k++) {
        const x = r() * W;
        const y = r() * H;
        for (let s = 0; s < 6; s++) {
          dot(x, y - s, rgb(glow));
          dot(x - (s >> 1), y - s, rgb(main, 1.2));
          dot(x + (s >> 1), y - s, rgb(main, 1.2));
        }
      }
      break;
    }
    case 'ruins': {
      // Old stone blocks, and rows of dots carved in them that glow.
      for (let y = 0; y < H; y += 15) {
        const shift = (y / 15) % 2 === 0 ? 0 : 15;
        pen(0, y, W, 1, rgb(main, 0.5));
        for (let x = shift; x < W + 30; x += 30) dot(x, y, rgb(main, 0.5), 1, 15);
      }
      for (let k = 0; k < 12; k++) {
        const x = (r() * (W - 20)) | 0;
        const y = (r() * H) | 0;
        for (let s = 0; s < 6; s++) if (r() < 0.7) dot(x + s * 3, y, rgb(glow), 2, 2);
      }
      for (let k = 0; k < 50; k++) dot(r() * W, r() * H, rgb(main, 0.8), 2, 1);
      break;
    }
    case 'grove': {
      // A clearing: tufts of grass, roots and flowers of the second colour.
      for (let k = 0; k < 80; k++) {
        const x = r() * W;
        const y = r() * H;
        dot(x, y, rgb(main, 1.1));
        dot(x + 1, y - 1, rgb(main, 1.3));
        dot(x - 1, y - 1, rgb(main, 0.9));
      }
      for (let k = 0; k < 16; k++) {
        const x = r() * W;
        const y = r() * H;
        dot(x, y - 1, rgb(glow));
        dot(x - 1, y, rgb(glow));
        dot(x + 1, y, rgb(glow));
        dot(x, y + 1, rgb(glow));
        dot(x, y, rgb(0xfff4c0));
      }
      break;
    }
    case 'lake': {
      // A still lake at night: rings of ripples and the reflection of a light.
      for (let k = 0; k < 8; k++) {
        const cx = r() * W;
        const cy = r() * H;
        const rad = 6 + r() * 14;
        for (let a = 0; a < 48; a++) {
          const ang = (a / 48) * Math.PI * 2;
          if (a % 3 !== 0)
            dot(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.4, rgb(main, 1.2));
        }
      }
      for (let k = 0; k < 24; k++) dot(r() * W, r() * H, rgb(glow), 3, 1);
      break;
    }
    case 'sky': {
      // High above the clouds: bands of cloud that drift and a few stars.
      for (let k = 0; k < 10; k++) {
        const y = (r() * H) | 0;
        const x = (r() * W) | 0;
        const w = 20 + ((r() * 40) | 0);
        for (let s = 0; s < 4; s++) {
          dot(x + s * 3, y - s, rgb(mix(main, 0xffffff, 0.25 + s * 0.1)), w - s * 6, 1);
        }
        dot(x, y + 1, rgb(main, 0.6), w, 1);
      }
      for (let k = 0; k < 40; k++) dot(r() * W, r() * H, rgb(glow));
      break;
    }
    case 'storm': {
      // Black clouds and the scars of lightning.
      for (let k = 0; k < 14; k++) dot(r() * W, r() * H, rgb(main, 1.2), 14 + ((r() * 18) | 0), 3);
      for (let k = 0; k < 7; k++) {
        let x = r() * W;
        let y = r() * H;
        for (let s = 0; s < 22; s++) {
          dot(x, y, rgb(glow));
          dot(x + 1, y, rgb(glow, 0.6));
          x += r() < 0.5 ? 1 : -1;
          y += 1;
        }
      }
      break;
    }
  }
}

/** For the tests: how many pixels of each colour a floor draws (a signature of the arena). */
export function floorSignature(species: string): string {
  const counts = new Map<string, number>();
  drawFloor(arenaOf(species), (_x, _y, w, h, color) => {
    counts.set(color, (counts.get(color) ?? 0) + w * h);
  });
  return [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([c, n]) => `${c}:${n}`)
    .join('|');
}
