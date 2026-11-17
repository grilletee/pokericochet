import { Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js';
import {
  digitsOf,
  NUMBER_CAP,
  NUMBER_JOIN_MS,
  NUMBER_LIFE_MS,
  numberAlpha,
  numberLook,
  numberPop,
  numberRise,
  showsNumber,
} from './feelRules';
import { BLANK, fxAtlas, GLYPH_H, GLYPH_W } from './fxAtlas';
import { FIELD_PIXEL } from './paint';
import { liveParticles, PARTICLE_DYNAMIC } from './particles';
import type { ParticleShape } from './sceneIds';
import { TYPE_SHAPES } from './shapes';

/**
 * The feel of the hits on the field (4V, block 1; art bible §6): sparks with the shape of the type
 * of the ball, damage numbers in the game's own bitmap digits that pop, rise and join when the
 * hits come fast, and the death of an enemy (its silhouette in white swells and breaks into pixels
 * of its type, with a puff of smoke). Render only: it reads events.
 *
 * Everything small is a particle of PixiJS (one texture source, `fxAtlas`; one draw call per
 * layer; no scene-graph node per particle), in fixed pools: what is not alive waits off the field.
 * Nothing is allocated and no visibility changes per frame.
 */

const PARTS = 280;
const PUFFS = 12;
const DIGITS = 4;
/** Where a particle that is not in use waits: far off the field. */
const OFF = -9999;

const DYNAMIC = PARTICLE_DYNAMIC;

interface NumberSlot {
  readonly glyphs: Particle[];
  life: number;
  age: number;
  x: number;
  y: number;
  drift: number;
  enemy: number;
  value: number;
  scale: number;
  count: number;
}

export class FieldFx {
  /** Sparks, pixels and glows: over the enemies. */
  readonly layer = new Container();
  /** The white silhouettes of what dies: goes right over the enemies (it shares their pictures). */
  readonly puffLayer = new Container();
  /** The damage numbers: over everything that plays. */
  readonly numbers = new ParticleContainer({ dynamicProperties: DYNAMIC });
  private readonly atlas = fxAtlas();
  private readonly sparks = new ParticleContainer({ dynamicProperties: DYNAMIC });
  private readonly lights = new ParticleContainer({ dynamicProperties: DYNAMIC });
  private readonly parts: Particle[] = [];
  /** The glyphs of all the numbers, in the order of their slots. */
  private readonly glyphPool: Particle[] = [];
  private readonly px = new Float32Array(PARTS);
  private readonly py = new Float32Array(PARTS);
  private readonly pvx = new Float32Array(PARTS);
  private readonly pvy = new Float32Array(PARTS);
  private readonly pgrav = new Float32Array(PARTS);
  private readonly plife = new Float32Array(PARTS);
  private readonly pms = new Float32Array(PARTS);
  private partNext = 0;
  private readonly puffs: Sprite[] = [];
  private readonly puffLife = new Float32Array(PUFFS);
  private readonly puffScale = new Float32Array(PUFFS);
  private puffNext = 0;
  private glowNext = 0;
  private readonly glows: Particle[] = [];
  private readonly glowLife = new Float32Array(PUFFS);
  private readonly glowSize = new Float32Array(PUFFS);
  private readonly slots: NumberSlot[] = [];
  private alive = 0;
  private busy = false;
  private seed = 1;

  constructor() {
    const { atlas } = this;
    this.lights.blendMode = 'add';
    for (let i = 0; i < PUFFS; i++) {
      const glow = new Particle({
        texture: atlas.glow,
        x: OFF,
        y: OFF,
        anchorX: 0.5,
        anchorY: 0.5,
      });
      this.glows.push(glow);
    }
    for (let i = 0; i < PUFFS; i++) {
      const puff = new Sprite(Texture.EMPTY);
      puff.anchor.set(0.5);
      puff.position.set(OFF, OFF);
      this.puffs.push(puff);
      this.puffLayer.addChild(puff);
    }
    for (let i = 0; i < PARTS; i++) {
      const dot = new Particle({
        texture: atlas.shapes.pixel,
        x: OFF,
        y: OFF,
        anchorX: 0.5,
        anchorY: 0.5,
      });
      this.parts.push(dot);
    }
    for (let i = 0; i < NUMBER_CAP; i++) {
      const glyphs: Particle[] = [];
      for (let d = 0; d < DIGITS; d++) {
        const glyph = new Particle({
          texture: atlas.digits[BLANK] ?? Texture.EMPTY,
          x: OFF,
          y: OFF,
        });
        glyphs.push(glyph);
        this.glyphPool.push(glyph);
      }
      this.slots.push({
        glyphs,
        life: 0,
        age: 0,
        x: 0,
        y: 0,
        drift: 0,
        enemy: 0,
        value: 0,
        scale: 1,
        count: 0,
      });
    }
    this.layer.addChild(this.lights, this.sparks);
  }

  /** A cheap sequence for the spread of the sparks (decoration: the render has no say in the game). */
  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private part(
    shape: ParticleShape,
    x: number,
    y: number,
    vx: number,
    vy: number,
    grav: number,
    color: number,
    ms: number,
    size = FIELD_PIXEL,
  ): void {
    const i = this.partNext;
    this.partNext = (this.partNext + 1) % PARTS;
    const dot = this.parts[i];
    if (dot === undefined) return;
    dot.texture = this.atlas.shapes[shape];
    dot.tint = color;
    dot.scaleX = size;
    dot.scaleY = size;
    this.px[i] = x;
    this.py[i] = y;
    this.pvx[i] = vx;
    this.pvy[i] = vy;
    this.pgrav[i] = grav;
    this.plife[i] = 1;
    this.pms[i] = ms;
    this.busy = true;
  }

  private glow(x: number, y: number, color: number, size: number): void {
    const i = this.glowNext;
    this.glowNext = (this.glowNext + 1) % PUFFS;
    const glow = this.glows[i];
    if (glow === undefined) return;
    glow.x = x;
    glow.y = y;
    glow.tint = color;
    this.glowLife[i] = 1;
    this.glowSize[i] = size;
    this.busy = true;
  }

  /**
   * A ball hit an enemy at (x, y) coming along (dx, dy) (unit vector, ball to enemy): sparks with
   * the shape of the type fly back the way the ball bounces, and the damage shows as a number.
   */
  hit(
    enemyId: number,
    x: number,
    y: number,
    dx: number,
    dy: number,
    radius: number,
    type: number,
    color: number,
    damage: number,
    effectiveness: number,
  ): void {
    const shape = TYPE_SHAPES[type] ?? 'star';
    const cx = x - dx * radius * 0.8;
    const cy = y - dy * radius * 0.8;
    const count = effectiveness > 1 ? 5 : 3;
    for (let k = 0; k < count; k++) {
      const spread = (this.random() - 0.5) * 1.9;
      const speed = 1.6 + this.random() * 2.2;
      const vx = (-dx * Math.cos(spread) + dy * Math.sin(spread)) * speed;
      const vy = (-dy * Math.cos(spread) - dx * Math.sin(spread)) * speed;
      this.part(shape, cx, cy, vx, vy, 0.06, k === 0 ? 0xffffff : color, 300 + k * 30);
    }
    this.part('cross', cx, cy, 0, 0, 0, 0xffffff, 90, FIELD_PIXEL * (effectiveness > 1 ? 2 : 1));
    this.number(enemyId, x, y - radius, damage, effectiveness);
  }

  private number(enemy: number, x: number, y: number, damage: number, effectiveness: number): void {
    // Quick hits on the same enemy add up into the number that is still young.
    for (const slot of this.slots) {
      if (slot.life <= 0 || slot.enemy !== enemy || slot.age > NUMBER_JOIN_MS) continue;
      slot.value += damage;
      slot.age = 0;
      slot.life = 1;
      this.write(slot, Math.max(effectiveness, slot.scale > 1 ? 1.5 : 1));
      return;
    }
    if (!showsNumber(this.alive, damage, effectiveness)) return;
    let free: NumberSlot | undefined;
    for (const slot of this.slots) {
      if (slot.life <= 0) {
        free = slot;
        break;
      }
    }
    if (free === undefined) return;
    free.life = 1;
    free.age = 0;
    free.enemy = enemy;
    free.value = damage;
    free.x = x + (this.random() - 0.5) * 14;
    free.y = y;
    free.drift = (this.random() - 0.5) * 16;
    this.alive += 1;
    this.busy = true;
    this.write(free, effectiveness);
  }

  private write(slot: NumberSlot, effectiveness: number): void {
    const look = numberLook(effectiveness);
    const list = digitsOf(slot.value, DIGITS);
    slot.scale = look.scale;
    slot.count = list.length;
    for (let d = 0; d < DIGITS; d++) {
      const glyph = slot.glyphs[d];
      if (glyph === undefined) continue;
      // The places a short number does not use show the blank glyph.
      glyph.texture = this.atlas.digits[list[d] ?? BLANK] ?? Texture.EMPTY;
      glyph.tint = look.color;
    }
  }

  /**
   * An enemy died at (x, y): its white silhouette swells and fades, it breaks into pixels of its
   * type, a puff of smoke stays, and a glow of its colour lights the spot for an instant.
   */
  kill(
    x: number,
    y: number,
    radius: number,
    type: number,
    color: number,
    silhouette: Texture | null,
    scale: number,
  ): void {
    const i = this.puffNext;
    const puff = this.puffs[i];
    this.glow(x, y, color, radius * 3.2);
    this.puffNext = (this.puffNext + 1) % PUFFS;
    if (puff !== undefined && silhouette !== null) {
      puff.texture = silhouette;
      puff.position.set(x, y);
      this.puffLife[i] = 1;
      this.puffScale[i] = scale;
    }
    const shape = TYPE_SHAPES[type] ?? 'star';
    const count = Math.min(14, 7 + Math.round(radius / 6));
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + this.random();
      const speed = 1.4 + this.random() * 2.6;
      this.part(
        k % 3 === 0 ? 'pixel' : shape,
        x + Math.cos(a) * radius * 0.4,
        y + Math.sin(a) * radius * 0.4,
        Math.cos(a) * speed,
        Math.sin(a) * speed - 0.8,
        0.1,
        k % 3 === 0 ? 0xffffff : color,
        380 + this.random() * 260,
        k % 3 === 0 ? FIELD_PIXEL * 2 : FIELD_PIXEL,
      );
    }
    // Smoke: three grey motes that rise slowly.
    for (let k = 0; k < 3; k++) {
      this.part(
        'mote',
        x + (k - 1) * radius * 0.5,
        y,
        (k - 1) * 0.3,
        -0.7,
        -0.01,
        0x566c86,
        560,
        3,
      );
    }
    this.busy = true;
  }

  /** A burst of pixels of one colour (a pickup, a capture, a level): `count` shapes thrown around. */
  burst(
    x: number,
    y: number,
    shape: ParticleShape,
    color: number,
    count: number,
    speed: number,
  ): void {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + this.random() * 0.6;
      const v = speed * (0.6 + this.random() * 0.7);
      this.part(shape, x, y, Math.cos(a) * v, Math.sin(a) * v - 0.6, 0.07, color, 420);
    }
    this.glow(x, y, color, 60);
  }

  /** Offset of the screen while a strike shakes it; the renderer adds it to the pivot of the world. */
  shakeX = 0;
  shakeY = 0;
  private shakeLife = 0;
  private clock = 0;

  /**
   * An attack of a boss struck a band of the floor `width` wide at `x` (4V; the residue of the
   * art bible §6): matter of its type is thrown up along the band, a light of its colour flares on
   * the floor and, for a wide one, the screen shakes two pixels.
   */
  strike(x: number, width: number, floorY: number, type: number, color: number): void {
    const shape = TYPE_SHAPES[type] ?? 'star';
    const count = Math.max(5, Math.min(16, Math.round(width / 12)));
    for (let k = 0; k < count; k++) {
      const px = x + (this.random() - 0.5) * width;
      this.part(
        k % 4 === 0 ? 'pixel' : shape,
        px,
        floorY - this.random() * 10,
        (this.random() - 0.5) * 1.6,
        -2.2 - this.random() * 3.2,
        0.12,
        k % 4 === 0 ? 0xffffff : color,
        420 + this.random() * 240,
        k % 4 === 0 ? FIELD_PIXEL * 2 : FIELD_PIXEL,
      );
    }
    this.glow(x, floorY, color, Math.max(70, width * 1.8));
    if (width >= 40) this.shakeLife = 1;
    this.busy = true;
  }

  /** While a boss gathers its attack: a mote of its colour is drawn in from around it to its body. */
  gather(x: number, y: number, radius: number, type: number, color: number): void {
    const a = this.random() * Math.PI * 2;
    const from = radius * 2.1;
    const ms = 300;
    // It covers the way to the body in its lifetime.
    const speed = from / (ms / 16.67);
    this.part(
      TYPE_SHAPES[type] ?? 'star',
      x + Math.cos(a) * from,
      y + Math.sin(a) * from,
      -Math.cos(a) * speed,
      -Math.sin(a) * speed,
      0,
      color,
      ms,
    );
  }

  update(ms: number): void {
    this.clock += ms;
    if (this.shakeLife > 0) {
      this.shakeLife = Math.max(0, this.shakeLife - ms / 200);
      const power = this.shakeLife > 0 ? FIELD_PIXEL : 0;
      const phase = Math.floor(this.clock / 33) % 2 === 0 ? 1 : -1;
      this.shakeX = phase * power;
      this.shakeY = -phase * (power / 2);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
    if (!this.busy) return;
    const step = ms / 16.67;
    let any = false;
    // How far into each pool something is alive: the containers hold their pools up to there.
    let partsLive = 0;
    let glowsLive = 0;
    let slotsLive = 0;
    for (let i = 0; i < PARTS; i++) {
      const life = this.plife[i] ?? 0;
      if (life <= 0) continue;
      const dot = this.parts[i];
      if (dot === undefined) continue;
      const next = life - ms / (this.pms[i] ?? 300);
      if (next <= 0) {
        this.plife[i] = 0;
        dot.x = OFF;
        continue;
      }
      any = true;
      partsLive = i + 1;
      this.plife[i] = next;
      this.pvy[i] = (this.pvy[i] ?? 0) + (this.pgrav[i] ?? 0) * step;
      this.px[i] = (this.px[i] ?? 0) + (this.pvx[i] ?? 0) * step;
      this.py[i] = (this.py[i] ?? 0) + (this.pvy[i] ?? 0) * step;
      dot.x = Math.round((this.px[i] ?? 0) / FIELD_PIXEL) * FIELD_PIXEL;
      dot.y = Math.round((this.py[i] ?? 0) / FIELD_PIXEL) * FIELD_PIXEL;
      // Out in steps: whole, then half, then gone.
      dot.alpha = next > 0.4 ? 1 : next > 0.18 ? 0.6 : 0.3;
    }
    for (let i = 0; i < PUFFS; i++) {
      const life = this.puffLife[i] ?? 0;
      const puff = this.puffs[i];
      if (life > 0 && puff !== undefined) {
        const next = life - ms / 190;
        this.puffLife[i] = Math.max(0, next);
        if (next <= 0) puff.position.set(OFF, OFF);
        else {
          any = true;
          puff.scale.set((this.puffScale[i] ?? 1) * (1 + (1 - next) * 0.3));
          puff.alpha = next > 0.5 ? 1 : next > 0.25 ? 0.6 : 0.3;
        }
      }
      const lit = this.glowLife[i] ?? 0;
      const glow = this.glows[i];
      if (lit > 0 && glow !== undefined) {
        const next = lit - ms / 260;
        this.glowLife[i] = Math.max(0, next);
        if (next <= 0) glow.x = OFF;
        else {
          any = true;
          glowsLive = i + 1;
          const size = ((this.glowSize[i] ?? 40) / 24) * (0.7 + (1 - next) * 0.5);
          glow.scaleX = size;
          glow.scaleY = size;
          glow.alpha = Math.ceil(next * 4) / 4;
        }
      }
    }
    for (let s = 0; s < this.slots.length; s++) {
      const slot = this.slots[s];
      if (slot === undefined || slot.life <= 0) continue;
      slot.age += ms;
      slot.life -= ms / NUMBER_LIFE_MS;
      if (slot.life <= 0) {
        slot.life = 0;
        for (const glyph of slot.glyphs) glyph.x = OFF;
        this.alive -= 1;
        continue;
      }
      any = true;
      slotsLive = s + 1;
      const t = 1 - slot.life;
      const rise = numberRise(t);
      const size = FIELD_PIXEL * slot.scale * numberPop(t);
      const alpha = numberAlpha(t);
      // The digits side by side, centred on the number and standing on its line.
      const left = Math.round(slot.x + slot.drift * rise - (slot.count * (GLYPH_W - 1) * size) / 2);
      const top = Math.round(slot.y - 26 * rise - GLYPH_H * size);
      for (let d = 0; d < DIGITS; d++) {
        const glyph = slot.glyphs[d];
        if (glyph === undefined) continue;
        glyph.x = left + d * (GLYPH_W - 1) * size;
        glyph.y = top;
        glyph.scaleX = size;
        glyph.scaleY = size;
        glyph.alpha = alpha;
      }
    }
    liveParticles(this.sparks, this.parts, partsLive);
    liveParticles(this.lights, this.glows, glowsLive);
    liveParticles(this.numbers, this.glyphPool, slotsLive * DIGITS);
    // With nothing alive the pool starts again from its beginning, so a quiet fight keeps the
    // containers short.
    if (partsLive === 0) this.partNext = 0;
    if (glowsLive === 0) this.glowNext = 0;
    this.busy = any;
  }
}
