import { Container, Sprite, Texture } from 'pixi.js';

/**
 * The death of a boss (4G-H, 15th playtest: "al morir, una animación de muerte completa y DESPUÉS el
 * resumen"). The boss does not just vanish: it stays where it died, shakes harder and harder while
 * it flashes between white and the colour of its type and throws sparks, swells into white, and
 * bursts in a flash of the whole screen and a shower of pieces that fall. The final boss gets the
 * whole sequence (`FINAL_DEATH_MS`); a boss between waves a short one. The app waits for it before it
 * shows the summary. Render only: it never touches the run.
 */

/** How long the death of the final boss lasts, until its flash has faded (ms). */
export const FINAL_DEATH_MS = 3400;
/** The death of a boss between waves, the same sequence faster. */
export const MID_DEATH_MS = 1400;

const PIECES = 48;

/** A small generator, so the same death looks the same (screenshots, tests). */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export class BossDeathFx {
  /** The dying body and its pieces, in arena coordinates: add it to the world container. */
  readonly layer = new Container();
  /** The white flash of the burst over the whole screen: add it to the stage. */
  readonly flash = new Sprite(Texture.WHITE);
  shakeX = 0;
  shakeY = 0;
  private readonly body = new Sprite(Texture.EMPTY);
  private readonly halo: Sprite;
  private readonly sprites: Sprite[] = [];
  private readonly pieces: Piece[] = [];
  private t = 0;
  private total = 0;
  private x = 0;
  private y = 0;
  private radius = 0;
  private scale = 1;
  private color = 0xffffff;
  private burst = false;
  private random = lcg(1);
  private sparkClock = 0;

  constructor(ring: Texture) {
    this.body.anchor.set(0.5);
    this.halo = new Sprite(ring);
    this.halo.anchor.set(0.5);
    this.layer.addChild(this.halo, this.body);
    for (let i = 0; i < PIECES; i++) {
      const s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5);
      s.visible = false;
      this.sprites.push(s);
      this.pieces.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
      this.layer.addChild(s);
    }
    this.flash.alpha = 0;
    this.flash.visible = false;
    this.layer.visible = false;
  }

  /** True while a death is being played. */
  get active(): boolean {
    return this.t < this.total;
  }

  /**
   * A boss died at (x, y) with this body (`texture`, drawn at `scale`) and the colour of its type.
   * `final` plays the whole sequence.
   */
  start(
    x: number,
    y: number,
    radius: number,
    texture: Texture,
    scale: number,
    color: number,
    final: boolean,
  ): void {
    this.t = 0;
    this.total = final ? FINAL_DEATH_MS : MID_DEATH_MS;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.scale = scale;
    this.color = color;
    this.burst = false;
    this.sparkClock = 0;
    this.random = lcg((x * 31 + y * 17 + radius) | 0);
    this.body.texture = texture;
    this.body.visible = true;
    this.body.alpha = 1;
    this.layer.visible = true;
    for (const s of this.sprites) s.visible = false;
    for (const p of this.pieces) p.life = 0;
  }

  private throwPiece(fromX: number, fromY: number, speed: number, up: number): void {
    const free = this.pieces.findIndex((p) => p.life <= 0);
    if (free < 0) return;
    const p = this.pieces[free] as Piece;
    const angle = this.random() * Math.PI * 2;
    const v = speed * (0.4 + this.random() * 0.8);
    p.x = fromX;
    p.y = fromY;
    p.vx = Math.cos(angle) * v;
    p.vy = Math.sin(angle) * v - up;
    p.life = 1;
    const s = this.sprites[free];
    if (s === undefined) return;
    s.tint = this.random() < 0.5 ? this.color : 0xffffff;
    const size = 4 + Math.floor(this.random() * 3) * 4;
    s.width = size;
    s.height = size;
    s.visible = true;
  }

  /** Advances the death `ms` and sizes the flash to the screen. */
  update(ms: number, screenW: number, screenH: number): void {
    this.flash.width = screenW;
    this.flash.height = screenH;
    if (!this.layer.visible) return;
    this.t += ms;
    const k = this.total / FINAL_DEATH_MS; // the short death is the same, faster
    const shakeEnd = 1800 * k;
    const swellEnd = 2300 * k;
    if (this.t < shakeEnd) {
      // 1. It shakes harder and harder and flashes faster and faster, throwing sparks.
      const p = this.t / shakeEnd;
      const amp = 2 + 10 * p;
      this.body.x = this.x + (this.random() * 2 - 1) * amp;
      this.body.y = this.y + (this.random() * 2 - 1) * amp * 0.6;
      this.body.scale.set(this.scale);
      const period = 200 - 150 * p;
      this.body.tint = Math.floor(this.t / period) % 2 === 0 ? 0xffffff : this.color;
      this.halo.visible = true;
      this.halo.tint = this.color;
      this.halo.position.set(this.x, this.y);
      this.halo.scale.set((this.radius * (1.2 + 0.3 * Math.sin(this.t / 60))) / 30);
      this.halo.alpha = 0.4 + 0.5 * p;
      this.sparkClock += ms;
      while (this.sparkClock > 110) {
        this.sparkClock -= 110;
        const a = this.random() * Math.PI * 2;
        this.throwPiece(
          this.x + Math.cos(a) * this.radius * 0.6,
          this.y + Math.sin(a) * this.radius * 0.6,
          3,
          1,
        );
      }
      this.shakeX = (this.random() * 2 - 1) * amp * 0.4;
      this.shakeY = (this.random() * 2 - 1) * amp * 0.4;
    } else if (this.t < swellEnd) {
      // 2. It swells and turns white, a ring opens round it.
      const p = (this.t - shakeEnd) / (swellEnd - shakeEnd);
      this.body.position.set(this.x, this.y);
      this.body.scale.set(this.scale * (1 + 0.35 * p));
      this.body.tint = 0xffffff;
      this.body.alpha = 1;
      this.halo.tint = 0xffffff;
      this.halo.scale.set((this.radius * (1.3 + 2.5 * p)) / 30);
      this.halo.alpha = 1 - p * 0.5;
      this.shakeX = (this.random() * 2 - 1) * 6;
      this.shakeY = (this.random() * 2 - 1) * 6;
    } else {
      // 3. The burst: a white flash over everything, a shower of pieces, and it is gone.
      if (!this.burst) {
        this.burst = true;
        this.body.visible = false;
        this.halo.visible = false;
        for (let i = 0; i < PIECES; i++) this.throwPiece(this.x, this.y, 9, 3);
        this.flash.visible = true;
      }
      const p = Math.min(1, (this.t - swellEnd) / Math.max(1, this.total - swellEnd));
      this.flash.alpha = (1 - p) * (1 - p) * 0.9;
      this.flash.visible = this.flash.alpha > 0.01;
      this.shakeX = (1 - p) * (this.random() * 2 - 1) * 8;
      this.shakeY = (1 - p) * (this.random() * 2 - 1) * 8;
    }
    // The pieces fly and fall.
    const dt = ms / 16.67;
    for (let i = 0; i < PIECES; i++) {
      const piece = this.pieces[i] as Piece;
      const s = this.sprites[i];
      if (s === undefined || piece.life <= 0) {
        if (s !== undefined) s.visible = false;
        continue;
      }
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.vy += 0.25 * dt;
      piece.life -= ms / 1300;
      s.position.set(piece.x, piece.y);
      s.alpha = Math.max(0, piece.life);
    }
    if (this.t >= this.total) {
      this.layer.visible = false;
      this.flash.visible = false;
      this.flash.alpha = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      for (const s of this.sprites) s.visible = false;
    }
  }
}
