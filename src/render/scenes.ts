import type { Texture } from 'pixi.js';
import { type ArenaSpec, safeGlow } from './legendArena';
import {
  bayer,
  hexRgb,
  makeCanvas,
  mixRgb,
  noiseField,
  numRgb,
  PixelWriter,
  type Rgb,
  SCENE_H,
  SCENE_W,
  seeded,
  textureOf,
} from './paint';
import { AMBIENT, type AmbientDef, type SceneId } from './sceneIds';

/**
 * The painted scenes of the biomes (4V, block 1; art bible §3.4): every biome is a place seen from
 * above, drawn by code with the craft of pixel art (closed ramps of five tones, ordered dither,
 * volumes lit from the top left, contact shadows). A scene has a ground that tiles and scrolls (up
 * to three animated frames: the sea moves, the lava beats), a layer of big props that lives on the
 * EDGES of the field and scrolls faster (the parallax), and its own air (`AMBIENT`). The middle of
 * the field stays calm and dark: what can be touched must stand out (bible §5).
 *
 * All of it is original art; nothing is copied from any game.
 */

const W = SCENE_W;
const H = SCENE_H;
const TAU = Math.PI * 2;

/** 0 in the calm corridor of the middle, 1 at the edges of the field. */
function edge(x: number): number {
  return Math.max(0, Math.min(1, (Math.abs(x - W / 2) - 58) / 56));
}

/** The x of a winding trail at height y (it closes on itself, so the tile repeats). */
function trail(y: number, seed: number): number {
  const t = (y / H) * TAU;
  return W / 2 + Math.sin(t + seed) * 15 + Math.sin(t * 2 + seed * 1.7) * 7;
}

function ramp(...hex: string[]): Rgb[] {
  return hex.map(hexRgb);
}

interface Cell {
  /** Distance to the border of the cell (0 on the crack) and a number of the cell in [0, 1). */
  readonly border: number;
  readonly id: number;
}

/** Cells of stone (a Voronoi diagram that wraps): the plates of basalt, the slabs of a cave. */
function cellAt(x: number, y: number, size: number, seed: number): Cell {
  const nx = Math.round(W / size);
  const ny = Math.round(H / size);
  const gx = Math.floor(x / size);
  const gy = Math.floor(y / size);
  let d1 = 1e9;
  let d2 = 1e9;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = gx + i;
      const cy = gy + j;
      const wx = ((cx % nx) + nx) % nx;
      const wy = ((cy % ny) + ny) % ny;
      const h = Math.imul(wx * 73856093 + seed, 19349663) ^ Math.imul(wy + 11, 83492791);
      const px = (cx + (((h >>> 0) % 1000) / 1000) * 0.8 + 0.1) * size;
      const py = (cy + ((((h >>> 10) >>> 0) % 1000) / 1000) * 0.8 + 0.1) * size;
      const d = Math.hypot(x - px, y - py);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = ((h >>> 3) % 997) / 997;
      } else if (d < d2) d2 = d;
    }
  }
  return { border: d2 - d1, id };
}

interface Ctx {
  readonly rand: () => number;
  readonly seed: number;
  /** Two fields of noise of the tile: broad shapes and fine grain. */
  readonly broad: Float32Array;
  readonly fine: Float32Array;
  readonly accent: Rgb;
}

type Painter = (w: PixelWriter, ctx: Ctx) => void;
type FramePainter = (w: PixelWriter, ctx: Ctx, frame: number) => void;

interface SceneDef {
  readonly ground: Painter;
  readonly props: Painter;
  /** Paints what changes over the ground in each animated frame (the base is copied first). */
  readonly frames?: { readonly count: number; readonly ms: number; readonly paint: FramePainter };
}

const at = (f: Float32Array, x: number, y: number): number =>
  f[(((y % H) + H) % H) * W + (((x % W) + W) % W)] ?? 0;

/** Places `count` things on the two edges of the field (never in the corridor), top to bottom. */
function onEdges(
  ctx: Ctx,
  count: number,
  reach: number,
  place: (x: number, y: number, side: number, k: number) => void,
): void {
  for (let k = 0; k < count; k++) {
    const side = k % 2 === 0 ? -1 : 1;
    const inset = ctx.rand() ** 1.6 * reach;
    const x = side < 0 ? Math.round(inset) : Math.round(W - 1 - inset);
    const y = Math.round(((k + ctx.rand() * 0.8) / count) * H);
    place(x, y, side, k);
  }
}

// ---------------------------------------------------------------------------------------------
// Grass: the meadow, the forest and the fairy glade
// ---------------------------------------------------------------------------------------------

function grass(
  tones: Rgb[],
  earth: Rgb[],
  flowers: readonly Rgb[],
  flowerShare: number,
  pathWidth: number,
): Painter {
  return (w, ctx) => {
    for (let y = 0; y < H; y++) {
      const px = trail(y, ctx.seed);
      for (let x = 0; x < W; x++) {
        const n = at(ctx.broad, x, y);
        const grain = at(ctx.fine, x, y);
        const dist = Math.abs(x - px) - pathWidth - (grain - 0.5) * 7;
        if (dist < 0) {
          // The trail the wild Pokémon come down: packed earth, darker in its ruts.
          const rut = Math.abs(Math.abs(x - px) - pathWidth * 0.45) < 1.5 ? -0.16 : 0;
          w.ramp(x, y, earth, 0.3 + grain * 0.45 + rut);
        } else if (dist < 1.4) {
          w.put(x, y, tones[0] ?? [0, 0, 0]);
        } else {
          w.ramp(x, y, tones, 0.14 + n * 0.5 + grain * 0.16 + edge(x) * 0.14);
        }
      }
    }
    // Tufts: short blades a tone lighter, each with its dark foot.
    const light = tones[tones.length - 1] ?? [0, 0, 0];
    const dark = tones[0] ?? [0, 0, 0];
    for (let k = 0; k < 520; k++) {
      const x = Math.floor(ctx.rand() * W);
      const y = Math.floor(ctx.rand() * H);
      if (Math.abs(x - trail(y, ctx.seed)) < pathWidth + 4) continue;
      w.put(x, y, light);
      w.put(x + 1, y - 1, light);
      w.put(x - 1, y - 1, mixRgb(light, dark, 0.35));
      w.put(x, y + 1, dark);
    }
    // Flowers in drifts, thicker towards the edges.
    for (let k = 0; k < 900; k++) {
      const x = Math.floor(ctx.rand() * W);
      const y = Math.floor(ctx.rand() * H);
      if (Math.abs(x - trail(y, ctx.seed)) < pathWidth + 5) continue;
      if (at(ctx.broad, x + 60, y + 90) < 0.56 || ctx.rand() > flowerShare + edge(x) * 0.4)
        continue;
      const tone = flowers[k % flowers.length] ?? light;
      w.put(x, y, tone);
      if (k % 3 === 0) {
        w.put(x + 1, y, tone);
        w.put(x, y + 1, mixRgb(tone, dark, 0.5));
      }
    }
    // Pebbles on the trail.
    for (let k = 0; k < 70; k++) {
      const y = Math.floor(ctx.rand() * H);
      const x = Math.round(trail(y, ctx.seed) + (ctx.rand() - 0.5) * pathWidth * 1.5);
      w.put(x, y, earth[earth.length - 1] ?? light);
      w.put(x, y + 1, earth[0] ?? dark);
    }
  };
}

function trees(canopy: Rgb[], count: number, big: number, extras: Painter | null): Painter {
  return (w, ctx) => {
    onEdges(ctx, count, 30, (x, y, _side, k) => {
      const r = big - 3 + Math.floor(ctx.rand() * 6);
      w.shadow(x + 4, y + 6, r + 2, Math.round(r * 0.8), 0.5);
      w.lump(x, y, r, Math.round(r * 0.88), canopy, 0.34, ctx.seed + k);
      // A second, smaller crown on top gives the tree its volume.
      w.lump(
        x - 2,
        y - 3,
        Math.round(r * 0.55),
        Math.round(r * 0.5),
        canopy.slice(1),
        0.3,
        k,
        false,
      );
    });
    extras?.(w, ctx);
  };
}

function bushes(tones: Rgb[], berries: Rgb, count: number): Painter {
  return (w, ctx) => {
    onEdges(ctx, count, 46, (x, y, _side, k) => {
      const r = 3 + Math.floor(ctx.rand() * 3);
      w.shadow(x + 2, y + 3, r + 1, r, 0.4);
      w.lump(x, y, r, r - 1, tones, 0.3, ctx.seed + k * 7);
      if (k % 2 === 0) w.put(x - 1, y - 1, berries);
      if (k % 3 === 0) w.put(x + 1, y, berries);
    });
  };
}

function mushrooms(cap: Rgb[], spot: Rgb, glow: Rgb | null, count: number, reach: number): Painter {
  return (w, ctx) => {
    onEdges(ctx, count, reach, (x, y, _side, k) => {
      const r = 3 + Math.floor(ctx.rand() * 4);
      if (glow !== null) {
        // A ring of light on the ground around a mushroom that shines.
        for (let dy = -r - 5; dy <= r + 5; dy++) {
          for (let dx = -r - 5; dx <= r + 5; dx++) {
            const d = Math.hypot(dx, dy) / (r + 5);
            if (d < 1 && (1 - d) * 0.9 > bayer(x + dx, y + dy)) w.blend(x + dx, y + dy, glow, 0.3);
          }
        }
      }
      w.shadow(x + 2, y + 3, r, r - 1, 0.45);
      w.lump(x, y, r, r - 1, cap, 0.12, ctx.seed + k * 3);
      w.put(x - 1, y - 1, spot);
      if (r > 4) {
        w.put(x + 2, y, spot);
        w.put(x - 2, y + 1, spot);
      }
    });
  };
}

// ---------------------------------------------------------------------------------------------
// Water: the coast and the swamp
// ---------------------------------------------------------------------------------------------

function water(tones: Rgb[], shore: Rgb[] | null, foam: Rgb): SceneDef['ground'] {
  return (w, ctx) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = at(ctx.broad, x, y);
        const grain = at(ctx.fine, x * 2, y);
        const reach = Math.abs(x - W / 2) - (96 + (at(ctx.broad, 0, y * 2) - 0.5) * 22);
        if (shore !== null && reach > 0) {
          w.ramp(x, y, shore, 0.3 + grain * 0.4 + Math.min(0.3, reach * 0.02));
        } else if (shore !== null && reach > -2) {
          w.put(x, y, foam);
        } else {
          // Deeper in the middle, long horizontal bands of swell.
          const swell = Math.sin((y + n * 26) * 0.21) * 0.1;
          w.ramp(x, y, tones, 0.12 + n * 0.42 + swell + edge(x) * 0.2 + grain * 0.06);
        }
      }
    }
  };
}

/** The crests of the swell, a different phase per frame: the sea moves. */
function crests(light: Rgb, foam: Rgb, hasShore: boolean, density: number): FramePainter {
  return (w, ctx, frame) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const reach = Math.abs(x - W / 2) - (96 + (at(ctx.broad, 0, y * 2) - 0.5) * 22);
        if (hasShore && reach > -3) {
          // The foam breathes in and out on the sand.
          if (reach < 1 + frame && reach > -3 + frame) w.put(x, y, foam);
          continue;
        }
        const n = at(ctx.broad, x, y);
        const wave = Math.sin((y + n * 26) * 0.21 + frame * 1.9 + at(ctx.fine, x, y) * 2.2);
        const run = at(ctx.fine, x + frame * 3, y * 3);
        // Fewer crests in the corridor of the middle, and no white foam there.
        const calm = 0.35 + 0.65 * edge(x);
        if (wave > 0.93 && run > 1 - density * calm) {
          w.put(x, y, wave > 0.985 && calm > 0.6 ? foam : light);
        }
      }
    }
  };
}

function lilies(pad: Rgb[], bloom: Rgb, count: number): Painter {
  return (w, ctx) => {
    onEdges(ctx, count, 58, (x, y, _side, k) => {
      const r = 3 + Math.floor(ctx.rand() * 4);
      w.shadow(x + 1, y + 2, r, r - 1, 0.35);
      w.lump(x, y, r, r - 1, pad, 0.08, ctx.seed + k);
      // The notch of a lily pad, and a flower on some.
      for (let i = 0; i <= r; i++) w.put(x + i, y + Math.round(i * 0.5), pad[0] ?? [0, 0, 0]);
      if (k % 3 === 0) {
        w.put(x - 1, y - 1, bloom);
        w.put(x, y - 1, [255, 255, 255]);
        w.put(x - 1, y, mixRgb(bloom, [80, 20, 80], 0.4));
      }
    });
  };
}

function reeds(tone: Rgb[], head: Rgb, count: number): Painter {
  return (w, ctx) => {
    onEdges(ctx, count, 20, (x, y) => {
      const tall = 5 + Math.floor(ctx.rand() * 6);
      for (let i = 0; i < tall; i++) {
        w.put(x + (i > tall - 3 ? 1 : 0), y - i, tone[i % 2 === 0 ? 3 : 2] ?? head);
      }
      w.put(x + 1, y - tall, head);
      w.put(x + 1, y - tall - 1, head);
      w.put(x - 1, y, tone[1] ?? head);
    });
  };
}

function boulders(tones: Rgb[], count: number, big: number, reach: number): Painter {
  return (w, ctx) => {
    onEdges(ctx, count, reach, (x, y, _side, k) => {
      const r = Math.max(2, big - 2 + Math.floor(ctx.rand() * 5));
      w.shadow(x + 3, y + 3, r + 1, Math.round(r * 0.7), 0.5);
      w.lump(x, y, r, Math.round(r * 0.72), tones, 0.5, ctx.seed + k * 13);
    });
  };
}

// ---------------------------------------------------------------------------------------------
// Stone: the volcano, the cave and the storm ridge
// ---------------------------------------------------------------------------------------------

function plates(tones: Rgb[], size: number, seam: Rgb, lit: Rgb | null): Painter {
  return (w, ctx) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cell = cellAt(x + (at(ctx.fine, x, y) - 0.5) * 5, y, size, ctx.seed);
        const grain = at(ctx.fine, x * 2, y * 2);
        if (cell.border < 1.2) {
          w.put(x, y, seam);
        } else if (lit !== null && cell.border < 2.4 && (x + y) % 2 === 0) {
          w.put(x, y, lit);
        } else {
          w.ramp(x, y, tones, 0.1 + cell.id * 0.42 + grain * 0.22 + edge(x) * 0.12);
        }
      }
    }
  };
}

/** Rivers of lava down both edges and thin veins in the cracks, beating frame by frame. */
function lava(tones: Rgb[], size: number): FramePainter {
  return (w, ctx, frame) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const bank = Math.abs(x - W / 2) - (100 + (at(ctx.broad, 0, y * 2) - 0.5) * 26);
        if (bank > 0) {
          // The river: bright in the middle of its flow, with crusts that drift down.
          const flow = at(ctx.fine, x * 2, y + frame * 5);
          const heat = Math.min(1, bank / 9) * 0.55 + flow * 0.5 + (frame === 1 ? 0.06 : 0);
          w.ramp(x, y, tones, heat);
          continue;
        }
        if (bank > -5) {
          if ((bank + 5) / 5 > bayer(x, y)) w.blend(x, y, tones[1] ?? [0, 0, 0], 0.55);
          continue;
        }
        const cell = cellAt(x + (at(ctx.fine, x, y) - 0.5) * 5, y, size, ctx.seed);
        if (cell.border >= 1.2) continue;
        // Veins: only some cracks carry lava, and they glow less in the calm corridor.
        const vein = at(ctx.broad, x + 40, y + 40);
        if (vein < 0.54) continue;
        const beat = ((frame + Math.floor(vein * 9)) % 3) * 0.14;
        w.ramp(x, y, tones, 0.25 + edge(x) * 0.4 + beat);
      }
    }
  };
}

function crystals(tones: Rgb[], glow: Rgb, count: number, reach: number): Painter {
  return (w, ctx) => {
    onEdges(ctx, count, reach, (x, y, _side, k) => {
      const tall = 7 + Math.floor(ctx.rand() * 8);
      const half = 2 + Math.floor(tall / 5);
      for (let dy = -tall - 6; dy <= 8; dy++) {
        for (let dx = -half - 7; dx <= half + 7; dx++) {
          const d = Math.hypot(dx, (dy + tall / 2) * 0.7) / (half + 7);
          if (d < 1 && (1 - d) * 0.8 > bayer(x + dx, y + dy)) w.blend(x + dx, y + dy, glow, 0.26);
        }
      }
      w.shadow(x + 2, y + 2, half + 2, 2, 0.5);
      // A faceted spire: a lit face, a dark face and a bright ridge between them.
      for (let i = 0; i <= tall; i++) {
        const wide = Math.max(0, Math.round(half * Math.min(1, (tall - i) / (tall * 0.45), 1)));
        for (let dx = -wide; dx <= wide; dx++) {
          const face = dx < 0 ? 3 : dx === 0 ? 4 : 1;
          w.put(x + dx, y - i, tones[Math.min(tones.length - 1, face)] ?? glow);
        }
        w.put(x - wide - 1, y - i, tones[0] ?? glow);
        w.put(x + wide + 1, y - i, tones[0] ?? glow);
      }
      w.put(x, y - tall - 1, [255, 255, 255]);
      if (k % 2 === 0) {
        // A small shard beside it.
        for (let i = 0; i < 4; i++) w.put(x + half + 2, y - i, tones[i < 2 ? 2 : 4] ?? glow);
      }
    });
  };
}

/** The rails of a mine down the middle of the cave: two lines and their sleepers. */
function rails(wood: Rgb[], iron: Rgb[]): Painter {
  return (w, ctx) => {
    for (let y = 0; y < H; y++) {
      const mid = Math.round(trail(y, ctx.seed) * 0.5 + W / 4);
      if (y % 9 < 3) {
        for (let dx = -13; dx <= 13; dx++) {
          w.ramp(
            mid + dx,
            y,
            wood,
            0.25 + at(ctx.fine, mid + dx, y) * 0.5 - (y % 9 === 2 ? 0.2 : 0),
          );
        }
      }
      for (const side of [-8, 8]) {
        w.put(mid + side, y, iron[2] ?? [0, 0, 0]);
        w.put(mid + side + 1, y, iron[y % 5 === 0 ? 4 : 3] ?? [0, 0, 0]);
        w.put(mid + side + 2, y, iron[0] ?? [0, 0, 0]);
      }
    }
  };
}

/** Puddles that mirror the sky: flat light shapes with a dark rim (their rings are animated). */
function puddles(tones: Rgb[]): Painter {
  return (w, ctx) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = at(ctx.broad, x + 90, y + 30);
        if (n > 0.72) w.ramp(x, y, tones, 0.2 + (n - 0.72) * 2.4 + at(ctx.fine, x * 3, y) * 0.15);
        else if (n > 0.705) w.put(x, y, tones[0] ?? [0, 0, 0]);
      }
    }
  };
}

function ripples(light: Rgb): FramePainter {
  return (w, ctx, frame) => {
    const rand = seeded(ctx.seed * 3 + 1);
    for (let k = 0; k < 46; k++) {
      const x = Math.floor(rand() * W);
      const y = Math.floor(rand() * H);
      if (at(ctx.broad, x + 90, y + 30) <= 0.735) continue;
      const r = 1 + ((k + frame) % 3);
      for (let a = 0; a < 8; a++) {
        if ((a + k) % 2 === 0) continue;
        w.put(
          x + Math.round(Math.cos(a * 0.785) * r),
          y + Math.round(Math.sin(a * 0.785) * r * 0.6),
          light,
        );
      }
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Snow: the frozen peak
// ---------------------------------------------------------------------------------------------

function snow(tones: Rgb[], ice: Rgb[]): Painter {
  return (w, ctx) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = at(ctx.broad, x, y);
        const grain = at(ctx.fine, x, y);
        const pond = at(ctx.broad, x + 70, y + 120);
        if (pond > 0.63 && edge(x) < 0.9) {
          // Sheets of ice: dark and glassy, with white scratches.
          const scratch = at(ctx.fine, x * 4 + y, y) > 0.8 ? 0.35 : 0;
          w.ramp(x, y, ice, 0.25 + (pond - 0.63) * 1.6 + scratch);
        } else if (pond > 0.615 && edge(x) < 0.9) {
          w.put(x, y, tones[tones.length - 1] ?? [255, 255, 255]);
        } else {
          // Drifts: the lit side of every swell of the noise is brighter.
          const slope = at(ctx.broad, x + 2, y + 2) - n;
          w.ramp(x, y, tones, 0.1 + n * 0.34 - slope * 5 + grain * 0.1 + edge(x) * 0.26);
        }
      }
    }
    // Sparkles of frost.
    for (let k = 0; k < 220; k++) {
      const x = Math.floor(ctx.rand() * W);
      const y = Math.floor(ctx.rand() * H);
      if (ctx.rand() < edge(x) + 0.25) w.put(x, y, [236, 246, 255]);
    }
  };
}

function pines(tones: Rgb[], cap: Rgb[], count: number): Painter {
  return (w, ctx) => {
    onEdges(ctx, count, 26, (x, y, _side, k) => {
      const r = 7 + Math.floor(ctx.rand() * 5);
      w.shadow(x + 4, y + 5, r + 1, Math.round(r * 0.8), 0.45);
      // A pine from above: rings of branches, each smaller, the top ones capped with snow.
      for (let ring = 0; ring < 3; ring++) {
        const rr = Math.round(r * (1 - ring * 0.3));
        w.lump(x - ring, y - ring * 2, rr, rr, ring === 2 ? cap : tones, 0.55, ctx.seed + k + ring);
      }
    });
  };
}

// ---------------------------------------------------------------------------------------------
// Floors made by hands: the dojo, the ruins, the haunted house and the power plant
// ---------------------------------------------------------------------------------------------

function planks(tones: Rgb[], wide: number, lane: Painter | null): Painter {
  return (w, ctx) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const board = Math.floor(x / wide);
        const seam = x % wide === 0;
        // Each board has its tone, its grain and its ends (boards are 60 to 90 pixels long).
        const tone = ((Math.imul(board + 3, 2654435761) >>> 8) % 100) / 100;
        const long = 60 + ((board * 37) % 30);
        const end = (y + board * 23) % long === 0;
        const grain = at(ctx.fine, x * 5 + board * 9, y) * 0.26;
        if (seam || end) w.put(x, y, tones[0] ?? [0, 0, 0]);
        else w.ramp(x, y, tones, 0.2 + tone * 0.34 + grain + edge(x) * 0.12);
      }
    }
    for (let k = 0; k < 150; k++) {
      // Knots and nails.
      const x = Math.floor(ctx.rand() * W);
      const y = Math.floor(ctx.rand() * H);
      w.put(x, y, tones[0] ?? [0, 0, 0]);
      if (k % 2 === 0) w.put(x + 1, y, tones[tones.length - 1] ?? [0, 0, 0]);
    }
    lane?.(w, ctx);
  };
}

/** A woven lane down the middle: the mats of the dojo, the runner of the haunted house. */
function runner(tones: Rgb[], trim: Rgb, half: number, weave: number): Painter {
  return (w, ctx) => {
    for (let y = 0; y < H; y++) {
      for (let dx = -half; dx <= half; dx++) {
        const x = W / 2 + dx;
        const border = half - Math.abs(dx);
        if (border < 1) w.put(x, y, tones[0] ?? [0, 0, 0]);
        else if (border < 3) w.put(x, y, trim);
        else if (border < 4) w.put(x, y, tones[0] ?? [0, 0, 0]);
        else {
          const mat = Math.floor(y / weave) % 2;
          const stitch = y % weave === 0 || (dx + half + mat * (weave / 2)) % weave === 0;
          // A diamond of the pattern every so often.
          const gem =
            (Math.abs(dx) + Math.abs((y % 40) - 20)) % 20 === 0 && Math.abs(dx) < half - 8;
          if (gem) w.put(x, y, mixRgb(trim, tones[2] ?? trim, 0.7));
          else if (stitch) w.put(x, y, tones[1] ?? [0, 0, 0]);
          else w.ramp(x, y, tones, 0.42 + at(ctx.fine, x * 3, y * 3) * 0.3);
        }
      }
    }
  };
}

function slabs(tones: Rgb[], sw: number, sh: number, moss: Rgb[] | null): Painter {
  return (w, ctx) => {
    for (let y = 0; y < H; y++) {
      const row = Math.floor(y / sh);
      for (let x = 0; x < W; x++) {
        const sx = x + (row % 2) * (sw / 2);
        const col = Math.floor(sx / sw);
        const tone = ((Math.imul(col * 7 + row * 13 + 5, 2246822519) >>> 9) % 100) / 100;
        const lx = sx % sw;
        const ly = y % sh;
        const grain = at(ctx.fine, x * 2, y * 2);
        if (lx === 0 || ly === 0) w.put(x, y, mixRgb(tones[0] ?? [0, 0, 0], [4, 6, 12], 0.5));
        else if (lx === 1 || ly === 1) w.ramp(x, y, tones, 0.62 + tone * 0.3);
        else w.ramp(x, y, tones, 0.14 + tone * 0.4 + grain * 0.2 + edge(x) * 0.1);
        // Moss grows from the edges and in the joints.
        if (moss !== null) {
          const grown =
            at(ctx.broad, x + 30, y + 50) + edge(x) * 0.22 + (lx < 2 || ly < 2 ? 0.08 : 0);
          if (grown > 0.74 && grain > 0.4) w.ramp(x, y, moss, (grown - 0.7) * 2 + grain * 0.3);
        }
      }
    }
    // Cracks: short crooked lines.
    for (let k = 0; k < 26; k++) {
      let x = Math.floor(ctx.rand() * W);
      let y = Math.floor(ctx.rand() * H);
      for (let i = 0; i < 9 + (k % 8); i++) {
        w.put(x, y, mixRgb(tones[0] ?? [0, 0, 0], [4, 6, 12], 0.6));
        x += ctx.rand() < 0.5 ? 1 : ctx.rand() < 0.5 ? -1 : 0;
        y += 1;
      }
    }
  };
}

/** Glyphs carved in some slabs: they beat with the frame. */
function runes(sw: number, sh: number, dim: Rgb, lit: Rgb): FramePainter {
  const GLYPHS = [
    ['.x.x.', 'x.x.x', '..x..', 'x.x.x', '.x.x.'],
    ['xxxxx', 'x...x', 'x.x.x', 'x...x', 'xxxxx'],
    ['..x..', '.xxx.', 'xx.xx', '.xxx.', '..x..'],
    ['x...x', '.x.x.', 'xxxxx', '.x.x.', 'x...x'],
  ];
  return (w, ctx, frame) => {
    const rand = seeded(ctx.seed + 77);
    for (let row = 0; row < H / sh; row++) {
      for (let col = 0; col < W / sw; col++) {
        if (rand() > 0.16) continue;
        const x = col * sw - (row % 2) * (sw / 2) + Math.floor(sw / 2) - 2;
        const y = row * sh + Math.floor(sh / 2) - 2;
        const on = (row + col + frame) % 3 === 0;
        // Fewer and dimmer in the corridor.
        if (edge(((x % W) + W) % W) < 0.2 && !on && rand() < 0.5) continue;
        const glyph = GLYPHS[(row * 3 + col) % GLYPHS.length] ?? [];
        w.stamp(glyph, x, y, { x: on ? lit : dim });
      }
    }
  };
}

function columns(tones: Rgb[], count: number): Painter {
  return (w, ctx) => {
    onEdges(ctx, count, 26, (x, y, _side, k) => {
      const r = 6 + Math.floor(ctx.rand() * 3);
      w.shadow(x + 5, y + 6, r + 3, r, 0.5);
      // A broken column from above: the drum, the fluting as a ring and the dark break.
      w.lump(x, y, r, r, tones, 0.12, ctx.seed + k);
      w.lump(x, y, r - 3, r - 3, tones.slice(0, 3), 0.5, ctx.seed + k + 9);
      if (k % 2 === 0) {
        // A fallen block beside it.
        for (let dy = 0; dy < 5; dy++) {
          for (let dx = 0; dx < 8; dx++) {
            w.put(
              x + r + 3 + dx,
              y + 2 + dy,
              tones[dy === 0 ? 4 : dx === 0 ? 3 : dy === 4 ? 0 : 2] ?? [0, 0, 0],
            );
          }
        }
      }
    });
  };
}

function lanterns(post: Rgb[], light: Rgb, count: number, reach: number): Painter {
  return (w, ctx) => {
    onEdges(ctx, count, reach, (x, y) => {
      for (let dy = -14; dy <= 14; dy++) {
        for (let dx = -14; dx <= 14; dx++) {
          const d = Math.hypot(dx, dy) / 14;
          if (d < 1 && (1 - d) ** 1.5 > bayer(x + dx, y + dy)) w.blend(x + dx, y + dy, light, 0.3);
        }
      }
      w.shadow(x + 2, y + 3, 4, 3, 0.5);
      w.lump(x, y, 3, 3, post, 0.05, ctx.seed);
      w.put(x, y, light);
      w.put(x - 1, y, mixRgb(light, [255, 255, 255], 0.6));
      w.put(x, y - 1, mixRgb(light, [255, 255, 255], 0.6));
    });
  };
}

function panels(tones: Rgb[], size: number, stripe: Rgb): Painter {
  return (w, ctx) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const lx = x % size;
        const ly = y % size;
        const id = Math.floor(x / size) * 5 + Math.floor(y / size) * 11;
        const tone = ((Math.imul(id + 1, 2654435761) >>> 10) % 100) / 100;
        const grille = tone > 0.8 && lx > 4 && lx < size - 4 && ly > 4 && ly < size - 4;
        if (x < 7 || x >= W - 7) {
          // The warning stripes of the walkway, down both edges.
          w.put(x, y, (x + y) % 12 < 6 ? stripe : (tones[0] ?? [0, 0, 0]));
        } else if (lx === 0 || ly === 0)
          w.put(x, y, mixRgb(tones[0] ?? [0, 0, 0], [2, 4, 10], 0.5));
        else if (lx === 1 || ly === 1) w.put(x, y, tones[tones.length - 1] ?? [0, 0, 0]);
        else if (lx === size - 1 || ly === size - 1) w.put(x, y, tones[1] ?? [0, 0, 0]);
        else if (grille)
          w.put(x, y, ly % 3 === 0 ? (tones[0] ?? [0, 0, 0]) : (tones[2] ?? [0, 0, 0]));
        else
          w.ramp(x, y, tones, 0.2 + tone * 0.3 + at(ctx.fine, x * 2, y * 2) * 0.16 + edge(x) * 0.1);
        // Rivets in the corners of every plate.
        if ((lx === 3 || lx === size - 4) && (ly === 3 || ly === size - 4)) {
          w.put(x, y, tones[tones.length - 1] ?? [0, 0, 0]);
          w.put(x + 1, y + 1, tones[0] ?? [0, 0, 0]);
        }
      }
    }
  };
}

/** Conduits of power down both sides: a pulse of light travels along them. */
function conduits(dim: Rgb, lit: Rgb): FramePainter {
  return (w, _ctx, frame) => {
    for (const x of [22, 23, W - 24, W - 23]) {
      for (let y = 0; y < H; y++) {
        const pulse = (y + frame * 20) % 60;
        w.put(x, y, pulse < 9 ? (pulse < 3 ? [255, 255, 255] : lit) : dim);
      }
    }
    for (const x of [21, 24, W - 25, W - 22]) {
      for (let y = 0; y < H; y++) w.put(x, y, [8, 10, 18]);
    }
  };
}

function machines(tones: Rgb[], light: Rgb, count: number): Painter {
  return (w, ctx) => {
    onEdges(ctx, count, 6, (x0, y, side, k) => {
      const x = side < 0 ? x0 + 12 : x0 - 12;
      for (let dy = -12; dy <= 12; dy++) {
        for (let dx = -12; dx <= 12; dx++) {
          const d = Math.hypot(dx, dy) / 12;
          if (d < 1 && 1 - d > bayer(x + dx, y + dy)) w.blend(x + dx, y + dy, light, 0.22);
        }
      }
      w.shadow(x + 3, y + 4, 7, 6, 0.5);
      // A coil from above: rings of metal around a core that shines.
      w.lump(x, y, 6, 6, tones, 0.04, ctx.seed + k);
      w.lump(x, y, 4, 4, tones.slice(0, 3), 0.04, ctx.seed + k);
      w.lump(x, y, 2, 2, [light, light, [255, 255, 255]], 0, k);
    });
  };
}

// ---------------------------------------------------------------------------------------------
// The sky of the dragons: above the clouds
// ---------------------------------------------------------------------------------------------

function heavens(tones: Rgb[], cloud: Rgb[]): Painter {
  return (w, ctx) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = at(ctx.broad, x, y);
        const far = at(ctx.broad, x + 100, y + 200) * 0.7 + at(ctx.fine, x, y) * 0.3;
        if (far > 0.6 && edge(x) > 0.15) {
          // Far banks of cloud, lit from the top left: the edge that faces the light is bright.
          const rim =
            far - (at(ctx.broad, x + 98, y + 198) * 0.7 + at(ctx.fine, x - 2, y - 2) * 0.3);
          w.ramp(x, y, cloud, 0.2 + (far - 0.6) * 1.4 + rim * 9);
        } else {
          w.ramp(x, y, tones, 0.1 + n * 0.5 + edge(x) * 0.12);
        }
      }
    }
    for (let k = 0; k < 130; k++) {
      const x = Math.floor(ctx.rand() * W);
      const y = Math.floor(ctx.rand() * H);
      w.put(x, y, k % 4 === 0 ? [255, 244, 214] : [170, 180, 236]);
    }
  };
}

function clouds(tones: Rgb[], count: number): Painter {
  return (w, ctx) => {
    onEdges(ctx, count, 16, (x, y, _side, k) => {
      // A cumulus is a row of lumps of different sizes on a flat, darker base.
      const puffs = 3 + (k % 3);
      for (let i = 0; i < puffs; i++) {
        const r = 7 + Math.floor(ctx.rand() * 7);
        w.lump(
          x + (i - puffs / 2) * 9,
          y + Math.floor(ctx.rand() * 6),
          r,
          Math.round(r * 0.75),
          tones,
          0.3,
          k * 5 + i,
        );
      }
    });
  };
}

// ---------------------------------------------------------------------------------------------
// The fourteen scenes
// ---------------------------------------------------------------------------------------------

const both =
  (...list: Painter[]): Painter =>
  (w, ctx) => {
    for (const paint of list) paint(w, ctx);
  };

const STONE = ramp('#23262e', '#343843', '#484e5a', '#5f6672', '#7b838e');

const SCENES: Record<SceneId, SceneDef> = {
  meadow: {
    ground: grass(
      ramp('#173d2a', '#1f5131', '#296739', '#357f43', '#49994f'),
      ramp('#2c2a22', '#3a3528', '#4a4230', '#5a5038'),
      ramp('#ffe27a', '#fff6e0', '#ff9fc0'),
      0.5,
      15,
    ),
    props: both(
      trees(ramp('#0f3323', '#17482c', '#216136', '#2f7d41', '#4a9c4c'), 12, 11, null),
      bushes(ramp('#143d28', '#1d5430', '#2b7039', '#3f8f45'), hexRgb('#ff7fb0'), 14),
      boulders(STONE, 6, 4, 40),
    ),
  },
  forest: {
    ground: grass(
      ramp('#0c2420', '#113228', '#174232', '#1f553c', '#2b6b48'),
      ramp('#1d1a18', '#28231e', '#342d24', '#42382a'),
      ramp('#d9a441', '#b8742e', '#8fd06a'),
      0.42,
      12,
    ),
    props: both(
      trees(ramp('#071c18', '#0d2a20', '#143b2a', '#1e5034', '#2f6a40'), 20, 15, null),
      mushrooms(ramp('#6a1c1c', '#a82c2a', '#d9483a'), hexRgb('#fff6e0'), null, 10, 50),
      bushes(ramp('#0c2a20', '#123a28', '#1b4e30', '#286638'), hexRgb('#6fb0ff'), 10),
    ),
  },
  glade: {
    ground: grass(
      ramp('#123438', '#184640', '#1f5a4a', '#297253', '#3c8c60'),
      ramp('#2a2638', '#363046', '#443c56', '#544a66'),
      ramp('#ff9fd0', '#fff0fa', '#c8a8ff', '#ffe27a'),
      0.85,
      11,
    ),
    props: both(
      mushrooms(
        ramp('#7a2a6a', '#b0409a', '#e060c0', '#ff9fd8'),
        hexRgb('#fff0fa'),
        hexRgb('#ff7fc8'),
        16,
        44,
      ),
      trees(ramp('#0e2c34', '#143c3c', '#1c5046', '#286850', '#3c845c'), 8, 12, null),
      bushes(ramp('#3a1c50', '#52286e', '#6e3a90', '#9458b8'), hexRgb('#fff0fa'), 12),
    ),
  },
  coast: {
    ground: water(
      ramp('#0a2352', '#0f3068', '#15407e', '#1c5296', '#2867ac'),
      ramp('#7a6a48', '#93805a', '#ad986c', '#c4b080'),
      hexRgb('#e8f8ff'),
    ),
    props: both(
      boulders(ramp('#2a2c38', '#3c4050', '#525868', '#6c7484', '#8a94a2'), 12, 5, 44),
      trees(ramp('#0f3a2a', '#175030', '#236a38', '#358845', '#4fa654'), 6, 9, null),
    ),
    frames: { count: 3, ms: 300, paint: crests(hexRgb('#5fa8e0'), hexRgb('#e8f8ff'), true, 0.5) },
  },
  swamp: {
    ground: water(
      ramp('#0e2420', '#143228', '#1b4230', '#24543a', '#326a46'),
      null,
      hexRgb('#9fd8a0'),
    ),
    props: both(
      lilies(ramp('#17402a', '#1f5632', '#2b703c', '#3f8c48'), hexRgb('#ff9fd0'), 22),
      reeds(ramp('#1c3020', '#2a442a', '#3c5c36', '#527a44'), hexRgb('#7a5a3a'), 40),
      trees(ramp('#0c1c1a', '#122822', '#1a382c', '#244a36', '#30603f'), 8, 12, null),
    ),
    frames: { count: 3, ms: 420, paint: crests(hexRgb('#3f8456'), hexRgb('#8fcf9a'), false, 0.3) },
  },
  volcano: {
    ground: plates(
      ramp('#140c10', '#1d1116', '#28161b', '#341c20', '#432426'),
      24,
      hexRgb('#0a0608'),
      null,
    ),
    props: boulders(ramp('#0e080a', '#1a0f12', '#2a171a', '#3e2222', '#5a302a'), 16, 6, 16),
    frames: {
      count: 3,
      ms: 360,
      paint: lava(ramp('#5a1408', '#a82a0c', '#ef5a14', '#ffa02c', '#ffe27a'), 24),
    },
  },
  cave: {
    ground: both(
      plates(
        ramp('#17130f', '#221b15', '#2f251c', '#3d3024', '#4d3d2d'),
        30,
        hexRgb('#0c0a08'),
        null,
      ),
      rails(
        ramp('#2a1c12', '#3a2718', '#4d3520', '#5f4428'),
        ramp('#1c1e26', '#2e323c', '#484e5a', '#6c7480', '#a0aab4'),
      ),
    ),
    props: both(
      boulders(ramp('#120f0c', '#1f1913', '#30261c', '#443628', '#5c4a36'), 14, 7, 30),
      crystals(
        ramp('#0f4a5a', '#177a8a', '#2ab0c0', '#6fe0ea', '#d8fbff'),
        hexRgb('#2ab0c0'),
        10,
        34,
      ),
    ),
  },
  peak: {
    ground: snow(
      ramp('#23406c', '#2f5486', '#3f6ca0', '#5486b8', '#6ea0cc'),
      ramp('#12284a', '#1a3a62', '#24507c', '#3a6c98', '#bfe0f4'),
    ),
    props: both(
      pines(
        ramp('#0c2430', '#12343c', '#1a4848', '#266054'),
        ramp('#7fa8cc', '#a8cce4', '#d6ecfa', '#ffffff'),
        12,
      ),
      crystals(
        ramp('#3a6c98', '#5a94c0', '#86bfe0', '#bfe4f6', '#ffffff'),
        hexRgb('#86bfe0'),
        8,
        30,
      ),
      boulders(ramp('#1c2c44', '#2a405e', '#3e5a7c', '#587a9c', '#86a8c4'), 8, 5, 40),
    ),
  },
  dojo: {
    ground: planks(
      ramp('#2a1810', '#3a2216', '#4c2e1c', '#603c24', '#764c2e'),
      12,
      // No red in the middle of any field: red is the colour of danger (art bible §5).
      runner(ramp('#1a2416', '#2a3820', '#36482a', '#445a34'), hexRgb('#c8922e'), 52, 10),
    ),
    props: both(
      columns(ramp('#3a100c', '#5a1a12', '#7e261a', '#a03424', '#c44a34'), 8),
      lanterns(ramp('#2a1810', '#4c2e1c', '#764c2e'), hexRgb('#ffc86a'), 10, 34),
    ),
  },
  ruins: {
    ground: slabs(
      ramp('#1a2220', '#252f2c', '#313e39', '#404f48', '#526359'),
      24,
      16,
      ramp('#16302a', '#1f4432', '#2c5a3c', '#3e7048'),
    ),
    props: both(
      columns(ramp('#2a3230', '#3c4844', '#52605a', '#6e7e74', '#8fa094'), 10),
      bushes(ramp('#143424', '#1e4a2e', '#2c6438', '#407e44'), hexRgb('#ff8fc8'), 12),
    ),
    frames: { count: 3, ms: 520, paint: runes(24, 16, hexRgb('#5a3a5e'), hexRgb('#ff8fc8')) },
  },
  haunted: {
    ground: planks(
      ramp('#150f1c', '#1e1528', '#291c36', '#352544', '#443055'),
      10,
      runner(ramp('#10182c', '#17223c', '#1f2e4e', '#293c62'), hexRgb('#c8a04a'), 44, 8),
    ),
    props: both(
      lanterns(ramp('#1a1420', '#3a2c48', '#5a4470'), hexRgb('#ffd27a'), 8, 40),
      columns(ramp('#1c1626', '#2a2038', '#3c2e4e', '#524066', '#6e5884'), 6),
      boulders(ramp('#1a1622', '#2a2434', '#3e364a', '#584e64', '#7a7088'), 8, 5, 30),
    ),
  },
  plant: {
    ground: panels(
      ramp('#12151f', '#1a1f2c', '#232a3a', '#2f384b', '#3f4a60'),
      30,
      hexRgb('#c8a02a'),
    ),
    props: machines(
      ramp('#1a1e2a', '#2c3444', '#444e62', '#667288', '#96a2b4'),
      hexRgb('#ffe27a'),
      10,
    ),
    frames: { count: 3, ms: 140, paint: conduits(hexRgb('#6a5a1c'), hexRgb('#ffe27a')) },
  },
  storm: {
    ground: both(
      plates(
        ramp('#0e1018', '#151924', '#1e2332', '#293042', '#374055'),
        34,
        hexRgb('#07080e'),
        hexRgb('#2f384b'),
      ),
      puddles(ramp('#16223a', '#1f3050', '#2c4468', '#3e5c84')),
    ),
    props: both(
      boulders(ramp('#0c0e16', '#161a26', '#242a3a', '#363e52', '#4e5870'), 14, 7, 30),
      crystals(
        ramp('#3a3a1c', '#6a6a2a', '#b0a83a', '#ffe27a', '#ffffff'),
        hexRgb('#ffe27a'),
        5,
        26,
      ),
    ),
    frames: { count: 3, ms: 200, paint: ripples(hexRgb('#9fc0e8')) },
  },
  sky: {
    ground: heavens(
      ramp('#10163e', '#182056', '#222c70', '#30398a', '#434ba2'),
      ramp('#3a3470', '#5a4a90', '#8a6cb0', '#c098c8', '#f0c8dc'),
    ),
    props: clouds(ramp('#6a5a9c', '#927cbc', '#bca0d6', '#e4c8ea', '#fff0f6'), 12),
  },
};

/**
 * The arena of a legendary as a painted scene (4W, block 6; 18th playtest: "la arena final a
 * mejorar"). Until now it was one small tile of 120 x 180 art pixels (4 arena units each, twice the
 * pixel of the bible) with no calm corridor and nothing on the edges. Now it is a scene like the
 * biomes, at the pixel of the bible (2 units): the same painters, coloured with the palette of its
 * legendary (`legendArena`): its dark base for the ground (dark enough in the corridor), its main
 * colour for the big things on the edges and the colour that glows for what is lit and animated.
 */
function between(a: number, b: number, ts: readonly number[]): Rgb[] {
  return ts.map((t) => mixRgb(numRgb(a), numRgb(b), t));
}

export function arenaSceneDef(spec: ArenaSpec): SceneDef {
  const { base, main } = spec;
  const glow = safeGlow(spec.glow);
  const white = 0xffffff;
  const ground = between(base, main, [0.04, 0.12, 0.22, 0.34, 0.46]);
  const props = [
    ...between(base, main, [0.25, 0.5, 0.75, 1]),
    mixRgb(numRgb(main), numRgb(white), 0.35),
  ];
  const lit = [
    ...between(main, glow, [0.2, 0.45, 0.7, 1]),
    mixRgb(numRgb(glow), numRgb(white), 0.5),
  ];
  const glowRgb = numRgb(glow);
  const dim = mixRgb(numRgb(base), numRgb(glow), 0.25);
  const light = mixRgb(numRgb(glow), numRgb(white), 0.4);
  const seam = mixRgb(numRgb(base), numRgb(0), 0.5);
  const four = (ramp: Rgb[]): Rgb[] => ramp.slice(0, 4);
  switch (spec.floor) {
    case 'abyss':
      return {
        ground: water(ground, null, light),
        props: both(boulders(props, 10, 5, 40), crystals(lit, glowRgb, 8, 34)),
        frames: {
          count: 3,
          ms: 340,
          paint: crests(mixRgb(numRgb(main), numRgb(white), 0.2), light, false, 0.45),
        },
      };
    case 'magma':
      return {
        ground: plates(ground, 24, seam, null),
        props: boulders(props, 14, 6, 16),
        frames: {
          count: 3,
          ms: 360,
          paint: lava(
            [
              mixRgb(numRgb(base), numRgb(main), 0.6),
              numRgb(main),
              mixRgb(numRgb(main), glowRgb, 0.5),
              glowRgb,
              light,
            ],
            24,
          ),
        },
      };
    case 'cosmos':
      return {
        ground: heavens(ground, between(main, glow, [0.1, 0.3, 0.5, 0.7, 0.9])),
        props: crystals(lit, glowRgb, 10, 30),
      };
    case 'void':
      return {
        ground: slabs(ground, 24, 16, null),
        props: both(columns(props, 8), crystals(lit, glowRgb, 6, 30)),
        frames: { count: 3, ms: 520, paint: runes(24, 16, dim, glowRgb) },
      };
    case 'lab':
      return {
        ground: panels(ground, 30, glowRgb),
        props: machines(props, glowRgb, 10),
        frames: { count: 3, ms: 160, paint: conduits(dim, glowRgb) },
      };
    case 'glacier':
      return {
        ground: snow(ground, between(base, glow, [0.15, 0.3, 0.45, 0.65, 0.9])),
        props: both(crystals(lit, glowRgb, 10, 30), boulders(props, 8, 5, 40)),
      };
    case 'ruins':
      return {
        ground: slabs(ground, 24, 16, between(base, main, [0.2, 0.3, 0.4, 0.5])),
        props: columns(props, 10),
        frames: { count: 3, ms: 520, paint: runes(24, 16, dim, glowRgb) },
      };
    case 'grove':
      return {
        ground: grass(
          ground,
          between(base, 0x5a4830, [0.3, 0.45, 0.6, 0.75]),
          [glowRgb, light],
          0.6,
          13,
        ),
        props: both(trees(props, 12, 12, null), mushrooms(four(lit), light, glowRgb, 10, 44)),
      };
    case 'lake':
      return {
        ground: water(ground, null, light),
        props: both(lilies(four(props), glowRgb, 18), reeds(four(props), glowRgb, 30)),
        frames: {
          count: 3,
          ms: 420,
          paint: crests(mixRgb(numRgb(main), numRgb(white), 0.15), light, false, 0.3),
        },
      };
    case 'sky':
      return {
        ground: heavens(ground, between(main, white, [0.1, 0.25, 0.4, 0.6, 0.8])),
        props: clouds(between(main, white, [0.2, 0.4, 0.6, 0.8, 0.95]), 12),
      };
    case 'storm':
      return {
        ground: both(
          plates(ground, 34, seam, numRgb(main)),
          puddles(four(between(base, main, [0.3, 0.45, 0.6, 0.75]))),
        ),
        props: both(boulders(props, 14, 7, 30), crystals(lit, glowRgb, 5, 26)),
        frames: { count: 3, ms: 200, paint: ripples(light) },
      };
  }
}

export interface Scene {
  readonly id: string;
  /** The ground: one texture, or the frames of its animation. */
  readonly ground: readonly Texture[];
  readonly frameMs: number;
  /** The big things on the edges of the field (transparent elsewhere). */
  readonly props: Texture;
  readonly ambient: AmbientDef;
}

/**
 * A scene being painted. Painting one costs tens of milliseconds, so it is done a step per frame
 * (`advance`) while the last scene stays on screen: a change of biome never stalls the game.
 */
export class SceneBuild {
  private readonly steps: (() => void)[] = [];
  private readonly ground: Texture[] = [];
  private props: Texture | null = null;
  private base: HTMLCanvasElement | null = null;
  private readonly def: SceneDef;
  private readonly air: AmbientDef;

  /**
   * A biome by its id; or, with `arena` (4W), the arena of a legendary, whose `id` is any key that
   * tells it apart (the species and its fury).
   */
  constructor(
    readonly id: string,
    accent: number,
    arena?: { readonly spec: ArenaSpec; readonly ambient: AmbientDef },
  ) {
    const def = arena === undefined ? SCENES[id as SceneId] : arenaSceneDef(arena.spec);
    this.def = def;
    this.air = arena === undefined ? AMBIENT[id as SceneId] : arena.ambient;
    const seed =
      arena === undefined
        ? SCENE_SEEDS.indexOf(id as SceneId) * 131 + 17
        : arena.spec.seed * 977 + 5;
    const ctx: Ctx = {
      rand: seeded(seed),
      seed,
      broad: new Float32Array(0),
      fine: new Float32Array(0),
      accent: [(accent >> 16) & 255, (accent >> 8) & 255, accent & 255],
    };
    const fields = ctx as { broad: Float32Array; fine: Float32Array };
    this.steps.push(() => {
      fields.broad = noiseField(W, H, 40, 40, 3, seed);
    });
    this.steps.push(() => {
      fields.fine = noiseField(W, H, 8, 8, 2, seed + 50);
    });
    this.steps.push(() => {
      const writer = new PixelWriter(makeCanvas(W, H));
      def.ground(writer, ctx);
      this.base = writer.done();
      if (def.frames === undefined) this.ground.push(textureOf(this.base));
    });
    const frames = def.frames;
    if (frames !== undefined) {
      for (let f = 0; f < frames.count; f++) {
        this.steps.push(() => {
          const painting = makeCanvas(W, H);
          if (this.base !== null) painting.g.drawImage(this.base, 0, 0);
          const writer = new PixelWriter(painting);
          frames.paint(writer, ctx, f);
          this.ground.push(textureOf(writer.done()));
        });
      }
    }
    this.steps.push(() => {
      const writer = new PixelWriter(makeCanvas(W, H));
      def.props(writer, ctx);
      this.props = textureOf(writer.done());
    });
  }

  /** Paints the next piece. True once the scene is whole. */
  advance(): boolean {
    this.steps.shift()?.();
    return this.steps.length === 0;
  }

  get scene(): Scene | null {
    if (this.steps.length > 0 || this.props === null) return null;
    return {
      id: this.id,
      ground: this.ground,
      frameMs: this.def.frames?.ms ?? 0,
      props: this.props,
      ambient: this.air,
    };
  }
}

const SCENE_SEEDS: readonly SceneId[] = Object.keys(SCENES) as SceneId[];
const sceneCache = new Map<string, Scene>();

/** The scene if it is already painted (a biome by its id, an arena by its key). */
export function paintedScene(id: string): Scene | undefined {
  return sceneCache.get(id);
}

export function keepScene(scene: Scene): void {
  sceneCache.set(scene.id, scene);
}
