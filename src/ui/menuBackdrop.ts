/**
 * The animated background of the title and the menus (4G-I, 16th playtest: "el inicio es muy
 * feo"): a night sky of twinkling pixel stars, two layers of hills that drift, and glass spheres in
 * the colours of the types that bounce across it like the balls of the game. All drawn by code on a
 * small canvas scaled up without smoothing (pixel art); original, no franchise art. It runs only
 * while it is shown. The positions are a pure function of time (`backdropFrame`), so it can be tested.
 */

/** Art pixels of the canvas (scaled up to the screen). */
export const BACKDROP_W = 160;
export const BACKDROP_H = 100;

const SPHERE_COLORS = ['#f08030', '#6890f0', '#78c850', '#f8d030', '#a040a0', '#f85888', '#98d8d8'];

export interface BackdropSphere {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly color: string;
}

/** Where the spheres are at `ms`: each bounces on its own between the walls and the hills. Pure. */
export function backdropFrame(ms: number): readonly BackdropSphere[] {
  const out: BackdropSphere[] = [];
  for (let i = 0; i < SPHERE_COLORS.length; i++) {
    const r = 3 + (i % 3);
    const speedX = 0.012 + i * 0.003;
    const span = BACKDROP_W - 2 * r;
    // A triangle wave: from wall to wall and back.
    const tx = ((ms * speedX + i * 37) % (2 * span)) / span;
    const x = r + (tx < 1 ? tx : 2 - tx) * span;
    // A bounce: |sin| over the floor of the hills.
    const floor = BACKDROP_H - 18 - r;
    const height = 30 + (i % 4) * 8;
    const y = floor - Math.abs(Math.sin(ms / (420 + i * 60) + i)) * height;
    out.push({ x, y, r, color: SPHERE_COLORS[i] ?? '#ffffff' });
  }
  return out;
}

/** A small generator so the stars are always the same. */
function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class MenuBackdrop {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D | null;
  private raf = 0;
  private readonly stars: { x: number; y: number; p: number }[] = [];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = BACKDROP_W;
    this.canvas.height = BACKDROP_H;
    this.canvas.dataset.menuBackdrop = '';
    this.canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;' +
      'pointer-events:none;z-index:0;object-fit:cover;';
    this.g = this.canvas.getContext('2d');
    const r = rand(7);
    for (let i = 0; i < 70; i++) this.stars.push({ x: r() * BACKDROP_W, y: r() * 60, p: r() * 6 });
  }

  start(): void {
    if (this.raf !== 0 || typeof requestAnimationFrame !== 'function') return;
    const loop = (ms: number): void => {
      this.draw(ms);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf !== 0 && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private draw(ms: number): void {
    const g = this.g;
    if (g === null) return;
    // The sky: bands from deep blue to violet.
    const bands = ['#0b0e24', '#11143a', '#1a1a4a', '#26205a', '#33266a'];
    bands.forEach((color, i) => {
      g.fillStyle = color;
      g.fillRect(0, (i * BACKDROP_H) / bands.length, BACKDROP_W, BACKDROP_H / bands.length + 1);
    });
    for (const s of this.stars) {
      const on = Math.sin(ms / 500 + s.p) > -0.3;
      g.fillStyle = on ? '#fff7e0' : '#5a5a90';
      g.fillRect(s.x | 0, s.y | 0, 1, 1);
    }
    // Two layers of hills that drift at two speeds.
    this.hills(g, ms * 0.004, 22, '#1d2a52', 9);
    this.hills(g, ms * 0.009, 14, '#14203e', 5);
    for (const s of backdropFrame(ms)) this.sphere(g, s);
  }

  private hills(
    g: CanvasRenderingContext2D,
    shift: number,
    height: number,
    color: string,
    bump: number,
  ): void {
    g.fillStyle = color;
    for (let x = 0; x < BACKDROP_W; x++) {
      const h =
        height +
        Math.round(bump * Math.sin((x + shift) / 13) + (bump / 2) * Math.sin((x + shift) / 5));
      g.fillRect(x, BACKDROP_H - h, 1, h);
    }
  }

  private sphere(g: CanvasRenderingContext2D, s: BackdropSphere): void {
    const cx = s.x | 0;
    const cy = s.y | 0;
    for (let dy = -s.r; dy <= s.r; dy++) {
      for (let dx = -s.r; dx <= s.r; dx++) {
        const d = dx * dx + dy * dy;
        if (d > s.r * s.r) continue;
        g.fillStyle = d > (s.r - 1) * (s.r - 1) ? '#0b0e16' : s.color;
        g.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
    g.fillStyle = '#ffffff';
    g.fillRect(cx - 1, cy - s.r + 1, 1, 1);
  }
}
