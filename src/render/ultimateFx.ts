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
const PARTS = 320;
/** How long a beam or a row stays, in milliseconds. */
const BIG_MS = 520;

type Flourish = 'fire' | 'water' | 'grass' | 'spark' | 'radial';
const ELEMENT_CODE: Record<Flourish, number> = { radial: 0, fire: 1, water: 2, grass: 3, spark: 4 };

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
  /** How long each particle lives, in ms (lightning is quick, embers slow). */
  private readonly plifeMs = new Float32Array(PARTS);
  /** Full width of a row (it grows from the left over the first part of its life) and its element. */
  private readonly bigFull = new Float32Array(BIG);
  private readonly bigElem = new Uint8Array(BIG);
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
    lifeMs = 700,
  ): void {
    const i = this.partNext;
    this.partNext = (this.partNext + 1) % PARTS;
    const dot = this.parts[i];
    if (dot === undefined) return;
    this.plifeMs[i] = lifeMs;
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

  private bigAt(
    kind: 0 | 1,
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    element: Flourish = 'radial',
  ): void {
    const i = this.bigNext;
    this.bigNext = (this.bigNext + 1) % BIG;
    const sheet = this.big[i];
    if (sheet === undefined) return;
    this.bigKind[i] = kind;
    this.bigLife[i] = 1;
    this.bigColor[i] = color;
    this.bigFull[i] = w;
    this.bigElem[i] = ELEMENT_CODE[element];
    sheet.position.set(x, y);
    // A row sweeps in from the left (a wave); a beam is there at once.
    sheet.width = Math.max(1, kind === 1 ? 1 : w);
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
    // A thrown Ultimate (not one that goes off by itself) is bigger than the move it comes from, and
    // a streak of the element joins the launcher with the target so it is seen where it goes.
    const boost = manual ? 1.6 : 1;
    if (manual && shape !== 'cross') {
      const dx = x - launcherX;
      const dy = y - launcherY;
      for (let k = 0; k <= 22; k++) {
        const t = k / 22;
        this.particle(
          launcherX + dx * t + Math.sin(k * 1.7) * 5,
          launcherY + dy * t,
          0,
          0,
          0,
          k % 2 === 0 ? 0xffffff : color,
          ART_PIXEL * 1.3,
          380,
        );
      }
      this.bigAt(0, launcherX - 10, y, 20, Math.max(0, launcherY - y), color, kind);
    }
    switch (shape) {
      case 'beam':
        this.bigAt(0, x - (size * boost) / 2, 0, size * boost, y, color, kind);
        break;
      case 'wave':
        this.bigAt(1, 0, y - (size * boost) / 2, this.width, size * boost, color, kind);
        break;
      case 'cross':
        this.bigAt(0, x - size / 2, 0, size, this.height, color, kind);
        this.bigAt(1, 0, y - size / 2, this.width, size, color, kind);
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
        // A thrown electric Ultimate: a star of bolts from the target.
        if (manual) {
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2 + 0.3;
            this.bolt(x, y, x + Math.cos(a) * 120, y + Math.sin(a) * 120);
          }
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

  /**
   * A bolt of lightning from one enemy to the next (an electric chain): a jagged line of bright
   * pixels that is gone in a blink, with a flash of sparks where it lands.
   */
  bolt(x0: number, y0: number, x1: number, y1: number): void {
    const n = 9;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const nx = -dy / len;
    const ny = dx / len;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const jag = k === 0 || k === n ? 0 : (k % 2 === 0 ? 1 : -1) * (6 + (k % 3) * 3);
      const x = x0 + dx * t + nx * jag;
      const y = y0 + dy * t + ny * jag;
      this.particle(x, y, 0, 0, 0, k % 2 === 0 ? 0xffffff : 0xfff176, ART_PIXEL * 1.1, 220);
      // The pixels between the knots, so the line is continuous.
      if (k < n) {
        const t2 = (k + 0.5) / n;
        this.particle(x0 + dx * t2, y0 + dy * t2, 0, 0, 0, 0xfff176, ART_PIXEL * 0.8, 220);
      }
    }
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3;
      this.particle(
        x1,
        y1,
        Math.cos(a) * 2.5,
        Math.sin(a) * 2.5,
        0,
        0xffffff,
        ART_PIXEL * 0.8,
        300,
      );
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
      const elem = this.bigElem[i] ?? 0;
      if (this.bigKind[i] === 1) {
        // A row sweeps across the field in the first 40 % of its life, throwing spray at its head.
        const grown = Math.min(1, (1 - next) / 0.4);
        const full = this.bigFull[i] ?? this.width;
        sheet.width = Math.max(1, full * grown);
        if (grown < 1) {
          const headX = sheet.x + sheet.width;
          const mid = sheet.y + sheet.height / 2;
          for (let k = 0; k < 2; k++) {
            this.particle(
              headX,
              mid + (k - 0.5) * sheet.height * 0.7,
              1.5 + k,
              -2 - k * 1.5,
              elem === 2 ? 0.18 : 0.05,
              k === 0 ? 0xffffff : (this.bigColor[i] ?? 0xffffff),
              ART_PIXEL,
              500,
            );
          }
        }
      } else {
        // A beam sheds the matter of its element along its length: embers, leaves in a spiral,
        // sparks or drops, a few per frame.
        const cx = sheet.x + sheet.width / 2;
        const y = sheet.y + ((this.clock * 0.9 + i * 53) % Math.max(40, sheet.height));
        const spin = Math.sin(this.clock / 90 + i) * sheet.width * 0.8;
        if (elem === 3) {
          this.particle(
            cx + spin,
            y,
            Math.cos(this.clock / 90) * 1.2,
            1.2,
            0,
            0xbff59a,
            ART_PIXEL,
            600,
          );
        } else if (elem === 1) {
          this.particle(cx + spin * 0.6, y, 0, -2, -0.02, 0xffe27a, ART_PIXEL * 0.8, 600);
        } else if (elem === 4) {
          this.particle(
            cx + spin,
            y,
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,
            0,
            0xffffff,
            ART_PIXEL * 0.8,
            260,
          );
        } else if (elem === 2) {
          this.particle(cx + spin, y, spin * 0.05, -2.5, 0.2, 0xdff4ff, ART_PIXEL * 0.8, 600);
        }
      }
    }
    for (let i = 0; i < PARTS; i++) {
      const life = this.plife[i] ?? 0;
      const dot = this.parts[i];
      if (life <= 0 || dot === undefined) continue;
      const next = life - ms / (this.plifeMs[i] ?? 700);
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
