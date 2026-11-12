import { Container, Sprite, Text, Texture } from 'pixi.js';

/**
 * The feel of a hit on the player (4G-G, 14th playtest: "no me entero cuando me hacen daño"): a red
 * flash over the whole screen, a short shake, a floating damage number over the player and the
 * blink of the launcher while the invulnerability lasts. Render only: it reads events and the
 * snapshot, and decides nothing about the game.
 */

const FLASH_MS = 320;
const SHAKE_MS = 240;
const FLOAT_MS = 900;
const FLOATS = 4;

export class HurtFx {
  /** Floating numbers, in world (arena) coordinates: add it to the world container. */
  readonly numbers = new Container();
  /** The red veil over the whole screen: add it to the stage, above the world. */
  readonly flash = new Sprite(Texture.WHITE);
  shakeX = 0;
  shakeY = 0;
  private flashLife = 0;
  private shakeLife = 0;
  private readonly texts: Text[] = [];
  private readonly lives: number[] = [];
  private next = 0;

  constructor() {
    this.flash.tint = 0xff1744;
    this.flash.alpha = 0;
    this.flash.visible = false;
    for (let i = 0; i < FLOATS; i++) {
      const text = new Text({
        text: '',
        style: {
          fontFamily: 'Pixelify, monospace',
          fontSize: 30,
          fontWeight: '700',
          fill: 0xffffff,
          stroke: { color: 0xb71c1c, width: 6 },
        },
      });
      text.anchor.set(0.5);
      text.visible = false;
      this.texts.push(text);
      this.lives.push(0);
      this.numbers.addChild(text);
    }
  }

  /** A hit: `damage` health lost with the player at (x, y) in arena pixels. */
  hurt(x: number, y: number, damage: number): void {
    this.flashLife = 1;
    this.shakeLife = 1;
    const i = this.next;
    this.next = (this.next + 1) % FLOATS;
    const text = this.texts[i];
    if (text === undefined) return;
    text.text = `-${formatDamage(damage)}`;
    text.position.set(x, y - 50);
    text.alpha = 1;
    text.visible = true;
    this.lives[i] = 1;
  }

  /** The blink of the launcher: alternating every 80 ms while the invulnerability lasts. */
  static blink(invulnTicks: number, elapsedTotalMs: number): number {
    if (invulnTicks <= 0) return 1;
    return ((elapsedTotalMs / 80) | 0) % 2 === 0 ? 0.25 : 1;
  }

  /** Advances the effects `ms` and sizes the veil to the screen. */
  update(ms: number, screenW: number, screenH: number): void {
    this.flash.width = screenW;
    this.flash.height = screenH;
    if (this.flashLife > 0) {
      this.flashLife = Math.max(0, this.flashLife - ms / FLASH_MS);
      this.flash.visible = this.flashLife > 0;
      // A strong first instant that fades: the veil must be seen, not hide the field for long.
      this.flash.alpha = this.flashLife * this.flashLife * 0.45;
    }
    if (this.shakeLife > 0) {
      this.shakeLife = Math.max(0, this.shakeLife - ms / SHAKE_MS);
      const power = Math.ceil(this.shakeLife * 6);
      const phase = (this.shakeLife * 24) % 2 < 1 ? 1 : -1;
      this.shakeX = phase * power;
      this.shakeY = -phase * Math.ceil(power / 2);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
    for (let i = 0; i < FLOATS; i++) {
      const life = this.lives[i] ?? 0;
      const text = this.texts[i];
      if (life <= 0 || text === undefined) continue;
      const next = life - ms / FLOAT_MS;
      if (next <= 0) {
        this.lives[i] = 0;
        text.visible = false;
      } else {
        this.lives[i] = next;
        text.y -= ms * 0.05;
        text.alpha = Math.min(1, next * 2);
      }
    }
  }
}

/**
 * The countdown over an enemy marked as a threat (4G-G): a big number of whole seconds left, in
 * red, that follows the enemy. A small pool, refilled every frame.
 */
export class CountdownFx {
  readonly layer = new Container();
  private readonly texts: Text[] = [];
  private used = 0;

  constructor(size = 3) {
    for (let i = 0; i < size; i++) {
      const text = new Text({
        text: '',
        style: {
          fontFamily: 'Pixelify, monospace',
          fontSize: 34,
          fontWeight: '700',
          fill: 0xfff176,
          stroke: { color: 0xb71c1c, width: 7 },
        },
      });
      text.anchor.set(0.5);
      text.visible = false;
      this.texts.push(text);
      this.layer.addChild(text);
    }
  }

  /** Call once per frame before the `show`s. */
  begin(): void {
    this.used = 0;
  }

  /** The number of whole seconds left over the enemy at (x, y). */
  show(x: number, y: number, ticksLeft: number): void {
    const text = this.texts[this.used];
    if (text === undefined) return;
    this.used += 1;
    const seconds = Math.ceil(ticksLeft / 60);
    if (text.text !== String(seconds)) text.text = String(seconds);
    text.position.set(x, y);
    // It beats faster as the end nears.
    const pulse = 1 + 0.12 * Math.sin(ticksLeft / (ticksLeft < 70 ? 2 : 5));
    text.scale.set(pulse);
    text.visible = true;
  }

  /** Call once per frame after the `show`s: hides what was not shown. */
  end(): void {
    for (let i = this.used; i < this.texts.length; i++) {
      const text = this.texts[i];
      if (text !== undefined) text.visible = false;
    }
  }
}

/** One decimal only when it matters (a half point of health), otherwise a whole number. */
export function formatDamage(damage: number): string {
  const whole = damage | 0;
  return damage - whole < 0.05 ? String(whole) : damage.toFixed(1);
}
