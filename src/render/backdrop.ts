import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { ArenaSpec } from './legendArena';
import {
  bayer,
  FIELD_PIXEL,
  makeCanvas,
  noiseField,
  PixelWriter,
  SCENE_H,
  SCENE_W,
  textureOf,
} from './paint';
import type { AmbientDef, SceneId } from './sceneIds';
import { keepScene, paintedScene, type Scene, SceneBuild } from './scenes';
import { shapeTexture } from './shapes';

/**
 * What is behind the game (4V, block 1): the painted scene of the biome in two layers that scroll
 * at different speeds (ground and props: the parallax), its animated frames, the air of the scene
 * (shaped particles, a drifting film of mist or cloud shadow, lightning), and the light: a stepped
 * vignette that darkens the edges and shafts of additive light. A change of scene is painted over
 * several frames and cross-faded, so it never stalls or pops.
 *
 * Render only. Fixed pools; nothing is painted per frame once a scene is built.
 */

/** Arena units per millisecond the ground and the props scroll at. */
const GROUND_SPEED = 0.009;
const PROPS_SPEED = 0.021;
const FADE_MS = 700;
const PARTICLES = 30;

interface Sheet {
  readonly box: Container;
  readonly ground: TilingSprite;
  readonly props: TilingSprite;
  frames: readonly Texture[];
  frameMs: number;
  /** Arena units per art pixel of what this sheet shows (the old arenas of the legendaries use 4). */
  pixel: number;
}

let mistTexture: Texture | null = null;
/** A film of soft cloud that tiles: the mist, the cloud shadows and the spindrift, tinted per scene. */
function mist(): Texture {
  if (mistTexture !== null) return mistTexture;
  const w = SCENE_W;
  const h = SCENE_H / 2;
  const field = noiseField(w, h, 60, 45, 3, 4242);
  const writer = new PixelWriter(makeCanvas(w, h));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = ((field[y * w + x] ?? 0) - 0.5) * 6;
      if (v <= 0) continue;
      const band = Math.min(3, Math.floor(v) + (v - Math.floor(v) > bayer(x, y) ? 1 : 0));
      if (band > 0) writer.put(x, y, [255, 255, 255], band * 85);
    }
  }
  mistTexture = textureOf(writer.done());
  return mistTexture;
}

let vignetteTexture: Texture | null = null;
/** Darkness that grows towards the sides and the top corners, in dithered steps. */
function vignette(): Texture {
  if (vignetteTexture !== null) return vignetteTexture;
  const writer = new PixelWriter(makeCanvas(SCENE_W, SCENE_H));
  for (let y = 0; y < SCENE_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      const dx = Math.abs(x - SCENE_W / 2) / (SCENE_W / 2);
      const dy = Math.abs(y - SCENE_H * 0.55) / (SCENE_H * 0.55);
      const v = Math.max(0, dx ** 2.4 * 0.95 + dy ** 3 * 0.55 - 0.08) * 5;
      const band = Math.min(5, Math.floor(v) + (v - Math.floor(v) > bayer(x, y) ? 1 : 0));
      if (band > 0) writer.put(x, y, [6, 8, 20], band * 44);
    }
  }
  vignetteTexture = textureOf(writer.done());
  return vignetteTexture;
}

let shaftTexture: Texture | null = null;
/** Shafts of light that fall from the top left, fading as they go down. */
function shafts(): Texture {
  if (shaftTexture !== null) return shaftTexture;
  const writer = new PixelWriter(makeCanvas(SCENE_W, SCENE_H));
  const beams = [
    [-30, 26],
    [44, 14],
    [96, 34],
    [170, 12],
    [214, 24],
  ] as const;
  for (let y = 0; y < SCENE_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      const along = x - y * 0.42;
      let light = 0;
      for (const [start, wide] of beams) {
        const d = Math.abs(along - start - wide / 2) / (wide / 2);
        if (d < 1) light = Math.max(light, 1 - d * d);
      }
      const v = light * (1 - y / (SCENE_H * 0.92)) * 3;
      if (v <= 0) continue;
      const band = Math.min(3, Math.floor(v) + (v - Math.floor(v) > bayer(x, y) ? 1 : 0));
      if (band > 0) writer.put(x, y, [255, 255, 255], band * 60);
    }
  }
  shaftTexture = textureOf(writer.done());
  return shaftTexture;
}

/** A number in [0, 1) that depends only on its two inputs: where a floating particle is reborn. */
function spot(i: number, cycle: number): number {
  let h = Math.imul(i + 1, 374761393) ^ Math.imul(cycle + 7, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Backdrop {
  /** Under everything that plays: ground, props, mist, particles and the vignette. */
  readonly under = new Container();
  /** Over the field: the shafts of light and the flash of the lightning. */
  readonly over = new Container();
  private readonly sheets: [Sheet, Sheet];
  private front = 0;
  private fade = 1;
  private readonly mistSheet: TilingSprite;
  private readonly dark: Sprite;
  private readonly shaftSprite: Sprite;
  private readonly flash: Sprite;
  private readonly dots: Sprite[] = [];
  private readonly air = new Container();
  private ambient: AmbientDef | null = null;
  private clock = 0;
  private scroll = 0;
  /** What is on screen or on its way: a scene id, or the key of an arena. */
  private shown = '';
  private build: SceneBuild | null = null;
  private wanted: string | null = null;
  private flashLife = 0;
  private nextFlash = 3000;

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    const sheet = (): Sheet => {
      const box = new Container();
      const ground = new TilingSprite({ texture: Texture.EMPTY, width, height });
      const props = new TilingSprite({ texture: Texture.EMPTY, width, height });
      box.addChild(ground, props);
      box.visible = false;
      return { box, ground, props, frames: [], frameMs: 0, pixel: FIELD_PIXEL };
    };
    this.sheets = [sheet(), sheet()];
    this.mistSheet = new TilingSprite({ texture: mist(), width, height });
    this.mistSheet.tileScale.set(FIELD_PIXEL);
    this.mistSheet.visible = false;
    for (let i = 0; i < PARTICLES; i++) {
      const dot = new Sprite(Texture.EMPTY);
      dot.anchor.set(0.5);
      dot.visible = false;
      this.dots.push(dot);
      this.air.addChild(dot);
    }
    this.dark = new Sprite(vignette());
    this.dark.width = width;
    this.dark.height = height;
    this.under.addChild(
      this.sheets[0].box,
      this.sheets[1].box,
      this.mistSheet,
      this.air,
      this.dark,
    );
    this.shaftSprite = new Sprite(shafts());
    this.shaftSprite.width = width;
    this.shaftSprite.height = height;
    this.shaftSprite.blendMode = 'add';
    this.shaftSprite.visible = false;
    this.flash = new Sprite(Texture.WHITE);
    this.flash.width = width;
    this.flash.height = height;
    this.flash.blendMode = 'add';
    this.flash.tint = 0xcfe0ff;
    this.flash.visible = false;
    this.over.addChild(this.shaftSprite, this.flash);
  }

  /** The ground that is on screen: the surround of a phone layout continues it past the field. */
  get groundSheet(): TilingSprite {
    return this.sheetAt(this.front).ground;
  }

  /** True while there is something painted to show. */
  get ready(): boolean {
    return this.sheetAt(this.front).box.visible;
  }

  private sheetAt(index: number): Sheet {
    return index === 0 ? this.sheets[0] : this.sheets[1];
  }

  /** Asks for the scene of a biome (null: nothing behind the game). Painted over the next frames. */
  showScene(id: SceneId | null): void {
    if (id === null) {
      if (this.shown === '') return;
      this.shown = '';
      this.wanted = null;
      this.build = null;
      for (const sheet of this.sheets) sheet.box.visible = false;
      this.setAmbient(null);
      return;
    }
    if (this.shown === id) return;
    this.shown = id;
    this.wanted = id;
    const painted = paintedScene(id);
    if (painted !== undefined) {
      this.build = null;
      this.enter(painted);
    } else {
      this.build = new SceneBuild(id, 0xffffff);
    }
  }

  /**
   * The arena of a legendary: one texture of its own (`pixel` arena units per art pixel) and its own
   * dust in the air. `key` tells one arena from another (the fury changes it).
   */
  showArena(key: string, texture: Texture, pixel: number, ambient: AmbientDef): void {
    if (this.shown === key) return;
    this.shown = key;
    this.wanted = null;
    this.build = null;
    this.swap([texture], 0, Texture.EMPTY, pixel);
    this.setAmbient(ambient);
  }

  /**
   * The arena of a legendary as a painted scene (4W, block 6): painted over the next frames like a
   * biome (the scene before stays meanwhile), kept, and cross-faded in. `key` tells one arena from
   * another (the species and its fury).
   */
  showLegend(key: string, spec: ArenaSpec, ambient: AmbientDef): void {
    if (this.shown === key) return;
    this.shown = key;
    this.wanted = key;
    const painted = paintedScene(key);
    if (painted !== undefined) {
      this.build = null;
      this.enter(painted);
    } else {
      this.build = new SceneBuild(key, 0xffffff, { spec, ambient });
    }
  }

  private enter(scene: Scene): void {
    this.swap(scene.ground, scene.frameMs, scene.props, FIELD_PIXEL);
    this.setAmbient(scene.ambient);
  }

  /** Puts new art on the back sheet and starts the cross-fade to it. */
  private swap(frames: readonly Texture[], frameMs: number, props: Texture, pixel: number): void {
    const back = this.sheetAt(1 - this.front);
    back.frames = frames;
    back.frameMs = frameMs;
    back.pixel = pixel;
    back.ground.texture = frames[0] ?? Texture.EMPTY;
    back.ground.tileScale.set(pixel);
    back.props.texture = props;
    back.props.tileScale.set(pixel);
    back.props.visible = props !== Texture.EMPTY;
    back.box.visible = true;
    back.box.alpha = 0;
    // The new sheet is drawn over the old one while it fades in.
    this.under.setChildIndex(back.box, 1);
    this.front = 1 - this.front;
    this.fade = 0;
  }

  private setAmbient(def: AmbientDef | null): void {
    this.ambient = def;
    const count = def?.count ?? 0;
    for (let i = 0; i < PARTICLES; i++) {
      const dot = this.dots[i];
      if (dot === undefined) continue;
      dot.visible = i < count;
      if (def === null || i >= count) continue;
      dot.texture = shapeTexture(def.shape, def.glow);
      dot.blendMode = def.glow ? 'add' : 'normal';
      dot.tint = def.colors[i % 2] ?? 0xffffff;
      dot.scale.set(FIELD_PIXEL);
    }
    this.mistSheet.visible = def !== null && def.mist !== null;
    if (def?.mist) {
      this.mistSheet.tint = def.mist.color;
      this.mistSheet.alpha = def.mist.alpha;
    }
    this.shaftSprite.visible = def !== null && def.shafts !== 0;
    if (def !== null && def.shafts !== 0) this.shaftSprite.tint = def.shafts;
    this.dark.visible = def !== null;
    this.dark.alpha = def?.vignette ?? 0;
    this.flashLife = 0;
    this.flash.visible = false;
  }

  update(ms: number): void {
    this.clock += ms;
    this.scroll += ms;
    // A scene that is being painted advances one step per frame, and enters when it is whole.
    if (this.build !== null) {
      if (this.build.advance()) {
        const scene = this.build.scene;
        this.build = null;
        if (scene !== null) {
          keepScene(scene);
          if (this.wanted === scene.id) this.enter(scene);
        }
      }
    }
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + ms / FADE_MS);
      const front = this.sheetAt(this.front);
      const back = this.sheetAt(1 - this.front);
      // In steps, like everything else: no smooth alpha ramps on pixel art.
      front.box.alpha = Math.ceil(this.fade * 6) / 6;
      if (this.fade >= 1) back.box.visible = false;
    }
    for (const sheet of this.sheets) {
      if (!sheet.box.visible) continue;
      const px = sheet.pixel;
      sheet.ground.tilePosition.y = Math.floor((this.scroll * GROUND_SPEED) / px) * px;
      sheet.props.tilePosition.y = Math.floor((this.scroll * PROPS_SPEED) / px) * px;
      if (sheet.frames.length > 1 && sheet.frameMs > 0) {
        const frame = sheet.frames[Math.floor(this.clock / sheet.frameMs) % sheet.frames.length];
        if (frame !== undefined && sheet.ground.texture !== frame) sheet.ground.texture = frame;
      }
    }
    const def = this.ambient;
    if (def === null) return;
    if (def.mist !== null) {
      this.mistSheet.tilePosition.set(
        Math.floor((this.clock * def.mist.speed) / FIELD_PIXEL) * FIELD_PIXEL,
        Math.floor((this.scroll * PROPS_SPEED * 1.4) / FIELD_PIXEL) * FIELD_PIXEL,
      );
    }
    if (def.shafts !== 0) this.shaftSprite.alpha = 0.1 + 0.04 * Math.sin(this.clock / 1700);
    if (def.flash) this.lightning(ms);
    this.moveAir(def);
  }

  /** Lightning: two quick flashes of the whole field, every few seconds. */
  private lightning(ms: number): void {
    this.nextFlash -= ms;
    if (this.nextFlash <= 0) {
      this.nextFlash = 3500 + Math.random() * 6000;
      this.flashLife = 1;
    }
    if (this.flashLife <= 0) return;
    this.flashLife = Math.max(0, this.flashLife - ms / 420);
    const f = this.flashLife;
    // Bright, dark, bright again and out.
    this.flash.alpha = f > 0.8 ? 0.3 : f > 0.62 ? 0.04 : f > 0.45 ? 0.2 : f * 0.2;
    this.flash.visible = f > 0;
  }

  private moveAir(def: AmbientDef): void {
    const { width, height } = this;
    const t = this.clock;
    for (let i = 0; i < def.count && i < PARTICLES; i++) {
      const dot = this.dots[i];
      if (dot === undefined) continue;
      const phase = (i * 0.61803398875) % 1; // a spread that never lines the particles up
      const speed = 0.014 + (i % 5) * 0.005;
      let x = phase * width;
      let y = 0;
      let alpha = 0.8;
      switch (def.motion) {
        case 'fall':
          y = (t * speed * 1.6 + phase * 7 * height) % height;
          x += Math.sin(t / 700 + i * 1.3) * 16;
          break;
        case 'rise':
          y = height - ((t * speed * 1.3 + phase * 7 * height) % height);
          x += Math.sin(t / 900 + i * 1.7) * 10;
          alpha = Math.min(1, (y / height) * 2.2);
          break;
        case 'rain':
          y = (t * speed * 34 + phase * 9 * height) % height;
          x = (((phase * 5.3 * width - y * 0.34) % width) + width) % width;
          alpha = 0.55;
          break;
        case 'snow':
          y = (t * speed * 2.6 + phase * 7 * height) % height;
          x = (phase * 3.1 * width + t * 0.03 + Math.sin(t / 500 + i) * 9) % width;
          break;
        case 'drift':
          x = (t * speed * 1.2 + phase * 3.3 * width) % width;
          y = ((i * 97) % height) + Math.sin(t / 800 + i) * 12;
          break;
        default: {
          // Floating: it is born somewhere, hangs there for a few seconds and is born elsewhere.
          const period = 2600 + (i % 4) * 700;
          const life = (t + phase * period) % period;
          const cycle = Math.floor((t + phase * period) / period);
          x = spot(i, cycle) * width + Math.sin(t / 600 + i) * 5;
          y = spot(i + 31, cycle) * height + Math.cos(t / 750 + i) * 5;
          alpha = Math.sin((life / period) * Math.PI);
        }
      }
      if (def.blink) alpha *= 0.55 + 0.45 * Math.sin(t / 170 + i * 2.4);
      // Quieter in the corridor of the middle, where the game is read.
      const side = Math.min(1, Math.abs(x - width / 2) / (width * 0.3));
      dot.alpha = Math.max(0, alpha) * (0.45 + 0.55 * side);
      dot.position.set(
        Math.round(x / FIELD_PIXEL) * FIELD_PIXEL,
        Math.round(y / FIELD_PIXEL) * FIELD_PIXEL,
      );
    }
  }
}
