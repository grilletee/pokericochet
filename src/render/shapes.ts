import type { Texture } from 'pixi.js';
import { bayer, makeCanvas, PixelWriter, textureOf } from './paint';
import type { ParticleShape } from './sceneIds';

/**
 * The small shapes of the particles (4V; art bible §6: "cada tipo se reconoce por forma"): white
 * pixel sprites of a few pixels that are tinted where they are used. A leaf is a leaf and a spark a
 * spark, so the air of a biome and the hit of a type read without looking at the colour.
 */
export const SHAPE_ROWS: Record<ParticleShape, readonly string[]> = {
  petal: ['.xx.', 'xxxx', 'xxx.', '.x..'],
  leaf: ['...xx', '.xxxx', 'xxxx.', 'xxx..', 'x....'],
  ember: ['.x.', '.xx', 'xxx', 'xxx', '.x.'],
  bubble: ['.xx.', 'x..x', 'x..x', '.xx.'],
  flake: ['x.x', '.x.', 'x.x'],
  streak: ['..x', '..x', '.x.', '.x.', 'x..', 'x..'],
  spark: ['.x.', 'xxx', '.x.'],
  mote: ['xx', 'xx'],
  star: ['..x..', '..x..', 'xxxxx', '..x..', '..x..'],
  drop: ['.x.', '.x.', 'xxx', 'xxx', '.x.'],
  shard: ['x..', 'xx.', 'xxx', '.xx'],
  wisp: ['.xx.', 'xxxx', 'xxxx', '.xx.', '..x.', '.x..'],
  feather: ['...x', '..xx', '.xx.', 'xx..', 'x...'],
  ring: ['.xxx.', 'x...x', 'x...x', 'x...x', '.xxx.'],
  bolt: ['..xx', '.xx.', 'xxxx', '.xx.', 'xx..'],
  cross: ['x...x', '.x.x.', '..x..', '.x.x.', 'x...x'],
  pixel: ['x'],
};

const plain = new Map<ParticleShape, Texture>();
const lit = new Map<ParticleShape, Texture>();

/**
 * The texture of a shape. With `glow`, the shape sits on a small stepped halo (for particles drawn
 * in additive mode: embers, fireflies, wisps), still one sprite.
 */
export function shapeTexture(shape: ParticleShape, glow = false): Texture {
  const cache = glow ? lit : plain;
  const hit = cache.get(shape);
  if (hit !== undefined) return hit;
  const rows = SHAPE_ROWS[shape];
  const w = rows[0]?.length ?? 1;
  const h = rows.length;
  const pad = glow ? 4 : 0;
  const writer = new PixelWriter(makeCanvas(w + pad * 2, h + pad * 2));
  if (glow) {
    const cx = (w + pad * 2 - 1) / 2;
    const cy = (h + pad * 2 - 1) / 2;
    const reach = Math.max(w, h) / 2 + pad;
    for (let y = 0; y < h + pad * 2; y++) {
      for (let x = 0; x < w + pad * 2; x++) {
        const d = Math.hypot(x - cx, y - cy) / reach;
        if (d < 1 && (1 - d) ** 2 > bayer(x, y) * 0.8) {
          writer.put(x, y, [255, 255, 255], Math.round((1 - d) * 120));
        }
      }
    }
  }
  writer.stamp(rows, pad, pad, { x: [255, 255, 255] });
  const made = textureOf(writer.done());
  cache.set(shape, made);
  return made;
}

/** The shape of the sparks of each type, by type code (the order of `GAME_TYPES`). */
export const TYPE_SHAPES: readonly ParticleShape[] = [
  'star', // normal
  'cross', // fighting
  'feather', // flying
  'bubble', // poison
  'shard', // ground
  'shard', // rock
  'leaf', // bug
  'wisp', // ghost
  'star', // steel
  'ember', // fire
  'drop', // water
  'leaf', // grass
  'bolt', // electric
  'ring', // psychic
  'flake', // ice
  'ember', // dragon
  'wisp', // dark
  'star', // fairy
];
