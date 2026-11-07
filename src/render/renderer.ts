import { Application, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import {
  type AimDirection,
  aimDirection,
  type GameConfig,
  type GameEvent,
  NO_SPECIES,
  type Snapshot,
  STATUS_BURN,
  STATUS_CURSE,
  STATUS_FROZEN,
  STATUS_MARK,
  STATUS_PARALYSED,
  STATUS_POISON,
  STATUS_PUSHED,
  STATUS_SLOW,
  typeCode,
} from '../domain';
import { ballVisualScale, opaqueExtent } from './artBox';
import { interpolateBalls, interpolateEnemies } from './interpolate';

/** Placeholder colours per type code (fire, water, grass, electric). No franchise art here. */
// In the order of the type codes of the snapshot (`typeCode`, the place in GAME_TYPES): normal,
// fighting, flying, poison, ground, rock, bug, ghost, steel, fire, water, grass, electric, psychic,
// ice, dragon, dark, fairy.
const TYPE_COLORS: readonly number[] = [
  0xc9c5a0, 0xd0584a, 0xa4b8f0, 0xb55cc0, 0xe0c068, 0xc2b068, 0xa8c030, 0x8570b8, 0xb8b8d0,
  0xff7043, 0x4fc3f7, 0x81c784, 0xffee58, 0xf9689a, 0x98e0e0, 0x7c52f8, 0x8a7060, 0xf4a8c8,
];
const FX_POOL = 48;
/** Things of a boss drawn at once; the snapshot carries `MAX_HAZARDS`. */
const HAZARD_POOL = 16;
/** Signs of the states of the enemies (flames, bubbles, sparks...) drawn at once. */
const STATUS_POOL = 360;
/** Colour of each kind of hazard (the order of `HAZARD_KINDS`): column, comb, sweep, rain, shot, zone, gust. */
const HAZARD_COLORS: readonly number[] = [
  0xff6b4a, 0xff9a3c, 0x4fc3f7, 0xc792ea, 0xffd54f, 0x7a4cff, 0xe8f4ff,
];
const KIND_SHOT = 4;
const KIND_ZONE = 5;
const KIND_GUST = 6;
const AIM_DOTS = 16;
/** Particles of the biome of the wave in progress (4H-B2, block 3): few and cheap on purpose. */
const BIOME_DOTS = 22;
/** How fast the tint of the field moves to the colour of a new biome, in milliseconds. */
const BIOME_FADE_MS = 900;
/** Type codes whose biome particles rise (embers, fumes), fall (rain, snow, petals) or drift. */
const RISING = new Set([9, 3, 7, 15, 16, 13]); // fire, poison, ghost, dragon, dark, psychic
const FALLING = new Set([10, 14, 11, 17, 6, 0]); // water, ice, grass, fairy, bug, normal
/** Length of the aim guide and the gap between its dots, in arena pixels. */
const AIM_LENGTH = 300;
const PICKUP_GOLD = 0xffd54f;
const FX_DURATION_MS = 280;

const ENEMY_ART_SCALE = 1.7;
/** Moves draw their shape for this long (ADR-039); at most this many at once. */
const SHAPE_POOL = 12;
const SHAPE_DURATION_MS = 380;
/** The aura of a ball by stage - 1 (ADR-037): none, thin, thick; its size relative to the ball. */
const AURA_ALPHA: readonly number[] = [0, 0.5, 0.95];
const AURA_SIZE: readonly number[] = [0, 2.0, 2.5];

/**
 * Side of the box that holds the visible pixels of a texture (ADR-037), measured once. If the
 * pixels cannot be read, the whole picture counts.
 */
function measureExtent(texture: Texture): number {
  const whole = Math.max(texture.width, texture.height);
  try {
    const resource = texture.source.resource as CanvasImageSource;
    const canvas = document.createElement('canvas');
    canvas.width = texture.width;
    canvas.height = texture.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) return whole;
    context.drawImage(resource, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    return opaqueExtent(
      (x, y) => data[(y * canvas.width + x) * 4 + 3] ?? 0,
      canvas.width,
      canvas.height,
    );
  } catch {
    return whole;
  }
}

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
  private readonly hazardLayer = new Container();
  private readonly hazardSprites: Sprite[] = [];
  /** The bright mark each hazard leaves on the floor strip, and the pool of the status signs. */
  private readonly hazardFloor: Sprite[] = [];
  private readonly statusLayer = new Container();
  private readonly statusSprites: Sprite[] = [];
  private statusUsed = 0;
  private readonly weakRing: Sprite;
  private readonly shieldRing: Sprite;
  private readonly biomeLayer = new Container();
  private readonly biomeTint: Sprite;
  private readonly biomeDots: Sprite[] = [];
  /** The colour the field is tinted with now (0 = no biome) and the clock of the particles. */
  private tintRgb = [0, 0, 0];
  private tintAlpha = 0;
  private biomeClock = 0;
  private readonly aimScratch: AimDirection = { x: 0, y: -1 };
  private readonly reachRing: Sprite;
  private pickupsShown = 0;
  private readonly enemySprites: Sprite[] = [];
  private readonly ballSprites: Sprite[] = [];
  private readonly fxSprites: Sprite[] = [];
  private readonly fxLife = new Float32Array(FX_POOL);
  private readonly fxSize = new Float32Array(FX_POOL);
  private fxNext = 0;
  /** Opaque box of each art texture, by art code (ADR-037). */
  private readonly extents: number[];
  private readonly auras: Sprite[] = [];
  private readonly shapes: Sprite[] = [];
  private readonly shapeLife = new Float32Array(SHAPE_POOL);
  private shapeNext = 0;
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
    private readonly bar: Texture,
    maxSlots: number,
    maxEnemies: number,
    private readonly art: readonly (Texture | undefined)[],
    private readonly forms: readonly (readonly number[])[],
  ) {
    this.extents = art.map((texture) => (texture === undefined ? 1 : measureExtent(texture)));
    for (let i = 0; i < SHAPE_POOL; i++) {
      const sprite = new Sprite(bar);
      sprite.visible = false;
      this.shapes.push(sprite);
    }
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
    const shapeLayer = new Container();
    for (const sprite of this.shapes) shapeLayer.addChild(sprite);
    // The biome: a tint over the whole field and a few drifting particles (block 3 of 4H-B2).
    this.biomeTint = new Sprite(bar);
    this.biomeTint.width = width;
    this.biomeTint.height = height;
    this.biomeTint.alpha = 0;
    this.biomeLayer.addChild(this.biomeTint);
    for (let i = 0; i < BIOME_DOTS; i++) {
      const dot = new Sprite(disc);
      dot.anchor.set(0.5);
      dot.visible = false;
      this.biomeDots.push(dot);
      this.biomeLayer.addChild(dot);
    }
    // The columns of a boss's attacks, under everything that moves; the ring of its shield and the
    // weak point over its body (4G-B, ADR-046).
    for (let i = 0; i < HAZARD_POOL; i++) {
      const column = new Sprite(bar);
      column.visible = false;
      this.hazardSprites.push(column);
      this.hazardLayer.addChild(column);
      const mark = new Sprite(bar);
      mark.visible = false;
      this.hazardFloor.push(mark);
      this.hazardLayer.addChild(mark);
    }
    for (let i = 0; i < STATUS_POOL; i++) {
      const sign = new Sprite(disc);
      sign.anchor.set(0.5);
      sign.visible = false;
      this.statusSprites.push(sign);
      this.statusLayer.addChild(sign);
    }
    this.shieldRing = new Sprite(ring);
    this.shieldRing.anchor.set(0.5);
    this.shieldRing.visible = false;
    this.weakRing = new Sprite(ring);
    this.weakRing.anchor.set(0.5);
    this.weakRing.visible = false;
    this.world.addChild(
      background,
      this.biomeLayer,
      this.hazardLayer,
      this.aimLayer,
      this.enemyLayer,
      this.statusLayer,
      this.pickupLayer,
      shapeLayer,
      this.ballLayer,
      this.fxLayer,
      this.shieldRing,
      this.weakRing,
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
    const bar = app.renderer.generateTexture(new Graphics().rect(0, 0, 4, 4).fill(0xffffff));
    return new Renderer(app, config, disc, ring, bar, maxSlots, maxEnemies, art, forms);
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

    this.drawBiome(curr, elapsedMs);
    this.drawBossFight(curr);
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

  /** The colour (0xRRGGBB) the field is tinted with now, or -1 when there is no biome: for tests. */
  get biomeColor(): number {
    if (this.tintAlpha < 0.01) return -1;
    const [r, g, b] = this.tintRgb;
    return (Math.round(r ?? 0) << 16) | (Math.round(g ?? 0) << 8) | Math.round(b ?? 0);
  }

  /**
   * The look of the biome of the wave in progress (4H-B2): the field is tinted with the colour of
   * its main type, fading from the last one, and a few particles of its two main types rise, fall
   * or drift by the family of the type. Render only: nothing here touches the run.
   */
  private drawBiome(curr: Snapshot, elapsedMs: number): void {
    const main = curr.biomeMain;
    const has = main >= 0;
    const target = has ? (TYPE_COLORS[main] ?? 0xffffff) : 0;
    const step = Math.min(1, elapsedMs / BIOME_FADE_MS);
    const goal = [(target >> 16) & 255, (target >> 8) & 255, target & 255];
    // The colour moves to the new biome; the strength goes down to 0 while there is none.
    if (has && this.tintAlpha < 0.01) this.tintRgb = goal;
    for (let c = 0; c < 3; c++) {
      this.tintRgb[c] = (this.tintRgb[c] ?? 0) + ((goal[c] ?? 0) - (this.tintRgb[c] ?? 0)) * step;
    }
    this.tintAlpha += ((has ? 0.16 : 0) - this.tintAlpha) * step;
    this.biomeTint.alpha = this.tintAlpha;
    this.biomeTint.tint = this.biomeColor < 0 ? 0xffffff : this.biomeColor;

    this.biomeClock += elapsedMs;
    const { width, height } = this.config.arena;
    const second = curr.biomeSecond >= 0 ? curr.biomeSecond : main;
    const rising = RISING.has(main);
    const falling = FALLING.has(main);
    for (let i = 0; i < BIOME_DOTS; i++) {
      const dot = this.biomeDots[i];
      if (dot === undefined) continue;
      dot.visible = has;
      if (!has) continue;
      const phase = (i * 0.61803398875) % 1; // a spread of the dots that never lines them up
      const speed = 0.012 + (i % 5) * 0.004; // pixels per millisecond
      const travel = (this.biomeClock * speed + phase * height) % height;
      let x = phase * width;
      let y = height - travel;
      if (falling) y = travel;
      else if (!rising) {
        // Drifting sideways, wrapping around, at the height of the dot.
        x = (this.biomeClock * speed + phase * width) % width;
        y = ((i * 97) % height) + Math.sin(this.biomeClock / 700 + i) * 14;
      }
      if (rising || falling) x += Math.sin(this.biomeClock / 900 + i) * 10;
      dot.x = x;
      dot.y = y;
      const size = 2.2 + (i % 4) * 0.9;
      dot.scale.set(size / 32);
      dot.tint = TYPE_COLORS[i % 2 === 0 ? main : second] ?? 0xffffff;
      // Electric and Fairy blink; the rest stay steady.
      const blink =
        main === 12 || main === 17 ? 0.5 + 0.5 * Math.sin(this.biomeClock / 160 + i * 2) : 1;
      dot.alpha = 0.42 * blink * this.tintAlpha * 6;
    }
  }

  /**
   * The fight of a boss (4G-C, ADR-053): what the boss put on the field, each kind with its own
   * colour and shape (columns, combs, sweeps, rain, falling shots, patches of floor, gusts), a
   * bright mark on the floor strip for every one that hurts (so it reads even when a finger covers
   * the field), a blue ring while the core is closed and a gold circle on the core while it is open.
   */
  private drawBossFight(curr: Snapshot): void {
    const { height, defenseLineY } = this.config.arena;
    const floorHeight = height - defenseLineY;
    for (let i = 0; i < HAZARD_POOL; i++) {
      const sprite = this.hazardSprites[i];
      const mark = this.hazardFloor[i];
      if (sprite === undefined || mark === undefined) continue;
      if (i >= curr.hazardCount) {
        sprite.visible = false;
        mark.visible = false;
        continue;
      }
      const kind = curr.hazardKind[i] ?? 0;
      const x = curr.hazardX[i] ?? 0;
      const width = curr.hazardWidth[i] ?? 0;
      const left = curr.hazardWarn[i] ?? 0;
      const warning = left > 0;
      const color = HAZARD_COLORS[kind] ?? 0xffffff;
      const pulse = 0.5 + 0.5 * Math.sin(curr.tick / Math.max(2, left / 8));
      sprite.visible = true;
      mark.visible = false;
      if (kind === KIND_SHOT) {
        // A falling shot: a bright ball with a thin line down to where it will land.
        const y = curr.hazardY[i] ?? 0;
        sprite.texture = this.disc;
        sprite.width = width;
        sprite.height = width;
        sprite.x = x - width / 2;
        sprite.y = warning ? this.config.arena.defenseLineY - width : y - width / 2;
        sprite.tint = color;
        sprite.alpha = warning ? 0.35 + 0.35 * pulse : 0.95;
        mark.visible = true;
        mark.x = x - width / 2;
        mark.y = warning ? defenseLineY : y;
        mark.width = width;
        mark.height = warning ? floorHeight : Math.max(2, defenseLineY - y);
        mark.tint = color;
        mark.alpha = warning ? 0.55 : 0.18;
      } else if (kind === KIND_ZONE) {
        // A patch of floor: purple, low, with a thicker edge; balls on it cannot be collected.
        sprite.texture = this.bar;
        sprite.width = width;
        sprite.height = floorHeight;
        sprite.x = x - width / 2;
        sprite.y = defenseLineY;
        sprite.tint = color;
        sprite.alpha = warning ? 0.2 + 0.2 * pulse : 0.55;
      } else if (kind === KIND_GUST) {
        // A gust: pale bands that slide in the direction it pushes.
        sprite.texture = this.bar;
        sprite.width = width;
        sprite.height = 46;
        sprite.x = 0;
        sprite.y = defenseLineY - 60 + ((curr.tick * 2) % 40);
        sprite.tint = color;
        sprite.alpha = warning ? 0.1 + 0.1 * pulse : 0.28;
      } else {
        // Columns, combs, sweeps and rain: tall and faint, and bright on the floor strip.
        sprite.texture = this.bar;
        sprite.width = width;
        sprite.height = height;
        sprite.x = x - width / 2;
        sprite.y = 0;
        sprite.tint = color;
        sprite.alpha = warning ? 0.1 + 0.1 * pulse : 0.6;
        mark.visible = true;
        mark.x = x - width / 2;
        mark.y = defenseLineY;
        mark.width = width;
        mark.height = floorHeight;
        mark.tint = color;
        mark.alpha = warning ? 0.35 + 0.3 * pulse : 0.9;
      }
    }
    const alive = curr.bossMaxHp > 0 && curr.bossHp > 0;
    const open = alive && curr.bossCoreOpen > 0;
    // Closed: a blue ring around the boss (almost nothing gets through). Open: it goes away.
    this.shieldRing.visible = alive && !open;
    if (this.shieldRing.visible) {
      this.shieldRing.x = curr.bossX;
      this.shieldRing.y = curr.bossY;
      this.shieldRing.scale.set((curr.bossRadius + 10) / 30);
      this.shieldRing.tint = curr.bossPhase === 1 ? 0xff6b6b : 0x7ec8ff;
      this.shieldRing.alpha = 0.45;
    }
    // The core: faint while it is about to open, a bright pulsing gold circle while it is open.
    this.weakRing.visible = alive && curr.bossWeakRadius > 0;
    if (this.weakRing.visible) {
      this.weakRing.x = curr.bossWeakX;
      this.weakRing.y = curr.bossWeakY;
      this.weakRing.scale.set(curr.bossWeakRadius / 30);
      this.weakRing.tint = 0xffd54f;
      this.weakRing.alpha = open
        ? 0.9 + 0.1 * Math.sin(curr.tick / 4)
        : 0.3 + 0.2 * Math.sin(curr.tick / 6);
    }
  }

  /**
   * One sign per thing that can be wrong with an enemy (4G-C, "estados visibles"): subtle but each
   * its own. Burning rises as flames, poison as purple bubbles, a slowdown as pale drops, ice as a
   * frost ring, paralysis as flickering sparks, a mark as a red target, a curse as violet wisps and a
   * push as a streak behind. Returns the tint the sprite should wear (0xffffff for none).
   */
  private drawStatus(bits: number, x: number, y: number, radius: number, seed: number): number {
    if (bits === 0) return 0xffffff;
    const t = this.biomeClock;
    const spread = radius * 0.7;
    if (bits & STATUS_BURN) {
      for (let k = 0; k < 3; k++) {
        const f = (t / 700 + k / 3 + seed * 0.13) % 1;
        this.statusDot(
          x + (k - 1) * spread * 0.6 + Math.sin(t / 260 + k + seed) * 2,
          y + radius * 0.3 - f * radius * 1.4,
          k === 1 ? 0xffd24d : 0xff8a3d,
          3.2 * (1 - f * 0.5),
          0.85 * (1 - f),
        );
      }
    }
    if (bits & STATUS_POISON) {
      for (let k = 0; k < 3; k++) {
        const f = (t / 1100 + k / 3 + seed * 0.21) % 1;
        this.statusRing(
          x + (k - 1) * spread * 0.7 + Math.sin(t / 400 + k * 2) * 3,
          y + radius * 0.2 - f * radius * 1.3,
          0xc58bff,
          2.6 + k * 0.8,
          0.9 * (1 - f * 0.6),
        );
      }
    }
    if (bits & STATUS_SLOW) {
      for (let k = 0; k < 2; k++) {
        const f = (t / 1500 + k / 2 + seed * 0.17) % 1;
        this.statusDot(
          x + (k === 0 ? -1 : 1) * spread * 0.8,
          y - radius * 0.6 + f * radius * 1.4,
          0xbfe3ff,
          2.4,
          0.7 * (1 - f),
        );
      }
    }
    if (bits & STATUS_FROZEN) {
      this.statusRing(x, y, 0x9fe8ff, radius * 1.1, 0.75);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.6;
        this.statusDot(x + Math.cos(a) * radius, y + Math.sin(a) * radius, 0xffffff, 2.6, 0.9);
      }
    }
    if (bits & STATUS_PARALYSED) {
      const frame = Math.floor(t / 80) + seed;
      for (let k = 0; k < 3; k++) {
        const a = ((frame * 2.3 + k * 2.1) % 6.28) + k;
        const flick = (frame + k) % 3 === 0 ? 0.2 : 1;
        this.statusDot(
          x + Math.cos(a) * radius * 0.95,
          y + Math.sin(a) * radius * 0.95,
          0xfff27a,
          2.8,
          flick,
        );
      }
    }
    if (bits & STATUS_MARK) {
      this.statusRing(x, y - radius - 7, 0xff5a7a, 5.5, 0.9);
    }
    if (bits & STATUS_CURSE) {
      for (let k = 0; k < 2; k++) {
        const f = (t / 1800 + k / 2 + seed * 0.11) % 1;
        this.statusDot(
          x + (k === 0 ? -1 : 1) * spread * 0.5 + Math.sin(t / 500 + k) * 4,
          y - f * radius * 1.6,
          0x8d6bd1,
          5,
          0.4 * (1 - f),
        );
      }
    }
    if (bits & STATUS_PUSHED) {
      for (let k = 1; k <= 3; k++)
        this.statusDot(x, y - radius - k * 6, 0xffffff, 3.4 - k * 0.6, 0.5 - k * 0.12);
    }
    // The tint of the one that matters most.
    if (bits & STATUS_FROZEN) return 0xa8d8ff;
    if (bits & STATUS_PARALYSED) return Math.floor(t / 80) % 2 === 0 ? 0xfff6a0 : 0xffffff;
    if (bits & STATUS_BURN) return 0xffa896;
    if (bits & STATUS_POISON) return 0xd2b0ff;
    if (bits & STATUS_CURSE) return 0xbba8e6;
    if (bits & STATUS_MARK) return 0xff9aae;
    if (bits & STATUS_SLOW) return 0xc4e0ff;
    return 0xffffff;
  }

  private statusDot(x: number, y: number, color: number, size: number, alpha: number): void {
    const sprite = this.statusSprites[this.statusUsed];
    if (sprite === undefined) return;
    this.statusUsed += 1;
    sprite.texture = this.disc;
    sprite.visible = true;
    sprite.position.set(x, y);
    sprite.scale.set(size / 32);
    sprite.tint = color;
    sprite.alpha = Math.max(0, alpha);
  }

  private statusRing(x: number, y: number, color: number, size: number, alpha: number): void {
    const sprite = this.statusSprites[this.statusUsed];
    if (sprite === undefined) return;
    this.statusUsed += 1;
    sprite.texture = this.ring;
    sprite.visible = true;
    sprite.position.set(x, y);
    sprite.scale.set(size / 30);
    sprite.tint = color;
    sprite.alpha = Math.max(0, alpha);
  }

  /** Art code of the form a ball of `stage` shows: `forms[species code][stage - 1]`. */
  private artCode(code: number, stage: number): number {
    return this.forms[code]?.[stage - 1] ?? code;
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
    let shown = 0;
    for (let slot = 0; slot < curr.slotCount; slot++) {
      if (curr.ballActive[slot] !== 1) continue;
      const sprite = this.spriteAt(this.ballSprites, this.ballLayer, shown);
      sprite.visible = true;
      sprite.position.set(this.scratchBallX[slot] ?? 0, this.scratchBallY[slot] ?? 0);
      // The ball grows with the stage of its Pokémon (ADR-031) and the visible pixels of every
      // sprite, not the whole picture, have the size of the ball (ADR-037): the same growth for all.
      const radius = curr.ballRadius[slot] || this.config.ball.radius;
      const stage = curr.ballLevel[slot] ?? 1;
      const code = this.artCode(curr.ballSpecies[slot] ?? NO_SPECIES, stage);
      const art = this.art[code];
      if (art === undefined) {
        sprite.texture = this.disc;
        sprite.scale.set(radius / 32);
      } else {
        sprite.texture = art;
        sprite.scale.set(ballVisualScale(this.extents[code] ?? art.width, radius));
      }
      sprite.tint = 0xffffff;
      sprite.alpha = 1;
      this.drawAura(shown, sprite.x, sprite.y, radius, stage, curr.ballType[slot] ?? 0);
      shown += 1;
    }
    for (let i = shown; i < this.ballsShown; i++) {
      const sprite = this.ballSprites[i];
      if (sprite) sprite.visible = false;
      const aura = this.auras[i];
      if (aura) aura.visible = false;
    }
    this.ballsShown = shown;
  }

  /** A ring in the colour of the type around balls of stage 2 and 3, so a stage always shows. */
  private drawAura(
    index: number,
    x: number,
    y: number,
    radius: number,
    stage: number,
    type: number,
  ): void {
    let aura = this.auras[index];
    if (aura === undefined) {
      aura = new Sprite(this.ring);
      aura.anchor.set(0.5);
      this.auras[index] = aura;
      this.ballLayer.addChild(aura);
    }
    const alpha = AURA_ALPHA[stage - 1] ?? 0;
    aura.visible = alpha > 0;
    if (alpha === 0) return;
    aura.position.set(x, y);
    aura.tint = TYPE_COLORS[type] ?? 0xffffff;
    aura.alpha = alpha;
    aura.scale.set((radius * (AURA_SIZE[stage - 1] ?? 2)) / 30);
  }

  private drawEnemies(prev: Snapshot, curr: Snapshot, alpha: number): void {
    interpolateEnemies(prev, curr, alpha, this.scratchEnemyX, this.scratchEnemyY);
    // The signs of the states of the enemies use a pool of dots that is refilled every frame.
    for (let k = 0; k < this.statusUsed; k++) {
      const used = this.statusSprites[k];
      if (used !== undefined) used.visible = false;
    }
    this.statusUsed = 0;
    for (let i = 0; i < curr.enemyCount; i++) {
      const sprite = this.spriteAt(this.enemySprites, this.enemyLayer, i);
      sprite.visible = true;
      const ex = this.scratchEnemyX[i] ?? 0;
      const ey = this.scratchEnemyY[i] ?? 0;
      sprite.position.set(ex, ey);
      const radius = curr.enemyRadius[i] ?? 16;
      const art = this.art[curr.enemySpecies[i] ?? NO_SPECIES];
      const worn = this.drawStatus(curr.enemyStatus[i] ?? 0, ex, ey, radius, curr.enemyId[i] ?? 0);
      // A boss in its fury is red.
      const raging =
        curr.bossPhase === 1 &&
        radius === curr.bossRadius &&
        Math.abs(ex - curr.bossX) < 2 &&
        curr.bossMaxHp > 0;
      if (art === undefined) {
        sprite.texture = this.disc;
        sprite.scale.set(radius / 32);
        sprite.tint = worn === 0xffffff ? (TYPE_COLORS[curr.enemyType[i] ?? 0] ?? 0xffffff) : worn;
        sprite.alpha = 0.9;
      } else {
        sprite.texture = art;
        sprite.scale.set((radius * ENEMY_ART_SCALE) / (art.width / 2));
        sprite.tint = raging ? 0xff8a8a : worn;
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
      const code = this.artCode(curr.pickupSpecies[i] ?? NO_SPECIES, curr.pickupLevel[i] ?? 1);
      const art = this.art[code];
      if (art === undefined) {
        sprite.texture = this.disc;
        sprite.scale.set(radius / 32);
        sprite.tint = TYPE_COLORS[curr.pickupType[i] ?? 0] ?? 0xffffff;
      } else {
        sprite.texture = art;
        sprite.scale.set(ballVisualScale(this.extents[code] ?? art.width, radius) * 1.1);
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

  /** One sprite of a move's shape, faded out by `drawEffects`. */
  private startShape(
    texture: Texture,
    x: number,
    y: number,
    width: number,
    height: number,
    centred: boolean,
    color: number,
  ): void {
    const index = this.shapeNext;
    this.shapeNext = (this.shapeNext + 1) % SHAPE_POOL;
    const sprite = this.shapes[index];
    if (sprite === undefined) return;
    sprite.texture = texture;
    sprite.anchor.set(centred ? 0.5 : 0);
    sprite.position.set(x, y);
    // `disc` is 64 px wide and `bar` 4 px: scale each to the size asked.
    sprite.scale.set(width / texture.width, height / texture.height);
    sprite.tint = color;
    sprite.visible = true;
    this.shapeLife[index] = 1;
  }

  /** The shape of a move (ADR-039): a circle, a column up to the top, a row or a cross. */
  private startMove(event: Extract<GameEvent, { type: 'move' }>): void {
    const color = TYPE_COLORS[typeCode(event.element)] ?? 0xffffff;
    const { width } = this.config.arena;
    const size = event.size;
    switch (event.shape) {
      case 'burst':
      case 'nova':
        this.startShape(this.disc, event.x, event.y, size * 2, size * 2, true, color);
        break;
      case 'beam':
        this.startShape(this.bar, event.x - size / 2, 0, size, event.y, false, color);
        break;
      case 'wave':
        this.startShape(this.bar, 0, event.y - size / 2, width, size, false, color);
        break;
      case 'cross':
        this.startShape(
          this.bar,
          event.x - size / 2,
          0,
          size,
          this.config.arena.height,
          false,
          color,
        );
        this.startShape(this.bar, 0, event.y - size / 2, width, size, false, color);
        break;
      case 'chain':
        this.startShape(this.disc, event.x, event.y, 40, 40, true, color);
        break;
    }
    // A bigger ring marks the move of a late stage, so it reads at a glance.
    if (event.tier >= 3) this.startEffect(event.x, event.y, color, 3.2);
  }

  private drawEffects(events: readonly GameEvent[], elapsedMs: number): void {
    for (const event of events) {
      if (event.type === 'move') this.startMove(event);
      else if (event.type === 'hit') this.startEffect(event.x, event.y, 0xffffff);
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
    const shapeDecay = elapsedMs / SHAPE_DURATION_MS;
    for (let i = 0; i < SHAPE_POOL; i++) {
      const life = this.shapeLife[i] ?? 0;
      const sprite = this.shapes[i];
      if (life <= 0 || sprite === undefined) continue;
      const next = life - shapeDecay;
      if (next <= 0) {
        this.shapeLife[i] = 0;
        sprite.visible = false;
      } else {
        this.shapeLife[i] = next;
        sprite.alpha = next * 0.5;
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
