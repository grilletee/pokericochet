/**
 * The look of a boss attack by type (4G-H, 15th playtest: "visualmente todos los ataques acaban
 * siendo iguales"). The danger language does not change (the same hatched zone that fills like a
 * countdown, the same strip on the floor); what changes is what STRIKES: fire is a pillar of
 * flames that rises, water a curtain of falling water with crests of foam, rock and ground a shower
 * of rocks, ghost and dark shadows with eyes, electric a lightning bolt that flickers, grass a vine
 * that climbs, ice a fall of icicles, poison toxic bubbles, psychic rings that rise, and so on.
 *
 * Each look is a tile of 12 x 24 art pixels (four frames) that the render repeats along the band and
 * scrolls by `scroll` pixels per tick (negative: upwards). The pixels are built by a pure function
 * (`strikeRows`, palette codes: d edge, b body, l light, w white core, k shadow, . empty), so a test
 * can check that every type has its own; the textures are made once per type and colour, in
 * `bossTextures` (this file is pure and has no pixi). Original pixel art drawn by code. Render only.
 */

export type StrikeMotif =
  | 'flame'
  | 'water'
  | 'rocks'
  | 'shadow'
  | 'bolt'
  | 'vine'
  | 'icicles'
  | 'bubbles'
  | 'rings'
  | 'fists'
  | 'blades'
  | 'shards'
  | 'swarm'
  | 'sparkles'
  | 'shock';

export const STRIKE_W = 12;
export const STRIKE_H = 24;
export const STRIKE_FRAMES = 4;

/** Which look each type has and how it moves (pixels of the tile per tick, negative = up). */
const MOTIF_OF: Readonly<Record<string, { motif: StrikeMotif; scroll: number }>> = {
  fire: { motif: 'flame', scroll: -7 },
  dragon: { motif: 'flame', scroll: -9 },
  water: { motif: 'water', scroll: 8 },
  rock: { motif: 'rocks', scroll: 10 },
  ground: { motif: 'rocks', scroll: 7 },
  ghost: { motif: 'shadow', scroll: -2 },
  dark: { motif: 'shadow', scroll: -3 },
  electric: { motif: 'bolt', scroll: 0 },
  grass: { motif: 'vine', scroll: -4 },
  ice: { motif: 'icicles', scroll: 9 },
  poison: { motif: 'bubbles', scroll: -3 },
  psychic: { motif: 'rings', scroll: -5 },
  fighting: { motif: 'fists', scroll: 11 },
  flying: { motif: 'blades', scroll: 9 },
  steel: { motif: 'shards', scroll: 10 },
  bug: { motif: 'swarm', scroll: 3 },
  fairy: { motif: 'sparkles', scroll: 2 },
  normal: { motif: 'shock', scroll: 6 },
};

/** The look of a type (normal's shockwave for anything unknown). */
export function strikeLook(typeName: string): { motif: StrikeMotif; scroll: number } {
  return MOTIF_OF[typeName] ?? { motif: 'shock', scroll: 6 };
}

type Grid = string[][];

function blank(): Grid {
  return Array.from({ length: STRIKE_H }, () => Array.from({ length: STRIKE_W }, () => '.'));
}

function put(grid: Grid, x: number, y: number, code: string): void {
  const yy = ((y % STRIKE_H) + STRIKE_H) % STRIKE_H; // the tile wraps vertically
  const row = grid[yy];
  if (row === undefined || x < 0 || x >= STRIKE_W) return;
  row[x] = code;
}

/** A filled blob of `rows` (same codes) stamped at x, y, wrapping in y. */
function stampRows(grid: Grid, rows: readonly string[], x: number, y: number): void {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const code = row[dx] ?? '.';
      if (code !== '.') put(grid, x + dx, y + dy, code);
    }
  });
}

const ROCK = ['.ddd.', 'dbbld', 'dblbd', 'dbbbd', '.ddd.'];
const PEBBLE = ['.dd.', 'dbld', '.dd.'];
const ICICLE = ['dllld', 'dlwld', '.dld.', '.dld.', '..d..'];
const FIST = ['.dddd.', 'dbblbd', 'dbbbbd', 'dddddd', '.dbbd.'];
const SHARD = ['..d..', '.dld.', 'dlwld', '.dbd.', '..d..'];
const EYES = ['w.w'];
const STAR = ['..w..', '.wlw.', 'wlwlw', '.wlw.', '..w..'];

/** The pixels of one frame of a look: STRIKE_H rows of STRIKE_W palette codes. Pure. */
export function strikeRows(motif: StrikeMotif, frame: number): readonly string[] {
  const g = blank();
  const f = ((frame % STRIKE_FRAMES) + STRIKE_FRAMES) % STRIKE_FRAMES;
  switch (motif) {
    case 'flame': {
      // Tongues of fire: the width breathes along the column; a white core, a dark ragged edge.
      for (let y = 0; y < STRIKE_H; y++) {
        const wave = Math.sin((y + f * 3) * 0.55) + 0.6 * Math.sin((y * 2 + f * 5) * 0.37);
        const half = Math.max(2, Math.min(6, 4 + Math.round(wave * 1.6)));
        for (let x = 6 - half; x < 6 + half; x++) {
          const edge = x === 6 - half || x === 5 + half;
          const inner = Math.abs(x - 5.5);
          put(g, x, y, edge ? 'd' : inner < 1 ? 'w' : inner < half * 0.55 ? 'l' : 'b');
        }
        // Embers that leave the flame.
        if ((y * 7 + f * 3) % 11 === 0) put(g, (y * 5 + f) % 12, y, 'l');
      }
      break;
    }
    case 'water': {
      // A curtain of falling water: streaks of body and light, and a crest of white foam every 12 rows.
      for (let y = 0; y < STRIKE_H; y++) {
        for (let x = 1; x < STRIKE_W - 1; x++) {
          const streak = (x * 3 + y + f) % 5 === 0;
          put(g, x, y, streak ? 'l' : 'b');
        }
        put(g, 0, y, 'd');
        put(g, STRIKE_W - 1, y, 'd');
      }
      for (const top of [2, 14]) {
        for (let x = 0; x < STRIKE_W; x++) {
          const curl = Math.round(1.5 * Math.sin((x + f * 2) * 0.9));
          put(g, x, top + curl, 'w');
          put(g, x, top + curl + 1, 'l');
        }
      }
      break;
    }
    case 'rocks': {
      // A shower of rocks and pebbles, no band behind: it reads as things falling.
      stampRows(g, ROCK, 1 + (f % 2), 1);
      stampRows(g, PEBBLE, 7, 6 + f);
      stampRows(g, ROCK, 6 - (f % 2), 13);
      stampRows(g, PEBBLE, 1, 19);
      put(g, 4, 10 + f, 'd');
      put(g, 10, 21 - f, 'd');
      break;
    }
    case 'shadow': {
      // Dark wisps (k) that sway, and a pair of eyes that opens and closes.
      for (let y = 0; y < STRIKE_H; y++) {
        const sway = Math.round(2 * Math.sin((y + f * 2) * 0.4));
        const half = 3 + ((y + f) % 7 === 0 ? 1 : 0);
        for (let x = 6 - half + sway; x < 6 + half + sway; x++) {
          put(g, x, y, (x + y) % 3 === 0 ? 'd' : 'k');
        }
      }
      if (f !== 3) stampRows(g, EYES, 4 + Math.round(2 * Math.sin(f)), 6);
      if (f !== 1) stampRows(g, EYES, 5 - Math.round(2 * Math.sin(f)), 17);
      break;
    }
    case 'bolt': {
      // A zigzag bolt that takes a new path every frame (it flickers instead of scrolling).
      let x = 3 + f * 2;
      for (let y = 0; y < STRIKE_H; y++) {
        const step = ((y * 7 + f * 13) % 5) - 2;
        x = Math.max(2, Math.min(9, x + (step > 0 ? 1 : step < 0 ? -1 : 0)));
        put(g, x - 1, y, 'l');
        put(g, x, y, 'w');
        put(g, x + 1, y, 'w');
        put(g, x + 2, y, 'l');
        if ((y + f) % 6 === 0) put(g, x + 3, y, 'b');
        if ((y + f) % 8 === 0) put(g, x - 2, y, 'b');
      }
      break;
    }
    case 'vine': {
      // Two vines that twist round each other, with leaves.
      for (let y = 0; y < STRIKE_H; y++) {
        const a = Math.round(5.5 + 3 * Math.sin((y + f * 3) * 0.26));
        const b = Math.round(5.5 - 3 * Math.sin((y + f * 3) * 0.26));
        put(g, a, y, 'd');
        put(g, a + 1, y, 'b');
        put(g, b, y, 'b');
        put(g, b + 1, y, 'd');
        if (y % 6 === f % 6) {
          put(g, a + 2, y, 'l');
          put(g, a + 3, y, 'l');
          put(g, a + 2, y - 1, 'l');
        }
      }
      break;
    }
    case 'icicles': {
      stampRows(g, ICICLE, 1, 1 + f);
      stampRows(g, ICICLE, 7, 9 - f);
      stampRows(g, ICICLE, 3, 16);
      put(g, 10, 4 + f * 2, 'w');
      put(g, 1, 13 + f, 'w');
      break;
    }
    case 'bubbles': {
      // Sludge with bubbles of every size rising through it.
      for (let y = 0; y < STRIKE_H; y++) {
        for (let x = 2; x < STRIKE_W - 2; x++) put(g, x, y, (x + y * 2) % 7 === 0 ? 'd' : 'b');
      }
      const ring = (cx: number, cy: number, r: number): void => {
        for (let a = 0; a < 12; a++) {
          put(
            g,
            Math.round(cx + r * Math.cos(a / 1.9)),
            Math.round(cy + r * Math.sin(a / 1.9)),
            'l',
          );
        }
        put(g, cx - 1, cy - 1, 'w');
      };
      ring(4, 4 - f, 2);
      ring(8, 13 - f, 3);
      ring(5, 20 - f, 1);
      break;
    }
    case 'rings': {
      // Psychic waves: arcs that rise and grow, a white rim on each.
      for (const base of [0, 8, 16]) {
        const y0 = base + f * 2;
        for (let x = 0; x < STRIKE_W; x++) {
          const dip = Math.round(((x - 5.5) * (x - 5.5)) / 9);
          put(g, x, y0 + dip, 'w');
          put(g, x, y0 + dip + 1, 'l');
          put(g, x, y0 + dip + 2, 'b');
        }
      }
      break;
    }
    case 'fists': {
      // Blows that come down one after the other, with the lines of the impact.
      stampRows(g, FIST, 3, 2 + f);
      stampRows(g, FIST, 3, 14 + f);
      for (let y = 0; y < STRIKE_H; y += 3) {
        put(g, 1, y + f, 'l');
        put(g, 10, y + 1 + f, 'l');
      }
      break;
    }
    case 'blades': {
      // Wind blades: thin diagonal slashes.
      for (const y0 of [1, 9, 17]) {
        for (let k = 0; k < 8; k++) {
          put(g, 2 + k, y0 + k / 2 + f, k % 3 === 0 ? 'w' : 'l');
          put(g, 2 + k, y0 + k / 2 + 1 + f, 'b');
        }
      }
      break;
    }
    case 'shards': {
      stampRows(g, SHARD, 1 + f, 2);
      stampRows(g, SHARD, 6, 9 + f);
      stampRows(g, SHARD, 2, 17);
      put(g, 9, 1 + f * 3, 'w');
      break;
    }
    case 'swarm': {
      // A swarm: small dark bodies with a light wing, each on its own jittering path.
      for (let k = 0; k < 9; k++) {
        const x = (k * 5 + f * (k % 3) + 1) % 11;
        const y = (k * 7 + f * 2) % STRIKE_H;
        put(g, x, y, 'd');
        put(g, x + 1, y, 'b');
        put(g, x, y - 1, 'l');
      }
      break;
    }
    case 'sparkles': {
      // Twinkling stars of four points that grow and shrink.
      stampRows(g, f % 2 === 0 ? STAR : ['.w.', 'wlw', '.w.'], 1, 2);
      stampRows(g, f % 2 === 1 ? STAR : ['.w.', 'wlw', '.w.'], 6, 11);
      stampRows(g, f % 2 === 0 ? ['.w.', 'wlw', '.w.'] : STAR, 3, 18);
      put(g, 10, 6 + f, 'l');
      break;
    }
    case 'shock': {
      // A plain shockwave: thick bars that pulse.
      for (let y = 0; y < STRIKE_H; y++) {
        const on = (y + f * 2) % 6 < 3;
        for (let x = 1; x < STRIKE_W - 1; x++) put(g, x, y, on ? (x % 5 === 0 ? 'w' : 'l') : 'b');
        put(g, 0, y, 'd');
        put(g, STRIKE_W - 1, y, 'd');
      }
      break;
    }
  }
  return g.map((row) => row.join(''));
}
