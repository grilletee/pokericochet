import {
  Application,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
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
  LEGEND_LINK,
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
import { Backdrop } from './backdrop';
import { strikeLook } from './bossArt';
import { legendArenaTexture, strikeFrames } from './bossTextures';
import { BossDeathFx } from './deathFx';
import { FLASH_MS, mayFlash } from './feelRules';
import { DECK_LINE_ROWS, deckTexture } from './fieldArt';
import { FieldFx } from './fieldFx';
import { DISC, fxAtlas, RING } from './fxAtlas';
import { HurtFx } from './hurtFx';
import { interpolateBalls, interpolateEnemies } from './interpolate';
import { arenaOf, LEGEND_ARENAS } from './legendArena';
import { FIELD_PIXEL, glowTexture } from './paint';
import { liveParticles, PARTICLE_DYNAMIC, placeParticle } from './particles';
import {
  ART_PIXEL,
  arenaTexture,
  dotTexture,
  FX_FRAMES,
  fxFor,
  launcherTexture,
  outlinedTexture,
  ringTexture,
  sphereTexture,
  whiteOf,
} from './pixelArt';
import { type AmbientDef, sceneFor } from './sceneIds';
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
/** Dots in the trail of a ball (4G-H). */
const TRAIL_DOTS = 4;
/**
 * A boss near the defence line (4G-I): its distance shows from 40 s away, turns red at 15 s and
 * beats fast at 5 s (the same seconds as the bar and the alarm of the interface).
 */
const LINE_SHOW_TICKS = 40 * 60;
const LINE_NEAR_TICKS = 15 * 60;
const LINE_CRITICAL_TICKS = 5 * 60;
const AIM_DOTS = 16;
/** How fast the tint of the field moves to the colour of a new biome, in milliseconds. */
const BIOME_FADE_MS = 900;
/** The halo under a ball of a rare Pokémon (4V; art bible §3.3): none, ★4 violet, ★5 gold. */
const RARITY_GLOW: readonly number[] = [0, 0, 0, 0, 0xb58cff, 0xffd75a];
/** Where a pooled sprite that is not in use waits: far off the field (never `visible = false`). */
const OFF = -9999;
/** Enemy ids are folded into this many slots for the white flash of a hit. */
const FLASH_SLOTS = 1024;
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
    // One pass over the pixels for the box (this runs for every species at start-up, so no closure
    // per pixel): same rule as `opaqueExtent` (alpha above 20).
    const w = canvas.width;
    let minX = w;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0, at = 3; y < canvas.height; y++) {
      for (let x = 0; x < w; x++, at += 4) {
        if ((data[at] ?? 0) <= 20) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return { extent: whole, trimmed: undefined };
    const extent = Math.max(maxX - minX + 1, maxY - minY + 1);
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
  /** The death of a boss (4G-H): it shakes, flashes, swells and bursts before it is gone. */
  private readonly death: BossDeathFx;
  /** The boss as it was in the last frame it was alive: where its death is played. */
  private readonly lastBoss = { x: 0, y: 0, radius: 0, species: 0, type: -1, final: false };
  private speciesIds: readonly string[] = [];
  /** The distance of a boss to the defence line, and the line beating when it is near (4G-I). */
  private readonly lineDots: Sprite[] = [];
  private readonly lineGlow: Sprite;
  /**
   * The legendary move (4G-I): the whole field takes the colour of the legendary and beats while
   * the move is announced (its name is told by the interface).
   */
  private readonly legendVeil: Sprite;
  private legendLife = 0;
  private legendTotal = 1;
  /** The rings round a legendary (4G-H). */
  private readonly legendRings: Sprite[] = [];
  private clockMs = 0;
  private readonly enemyLayer = new Container();
  private readonly ballLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly pickupLayer = new Container();
  private readonly aimLayer = new Container();
  private readonly pickupSprites: Sprite[] = [];
  /** The glass sphere of a ball on the floor (4G-H): the same one it has in flight. */
  private readonly pickupSpheres: Sprite[] = [];
  private readonly aimDots: Sprite[] = [];
  /** The ring at the aim point of the two thumbs (4G-H). */
  private readonly aimReticle: Sprite;
  private reticleOn = false;
  private readonly hazardLayer = new Container();
  /** The sparks of the hazards in their own layer, so it can leave the scene when there are none. */
  private readonly sparkLayer = new Container();
  private readonly hazardSprites: TilingSprite[] = [];
  /** The bright mark each hazard leaves on the floor strip, and the pool of the status signs. */
  private readonly hazardFloor: TilingSprite[] = [];
  private readonly hazardSparks: Sprite[] = [];
  /** Mechanics of the legendaries: the tide at both sides, the barrier over the boss, the slow veil. */
  private readonly tideLeft: TilingSprite;
  private readonly tideRight: TilingSprite;
  private readonly barrierSprite: TilingSprite;
  private readonly slowVeil: Sprite;
  // The small things that move every frame by the hundred (the signs of the states, the trails
  // and the shadows of the balls) are particles of PixiJS on the one sheet of the effects (4V,
  // performance): no scene-graph node each, one draw call per layer.
  private readonly statusLayer = new ParticleContainer({ dynamicProperties: PARTICLE_DYNAMIC });
  private readonly statusSprites: Particle[] = [];
  private readonly shadowLayer = new ParticleContainer({ dynamicProperties: PARTICLE_DYNAMIC });
  private readonly atlas = fxAtlas();
  private statusUsed = 0;
  /** The aura of the boss while it announces and charges its strong attack. */
  private readonly shieldRing: Sprite;
  /** The scene behind the game: ground, props, air and light (4V, block 1). */
  private readonly scenery: Backdrop;
  /** The feel of the hits: sparks by type, damage numbers, deaths in pixels (4V). */
  private readonly feel = new FieldFx();
  /** When each enemy (its id folded into a slot) last started to flash white, in ms of the clock. */
  private readonly flashStart = new Float64Array(FLASH_SLOTS).fill(-1e9);
  /** The stars of the Pokémon of each art code (0 = none): the halo of a rare ball. */
  private rarity: Uint8Array = new Uint8Array(0);
  private readonly ballShadows: Particle[] = [];
  private readonly ballGlows: Sprite[] = [];
  private readonly glowLayer = new Container();
  private glowsShown = 0;
  private readonly launcherGlow: Sprite;
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
  /** The art textures cut to their opaque box, for the inside of a sphere (4G-G). */
  private readonly trimmed: (Texture | undefined)[];
  /** The moves and Ultimates (4G-E): pixel shapes, element showers, flash and shake. */
  private readonly moves: UltimateFx;
  private launcherX = 0;
  private enemiesShown = 0;
  private ballsShown = 0;
  private readonly player: Sprite;
  private readonly floorStrip: Container;
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
  /** The trail of each ball in the colour of its type (4G-H), behind the spheres. */
  private readonly trailLayer = new ParticleContainer({ dynamicProperties: PARTICLE_DYNAMIC });
  private readonly trailSprites: Particle[] = [];
  private readonly foeArt: (Texture | undefined)[] = [];
  private readonly scratchBallX: Float32Array;
  private readonly scratchBallY: Float32Array;
  private readonly scratchEnemyX: Float32Array;
  private readonly scratchEnemyY: Float32Array;

  private constructor(
    private readonly app: Application,
    private readonly config: GameConfig,
    private readonly disc: Texture,
    ring: Texture,
    bar: Texture,
    maxSlots: number,
    maxEnemies: number,
    private readonly art: readonly (Texture | undefined)[],
  ) {
    const measured = art.map((texture) =>
      texture === undefined ? undefined : measureArt(texture),
    );
    this.trimmed = measured.map((m) => m?.trimmed);
    this.moves = new UltimateFx(bar, config.arena.width, config.arena.height);
    this.scratchBallX = new Float32Array(maxSlots);
    this.scratchBallY = new Float32Array(maxSlots);
    this.scratchEnemyX = new Float32Array(maxEnemies);
    this.scratchEnemyY = new Float32Array(maxEnemies);

    const { width, height, defenseLineY } = config.arena;
    const background = new Graphics().rect(0, 0, width, height).fill(0x0b0d1a);
    // The scene of the biome (4V): painted ground and props with parallax, air and light.
    this.scenery = new Backdrop(width, height);
    // The deck under the line of defence: plates of metal with a rail, and the line as red dashes.
    const deckRows = Math.ceil((height - defenseLineY) / FIELD_PIXEL);
    const deck = new Sprite(
      deckTexture(
        Math.ceil(width / FIELD_PIXEL),
        deckRows,
        Math.round((config.player.y - defenseLineY) / FIELD_PIXEL) + 5,
      ),
    );
    deck.scale.set(FIELD_PIXEL);
    deck.y = defenseLineY - DECK_LINE_ROWS * FIELD_PIXEL;
    this.floorStrip = new Container();
    this.floorStrip.addChild(deck);
    this.player = new Sprite(launcherTexture());
    this.player.anchor.set(0.5);
    this.player.scale.set(2);
    this.player.y = config.player.y;
    // A soft light under the launcher: it is the one thing on the deck that is yours.
    this.launcherGlow = new Sprite(glowTexture(32));
    this.launcherGlow.anchor.set(0.5);
    this.launcherGlow.blendMode = 'add';
    this.launcherGlow.tint = 0x5fb0ff;
    this.launcherGlow.scale.set(FIELD_PIXEL * 1.2);
    this.launcherGlow.y = config.player.y + 4;

    for (let i = 0; i < FX_POOL; i++) {
      const sprite = new Sprite(ring);
      sprite.anchor.set(0.5);
      sprite.position.set(OFF, OFF);
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
    this.aimReticle = new Sprite(ring);
    this.aimReticle.anchor.set(0.5);
    this.aimReticle.tint = 0xffd54f;
    this.aimReticle.visible = false;
    this.aimLayer.addChild(this.aimReticle);
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
      this.sparkLayer.addChild(spark);
    }
    const spare = (): Particle =>
      new Particle({ texture: this.atlas.disc, x: OFF, y: OFF, anchorX: 0.5, anchorY: 0.5 });
    for (let i = 0; i < STATUS_POOL; i++) {
      const sign = spare();
      this.statusSprites.push(sign);
    }
    for (let i = 0; i < maxSlots; i++) {
      const shadow = spare();
      shadow.tint = 0x0b0d1a;
      shadow.alpha = 0.34;
      this.ballShadows.push(shadow);
    }
    for (let i = 0; i < maxSlots * TRAIL_DOTS; i++) {
      const dot = spare();
      this.trailSprites.push(dot);
    }
    for (let k = 0; k < 14; k++) {
      const dot = new Sprite(disc);
      dot.anchor.set(0.5);
      dot.visible = false;
      this.lineDots.push(dot);
    }
    this.legendVeil = new Sprite(Texture.WHITE);
    this.legendVeil.visible = false;
    this.lineGlow = new Sprite(Texture.WHITE);
    this.lineGlow.tint = 0xff3b3b;
    this.lineGlow.visible = false;
    this.shieldRing = new Sprite(ring);
    this.shieldRing.anchor.set(0.5);
    this.shieldRing.visible = false;
    this.death = new BossDeathFx(ring);
    for (let k = 0; k < 2; k++) {
      const legendRing = new Sprite(ring);
      legendRing.anchor.set(0.5);
      legendRing.visible = false;
      this.legendRings.push(legendRing);
    }
    this.world.addChild(
      background,
      this.scenery.under,
      this.legendVeil,
      this.floorStrip,
      this.lineGlow,
      ...this.lineDots,
      this.hazardLayer,
      ...this.legendRings,
      this.aimLayer,
      this.enemyLayer,
      this.feel.puffLayer,
      this.death.layer,
      this.statusLayer,
      this.feel.layer,
      this.pickupLayer,
      this.shadowLayer,
      this.glowLayer,
      this.trailLayer,
      this.sphereLayer,
      this.ballLayer,
      this.moves.layer,
      this.fxLayer,
      this.barrierSprite,
      this.sparkLayer,
      this.slowVeil,
      this.shieldRing,
      this.reachRing,
      this.launcherGlow,
      this.player,
      this.scenery.over,
      this.feel.numbers,
      this.hurt.numbers,
    );
    // The surround (4G-J, phone layouts): the far layer of the backdrop goes on behind the field,
    // across the side bands, dimmed, with a frame around the field. Off unless `setSurround(true)`.
    this.surround = new TilingSprite({ texture: Texture.EMPTY, width: 1, height: 1 });
    this.surroundDim = new Sprite(bar);
    this.surroundDim.tint = 0x070914;
    this.surroundDim.alpha = 0.74;
    this.surroundFrame = new Graphics();
    this.surroundLayer.addChild(this.surround, this.surroundDim, this.surroundFrame);
    this.surroundLayer.visible = false;
    app.stage.addChild(this.surroundLayer);
    app.stage.addChild(this.world);
    app.stage.addChild(this.hurt.flash);
    app.stage.addChild(this.death.flash);
  }

  private readonly surroundLayer = new Container();
  private readonly surround: TilingSprite;
  private readonly surroundDim: Sprite;
  private readonly surroundFrame: Graphics;
  private surroundOn = false;
  private surroundFrameKey = '';

  /** The biome behind the side bands (4G-J, block 4: the layouts A and B of a phone held sideways). */
  setSurround(on: boolean): void {
    this.surroundOn = on;
    this.surroundLayer.visible = on;
  }

  /** Keeps the surround aligned with the far layer of the field, so the backdrop runs on seamlessly. */
  private drawSurround(scale: number, x0: number, y0: number): void {
    if (!this.surroundOn) return;
    const far = this.scenery.groundSheet;
    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const on = this.scenery.ready && far.texture !== Texture.EMPTY;
    this.surround.visible = on;
    if (on) {
      this.surround.texture = far.texture;
      this.surround.width = screenW;
      this.surround.height = screenH;
      this.surround.tileScale.set(far.tileScale.x * scale, far.tileScale.y * scale);
      this.surround.tilePosition.set(
        x0 + far.tilePosition.x * scale,
        y0 + far.tilePosition.y * scale,
      );
    }
    this.surroundDim.width = screenW;
    this.surroundDim.height = screenH;
    const { width, height } = this.config.arena;
    const key = `${screenW}:${screenH}:${scale}`;
    if (key !== this.surroundFrameKey) {
      this.surroundFrameKey = key;
      // A pixel frame just outside the field: the play area reads at a glance.
      const w = width * scale;
      const h = height * scale;
      this.surroundFrame
        .clear()
        .rect(x0 - 4, y0 - 4, w + 8, h + 8)
        .fill(0x14172b)
        .rect(x0 - 2, y0 - 2, w + 4, h + 4)
        .fill(0x5fb0ff);
    }
  }

  /** The species id of every art code: the arena of a legendary is looked up by its id (4G-H). */
  setSpeciesIds(ids: readonly string[]): void {
    this.speciesIds = ids;
  }

  /** True while the death of a boss is being played: the app waits for it before the summary. */
  get dying(): boolean {
    return this.death.active;
  }

  static async create(
    host: HTMLElement,
    config: GameConfig,
    maxSlots: number,
    maxEnemies: number,
    art: readonly (Texture | undefined)[] = [],
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
    return new Renderer(app, config, disc, ring, bar, maxSlots, maxEnemies, art);
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
    this.drawSurround(scale, this.world.position.x, this.world.position.y);
    this.drawBossFight(curr);
    // The anticipation on the body of the boss (4V; art bible §6): while it announces an attack or
    // charges the strong one, matter of its type is drawn in to it, one mote every few ticks.
    if (
      this.feelOn &&
      curr.tick !== this.gatherTick &&
      curr.tick % 3 === 0 &&
      curr.bossMaxHp > 0 &&
      curr.bossHp > 0 &&
      (this.bossWarn || curr.bossCoreOpen > 0 || curr.bossCoreWarning)
    ) {
      this.gatherTick = curr.tick;
      this.feel.gather(
        curr.bossX,
        curr.bossY,
        curr.bossRadius,
        Math.max(0, curr.bossType),
        TYPE_COLORS[curr.bossType] ?? 0xffffff,
      );
    }
    if (curr.bossMaxHp > 0 && curr.bossHp > 0) {
      const b = this.lastBoss;
      b.x = curr.bossX;
      b.y = curr.bossY;
      b.radius = curr.bossRadius;
      b.species = curr.bossSpecies;
      b.type = curr.bossType;
      b.final = curr.bossFinal;
    }
    this.drawBalls(prev, curr, alpha);
    this.drawEnemies(prev, curr, alpha);
    this.player.x = prev.playerX + (curr.playerX - prev.playerX) * alpha;
    this.reachRing.x = this.player.x;
    this.reachRing.scale.set(this.config.pickup.radius / 30);
    this.drawPickups(curr);
    this.drawAim(curr);
    this.launcherX = this.player.x;
    this.launcherGlow.x = this.player.x;
    this.launcherGlow.alpha = 0.35 + 0.1 * Math.sin(this.clockMs / 420);
    this.drawEffects(events, elapsedMs, prev, curr);
    // The hit on the player: veil, shake, number, and the launcher blinks while it is invulnerable.
    this.clockMs += elapsedMs;
    this.hurt.update(elapsedMs, this.app.screen.width, this.app.screen.height);
    this.death.update(elapsedMs, this.app.screen.width, this.app.screen.height);
    this.legendLife = Math.max(0, this.legendLife - elapsedMs);
    this.player.alpha = HurtFx.blink(curr.playerInvuln, this.clockMs);
    // The screen shakes for a moment when an Ultimate lands, the player is hurt or a boss dies.
    this.world.pivot.set(
      this.moves.shakeX + this.hurt.shakeX + this.death.shakeX + this.feel.shakeX,
      this.moves.shakeY + this.hurt.shakeY + this.death.shakeY + this.feel.shakeY,
    );

    // The layers of the attacks leave the scene while there are none. The pools of small sprites
    // (states, rings, trails, balls) never change their visibility: what is not in use waits off
    // the field, because every change of visibility makes PixiJS rebuild its draw list (4V).
    this.hazardLayer.visible = curr.hazardCount > 0;
    this.sparkLayer.visible = curr.hazardCount > 0;

    this.app.render();
  }

  /**
   * The three layers of the backdrop of the biome of the wave, built once per biome and scrolled at
   * three speeds (parallax): the far one slowest. A change of biome goes through a short dip to the
   * colour of the floor, so it never pops.
   */
  private drawBackdrop(curr: Snapshot, elapsedMs: number): void {
    // The final boss has a stage of its own, nothing of the biome: the arena of THIS legendary (the
    // depths of the sea, a field of magma, the sky...; 4G-H) or the temple of its type if it has
    // none. Its fury transforms the arena (4G-I). The scenery cross-fades to it.
    if (curr.bossFinal && curr.bossType >= 0) {
      const legend = this.speciesIds[curr.bossSpecies] ?? '';
      const fury = curr.bossPhase === 1;
      const key = `arena:${curr.bossSpecies}:${fury ? 1 : 0}`;
      if (key !== this.arenaKey) {
        this.arenaKey = key;
        const look = arenaOf(legend, fury);
        const air: AmbientDef = {
          shape: look.motion === 'fall' ? 'flake' : look.motion === 'rise' ? 'ember' : 'mote',
          motion: look.motion === 'fall' ? 'fall' : look.motion === 'rise' ? 'rise' : 'drift',
          count: 24,
          colors: [look.dust[0] ?? 0xffffff, look.dust[1] ?? 0xffffff],
          glow: true,
          blink: true,
          mist: { color: look.dust[0] ?? 0xffffff, alpha: fury ? 0.1 : 0.06, speed: 0.012 },
          flash: false,
          shafts: fury ? (look.dust[1] ?? 0) : 0,
          vignette: 0.62,
        };
        this.scenery.showArena(
          key,
          legend in LEGEND_ARENAS
            ? legendArenaTexture(legend, fury)
            : arenaTexture(TYPE_COLORS[curr.bossType] ?? 0xffffff),
          ART_PIXEL,
          air,
        );
      }
    } else {
      this.arenaKey = '';
      const main = curr.biomeMain;
      this.scenery.showScene(
        main < 0 ? null : sceneFor(main, curr.biomeSecond >= 0 ? curr.biomeSecond : main),
      );
    }
    this.scenery.update(elapsedMs);
  }

  private arenaKey = '';

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
    // The painted scene carries the colour and the air now (4V); this number only says, for the
    // tests, which biome is on screen.
    this.biomeClock += elapsedMs;
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
    // A legendary move (4G-I) is shown for its whole, longer announcement; the rest, the last
    // WARN_TICKS (staggered attacks wait unseen).
    const legend = (curr.hazardLink[i] ?? 0) === LEGEND_LINK;
    if (left > WARN_TICKS && !legend) {
      sprite.visible = false;
      mark.visible = false;
      fill.visible = false;
      return;
    }
    const { height, defenseLineY } = this.config.arena;
    const floorHeight = height - defenseLineY;
    const p = 1 - Math.min(left, WARN_TICKS) / WARN_TICKS;
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
    // Set once per frame: a change of visibility, even there and back, makes PixiJS rebuild its
    // whole draw list (4V, performance).
    mark.visible = !(kind === KIND_ZONE || kind === KIND_CRACK || kind === KIND_GUST);
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
      if (warn <= 0 || warn > WARN_TICKS) continue;
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
      // Set once per frame (see `drawDanger`): which kinds leave a mark on the floor strip.
      mark.visible =
        kind === KIND_PORTAL
          ? (curr.hazardLink[i] ?? 0) > 0
          : !(kind === KIND_ZONE || kind === KIND_CRACK || kind === KIND_GUST);
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
        // An aimed shot (4G-H) flies from the body of its enemy to its mark on the floor.
        const fromX = curr.hazardFromX[i] ?? -1;
        const fromY = curr.hazardFromY[i] ?? -1;
        let drawX = x;
        if (!warning && fromX >= 0) {
          const travel = Math.max(1, defenseLineY - fromY);
          const p = Math.max(0, Math.min(1, (y - fromY) / travel));
          drawX = fromX + (x - fromX) * p;
        }
        sprite.x = drawX - sprite.width / 2;
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
        // Columns, combs, sweeps and rain strike with the look of the type of who throws them (4G-H:
        // pillars of flame, curtains of water, rocks, shadows, lightning...); rain is the projectile
        // of the type, falling. A strong mark on the floor strip so it reads under a finger.
        const typeCode = curr.hazardType[i] ?? 255;
        const typeName = GAME_TYPES[typeCode === 255 ? curr.bossType : typeCode] ?? 'normal';
        const tone = TYPE_COLORS[typeCode === 255 ? curr.bossType : typeCode] ?? bossColor;
        const look = strikeLook(typeName);
        const strike = strikeFrames(typeName, tone);
        const stream = kind === KIND_RAIN;
        const drop = stream && typeCode !== 255 ? shotFrames(typeCode, tone) : [];
        sprite.texture = stream
          ? (drop[frame] ?? fx.orb[frame] ?? Texture.EMPTY)
          : (strike[frame] ?? Texture.EMPTY);
        sprite.width = width;
        sprite.height = height;
        sprite.x = x - width / 2;
        sprite.y = 0;
        // Centre the art in the band and move it as the type moves (flames rise, rocks fall).
        const artWidth = 12 * ART_PIXEL;
        sprite.tilePosition.set(
          width / 2 - artWidth / 2,
          stream ? curr.tick * 9 : curr.tick * look.scroll,
        );
        sprite.alpha = kind === KIND_COMB || kind === KIND_SWEEP ? 0.95 : 1;
        mark.visible = true;
        mark.texture = strike[frame] ?? Texture.EMPTY;
        mark.x = x - width / 2;
        mark.y = defenseLineY;
        mark.width = width;
        mark.height = floorHeight;
        mark.tilePosition.set(width / 2 - 6 * ART_PIXEL, curr.tick * look.scroll);
        mark.alpha = 1;
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
    // The charge of the strong attack (a warning since 4G-H): announced with a soft aura and, while
    // it charges, an aura in the colour of its type (the colour of what is coming).
    const charging = alive && curr.bossCoreOpen > 0;
    const announcing = alive && curr.bossCoreWarning;
    this.shieldRing.visible = charging || announcing;
    if (this.shieldRing.visible) {
      this.shieldRing.x = curr.bossX;
      this.shieldRing.y = curr.bossY;
      const beat = Math.sin(curr.tick / (charging ? 4 : 6));
      this.shieldRing.scale.set((curr.bossRadius + (charging ? 12 : 8) + beat * 4) / 30);
      this.shieldRing.tint = charging ? (TYPE_COLORS[curr.bossType] ?? 0xff4b3a) : 0xffffff;
      this.shieldRing.alpha = charging ? 0.7 : 0.35 + 0.2 * beat;
    }
    // The legendary move (4G-I): the field beats in the colour of the legendary while it is announced.
    this.legendVeil.visible = this.legendLife > 0 && alive;
    if (this.legendVeil.visible) {
      const left = this.legendLife / this.legendTotal;
      this.legendVeil.tint = TYPE_COLORS[curr.bossType] ?? 0xffffff;
      this.legendVeil.position.set(0, 0);
      this.legendVeil.width = this.config.arena.width;
      this.legendVeil.height = defenseLineY;
      this.legendVeil.alpha =
        (0.12 + 0.12 * Math.sin(curr.tick / (left < 0.3 ? 2 : 5))) * (0.5 + left);
    }
    // A boss coming down to the line (4G-I): a column of dots from its body to the line that shows
    // the distance, white and calm far away, red and fast when it is near, and the line itself beats.
    const lineTicks = alive ? curr.bossLineTicks : -1;
    const showLine = lineTicks >= 0 && lineTicks <= LINE_SHOW_TICKS;
    const nearLine = showLine && lineTicks <= LINE_NEAR_TICKS;
    const top = curr.bossY + curr.bossRadius;
    for (let k = 0; k < this.lineDots.length; k++) {
      const dot = this.lineDots[k];
      if (dot === undefined) continue;
      dot.visible = showLine && top < defenseLineY;
      if (!dot.visible) continue;
      const f = (k + ((curr.tick / (nearLine ? 4 : 10)) % 1)) / this.lineDots.length;
      dot.position.set(curr.bossX, top + (defenseLineY - top) * f);
      dot.tint = nearLine ? 0xff3b3b : 0xffffff;
      dot.alpha = nearLine ? 0.9 : 0.45;
      dot.scale.set(nearLine ? 0.14 : 0.1);
    }
    this.lineGlow.visible = nearLine;
    if (nearLine) {
      this.lineGlow.position.set(0, defenseLineY - 4);
      this.lineGlow.width = this.config.arena.width;
      this.lineGlow.height = 8;
      const fast = lineTicks <= LINE_CRITICAL_TICKS;
      this.lineGlow.alpha = 0.35 + 0.35 * Math.sin(curr.tick / (fast ? 2 : 5));
    }
    // A legendary is never just another boss (4G-H, "que se sienta legendario"): two slow rings of
    // gold and of its colour turn round it the whole fight.
    const legendary = alive && curr.bossFinal;
    for (let k = 0; k < this.legendRings.length; k++) {
      const ring = this.legendRings[k];
      if (ring === undefined) continue;
      ring.visible = legendary;
      if (!legendary) continue;
      const breath = Math.sin(curr.tick / 40 + k * 2.1);
      ring.position.set(curr.bossX, curr.bossY);
      ring.scale.set((curr.bossRadius * (1.35 + 0.25 * k) + 5 * breath) / 30);
      ring.tint = k === 0 ? 0xffd54f : (TYPE_COLORS[curr.bossType] ?? 0xffffff);
      ring.alpha = 0.3 + 0.15 * breath;
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
    sprite.texture = this.atlas.disc;
    placeParticle(sprite, x, y, (size * 2) / DISC, (size * 2) / DISC, color, Math.max(0, alpha));
  }

  private statusRing(x: number, y: number, color: number, size: number, alpha: number): void {
    const sprite = this.statusSprites[this.statusUsed];
    if (sprite === undefined) return;
    this.statusUsed += 1;
    sprite.texture = this.atlas.ring;
    // The ring was drawn on a 64-pixel picture at `size / 30`: the same size on the screen.
    const scale = ((size / 30) * 64) / RING;
    placeParticle(sprite, x, y, scale, scale, color, Math.max(0, alpha));
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
    let trails = 0;
    let glows = 0;
    for (let slot = 0; slot < curr.slotCount; slot++) {
      if (curr.ballActive[slot] !== 1) continue;
      const sprite = this.spriteAt(this.ballSprites, this.ballLayer, shown);
      sprite.visible = true;
      sprite.position.set(this.scratchBallX[slot] ?? 0, this.scratchBallY[slot] ?? 0);
      // The ball grows with the stage of its Pokémon (ADR-031) and the visible pixels of every
      // sprite, not the whole picture, have the size of the ball (ADR-037): the same growth for all.
      const radius = curr.ballRadius[slot] || this.config.ball.radius;
      // The form comes from the domain (4G-I): the render never works one out.
      const code = curr.ballForm[slot] ?? NO_SPECIES;
      const art = this.art[code];
      // The ball IS a glass sphere (4G-F) of exactly the collision radius, with the Pokémon inside.
      const sphere = this.spriteAt(this.ballSpheres, this.sphereLayer, shown);
      sphere.visible = true;
      sphere.position.set(sprite.x, sprite.y);
      sphere.texture = sphereTexture(TYPE_COLORS[curr.ballType[slot] ?? 0] ?? 0xffffff);
      sphere.scale.set((2 * radius) / SPHERE_CIRCLE);
      // A contact shadow down and to the right (the light comes from the top left): the ball
      // floats over the ground instead of lying on it (4V; art bible §5).
      const shadow = this.ballShadows[shown];
      if (shadow !== undefined) {
        shadow.x = sprite.x + radius * 0.35;
        shadow.y = sprite.y + radius * 0.75;
        shadow.scaleX = (radius * 2.1) / DISC;
        shadow.scaleY = (radius * 1.2) / DISC;
      }
      // The halo of a rare Pokémon: violet for a ★4, gold that beats for a ★5.
      const tone = RARITY_GLOW[this.rarity[curr.ballSpecies[slot] ?? NO_SPECIES] ?? 0] ?? 0;
      if (tone !== 0) {
        let halo = this.ballGlows[glows];
        if (halo === undefined) {
          halo = new Sprite(glowTexture(32));
          halo.anchor.set(0.5);
          halo.blendMode = 'add';
          this.ballGlows[glows] = halo;
          this.glowLayer.addChild(halo);
        }
        if (halo.tint !== tone) halo.tint = tone;
        halo.position.set(sprite.x, sprite.y);
        const gold = tone === 0xffd75a;
        const beat = gold ? 0.5 + 0.5 * Math.sin(this.clockMs / 260 + slot) : 0.5;
        halo.scale.set((radius * (gold ? 3.6 : 3.1)) / 32);
        halo.alpha = gold ? 0.55 + 0.25 * beat : 0.45;
        glows += 1;
      }
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
      // The Pokémon stays upright inside its glass: the picture never turns with the flight.
      // A trail in the colour of its type (4G-H, "en movimiento cuesta reconocer qué Pokémon es"):
      // the colour says the type even when the picture is a blur. Dots that shrink and fade behind
      // it, along the way it came (from the last tick to this one).
      if (prev.ballActive[slot] === 1) {
        const dx = (curr.ballX[slot] ?? 0) - (prev.ballX[slot] ?? 0);
        const dy = (curr.ballY[slot] ?? 0) - (prev.ballY[slot] ?? 0);
        const step = Math.hypot(dx, dy);
        // A jump (a wrap, a new launch) is not a flight: no trail.
        if (step > 0.5 && step < radius * 2) {
          const tone = TYPE_COLORS[curr.ballType[slot] ?? 0] ?? 0xffffff;
          const spacing = Math.max(radius * 0.55, step * 0.9) / step;
          for (let k = 1; k <= TRAIL_DOTS; k++) {
            const dot = this.trailSprites[trails];
            if (dot === undefined) break;
            const size = (radius * (1 - k / (TRAIL_DOTS + 1)) * 1.8) / DISC;
            placeParticle(
              dot,
              sprite.x - dx * spacing * k,
              sprite.y - dy * spacing * k,
              size,
              size,
              tone,
              0.55 * (1 - k / (TRAIL_DOTS + 1)),
            );
            trails += 1;
          }
        }
      }
      shown += 1;
    }
    for (let i = shown; i < this.ballsShown; i++) {
      this.ballSprites[i]?.position.set(OFF, OFF);
      this.ballSpheres[i]?.position.set(OFF, OFF);
    }
    for (let i = glows; i < this.glowsShown; i++) this.ballGlows[i]?.position.set(OFF, OFF);
    this.glowsShown = glows;
    this.ballsShown = shown;
    liveParticles(this.shadowLayer, this.ballShadows, shown);
    liveParticles(this.trailLayer, this.trailSprites, trails);
  }

  private drawEnemies(prev: Snapshot, curr: Snapshot, alpha: number): void {
    interpolateEnemies(prev, curr, alpha, this.scratchEnemyX, this.scratchEnemyY);
    // The signs of the states of the enemies use a pool of dots that is refilled every frame.
    this.statusUsed = 0;
    this.statusLod = curr.enemyCount > STATUS_LOD_ENEMIES;
    for (let i = 0; i < curr.enemyCount; i++) {
      const sprite = this.spriteAt(this.enemySprites, this.enemyLayer, i);
      sprite.visible = true;
      const ex = this.scratchEnemyX[i] ?? 0;
      const ey = this.scratchEnemyY[i] ?? 0;
      const radius = curr.enemyRadius[i] ?? 16;
      const foeId = curr.enemyId[i] ?? 0;
      // Everything alive breathes (4V; art bible §6): a bob of a pixel or two with its own phase,
      // slower and wider for a boss. Only the picture moves; the body the balls hit does not.
      const big = radius >= 30;
      const bob =
        Math.round(Math.sin(this.clockMs / (big ? 620 : 360) + foeId * 1.7) * (big ? 1.5 : 1)) *
        FIELD_PIXEL;
      // A hit: the silhouette goes white for an instant and the picture jumps a little bigger.
      const since = this.clockMs - (this.flashStart[foeId & (FLASH_SLOTS - 1)] ?? -1e9);
      const flashing = since < FLASH_MS;
      const punch = flashing ? 1 + 0.1 * (1 - since / FLASH_MS) : 1;
      sprite.position.set(ex, ey + bob);
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
        const strongCharge = isBoss && curr.bossCoreOpen > 0;
        // The attacker shows what it is about to do (4G-F): a boss gleams red before each attack, an
        // enemy that is charging a shot glows yellow and white until the shot leaves its body.
        const id = curr.enemyId[i] ?? 0;
        let charging = false;
        for (let k = 0; k < this.glowCount; k++) if (this.glowIds[k] === id) charging = true;
        const beat = Math.floor(curr.tick / 5) % 2 === 0;
        sprite.scale.set(base * (strongCharge ? 1 + 0.04 * Math.sin(curr.tick / 4) : 1));
        if (strongCharge) {
          // Charging its strong attack (4G-H: a warning, no longer "exposed"): it swells a little and
          // glows in the colour of its type, the colour its attack will have.
          const tone = TYPE_COLORS[curr.bossType] ?? 0xff6a5a;
          sprite.tint = beat ? tone : 0xffffff;
          this.statusRing(ex, ey, tone, radius * 1.35 + 4 * Math.sin(curr.tick / 5), 0.6);
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
        if (flashing) {
          // The white silhouette lives in the same texture as the outlined picture.
          const white = whiteOf(sprite.texture);
          if (white !== undefined) {
            sprite.texture = white;
            sprite.tint = 0xffffff;
          }
          sprite.scale.set(sprite.scale.x * punch);
        }
      }
    }
    for (let i = curr.enemyCount; i < this.enemiesShown; i++) {
      this.enemySprites[i]?.position.set(OFF, OFF);
    }
    this.enemiesShown = curr.enemyCount;
    liveParticles(this.statusLayer, this.statusSprites, this.statusUsed);
  }

  /**
   * Balls on the floor and captured ones falling or waiting: the same glass sphere as in flight, the
   * same size (4G-H) and, since 4G-I, nothing else around it (16th playtest: "doble esfera,
   * redundante"); it blinks when it is about to join by itself. The form is the domain's.
   */
  private drawPickups(curr: Snapshot): void {
    for (let i = 0; i < curr.pickupCount; i++) {
      let glass = this.pickupSpheres[i];
      if (glass === undefined) {
        glass = new Sprite(Texture.EMPTY);
        glass.anchor.set(0.5);
        this.pickupSpheres[i] = glass;
        this.pickupLayer.addChild(glass);
      }
      const sprite = this.spriteAt(this.pickupSprites, this.pickupLayer, i);
      const radius = curr.pickupRadius[i] || this.config.ball.radius;
      const ticks = curr.pickupTicks[i] ?? 0;
      // Blink for the last second and a half: it is about to join on its own (or, if captured, to).
      const urgent = ticks < 90 && Math.floor(curr.tick / 6) % 2 === 0;
      const x = curr.pickupX[i] ?? 0;
      const y = curr.pickupY[i] ?? 0;
      sprite.visible = true;
      glass.visible = true;
      sprite.position.set(x, y);
      glass.position.set(x, y);
      glass.texture = sphereTexture(TYPE_COLORS[curr.pickupType[i] ?? 0] ?? 0xffffff);
      glass.scale.set((2 * radius) / SPHERE_CIRCLE);
      const code = curr.pickupForm[i] ?? NO_SPECIES;
      const art = this.art[code];
      if (art === undefined) {
        sprite.texture = this.disc;
        sprite.scale.set((radius * 0.7) / 32);
        sprite.tint = TYPE_COLORS[curr.pickupType[i] ?? 0] ?? 0xffffff;
      } else {
        const cut = this.trimmed[code] ?? art;
        sprite.texture = cut;
        sprite.scale.set((2 * radius * SPHERE_CONTENT) / Math.max(1, cut.width, cut.height));
        sprite.tint = 0xffffff;
      }
      sprite.alpha = urgent ? 0.35 : 1;
      glass.alpha = urgent ? 0.35 : 1;
    }
    for (let i = curr.pickupCount; i < this.pickupsShown; i++) {
      this.pickupSprites[i]?.position.set(OFF, OFF);
      this.pickupSpheres[i]?.position.set(OFF, OFF);
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
    // The point the right thumb drags (4G-H): a ring where the aim is, since no cursor shows it.
    const ring = this.aimReticle;
    ring.visible = show && this.reticleOn;
    if (ring.visible) {
      ring.position.set(curr.aimX, curr.aimY);
      ring.scale.set(0.42 + 0.04 * Math.sin(curr.tick / 8));
      ring.alpha = 0.85;
    }
  }

  /** Shows a ring at the aim point (the two-thumb scheme has no cursor, 4G-H). */
  setReticle(on: boolean): void {
    this.reticleOn = on;
  }

  private startEffect(x: number, y: number, color: number, size = 1): void {
    const index = this.fxNext;
    this.fxNext = (this.fxNext + 1) % FX_POOL;
    const sprite = this.fxSprites[index];
    if (sprite === undefined) return;
    sprite.position.set(x, y);
    sprite.tint = color;
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
    // 4V: a thrown Ultimate opens a shockwave of its type where it lands.
    if (event.manual && this.feelOn) {
      this.feel.shockwave(event.x, event.y, Math.max(90, event.size * 1.6), color);
    }
  }

  /** The boss that was alive in the last frame has died: play its death where it was (4G-H). */
  private startDeath(): void {
    const b = this.lastBoss;
    if (b.radius <= 0) return;
    const art = this.art[b.species];
    const color = TYPE_COLORS[b.type] ?? 0xffffff;
    // 4V: the fall of a boss opens a ring of light of its colour across the field.
    if (this.feelOn) this.feel.shockwave(b.x, b.y, b.radius * (b.final ? 7 : 5), color);
    if (art === undefined) {
      this.death.start(b.x, b.y, b.radius, this.disc, b.radius / 32, color, b.final);
    } else {
      const texture = this.outlined(this.foeArt, b.species, art, FOE_EDGE);
      const scale = (b.radius * ENEMY_ART_SCALE) / (art.width / 2);
      this.death.start(b.x, b.y, b.radius, texture, scale, color, b.final);
    }
    b.radius = 0;
  }

  private feelOn = true;
  /** How many strikes of attacks the renderer has drawn (for the browser checks, 4V). */
  strikesSeen = 0;

  /** Beams and shockwaves alive now (for the browser checks, 4V). */
  get wavesAlive(): number {
    return this.feel.wavesAlive;
  }
  private gatherTick = -1;

  /** Turns the sparks, numbers and deaths of the hits off (a measuring aid: `?debug&nofeel`). */
  setFeel(on: boolean): void {
    this.feelOn = on;
  }

  /** The stars of the Pokémon of each art code, for the halo of the rare balls (4V). */
  setRarity(stars: Uint8Array): void {
    this.rarity = stars;
  }

  /**
   * A ball hit an enemy (4V; art bible §6): it flashes white (not more often than `mayFlash`
   * allows, so a boss under fire is not a white blob), sparks of the type of the ball fly back the
   * way it came and the damage shows as a number.
   */
  private onHit(event: Extract<GameEvent, { type: 'hit' }>, curr: Snapshot): void {
    if (!this.feelOn) return;
    const slot = event.enemyId & (FLASH_SLOTS - 1);
    if (mayFlash(this.clockMs, this.flashStart[slot] ?? -1e9)) this.flashStart[slot] = this.clockMs;
    let radius = 16;
    for (let i = 0; i < curr.enemyCount; i++) {
      if (curr.enemyId[i] === event.enemyId) {
        radius = curr.enemyRadius[i] ?? 16;
        break;
      }
    }
    // The ball that did it is the nearest one: its type colours the sparks and its place says
    // which way they fly.
    let best = -1;
    let bestD = 1e12;
    for (let b = 0; b < curr.slotCount; b++) {
      if (curr.ballActive[b] !== 1) continue;
      const dx = (curr.ballX[b] ?? 0) - event.x;
      const dy = (curr.ballY[b] ?? 0) - event.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    let dx = 0;
    let dy = -1;
    let type = 0;
    if (best >= 0) {
      const len = Math.sqrt(bestD) || 1;
      dx = (event.x - (curr.ballX[best] ?? 0)) / len;
      dy = (event.y - (curr.ballY[best] ?? 0)) / len;
      type = curr.ballType[best] ?? 0;
    }
    this.feel.hit(
      event.enemyId,
      event.x,
      event.y,
      dx,
      dy,
      radius,
      type,
      TYPE_COLORS[type] ?? 0xffffff,
      event.damage,
      event.effectiveness,
    );
  }

  /**
   * An attack struck (4V; art bible §6, the impact and the residue): it is looked up in the last
   * frame to know what it was and whose. A column, comb, sweep or rain flashes as a beam of light
   * over exactly its band; anything that lands throws the matter of its type up from the floor.
   */
  private onStrike(
    event: Extract<GameEvent, { type: 'bossStrike' }>,
    prev: Snapshot,
    curr: Snapshot,
  ): void {
    let kind = KIND_COMB;
    let type = curr.bossType;
    for (let i = 0; i < prev.hazardCount; i++) {
      if (Math.abs((prev.hazardX[i] ?? -1) - event.x) > 0.5) continue;
      if (Math.abs((prev.hazardWidth[i] ?? -1) - event.width) > 0.5) continue;
      kind = prev.hazardKind[i] ?? kind;
      const own = prev.hazardType[i] ?? 255;
      if (own !== 255) type = own;
      break;
    }
    const color = type >= 0 ? (TYPE_COLORS[type] ?? DANGER) : DANGER;
    const { defenseLineY } = this.config.arena;
    this.strikesSeen += 1;
    if (kind !== KIND_SHOT) this.feel.beam(event.x, event.width, defenseLineY, color);
    this.feel.strike(event.x, event.width, defenseLineY, Math.max(0, type), color);
  }

  /** An enemy died: it is looked up in the last frame it was alive and breaks into pixels there. */
  private onKill(event: Extract<GameEvent, { type: 'kill' }>, prev: Snapshot): void {
    if (!this.feelOn) return;
    let radius = 16;
    let type = 0;
    let species = NO_SPECIES;
    for (let i = 0; i < prev.enemyCount; i++) {
      if (prev.enemyId[i] === event.enemyId) {
        radius = prev.enemyRadius[i] ?? 16;
        type = prev.enemyType[i] ?? 0;
        species = prev.enemySpecies[i] ?? NO_SPECIES;
        break;
      }
    }
    const art = this.art[species];
    const outlined = this.foeArt[species];
    const white = outlined === undefined ? undefined : whiteOf(outlined);
    this.feel.kill(
      event.x,
      event.y,
      radius,
      type,
      TYPE_COLORS[type] ?? 0xffffff,
      white ?? null,
      art === undefined ? 1 : (radius * ENEMY_ART_SCALE) / (art.width / 2),
    );
  }

  private drawEffects(
    events: readonly GameEvent[],
    elapsedMs: number,
    prev: Snapshot,
    curr: Snapshot,
  ): void {
    for (const event of events) {
      if (event.type === 'move') this.startMove(event);
      else if (event.type === 'bossDefeated') this.startDeath();
      else if (event.type === 'legendMove') {
        this.legendTotal = (event.ticks * 1000) / 60;
        this.legendLife = this.legendTotal;
      } else if (event.type === 'playerHurt')
        this.hurt.hurt(this.player.x, this.config.player.y, event.damage);
      else if (event.type === 'bossStrike' && this.feelOn) this.onStrike(event, prev, curr);
      else if (event.type === 'hit') this.onHit(event, curr);
      else if (event.type === 'kill') this.onKill(event, prev);
      else if (event.type === 'chain') {
        this.startEffect(event.toX, event.toY, 0xfff176);
        this.moves.bolt(event.fromX, event.fromY, event.toX, event.toY);
      } else if (event.type === 'collect')
        this.startEffect(event.x, this.config.player.y, 0x81d4fa);
      else if (event.type === 'capture') {
        this.startEffect(event.x, this.config.player.y, PICKUP_GOLD, 2.2);
        this.feel.burst(event.x, this.config.player.y, 'star', PICKUP_GOLD, 10, 3.2);
      } else if (event.type === 'captureDrop') {
        // Two staggered rings, big and gold: a drop must be seen from across the field.
        this.startEffect(event.x, event.y, PICKUP_GOLD, 2.6);
        this.startEffect(event.x, event.y, 0xffffff, 1.6);
        this.feel.burst(event.x, event.y, 'star', PICKUP_GOLD, 8, 2.4);
      }
    }
    this.feel.update(elapsedMs);
    this.moves.update(elapsedMs);
    const decay = elapsedMs / FX_DURATION_MS;
    for (let i = 0; i < FX_POOL; i++) {
      const life = this.fxLife[i] ?? 0;
      const sprite = this.fxSprites[i];
      if (life <= 0 || sprite === undefined) continue;
      const next = life - decay;
      if (next <= 0) {
        this.fxLife[i] = 0;
        sprite.position.set(OFF, OFF);
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
