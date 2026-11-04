import { Application, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import {
  type AimDirection,
  aimDirection,
  type GameConfig,
  type GameEvent,
  type Snapshot,
} from '../domain';
import { interpolateBalls, interpolateEnemies } from './interpolate';

/** Placeholder colours per type code (fire, water, grass, electric). No franchise art here. */
const TYPE_COLORS: readonly number[] = [0xff7043, 0x4fc3f7, 0x81c784, 0xffee58];
const FX_POOL = 48;
const AIM_DOTS = 16;
/** Length of the aim guide and the gap between its dots, in arena pixels. */
const AIM_LENGTH = 300;
const PICKUP_GOLD = 0xffd54f;
const FX_DURATION_MS = 280;

/** How much bigger than its collision circle a species sprite is drawn (sprites have margins). */
const BALL_ART_SCALE = 2.4;
const ENEMY_ART_SCALE = 1.7;

/**
 * Draws a pair of snapshots. Species with art (`art[code]`, supplied by the app) are drawn with
 * it; everything else is a flat marker in the colour of its type, so the game plays the same
 * without any franchise art. It only reads snapshots and events (ADR-007);
 * it never touches the run. All sprites come from pools, so a steady frame allocates nothing
 * beyond what PixiJS itself does.
 */
export class Renderer {
  private readonly world = new Container();
  private readonly enemyLayer = new Container();
  private readonly ballLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly pickupLayer = new Container();
  private readonly aimLayer = new Container();
  private readonly pickupSprites: Sprite[] = [];
  private readonly pickupRings: Sprite[] = [];
  private readonly aimDots: Sprite[] = [];
  private readonly aimScratch: AimDirection = { x: 0, y: -1 };
  private readonly reachRing: Sprite;
  private pickupsShown = 0;
  private readonly enemySprites: Sprite[] = [];
  private readonly ballSprites: Sprite[] = [];
  private readonly fxSprites: Sprite[] = [];
  private readonly fxLife = new Float32Array(FX_POOL);
  private readonly fxSize = new Float32Array(FX_POOL);
  private fxNext = 0;
  private enemiesShown = 0;
  private ballsShown = 0;
  private readonly player: Graphics;
  private readonly scratchBallX: Float32Array;
  private readonly scratchBallY: Float32Array;
  private readonly scratchEnemyX: Float32Array;
  private readonly scratchEnemyY: Float32Array;

  private constructor(
    private readonly app: Application,
    private readonly config: GameConfig,
    private readonly disc: Texture,
    private readonly ring: Texture,
    maxSlots: number,
    maxEnemies: number,
    private readonly art: readonly (Texture | undefined)[],
    private readonly forms: readonly (readonly number[])[],
  ) {
    this.scratchBallX = new Float32Array(maxSlots);
    this.scratchBallY = new Float32Array(maxSlots);
    this.scratchEnemyX = new Float32Array(maxEnemies);
    this.scratchEnemyY = new Float32Array(maxEnemies);

    const { width, height, defenseLineY } = config.arena;
    const background = new Graphics()
      .rect(0, 0, width, height)
      .fill(0x131a2b)
      .rect(0, defenseLineY, width, height - defenseLineY)
      .fill(0x1b2540)
      .moveTo(0, defenseLineY)
      .lineTo(width, defenseLineY)
      .stroke({ width: 2, color: 0xe57373, alpha: 0.8 })
      .rect(0, 0, width, height)
      .stroke({ width: 4, color: 0x3d4a73 });
    this.player = new Graphics().poly([-14, 12, 14, 12, 0, -14]).fill(0xffffff);
    this.player.y = config.player.y;

    for (let i = 0; i < FX_POOL; i++) {
      const sprite = new Sprite(ring);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.fxSprites.push(sprite);
      this.fxLayer.addChild(sprite);
    }
    this.reachRing = new Sprite(ring);
    this.reachRing.anchor.set(0.5);
    this.reachRing.alpha = 0.22;
    this.reachRing.y = config.player.y;
    this.reachRing.scale.set(config.pickup.radius / 30);
    for (let i = 0; i < AIM_DOTS; i++) {
      const dot = new Sprite(disc);
      dot.anchor.set(0.5);
      dot.visible = false;
      this.aimDots.push(dot);
      this.aimLayer.addChild(dot);
    }
    this.world.addChild(
      background,
      this.aimLayer,
      this.enemyLayer,
      this.pickupLayer,
      this.ballLayer,
      this.fxLayer,
      this.reachRing,
      this.player,
    );
    app.stage.addChild(this.world);
  }

  static async create(
    host: HTMLElement,
    config: GameConfig,
    maxSlots: number,
    maxEnemies: number,
    art: readonly (Texture | undefined)[] = [],
    forms: readonly (readonly number[])[] = [],
  ): Promise<Renderer> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: 0x0b0e16,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      autoStart: false, // we drive rendering from our own loop
    });
    host.appendChild(app.canvas);
    const disc = app.renderer.generateTexture(new Graphics().circle(0, 0, 32).fill(0xffffff));
    const ring = app.renderer.generateTexture(
      new Graphics().circle(0, 0, 30).stroke({ width: 4, color: 0xffffff }),
    );
    return new Renderer(app, config, disc, ring, maxSlots, maxEnemies, art, forms);
  }

  /** Arena-to-screen transform, shared with the input layer to convert pointer positions. */
  get view(): { scale: number; offsetX: number; offsetY: number } {
    const { width, height } = this.config.arena;
    const scale = Math.min(this.app.screen.width / width, this.app.screen.height / height);
    return {
      scale,
      offsetX: (this.app.screen.width - width * scale) / 2,
      offsetY: (this.app.screen.height - height * scale) / 2,
    };
  }

  render(
    prev: Snapshot,
    curr: Snapshot,
    alpha: number,
    events: readonly GameEvent[],
    elapsedMs: number,
  ): void {
    const { width, height } = this.config.arena;
    const scale = Math.min(this.app.screen.width / width, this.app.screen.height / height);
    this.world.scale.set(scale);
    this.world.position.set(
      (this.app.screen.width - width * scale) / 2,
      (this.app.screen.height - height * scale) / 2,
    );

    this.drawBalls(prev, curr, alpha);
    this.drawEnemies(prev, curr, alpha);
    this.player.x = prev.playerX + (curr.playerX - prev.playerX) * alpha;
    this.reachRing.x = this.player.x;
    this.reachRing.scale.set(this.config.pickup.radius / 30);
    this.drawPickups(curr);
    this.drawAim(curr);
    this.drawEffects(events, elapsedMs);

    this.app.render();
  }

  /** Art of the evolution form a ball of `level` shows: `forms[species code][level - 1]`. */
  private artFor(code: number, level: number): Texture | undefined {
    return this.art[this.forms[code]?.[level - 1] ?? code];
  }

  private spriteAt(pool: Sprite[], layer: Container, index: number): Sprite {
    let sprite = pool[index];
    if (sprite === undefined) {
      sprite = new Sprite(this.disc);
      sprite.anchor.set(0.5);
      pool[index] = sprite;
      layer.addChild(sprite);
    }
    return sprite;
  }

  private drawBalls(prev: Snapshot, curr: Snapshot, alpha: number): void {
    interpolateBalls(prev, curr, alpha, this.scratchBallX, this.scratchBallY);
    const radiusScale = this.config.ball.radius / 32;
    let shown = 0;
    for (let slot = 0; slot < curr.slotCount; slot++) {
      if (curr.ballActive[slot] !== 1) continue;
      const sprite = this.spriteAt(this.ballSprites, this.ballLayer, shown);
      sprite.visible = true;
      sprite.position.set(this.scratchBallX[slot] ?? 0, this.scratchBallY[slot] ?? 0);
      const art = this.artFor(curr.ballSpecies[slot] ?? 255, curr.ballLevel[slot] ?? 1);
      if (art === undefined) {
        sprite.texture = this.disc;
        sprite.scale.set(radiusScale);
      } else {
        sprite.texture = art;
        sprite.scale.set((this.config.ball.radius * BALL_ART_SCALE) / (art.width / 2));
      }
      sprite.tint = 0xffffff;
      sprite.alpha = 1;
      shown += 1;
    }
    for (let i = shown; i < this.ballsShown; i++) {
      const sprite = this.ballSprites[i];
      if (sprite) sprite.visible = false;
    }
    this.ballsShown = shown;
  }

  private drawEnemies(prev: Snapshot, curr: Snapshot, alpha: number): void {
    interpolateEnemies(prev, curr, alpha, this.scratchEnemyX, this.scratchEnemyY);
    for (let i = 0; i < curr.enemyCount; i++) {
      const sprite = this.spriteAt(this.enemySprites, this.enemyLayer, i);
      sprite.visible = true;
      sprite.position.set(this.scratchEnemyX[i] ?? 0, this.scratchEnemyY[i] ?? 0);
      const radius = curr.enemyRadius[i] ?? 16;
      const art = this.art[curr.enemySpecies[i] ?? 255];
      if (art === undefined) {
        sprite.texture = this.disc;
        sprite.scale.set(radius / 32);
        sprite.tint = TYPE_COLORS[curr.enemyType[i] ?? 0] ?? 0xffffff;
        sprite.alpha = 0.9;
      } else {
        sprite.texture = art;
        sprite.scale.set((radius * ENEMY_ART_SCALE) / (art.width / 2));
        sprite.tint = 0xffffff;
        sprite.alpha = 1;
      }
    }
    for (let i = curr.enemyCount; i < this.enemiesShown; i++) {
      const sprite = this.enemySprites[i];
      if (sprite) sprite.visible = false;
    }
    this.enemiesShown = curr.enemyCount;
  }

  /** Balls on the floor (white ring) and captured ones falling or waiting (gold ring). */
  private drawPickups(curr: Snapshot): void {
    const radius = this.config.ball.radius;
    for (let i = 0; i < curr.pickupCount; i++) {
      const sprite = this.spriteAt(this.pickupSprites, this.pickupLayer, i);
      let halo = this.pickupRings[i];
      if (halo === undefined) {
        halo = new Sprite(this.ring);
        halo.anchor.set(0.5);
        this.pickupRings[i] = halo;
        this.pickupLayer.addChild(halo);
      }
      const captured = curr.pickupCaptured[i] === 1;
      const ticks = curr.pickupTicks[i] ?? 0;
      const total = captured ? this.config.pickup.captureTtlTicks : this.config.pickup.returnTicks;
      // Blink for the last second and a half: it is about to join on its own (or, if captured, to).
      const urgent = ticks < 90 && Math.floor(curr.tick / 6) % 2 === 0;
      const x = curr.pickupX[i] ?? 0;
      const y = curr.pickupY[i] ?? 0;
      sprite.visible = true;
      halo.visible = true;
      sprite.position.set(x, y);
      halo.position.set(x, y);
      const art = this.artFor(curr.pickupSpecies[i] ?? 255, curr.pickupLevel[i] ?? 1);
      if (art === undefined) {
        sprite.texture = this.disc;
        sprite.scale.set(radius / 32);
        sprite.tint = TYPE_COLORS[curr.pickupType[i] ?? 0] ?? 0xffffff;
      } else {
        sprite.texture = art;
        sprite.scale.set((radius * BALL_ART_SCALE * 1.1) / (art.width / 2));
        sprite.tint = 0xffffff;
      }
      sprite.alpha = urgent ? 0.35 : 1;
      halo.tint = captured ? PICKUP_GOLD : 0xffffff;
      halo.alpha = urgent ? 0.2 : 0.4 + 0.6 * Math.min(1, ticks / Math.max(1, total));
      halo.scale.set((radius * 2.4) / 30);
    }
    for (let i = curr.pickupCount; i < this.pickupsShown; i++) {
      const sprite = this.pickupSprites[i];
      const halo = this.pickupRings[i];
      if (sprite) sprite.visible = false;
      if (halo) halo.visible = false;
    }
    this.pickupsShown = curr.pickupCount;
  }

  /** Dotted guide from the launcher along the manual aim; hidden while the assisted aim is on. */
  private drawAim(curr: Snapshot): void {
    const show = !curr.autoAim && curr.phase === 0;
    if (show) {
      aimDirection(
        this.player.x,
        this.config.player.y,
        curr.aimX,
        curr.aimY,
        this.config.ball.minVerticalRatio,
        this.aimScratch,
      );
    }
    const gap = AIM_LENGTH / AIM_DOTS;
    for (let i = 0; i < AIM_DOTS; i++) {
      const dot = this.aimDots[i];
      if (dot === undefined) continue;
      dot.visible = show;
      if (!show) continue;
      const d = (i + 1) * gap;
      dot.position.set(
        this.player.x + this.aimScratch.x * d,
        this.config.player.y + this.aimScratch.y * d,
      );
      dot.scale.set(0.11 - i * 0.003);
      dot.alpha = 0.75 - (i / AIM_DOTS) * 0.55;
    }
  }

  private startEffect(x: number, y: number, color: number, size = 1): void {
    const index = this.fxNext;
    this.fxNext = (this.fxNext + 1) % FX_POOL;
    const sprite = this.fxSprites[index];
    if (sprite === undefined) return;
    sprite.position.set(x, y);
    sprite.tint = color;
    sprite.visible = true;
    this.fxLife[index] = 1;
    this.fxSize[index] = size;
  }

  private drawEffects(events: readonly GameEvent[], elapsedMs: number): void {
    for (const event of events) {
      if (event.type === 'hit') this.startEffect(event.x, event.y, 0xffffff);
      else if (event.type === 'kill') this.startEffect(event.x, event.y, 0xffd54f);
      else if (event.type === 'chain') this.startEffect(event.toX, event.toY, 0xfff176);
      else if (event.type === 'collect') this.startEffect(event.x, this.config.player.y, 0x81d4fa);
      else if (event.type === 'capture')
        this.startEffect(event.x, this.config.player.y, PICKUP_GOLD, 2.2);
      else if (event.type === 'captureDrop') {
        // Two staggered rings, big and gold: a drop must be seen from across the field.
        this.startEffect(event.x, event.y, PICKUP_GOLD, 2.6);
        this.startEffect(event.x, event.y, 0xffffff, 1.6);
      }
    }
    const decay = elapsedMs / FX_DURATION_MS;
    for (let i = 0; i < FX_POOL; i++) {
      const life = this.fxLife[i] ?? 0;
      const sprite = this.fxSprites[i];
      if (life <= 0 || sprite === undefined) continue;
      const next = life - decay;
      if (next <= 0) {
        this.fxLife[i] = 0;
        sprite.visible = false;
      } else {
        this.fxLife[i] = next;
        sprite.alpha = next;
        sprite.scale.set((this.fxSize[i] ?? 1) * (0.35 + (1 - next) * 0.6));
      }
    }
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }
}
