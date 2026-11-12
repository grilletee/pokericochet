import {
  Application,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  TilingSprite,
} from 'pixi.js';
import {
  type AimDirection,
  aimDirection,
  GAME_TYPES,
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
  WARN_TICKS,
} from '../domain';
import { ballVisualScale, opaqueExtent } from './artBox';
import { CountdownFx, HurtFx } from './hurtFx';
import { interpolateBalls, interpolateEnemies } from './interpolate';
import {
  ART_PIXEL,
  arenaTexture,
  backdropFor,
  dotTexture,
  FX_FRAMES,
  fxFor,
  launcherTexture,
  outlinedTexture,
  ringTexture,
  sphereTexture,
} from './pixelArt';
import { chargeLook, shotFrames } from './shotArt';
import { UltimateFx } from './ultimateFx';

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
/** Codes of the kinds of hazard (the order of `HAZARD_KINDS`). */
const KIND_COMB = 1;
const KIND_SWEEP = 2;
const KIND_RAIN = 3;
const KIND_SHOT = 4;
const KIND_ZONE = 5;
const KIND_GUST = 6;
const KIND_CRACK = 7;
const KIND_PORTAL = 8;
const KIND_BLAST = 9;
/** Colour of the cracks (lava) and of the portals, which do not take the colour of the boss. */
const LAVA = 0xff7a2e;
const PORTAL_COLOR = 0xb08cff;
/** Sparks that fly off every attack while it strikes: four per hazard. */
const SPARKS_PER_HAZARD = 4;
/** The colour of every danger zone, whoever attacks (4G-F): the one language of danger. */
const DANGER = 0xff4a3a;
const OUTLINES_PER_FRAME = 2;
/** Above this many enemies the signs of the states are drawn in a reduced form. */
const STATUS_LOD_ENEMIES = 40;
/** The outline of what is against you (red); what is yours is a sphere, no outline (4G-F). */
const FOE_EDGE = '#ff5a5a';
/** Circle of the sphere texture (24 px canvas, circle of about 23 px) and share of the diameter the picture fills. */
const SPHERE_CIRCLE = 23.2;
const SPHERE_CONTENT = 0.86;
/** Pixels per millisecond the three layers of the backdrop scroll at (far, middle, near). */
const BACKDROP_SPEEDS: readonly number[] = [0.006, 0.016, 0.034];
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

/**
 * Side of the box that holds the visible pixels of a texture (ADR-037), measured once. If the
 * pixels cannot be read, the whole picture counts.
 */
/**
 * The visible part of a sprite: the side of its opaque box (ADR-037) and the same sprite cut to that
 * box (4G-G: "recorta el espacio vacío de los sprites para que el Pokémon llene la esfera"), so a
 * ball shows the Pokémon, not the empty margin of its 96 px canvas. If the pixels cannot be read,
 * the whole picture counts and nothing is cut.
 */
function measureArt(texture: Texture): { extent: number; trimmed: Texture | undefined } {
  const whole = Math.max(texture.width, texture.height);
  try {
    const resource = texture.source.resource as CanvasImageSource;
    const canvas = document.createElement('canvas');
    canvas.width = texture.width;
    canvas.height = texture.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) return { extent: whole, trimmed: undefined };
    context.drawImage(resource, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const alpha = (x: number, y: number) => data[(y * canvas.width + x) * 4 + 3] ?? 0;
    const extent = opaqueExtent(alpha, canvas.width, canvas.height);
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (alpha(x, y) <= 20) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return { extent, trimmed: undefined };
    const frame = new Rectangle(
      texture.frame.x + minX,
      texture.frame.y + minY,
      maxX - minX + 1,
      maxY - minY + 1,
    );
    return { extent, trimmed: new Texture({ source: texture.source, frame }) };
  } catch {
    return { extent: whole, trimmed: undefined };
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
  /** The feel of a hit on the player (4G-G): red flash, shake, floating number, blink. */
  private readonly hurt = new HurtFx();
  /** The seconds left over an enemy marked as a threat (4G-G). */
  private readonly countdown = new CountdownFx();
  private clockMs = 0;
  private readonly enemyLayer = new Container();
  private readonly ballLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly pickupLayer = new Container();
  private readonly aimLayer = new Container();
  private readonly pickupSprites: Sprite[] = [];
  private readonly pickupRings: Sprite[] = [];
  private readonly aimDots: Sprite[] = [];
  private readonly hazardLayer = new Container();
  private readonly hazardSprites: TilingSprite[] = [];
  /** The bright mark each hazard leaves on the floor strip, and the pool of the status signs. */
  private readonly hazardFloor: TilingSprite[] = [];
  private readonly hazardSparks: Sprite[] = [];
  /** Mechanics of the legendaries: the tide at both sides, the barrier over the boss, the slow veil. */
  private readonly tideLeft: TilingSprite;
  private readonly tideRight: TilingSprite;
  private readonly barrierSprite: TilingSprite;
  private readonly slowVeil: Sprite;
  private readonly statusLayer = new Container();
  private readonly statusSprites: Sprite[] = [];
  private statusUsed = 0;
  /** The aura of the boss while it announces and charges its strong attack. */
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
  /** The same textures cut to their opaque box, for the inside of a sphere (4G-G). */
  private readonly trimmed: (Texture | undefined)[];
  /** The moves and Ultimates (4G-E): pixel shapes, element showers, flash and shake. */
  private readonly moves: UltimateFx;
  private launcherX = 0;
  private enemiesShown = 0;
  private ballsShown = 0;
  private readonly player: Sprite;
  private readonly floorStrip: Graphics;
  private readonly backdrop: Partial<Record<'far' | 'mid' | 'near', TilingSprite>> = {};
  private readonly backdropFade: Sprite;
  /** The biome the backdrop was built for (main:second), and how much of the fade-through is left. */
  private readonly outlineQueue: {
    cache: (Texture | undefined)[];
    code: number;
    art: Texture;
    edge: string;
  }[] = [];
  private readonly outlinePending = new Set<string>();
  private statusLod = false;
  /** Enemies that are charging a shot (their ids) and whether a boss attack is being announced. */
  private readonly glowIds = new Int32Array(8);
  private glowCount = 0;
  private bossWarn = false;
  /** The solid fill of the danger zones, which fills like a countdown (4G-F). */
  private readonly hazardFill: TilingSprite[] = [];
  /** The glass spheres under the pictures of the balls (4G-F), and their layer. */
  private readonly ballSpheres: Sprite[] = [];
  private readonly sphereLayer = new Container();
  private readonly foeArt: (Texture | undefined)[] = [];
  private readonly backdropDim: Sprite;
  private backdropKey = -1;
  private backdropSheets: (TilingSprite | undefined)[] = [];
  private fade = 0;
  private scroll = 0;
  private readonly scratchBallX: Float32Array;
  private readonly scratchBallY: Float32Array;
  private readonly scratchEnemyX: Float32Array;
  private readonly scratchEnemyY: Float32Array;

  private constructor(
    private readonly app: Application,
    private readonly config: GameConfig,
    private readonly disc: Texture,
    private readonly ring: Texture,
    bar: Texture,
    maxSlots: number,
    maxEnemies: number,
    private readonly art: readonly (Texture | undefined)[],
    private readonly forms: readonly (readonly number[])[],
  ) {
    const measured = art.map((texture) =>
      texture === undefined ? undefined : measureArt(texture),
    );
    this.extents = measured.map((m) => m?.extent ?? 1);
    this.trimmed = measured.map((m) => m?.trimmed);
    this.moves = new UltimateFx(bar, config.arena.width, config.arena.height);
    this.scratchBallX = new Float32Array(maxSlots);
    this.scratchBallY = new Float32Array(maxSlots);
    this.scratchEnemyX = new Float32Array(maxEnemies);
    this.scratchEnemyY = new Float32Array(maxEnemies);

    const { width, height, defenseLineY } = config.arena;
    const background = new Graphics().rect(0, 0, width, height).fill(0x14172b);
    // The three layers of the backdrop (far, middle, near) scroll at different speeds: the parallax.
    for (const name of ['far', 'mid', 'near'] as const) {
      const sheet = new TilingSprite({ texture: Texture.EMPTY, width, height });
      sheet.tileScale.set(ART_PIXEL);
      sheet.visible = false;
      this.backdrop[name] = sheet;
      this.backdropSheets.push(sheet);
      this.biomeLayer.addChild(sheet);
    }
    this.backdropFade = new Sprite(bar);
    this.backdropFade.width = width;
    this.backdropFade.height = height;
    this.backdropFade.tint = 0x14172b;
    this.backdropFade.alpha = 0;
    this.biomeLayer.addChild(this.backdropFade);
    // A dark, desaturating film over the whole backdrop: the playing field is quieter than what
    // moves on it (4G-E).
    this.backdropDim = new Sprite(bar);
    this.backdropDim.width = width;
    this.backdropDim.height = height;
    this.backdropDim.tint = 0x070914;
    this.backdropDim.alpha = 0.5;
    this.biomeLayer.addChild(this.backdropDim);
    // The floor strip and the line of defence, in pixels: a dark band with a dashed red line.
    const floor = new Graphics()
      .rect(0, defenseLineY, width, height - defenseLineY)
      .fill({ color: 0x14172b, alpha: 0.8 })
      .rect(0, defenseLineY, width, 4)
      .fill(0x2b3a73);
    for (let x = 0; x < width; x += 16) floor.rect(x, defenseLineY - 4, 12, 4).fill(0xe04a4a);
    for (let x = 0; x < width; x += 8) floor.rect(x, height - 4, 4, 4).fill(0x4a5578);
    this.floorStrip = floor;
    this.player = new Sprite(launcherTexture());
    this.player.anchor.set(0.5);
    this.player.scale.set(2);
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
      const column = new TilingSprite({ texture: Texture.EMPTY, width: 1, height: 1 });
      column.tileScale.set(ART_PIXEL);
      column.visible = false;
      this.hazardSprites.push(column);
      this.hazardLayer.addChild(column);
      const mark = new TilingSprite({ texture: Texture.EMPTY, width: 1, height: 1 });
      mark.tileScale.set(ART_PIXEL);
      mark.visible = false;
      this.hazardFloor.push(mark);
      this.hazardLayer.addChild(mark);
      const fill = new TilingSprite({
        texture: fxFor(DANGER).particle,
        width: 1,
        height: 1,
      });
      fill.tileScale.set(ART_PIXEL);
      fill.tint = DANGER;
      fill.visible = false;
      this.hazardFill.push(fill);
      this.hazardLayer.addChild(fill);
    }
    const tideArt = fxFor(0x3f8fd8);
    this.tideLeft = new TilingSprite({
      texture: tideArt.patch[0] ?? Texture.EMPTY,
      width: 1,
      height,
    });
    this.tideRight = new TilingSprite({
      texture: tideArt.patch[0] ?? Texture.EMPTY,
      width: 1,
      height,
    });
    for (const wall of [this.tideLeft, this.tideRight]) {
      wall.tileScale.set(ART_PIXEL);
      wall.visible = false;
      wall.alpha = 0.8;
      this.hazardLayer.addChild(wall);
    }
    this.barrierSprite = new TilingSprite({ texture: Texture.EMPTY, width, height: 1 });
    this.barrierSprite.tileScale.set(ART_PIXEL);
    this.barrierSprite.visible = false;
    this.slowVeil = new Sprite(bar);
    this.slowVeil.width = width;
    this.slowVeil.height = height;
    this.slowVeil.tint = 0x6b8cff;
    this.slowVeil.alpha = 0;
    this.slowVeil.visible = false;
    for (let i = 0; i < HAZARD_POOL * SPARKS_PER_HAZARD; i++) {
      const spark = new Sprite(fxFor(0xffffff).particle);
      spark.anchor.set(0.5);
      spark.scale.set(ART_PIXEL / 2);
      spark.visible = false;
      this.hazardSparks.push(spark);
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
    this.world.addChild(
      background,
      this.biomeLayer,
      this.floorStrip,
      this.hazardLayer,
      this.aimLayer,
      this.enemyLayer,
      this.statusLayer,
      this.pickupLayer,
      this.sphereLayer,
      this.ballLayer,
      this.moves.layer,
      this.fxLayer,
      this.barrierSprite,
      ...this.hazardSparks,
      this.slowVeil,
      this.shieldRing,
      this.reachRing,
      this.player,
      this.countdown.layer,
      this.hurt.numbers,
    );
    app.stage.addChild(this.world);
    app.stage.addChild(this.hurt.flash);
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
      antialias: false, // pixel art: no smoothing anywhere
      roundPixels: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      autoStart: false, // we drive rendering from our own loop
    });
    host.appendChild(app.canvas);
    // Pixel dot and pixel ring (4G-D): every small effect, the aim guide and the markers are drawn
    // with them, so nothing in the game is a smooth circle.
    const disc = dotTexture();
    const ring = ringTexture();
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

    this.buildOutlines();
    this.drawBiome(curr, elapsedMs);
    this.drawBossFight(curr);
    this.drawBalls(prev, curr, alpha);
    this.drawEnemies(prev, curr, alpha);
    this.drawCountdowns(curr);
    this.player.x = prev.playerX + (curr.playerX - prev.playerX) * alpha;
    this.reachRing.x = this.player.x;
    this.reachRing.scale.set(this.config.pickup.radius / 30);
    this.drawPickups(curr);
    this.drawAim(curr);
    this.launcherX = this.player.x;
    this.drawEffects(events, elapsedMs);
    // The hit on the player: veil, shake, number, and the launcher blinks while it is invulnerable.
    this.clockMs += elapsedMs;
    this.hurt.update(elapsedMs, this.app.screen.width, this.app.screen.height);
    this.player.alpha = HurtFx.blink(curr.playerInvuln, this.clockMs);
    // The screen shakes for a moment when an Ultimate lands or the player is hurt.
    this.world.pivot.set(
      this.moves.shakeX + this.hurt.shakeX,
      this.moves.shakeY + this.hurt.shakeY,
    );

    this.app.render();
  }

  /**
   * The three layers of the backdrop of the biome of the wave, built once per biome and scrolled at
   * three speeds (parallax): the far one slowest. A change of biome goes through a short dip to the
   * colour of the floor, so it never pops.
   */
  private drawBackdrop(curr: Snapshot, elapsedMs: number): void {
    // The final boss has a stage of its own: the backdrop of its type, darker (4G-E).
    const ownStage = curr.bossFinal && curr.bossType >= 0;
    const main = ownStage ? curr.bossType : curr.biomeMain;
    const sheets = this.backdropSheets;
    this.backdropDim.alpha = ownStage ? 0.25 : 0.5;
    if (ownStage) {
      // A scenario of its own: a dark temple floor in the colour of the type, nothing of the biome.
      const key = 100000 + main;
      const far = sheets[0];
      if (key !== this.backdropKey && far !== undefined) {
        far.texture = arenaTexture(TYPE_COLORS[main] ?? 0xffffff);
        far.visible = true;
        for (let i = 1; i < sheets.length; i++) {
          const rest = sheets[i];
          if (rest !== undefined) rest.visible = false;
        }
        this.backdropKey = key;
        this.fade = 1;
      }
      this.fade = Math.max(0, this.fade - elapsedMs / 900);
      this.backdropFade.alpha = this.fade;
      this.scroll += elapsedMs;
      if (far !== undefined) {
        far.tilePosition.y = Math.floor((this.scroll * 0.012) / ART_PIXEL) * ART_PIXEL;
      }
      return;
    }
    if (main < 0) {
      for (const sheet of sheets) if (sheet !== undefined) sheet.visible = false;
      this.backdropKey = -1;
      return;
    }
    const second = ownStage ? main : curr.biomeSecond >= 0 ? curr.biomeSecond : main;
    const key = main * 64 + second;
    if (key !== this.backdropKey) {
      const made = backdropFor(
        main,
        second,
        (code) => `#${(TYPE_COLORS[code] ?? 0xffffff).toString(16).padStart(6, '0')}`,
      );
      const layers = [made.far, made.mid, made.near];
      sheets.forEach((sheet, i) => {
        if (sheet === undefined) return;
        sheet.texture = layers[i] ?? Texture.EMPTY;
        sheet.visible = true;
      });
      this.backdropKey = key;
      this.fade = 1;
    }
    this.fade = Math.max(0, this.fade - elapsedMs / 500);
    this.backdropFade.alpha = this.fade;
    this.scroll += elapsedMs;
    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i];
      if (sheet === undefined) continue;
      // Whole art pixels only, so the scrolling never smears the pixels.
      sheet.tilePosition.y =
        Math.floor((this.scroll * (BACKDROP_SPEEDS[i] ?? 0)) / ART_PIXEL) * ART_PIXEL;
    }
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
    // Nothing of the biome (particles, tint) in the arena of the final boss (4G-F).
    const has = main >= 0 && !curr.bossFinal;
    this.drawBackdrop(curr, elapsedMs);
    const target = has ? (TYPE_COLORS[main] ?? 0xffffff) : 0;
    const step = Math.min(1, elapsedMs / BIOME_FADE_MS);
    const goal = [(target >> 16) & 255, (target >> 8) & 255, target & 255];
    // The colour moves to the new biome; the strength goes down to 0 while there is none.
    if (has && this.tintAlpha < 0.01) this.tintRgb = goal;
    for (let c = 0; c < 3; c++) {
      this.tintRgb[c] = (this.tintRgb[c] ?? 0) + ((goal[c] ?? 0) - (this.tintRgb[c] ?? 0)) * step;
    }
    this.tintAlpha += ((has ? 0.16 : 0) - this.tintAlpha) * step;
    // The backdrop carries the colour now; the old flat tint only keeps `biomeColor` for the tests.
    this.biomeTint.alpha = 0;

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
   * The fight of a boss (4G-D, ADR-054): every attack is animated pixel art in the colour of the
   * type of the boss, with its own shape per verb (beams, orbs, patches, gusts, cracks, portals), a
   * hatched announcement, sparks on impact and a strong mark on the floor strip; the mechanics of the
   * legendaries (tide, barrier, slow time) and an aura while the boss announces and charges.
   */
  /** One danger zone: hatched area, a countdown fill and (for shots) the line from the attacker. */
  private drawDanger(
    curr: Snapshot,
    i: number,
    kind: number,
    x: number,
    width: number,
    left: number,
    originY: number,
  ): void {
    const sprite = this.hazardSprites[i];
    const mark = this.hazardFloor[i];
    const fill = this.hazardFill[i];
    if (sprite === undefined || mark === undefined || fill === undefined) return;
    if (left > WARN_TICKS) {
      sprite.visible = false;
      mark.visible = false;
      fill.visible = false;
      return;
    }
    const { height, defenseLineY } = this.config.arena;
    const floorHeight = height - defenseLineY;
    const p = 1 - left / WARN_TICKS;
    const flash = left < 14 && Math.floor(curr.tick / 3) % 2 === 0;
    const hatch = fxFor(DANGER).warn;
    sprite.visible = true;
    fill.visible = true;
    sprite.texture = hatch;
    sprite.tint = 0xffffff;
    sprite.tilePosition.set(0, 0);
    sprite.alpha = 0.34;
    // Translucent: the balls and the Pokémon stay visible through the fill.
    fill.alpha = flash ? 0.75 : 0.22 + 0.22 * p;
    mark.visible = false;
    if (kind === KIND_SHOT) {
      // The landing spot on the floor fills from the bottom; a thin line shows where it comes from.
      const w = Math.max(width, 8 * ART_PIXEL);
      // The path it will take from its attacker down to the floor (hatched), and the landing spot
      // on the floor strip, which fills from the bottom.
      sprite.x = x - w / 2;
      sprite.y = originY;
      sprite.width = w;
      sprite.height = Math.max(0, height - originY);
      sprite.alpha = 0.3;
      fill.x = x - w / 2;
      fill.width = w;
      fill.height = floorHeight * p;
      fill.y = defenseLineY + floorHeight - fill.height;
      mark.visible = true;
      mark.texture = hatch;
      mark.tint = 0xffffff;
      mark.x = x - w / 2;
      mark.y = defenseLineY;
      mark.width = w;
      mark.height = floorHeight;
      mark.alpha = 0.8;
    } else if (kind === KIND_ZONE || kind === KIND_CRACK || kind === KIND_GUST) {
      const top = kind === KIND_GUST ? defenseLineY - 60 : defenseLineY;
      const h = kind === KIND_GUST ? 46 : floorHeight;
      const left0 = kind === KIND_GUST ? 0 : x - width / 2;
      sprite.x = left0;
      sprite.y = top;
      sprite.width = width;
      sprite.height = h;
      fill.x = left0;
      fill.y = top;
      fill.width = width * p;
      fill.height = h;
    } else {
      // Columns, combs, sweeps and rain: a band that fills from the top, and the same band marked
      // strongly on the floor strip so it reads even with a finger over the field.
      sprite.x = x - width / 2;
      sprite.y = 0;
      sprite.width = width;
      sprite.height = height;
      fill.x = x - width / 2;
      fill.y = 0;
      fill.width = width;
      fill.height = height * p;
      mark.visible = true;
      mark.texture = hatch;
      mark.tint = 0xffffff;
      mark.x = x - width / 2;
      mark.y = defenseLineY;
      mark.width = width;
      mark.height = floorHeight;
      mark.alpha = 0.55 + 0.4 * p;
    }
  }

  private drawBossFight(curr: Snapshot): void {
    const { height, defenseLineY } = this.config.arena;
    const floorHeight = height - defenseLineY;
    const bossColor = TYPE_COLORS[curr.bossType] ?? 0xff6b4a;
    // Who is about to attack: a boss (its own attacks have a link >= 0) or the enemies whose shots
    // are being announced (link = minus their id), so their bodies can gleam before the strike.
    this.glowCount = 0;
    this.bossWarn = false;
    for (let i = 0; i < curr.hazardCount; i++) {
      const link = curr.hazardLink[i] ?? 0;
      const warn = curr.hazardWarn[i] ?? 0;
      // The enemy marked as a threat glows during its whole countdown, not only the last WARN_TICKS.
      if (warn <= 0 || (warn > WARN_TICKS && (curr.hazardKind[i] ?? 0) !== KIND_BLAST)) continue;
      if (link < 0) {
        if (this.glowCount < this.glowIds.length) this.glowIds[this.glowCount++] = -link;
      } else if ((curr.hazardKind[i] ?? 0) !== KIND_PORTAL) {
        this.bossWarn = true;
      }
    }
    for (let i = 0; i < HAZARD_POOL; i++) {
      const sprite = this.hazardSprites[i];
      const mark = this.hazardFloor[i];
      const fill = this.hazardFill[i];
      if (sprite === undefined || mark === undefined || fill === undefined) continue;
      if (i >= curr.hazardCount) {
        sprite.visible = false;
        mark.visible = false;
        fill.visible = false;
        continue;
      }
      const kind = curr.hazardKind[i] ?? 0;
      const x = curr.hazardX[i] ?? 0;
      const width = curr.hazardWidth[i] ?? 0;
      const left = curr.hazardWarn[i] ?? 0;
      const activeLeft = curr.hazardActive[i] ?? 0;
      const warning = left > 0;
      const frame = Math.floor(curr.tick / 5) % FX_FRAMES;
      const color = kind === KIND_CRACK ? LAVA : kind === KIND_PORTAL ? PORTAL_COLOR : bossColor;
      const fx = fxFor(color);
      const pulse = 0.5 + 0.5 * Math.sin(curr.tick / Math.max(2, left / 8));
      // The one language of danger (4G-F): while it is announced every attack is the same hatched
      // red zone that fills like a countdown and strikes when it is full; before the last
      // `WARN_TICKS` (staggered attacks) nothing is shown yet.
      if (warning && kind !== KIND_PORTAL) {
        this.drawDanger(curr, i, kind, x, width, left, curr.hazardY[i] ?? 0);
        for (let k = 0; k < SPARKS_PER_HAZARD; k++) {
          const spark = this.hazardSparks[i * SPARKS_PER_HAZARD + k];
          if (spark !== undefined) spark.visible = false;
        }
        continue;
      }
      fill.visible = false;
      sprite.visible = true;
      mark.visible = false;
      sprite.tint = 0xffffff;
      mark.tint = 0xffffff;
      sprite.tilePosition.set(0, 0);
      mark.tilePosition.set(0, 0);
      if (kind === KIND_SHOT) {
        // A falling orb with a pixel trail; its landing spot is hatched on the floor while it is announced.
        const y = curr.hazardY[i] ?? 0;
        const size = Math.max(width, 3 * ART_PIXEL);
        // A shot of an enemy is the projectile of its type (4G-G): spark, ember, bubble, leaf...
        const shotCode = curr.hazardType[i] ?? 255;
        const own = shotCode === 255 ? [] : shotFrames(shotCode, TYPE_COLORS[shotCode] ?? 0xffffff);
        sprite.texture = (own.length > 0 ? own[frame] : fx.orb[frame]) ?? Texture.EMPTY;
        sprite.width = ART_PIXEL * 12;
        sprite.height = ART_PIXEL * 18;
        sprite.x = x - sprite.width / 2;
        sprite.y = (warning ? defenseLineY - ART_PIXEL * 18 : y - ART_PIXEL * 12) - 0;
        sprite.alpha = warning ? 0.35 + 0.4 * pulse : 1;
        sprite.tilePosition.set(0, 0);
        mark.visible = true;
        mark.texture = fx.warn;
        mark.x = x - size / 2;
        mark.y = defenseLineY;
        mark.width = size;
        mark.height = floorHeight;
        mark.alpha = warning ? 0.5 + 0.4 * pulse : 0.15;
      } else if (kind === KIND_ZONE || kind === KIND_CRACK) {
        // A patch of floor: bubbling pixels in the colour of the boss (lava for a crack).
        sprite.texture = fx.patch[frame] ?? Texture.EMPTY;
        sprite.width = width;
        sprite.height = floorHeight;
        sprite.x = x - width / 2;
        sprite.y = defenseLineY;
        sprite.alpha = warning ? 0.25 + 0.3 * pulse : 0.85;
        if (warning) {
          mark.visible = true;
          mark.texture = fx.warn;
          mark.x = sprite.x;
          mark.y = defenseLineY;
          mark.width = width;
          mark.height = floorHeight;
          mark.alpha = 0.6;
        }
      } else if (kind === KIND_GUST) {
        // A gust: streaks of pixels that sweep across the floor.
        sprite.texture = fx.gust[frame] ?? Texture.EMPTY;
        sprite.width = width;
        sprite.height = 46;
        sprite.x = 0;
        sprite.y = defenseLineY - 60;
        sprite.tilePosition.set(curr.tick * 3, 0);
        sprite.alpha = warning ? 0.25 + 0.2 * pulse : 0.7;
      } else if (kind === KIND_PORTAL) {
        // A portal: a ring of pixels, and its pair at the other side; the player is carried between them.
        const link = curr.hazardLink[i] ?? 0;
        sprite.texture = fx.orb[frame] ?? Texture.EMPTY;
        sprite.width = ART_PIXEL * 12;
        sprite.height = ART_PIXEL * 12;
        sprite.x = x - sprite.width / 2;
        sprite.y = defenseLineY + 6;
        sprite.alpha = warning ? 0.4 + 0.4 * pulse : 0.95;
        mark.visible = link > 0;
        mark.texture = fx.orb[frame] ?? Texture.EMPTY;
        mark.x = link - ART_PIXEL * 6;
        mark.y = defenseLineY + 6;
        mark.width = ART_PIXEL * 12;
        mark.height = ART_PIXEL * 12;
        mark.alpha = sprite.alpha;
      } else {
        // Columns, combs, sweeps and rain: beams (announced as a hatched band), orbs for rain, and a
        // strong mark on the floor strip so it reads even when a finger covers the field.
        const stream = kind === KIND_RAIN;
        sprite.texture = warning
          ? fx.warn
          : stream
            ? (fx.orb[frame] ?? Texture.EMPTY)
            : (fx.beam[frame] ?? Texture.EMPTY);
        sprite.width = width;
        sprite.height = height;
        sprite.x = x - width / 2;
        sprite.y = 0;
        // Centre the art in the band, scroll upwards (beam) or downwards (rain).
        const artWidth = 12 * ART_PIXEL;
        sprite.tilePosition.set(width / 2 - artWidth / 2, stream ? curr.tick * 9 : -curr.tick * 6);
        sprite.alpha = warning
          ? 0.25 + 0.35 * pulse
          : kind === KIND_COMB || kind === KIND_SWEEP
            ? 0.95
            : 1;
        mark.visible = true;
        mark.texture = warning ? fx.warn : (fx.beam[frame] ?? Texture.EMPTY);
        mark.x = x - width / 2;
        mark.y = defenseLineY;
        mark.width = width;
        mark.height = floorHeight;
        mark.tilePosition.set(width / 2 - 6 * ART_PIXEL, -curr.tick * 6);
        mark.alpha = warning ? 0.55 + 0.45 * pulse : 1;
      }
      // Sparks fly off an attack while it strikes: the impact.
      for (let k = 0; k < SPARKS_PER_HAZARD; k++) {
        const spark = this.hazardSparks[i * SPARKS_PER_HAZARD + k];
        if (spark === undefined) continue;
        const striking = !warning && activeLeft > 0 && kind !== KIND_GUST && kind !== KIND_ZONE;
        spark.visible = striking;
        if (!striking) continue;
        const f = (curr.tick * 0.07 + k / SPARKS_PER_HAZARD + i * 0.31) % 1;
        spark.tint = 0xfff3c4;
        spark.x = x + (k - 1.5) * Math.max(10, width * 0.25) + Math.sin(curr.tick / 3 + k) * 4;
        spark.y = defenseLineY - f * 60;
        spark.alpha = 1 - f;
      }
    }
    // The mechanics of a legendary (ADR-054): the tide closes in from both sides, the barrier is a
    // shimmering line over the boss, time slow is a cold veil over the whole field.
    const { width: arenaWidth } = this.config.arena;
    const squeeze = curr.bossSqueeze * arenaWidth * 0.3;
    for (const [wall, left] of [
      [this.tideLeft, true],
      [this.tideRight, false],
    ] as const) {
      wall.visible = squeeze > 1;
      if (!wall.visible) continue;
      wall.width = squeeze;
      wall.height = height;
      wall.x = left ? 0 : arenaWidth - squeeze;
      wall.tilePosition.set(Math.sin(curr.tick / 30) * 8, curr.tick * 0.5);
    }
    const alive = curr.bossMaxHp > 0 && curr.bossHp > 0;
    this.barrierSprite.visible = alive && curr.bossBarrier;
    if (this.barrierSprite.visible) {
      const bf = fxFor(0xc792ea);
      this.barrierSprite.texture = bf.gust[Math.floor(curr.tick / 4) % FX_FRAMES] ?? Texture.EMPTY;
      this.barrierSprite.y = curr.bossY + curr.bossRadius + 8;
      this.barrierSprite.height = 8 * ART_PIXEL;
      this.barrierSprite.tilePosition.set(curr.tick * 2, 0);
      this.barrierSprite.alpha = 0.7 + 0.25 * Math.sin(curr.tick / 5);
    }
    this.slowVeil.visible = curr.bossTimeSlow;
    this.slowVeil.alpha = curr.bossTimeSlow ? 0.12 + 0.05 * Math.sin(curr.tick / 12) : 0;
    // The charge: the boss is announced with a pulsing yellow aura and, while it charges (exposed),
    // wears a red-hot aura that throbs fast. Guarded, there is nothing around it.
    const charging = alive && curr.bossCoreOpen > 0;
    const announcing = alive && curr.bossCoreWarning;
    this.shieldRing.visible = charging || announcing;
    if (this.shieldRing.visible) {
      this.shieldRing.x = curr.bossX;
      this.shieldRing.y = curr.bossY;
      const beat = Math.sin(curr.tick / (charging ? 3 : 6));
      this.shieldRing.scale.set((curr.bossRadius + (charging ? 14 : 8) + beat * 4) / 30);
      this.shieldRing.tint = charging ? 0xff4b3a : 0xffd54f;
      this.shieldRing.alpha = charging ? 0.85 : 0.5 + 0.3 * beat;
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
    // With a crowd on the field each state draws one sign instead of several (render cost, 4G-E).
    const lod = this.statusLod;
    if (bits & STATUS_BURN) {
      for (let k = 0; k < (lod ? 1 : 3); k++) {
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
      for (let k = 0; k < (lod ? 1 : 3); k++) {
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
      for (let k = 0; k < (lod ? 1 : 2); k++) {
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
      for (let k = 0; k < (lod ? 1 : 4); k++) {
        const a = (k / 4) * Math.PI * 2 + 0.6;
        this.statusDot(x + Math.cos(a) * radius, y + Math.sin(a) * radius, 0xffffff, 2.6, 0.9);
      }
    }
    if (bits & STATUS_PARALYSED) {
      const frame = Math.floor(t / 80) + seed;
      for (let k = 0; k < (lod ? 1 : 3); k++) {
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
      for (let k = 0; k < (lod ? 1 : 2); k++) {
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
      for (let k = 1; k <= (lod ? 1 : 3); k++)
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

  /** Builds the outlines that were asked for, a couple per frame (see `outlined`). */
  private buildOutlines(): void {
    for (let n = 0; n < OUTLINES_PER_FRAME && this.outlineQueue.length > 0; n++) {
      const job = this.outlineQueue.shift();
      if (job === undefined || job.cache[job.code] !== undefined) continue;
      job.cache[job.code] = outlinedTexture(job.art, job.edge);
    }
  }

  /** The outlined picture of art `code` (built once): allies cyan, enemies red (4G-E, legibility). */
  private outlined(
    cache: (Texture | undefined)[],
    code: number,
    art: Texture,
    edge: string,
  ): Texture {
    const made = cache[code];
    if (made !== undefined) return made;
    // Building an outline costs about 2 ms: never inside a frame in bulk. The plain picture is
    // drawn until its turn comes (at most `OUTLINES_PER_FRAME` are built per frame).
    const key = `${edge}:${code}`;
    if (!this.outlinePending.has(key)) {
      this.outlinePending.add(key);
      this.outlineQueue.push({ cache, code, art, edge });
    }
    return art;
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
      // The ball IS a glass sphere (4G-F) of exactly the collision radius, with the Pokémon inside.
      const sphere = this.spriteAt(this.ballSpheres, this.sphereLayer, shown);
      sphere.visible = true;
      sphere.position.set(sprite.x, sprite.y);
      sphere.texture = sphereTexture(TYPE_COLORS[curr.ballType[slot] ?? 0] ?? 0xffffff);
      sphere.scale.set((2 * radius) / SPHERE_CIRCLE);
      if (art === undefined) {
        sprite.texture = this.disc;
        sprite.scale.set((radius * 0.7) / 32);
      } else {
        // The Pokémon cut to its visible box fills the glass: its longest side is the share
        // `SPHERE_CONTENT` of the diameter (the empty margin of the canvas is not drawn).
        const cut = this.trimmed[code] ?? art;
        sprite.texture = cut;
        sprite.scale.set((2 * radius * SPHERE_CONTENT) / Math.max(1, cut.width, cut.height));
      }
      sprite.tint = 0xffffff;
      sprite.alpha = 1;
      shown += 1;
    }
    for (let i = shown; i < this.ballsShown; i++) {
      const sprite = this.ballSprites[i];
      if (sprite) sprite.visible = false;
      const sphere = this.ballSpheres[i];
      if (sphere) sphere.visible = false;
    }
    this.ballsShown = shown;
  }

  /** The seconds left over each enemy marked as a threat (a `blast` with the enemy's id as link). */
  private drawCountdowns(curr: Snapshot): void {
    this.countdown.begin();
    for (let i = 0; i < curr.hazardCount; i++) {
      if ((curr.hazardKind[i] ?? 0) !== KIND_BLAST) continue;
      const left = curr.hazardWarn[i] ?? 0;
      if (left <= 0) continue;
      const id = -(curr.hazardLink[i] ?? 0);
      for (let e = 0; e < curr.enemyCount; e++) {
        if (curr.enemyId[e] !== id) continue;
        const radius = curr.enemyRadius[e] ?? 16;
        this.countdown.show(
          this.scratchEnemyX[e] ?? 0,
          (this.scratchEnemyY[e] ?? 0) - radius - 20,
          left,
        );
        break;
      }
    }
    this.countdown.end();
  }

  private drawEnemies(prev: Snapshot, curr: Snapshot, alpha: number): void {
    interpolateEnemies(prev, curr, alpha, this.scratchEnemyX, this.scratchEnemyY);
    // The signs of the states of the enemies use a pool of dots that is refilled every frame.
    for (let k = 0; k < this.statusUsed; k++) {
      const used = this.statusSprites[k];
      if (used !== undefined) used.visible = false;
    }
    this.statusUsed = 0;
    this.statusLod = curr.enemyCount > STATUS_LOD_ENEMIES;
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
        sprite.texture = this.outlined(
          this.foeArt,
          curr.enemySpecies[i] ?? NO_SPECIES,
          art,
          FOE_EDGE,
        );
        const base = (radius * ENEMY_ART_SCALE) / (art.width / 2);
        const isBoss =
          radius === curr.bossRadius && Math.abs(ex - curr.bossX) < 2 && curr.bossMaxHp > 0;
        const exposed = isBoss && curr.bossCoreOpen > 0;
        // The attacker shows what it is about to do (4G-F): a boss gleams red before each attack, an
        // enemy that is charging a shot glows yellow and white until the shot leaves its body.
        const id = curr.enemyId[i] ?? 0;
        let charging = false;
        for (let k = 0; k < this.glowCount; k++) if (this.glowIds[k] === id) charging = true;
        const beat = Math.floor(curr.tick / (exposed ? 3 : 5)) % 2 === 0;
        sprite.scale.set(base * (exposed ? 1 + 0.08 * Math.sin(curr.tick / 2.5) : 1));
        if (exposed) {
          // VULNERABLE: gold and white flashes, the body pulsing and a fat gold halo behind it.
          sprite.tint = beat ? 0xffd23a : 0xffffff;
          this.statusRing(ex, ey, 0xffd23a, radius * 1.5 + 6 * Math.sin(curr.tick / 4), 0.9);
        } else if (isBoss && this.bossWarn) {
          sprite.tint = beat ? 0xff6a5a : 0xffffff;
        } else if (charging) {
          // Its own warning on its body (4G-G): the colour of its type and a pace that goes with
          // it (electric flickers, water breathes, rock glows heavy, a ghost fades).
          const typeCode = curr.enemyType[i] ?? 0;
          const look = chargeLook(GAME_TYPES[typeCode] ?? 'normal');
          const tone = TYPE_COLORS[typeCode] ?? 0xfff27a;
          const on = Math.floor(curr.tick / look.blink) % 2 === 0;
          sprite.tint = on ? tone : 0xffffff;
          const fade = look.fade ? 0.45 + 0.4 * Math.sin(curr.tick / look.blink) : 0.85;
          this.statusRing(ex, ey, tone, radius * look.ring, fade);
        } else {
          sprite.tint = raging ? 0xff8a8a : worn;
        }
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

  /** The shape of a move (ADR-039) as animated pixel art, with the launch of an Ultimate (4G-E). */
  private startMove(event: Extract<GameEvent, { type: 'move' }>): void {
    const color = TYPE_COLORS[typeCode(event.element)] ?? 0xffffff;
    this.moves.start(
      event.shape,
      event.element,
      color,
      event.x,
      event.y,
      event.size,
      event.tier,
      event.manual,
      this.launcherX,
      this.config.player.y,
    );
    // A bigger ring marks the move of a late stage, so it reads at a glance.
    if (event.tier >= 3) this.startEffect(event.x, event.y, color, 3.2);
  }

  private drawEffects(events: readonly GameEvent[], elapsedMs: number): void {
    for (const event of events) {
      if (event.type === 'move') this.startMove(event);
      else if (event.type === 'playerHurt')
        this.hurt.hurt(this.player.x, this.config.player.y, event.damage);
      else if (event.type === 'hit') this.startEffect(event.x, event.y, 0xffffff);
      else if (event.type === 'kill') this.startEffect(event.x, event.y, 0xffd54f);
      else if (event.type === 'chain') {
        this.startEffect(event.toX, event.toY, 0xfff176);
        this.moves.bolt(event.fromX, event.fromY, event.toX, event.toY);
      } else if (event.type === 'collect')
        this.startEffect(event.x, this.config.player.y, 0x81d4fa);
      else if (event.type === 'capture')
        this.startEffect(event.x, this.config.player.y, PICKUP_GOLD, 2.2);
      else if (event.type === 'captureDrop') {
        // Two staggered rings, big and gold: a drop must be seen from across the field.
        this.startEffect(event.x, event.y, PICKUP_GOLD, 2.6);
        this.startEffect(event.x, event.y, 0xffffff, 1.6);
      }
    }
    this.moves.update(elapsedMs);
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
