import { Container, Sprite, type Texture, TilingSprite } from 'pixi.js';
import type { GameType, MoveShapeKind } from '../domain';
import { ART_PIXEL, FX_FRAMES, fxFor } from './pixelArt';

/**
 * The presentation of the moves and the Ultimates (4G-E), in the pixel style of the boss attacks:
 * a launch burst at the launcher, a beam / row / ring of animated pixels in the colour of the type,
 * an impact flash with a short shake of the screen, and a shower of pixel particles that is
 * different for each element (embers for fire, drops for water, leaves for grass, sparks for
 * electricity). Render only: it reads events and never touches the run. Fixed pools, no allocation
 * per frame.
 */

const BIG = 8;
const PARTS = 160;
/** How long a beam or a row stays, in milliseconds. */
const BIG_MS = 520;

type Flourish = 'fire' | 'water' | 'grass' | 'spark' | 'radial';

/** Which flourish each type of attack gets: the four initials are fire, water, grass and electric. */
function flourishOf(element: GameType): Flourish {
  switch (element) {
    case 'fire':
    case 'dragon':
      return 'fire';
    case 'water':
    case 'ice':
      return 'water';
    case 'grass':
    case 'bug':
      return 'grass';
    case 'electric':
    case 'steel':
      return 'spark';
    default:
      return 'radial';
  }
}

export class UltimateFx {
  readonly layer = new Container();
  private readonly big: TilingSprite[] = [];
  private readonly bigLife = new Float32Array(BIG);
  private readonly bigKind = new Uint8Array(BIG); // 0 beam, 1 row
  private readonly bigColor = new Uint32Array(BIG);
  private bigNext = 0;
  private readonly parts: Sprite[] = [];
  private readonly px = new Float32Array(PARTS);
  private readonly py = new Float32Array(PARTS);
  private readonly pvx = new Float32Array(PARTS);
  private readonly pvy = new Float32Array(PARTS);
  private readonly plife = new Float32Array(PARTS);
  private readonly pgrav = new Float32Array(PARTS);
  private partNext = 0;
  private readonly flash: Sprite;
  private flashLife = 0;
  private shakeLife = 0;
  private clock = 0;
  /** Offset of the screen while it shakes; the renderer adds it to the pivot of the world. */
  shakeX = 0;
  shakeY = 0;

  constructor(
    bar: Texture,
    private readonly width: number,
    private readonly height: number,
  ) {
    for (let i = 0; i < BIG; i++) {
      const sheet = new TilingSprite({
        texture: fxFor(0xffffff).beam[0] ?? bar,
        width: 1,
        height: 1,
      });
      sheet.tileScale.set(ART_PIXEL);
      sheet.visible = false;
      this.big.push(sheet);
      this.layer.addChild(sheet);
    }
    for (let i = 0; i < PARTS; i++) {
      const dot = new Sprite(fxFor(0xffffff).particle);
      dot.anchor.set(0.5);
      dot.visible = false;
      this.parts.push(dot);
      this.layer.addChild(dot);
    }
    this.flash = new Sprite(bar);
    this.flash.width = width;
    this.flash.height = height;
    this.flash.alpha = 0;
    this.flash.visible = false;
    this.layer.addChild(this.flash);
  }

  private particle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    grav: number,
    color: number,
    size: number,
  ): void {
    const i = this.partNext;
    this.partNext = (this.partNext + 1) % PARTS;
    const dot = this.parts[i];
    if (dot === undefined) return;
    this.px[i] = x;
    this.py[i] = y;
    this.pvx[i] = vx;
    this.pvy[i] = vy;
    this.pgrav[i] = grav;
    this.plife[i] = 1;
    dot.tint = color;
    dot.scale.set(size);
    dot.visible = true;
  }

  private bigAt(kind: 0 | 1, x: number, y: number, w: number, h: number, color: number): void {
    const i = this.bigNext;
    this.bigNext = (this.bigNext + 1) % BIG;
    const sheet = this.big[i];
    if (sheet === undefined) return;
    this.bigKind[i] = kind;
    this.bigLife[i] = 1;
    this.bigColor[i] = color;
    sheet.position.set(x, y);
    sheet.width = Math.max(1, w);
    sheet.height = Math.max(1, h);
    sheet.visible = true;
  }

  /** The element's shower of particles around (x, y); `count` grows with the tier. */
  private flourish(kind: Flourish, x: number, y: number, count: number, color: number): void {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + (k % 3) * 0.4;
      const speed = 1.2 + (k % 5) * 0.55;
      switch (kind) {
        case 'fire': // embers that rise and flicker out
          this.particle(
            x + Math.cos(a) * 14,
            y,
            Math.cos(a) * 0.9,
            -speed * 1.6,
            -0.02,
            k % 3 === 0 ? 0xffe27a : color,
            ART_PIXEL * 0.8,
          );
          break;
        case 'water': // drops thrown up that fall back
          this.particle(
            x,
            y,
            Math.cos(a) * speed * 1.3,
            -2.4 - (k % 4),
            0.16,
            k % 2 === 0 ? 0xdff4ff : color,
            ART_PIXEL * 0.8,
          );
          break;
        case 'grass': // leaves that spin outward and drift down
          this.particle(
            x,
            y,
            Math.cos(a) * speed * 1.5,
            Math.sin(a) * speed - 0.6,
            0.05,
            k % 2 === 0 ? 0xbff59a : color,
            ART_PIXEL,
          );
          break;
        case 'spark': // fast white-yellow sparks in straight lines
          this.particle(
            x,
            y,
            Math.cos(a) * speed * 3.2,
            Math.sin(a) * speed * 3.2,
            0,
            k % 2 === 0 ? 0xffffff : 0xfff176,
            ART_PIXEL * 0.7,
          );
          break;
        default:
          this.particle(
            x,
            y,
            Math.cos(a) * speed * 2,
            Math.sin(a) * speed * 2,
            0.02,
            k % 2 === 0 ? 0xffffff : color,
            ART_PIXEL * 0.8,
          );
      }
    }
  }

  /**
   * A move went off (`manual`: the player threw the Ultimate). The Ultimate adds the launch at the
   * launcher, a screen flash and a shake; every move gets its shape and the element's shower.
   */
  start(
    shape: MoveShapeKind,
    element: GameType,
    color: number,
    x: number,
    y: number,
    size: number,
    tier: number,
    manual: boolean,
    launcherX: number,
    launcherY: number,
  ): void {
    const fx = fxFor(color);
    const kind = flourishOf(element);
    const strong = manual ? 2 : 1;
    switch (shape) {
      case 'beam':
        this.bigAt(0, x - size / 2, 0, size, y, color);
        break;
      case 'wave':
        this.bigAt(1, 0, y - size / 2, this.width, size, color);
        break;
      case 'cross':
        this.bigAt(0, x - size / 2, 0, size, this.height, color);
        this.bigAt(1, 0, y - size / 2, this.width, size, color);
        break;
      case 'burst':
      case 'nova': {
        // A ring of orbs that spreads to the radius of the move.
        const n = 18 + tier * 4;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          this.particle(
            x,
            y,
            (Math.cos(a) * size) / 22,
            (Math.sin(a) * size) / 22,
            0,
            color,
            ART_PIXEL * 1.4,
          );
        }
        break;
      }
      case 'chain':
        for (let k = 0; k < 8; k++) {
          const a = k * 0.8;
          this.particle(x, y, Math.cos(a) * 3, Math.sin(a) * 3, 0, 0xfff176, ART_PIXEL);
        }
        break;
    }
    void fx;
    this.flourish(kind, x, y, 8 + tier * 4 * strong, color);
    if (manual) {
      // The launch: a column of charge sparks up from the launcher, a flash and a shake.
      for (let k = 0; k < 14; k++) {
        this.particle(
          launcherX + ((k % 5) - 2) * 6,
          launcherY - 8,
          0,
          -4 - (k % 6),
          0.02,
          k % 2 === 0 ? 0xffffff : color,
          ART_PIXEL * 0.9,
        );
      }
      this.flash.tint = color;
      this.flashLife = 1;
      this.shakeLife = 1;
    }
  }

  /** Advances every effect by `ms` and draws the frame of each (the beams animate by life). */
  update(ms: number): void {
    this.clock += ms;
    const step = ms / 16.67;
    const decay = ms / BIG_MS;
    for (let i = 0; i < BIG; i++) {
      const life = this.bigLife[i] ?? 0;
      const sheet = this.big[i];
      if (life <= 0 || sheet === undefined) continue;
      const next = life - decay;
      if (next <= 0) {
        this.bigLife[i] = 0;
        sheet.visible = false;
        continue;
      }
      this.bigLife[i] = next;
      const fx = fxFor(this.bigColor[i] ?? 0xffffff);
      const frame = Math.floor(this.clock / 70) % FX_FRAMES;
      if (this.bigKind[i] === 0) {
        sheet.texture = fx.beam[frame] ?? sheet.texture;
        sheet.tilePosition.set(sheet.width / 2 - 6 * ART_PIXEL, -this.clock * 0.4);
      } else {
        sheet.texture = fx.patch[frame] ?? sheet.texture;
        sheet.tilePosition.set(-this.clock * 0.3, 0);
      }
      // Quick in, slow out: a beam is solid at first and thins out.
      sheet.alpha = Math.min(1, next * 2.2) * 0.92;
    }
    for (let i = 0; i < PARTS; i++) {
      const life = this.plife[i] ?? 0;
      const dot = this.parts[i];
      if (life <= 0 || dot === undefined) continue;
      const next = life - ms / 700;
      if (next <= 0) {
        this.plife[i] = 0;
        dot.visible = false;
        continue;
      }
      this.plife[i] = next;
      this.pvy[i] = (this.pvy[i] ?? 0) + (this.pgrav[i] ?? 0) * step;
      this.px[i] = (this.px[i] ?? 0) + (this.pvx[i] ?? 0) * step;
      this.py[i] = (this.py[i] ?? 0) + (this.pvy[i] ?? 0) * step;
      // Whole art pixels only, so the particles keep the pixel grid.
      dot.position.set(
        Math.round((this.px[i] ?? 0) / 2) * 2,
        Math.round((this.py[i] ?? 0) / 2) * 2,
      );
      dot.alpha = Math.min(1, next * 2);
    }
    if (this.flashLife > 0) {
      this.flashLife = Math.max(0, this.flashLife - ms / 220);
      this.flash.visible = this.flashLife > 0;
      this.flash.alpha = this.flashLife * 0.38;
    }
    if (this.shakeLife > 0) {
      this.shakeLife = Math.max(0, this.shakeLife - ms / 260);
      const power = Math.ceil(this.shakeLife * 5);
      const phase = Math.floor(this.clock / 33) % 2 === 0 ? 1 : -1;
      this.shakeX = phase * power;
      this.shakeY = -phase * Math.ceil(power / 2);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }
}
