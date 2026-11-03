import { Application, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { GameConfig, GameEvent, Snapshot } from '../domain';
import { interpolateBalls, interpolateEnemies } from './interpolate';

/** Placeholder colours per type code (fire, water, grass, electric). No franchise art here. */
const TYPE_COLORS: readonly number[] = [0xff7043, 0x4fc3f7, 0x81c784, 0xffee58];
const FX_POOL = 48;
const FX_DURATION_MS = 280;

/**
 * Draws a pair of snapshots with simple shapes. It only reads snapshots and events (ADR-007);
 * it never touches the run. All sprites come from pools, so a steady frame allocates nothing
 * beyond what PixiJS itself does.
 */
export class Renderer {
  private readonly world = new Container();
  private readonly enemyLayer = new Container();
  private readonly ballLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly enemySprites: Sprite[] = [];
  private readonly ballSprites: Sprite[] = [];
  private readonly fxSprites: Sprite[] = [];
  private readonly fxLife = new Float32Array(FX_POOL);
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
    ring: Texture,
    maxSlots: number,
    maxEnemies: number,
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
    this.world.addChild(background, this.enemyLayer, this.ballLayer, this.fxLayer, this.player);
    app.stage.addChild(this.world);
  }

  static async create(
    host: HTMLElement,
    config: GameConfig,
    maxSlots: number,
    maxEnemies: number,
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
    return new Renderer(app, config, disc, ring, maxSlots, maxEnemies);
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
    this.drawEffects(events, elapsedMs);

    this.app.render();
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
      sprite.scale.set(radiusScale);
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
      sprite.scale.set((curr.enemyRadius[i] ?? 16) / 32);
      sprite.tint = TYPE_COLORS[curr.enemyType[i] ?? 0] ?? 0xffffff;
      sprite.alpha = 0.9;
    }
    for (let i = curr.enemyCount; i < this.enemiesShown; i++) {
      const sprite = this.enemySprites[i];
      if (sprite) sprite.visible = false;
    }
    this.enemiesShown = curr.enemyCount;
  }

  private startEffect(x: number, y: number, color: number): void {
    const index = this.fxNext;
    this.fxNext = (this.fxNext + 1) % FX_POOL;
    const sprite = this.fxSprites[index];
    if (sprite === undefined) return;
    sprite.position.set(x, y);
    sprite.tint = color;
    sprite.visible = true;
    this.fxLife[index] = 1;
  }

  private drawEffects(events: readonly GameEvent[], elapsedMs: number): void {
    for (const event of events) {
      if (event.type === 'hit') this.startEffect(event.x, event.y, 0xffffff);
      else if (event.type === 'kill') this.startEffect(event.x, event.y, 0xffd54f);
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
        sprite.scale.set(0.35 + (1 - next) * 0.6);
      }
    }
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }
}
