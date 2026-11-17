/**
 * Which painted scene a biome gets (4V, block 1). Pure data and a pure function (no canvas, no
 * PixiJS), so the choice has tests: the 14 biomes of ADR-049 each have a scene of their own, picked
 * by the type codes of their two main types (the order of `GAME_TYPES`).
 */
export const SCENE_IDS = [
  'meadow',
  'forest',
  'glade',
  'coast',
  'swamp',
  'volcano',
  'cave',
  'peak',
  'dojo',
  'ruins',
  'haunted',
  'plant',
  'storm',
  'sky',
] as const;
export type SceneId = (typeof SCENE_IDS)[number];

const NORMAL = 0;
const FIGHTING = 1;
const POISON = 3;
const BUG = 6;
const STEEL = 8;
const WATER = 10;
const ELECTRIC = 12;

/** The scene of each main type when the second type does not change it. */
const BY_MAIN: readonly SceneId[] = [
  'meadow', // normal
  'dojo', // fighting
  'sky', // flying
  'swamp', // poison
  'cave', // ground
  'cave', // rock
  'forest', // bug
  'haunted', // ghost
  'plant', // steel
  'volcano', // fire
  'coast', // water
  'forest', // grass
  'storm', // electric
  'ruins', // psychic
  'peak', // ice
  'sky', // dragon
  'haunted', // dark
  'glade', // fairy
];

/**
 * The scene of a biome by its two main types. Two pairs of biomes share a main type and are told
 * apart by the second one: water is the coast unless it comes with poison or bug (the swamp), and
 * electric is the storm unless it comes with normal, fighting or steel (the power plant).
 */
export function sceneFor(main: number, second: number): SceneId {
  if (main === WATER && (second === POISON || second === BUG)) return 'swamp';
  if (main === ELECTRIC && (second === NORMAL || second === FIGHTING || second === STEEL)) {
    return 'plant';
  }
  return BY_MAIN[main] ?? 'meadow';
}

/** How the air of a scene moves: what its particles are and where they go. */
export type AmbientMotion = 'fall' | 'rise' | 'drift' | 'rain' | 'snow' | 'float';
export type ParticleShape =
  | 'petal'
  | 'leaf'
  | 'ember'
  | 'bubble'
  | 'flake'
  | 'streak'
  | 'spark'
  | 'mote'
  | 'star'
  | 'drop'
  | 'shard'
  | 'wisp'
  | 'feather'
  | 'ring'
  | 'bolt'
  | 'cross'
  | 'pixel';

export interface AmbientDef {
  readonly shape: ParticleShape;
  readonly motion: AmbientMotion;
  /** How many particles, their two colours and whether they shine (additive) and blink. */
  readonly count: number;
  readonly colors: readonly [number, number];
  readonly glow: boolean;
  readonly blink: boolean;
  /** A slow film that drifts across the field (mist, cloud shadows, spindrift): colour and strength. */
  readonly mist: { readonly color: number; readonly alpha: number; readonly speed: number } | null;
  /** Lightning: the whole field flashes now and then. */
  readonly flash: boolean;
  /** The light of the scene: the tint of the shafts (0 = none) and how dark the edges get (0..1). */
  readonly shafts: number;
  readonly vignette: number;
}

/** The air of every scene: one table, so a new scene is a row. */
export const AMBIENT: Record<SceneId, AmbientDef> = {
  meadow: {
    shape: 'petal',
    motion: 'fall',
    count: 14,
    colors: [0xffd7ea, 0xfff6c8],
    glow: false,
    blink: false,
    mist: { color: 0x0a1420, alpha: 0.16, speed: 0.008 },
    flash: false,
    shafts: 0,
    vignette: 0.42,
  },
  forest: {
    shape: 'leaf',
    motion: 'fall',
    count: 16,
    colors: [0x9fe86a, 0xffd75a],
    glow: false,
    blink: false,
    mist: null,
    flash: false,
    shafts: 0xffe9a0,
    vignette: 0.6,
  },
  glade: {
    shape: 'mote',
    motion: 'rise',
    count: 18,
    colors: [0xff9fd0, 0xfff0fa],
    glow: true,
    blink: true,
    mist: { color: 0xff9fd0, alpha: 0.07, speed: 0.006 },
    flash: false,
    shafts: 0xffc8f0,
    vignette: 0.5,
  },
  coast: {
    shape: 'star',
    motion: 'float',
    count: 16,
    colors: [0xffffff, 0xbfeaff],
    glow: true,
    blink: true,
    mist: null,
    flash: false,
    shafts: 0,
    vignette: 0.4,
  },
  swamp: {
    shape: 'bubble',
    motion: 'rise',
    count: 14,
    colors: [0xb6f0a0, 0xd9b8ff],
    glow: false,
    blink: false,
    mist: { color: 0xb6e8c0, alpha: 0.12, speed: 0.005 },
    flash: false,
    shafts: 0,
    vignette: 0.6,
  },
  volcano: {
    shape: 'ember',
    motion: 'rise',
    count: 22,
    colors: [0xffb23a, 0xff6a1c],
    glow: true,
    blink: true,
    mist: { color: 0xff6a1c, alpha: 0.06, speed: 0.01 },
    flash: false,
    shafts: 0,
    vignette: 0.68,
  },
  cave: {
    shape: 'mote',
    motion: 'drift',
    count: 14,
    colors: [0xd8c8a8, 0x8ef0ff],
    glow: false,
    blink: true,
    mist: null,
    flash: false,
    shafts: 0xffd9a0,
    vignette: 0.72,
  },
  peak: {
    shape: 'flake',
    motion: 'snow',
    count: 26,
    colors: [0xffffff, 0xd6ecff],
    glow: false,
    blink: false,
    mist: { color: 0xeaf6ff, alpha: 0.1, speed: 0.03 },
    flash: false,
    shafts: 0,
    vignette: 0.45,
  },
  dojo: {
    shape: 'mote',
    motion: 'drift',
    count: 12,
    colors: [0xffe9c0, 0xffd08a],
    glow: true,
    blink: true,
    mist: null,
    flash: false,
    shafts: 0xffd9a0,
    vignette: 0.55,
  },
  ruins: {
    shape: 'shard',
    motion: 'rise',
    count: 12,
    colors: [0xff8fc8, 0x9fe8ff],
    glow: true,
    blink: true,
    mist: { color: 0xc8d8e8, alpha: 0.09, speed: 0.004 },
    flash: false,
    shafts: 0xd8c8ff,
    vignette: 0.58,
  },
  haunted: {
    shape: 'wisp',
    motion: 'float',
    count: 9,
    colors: [0x9fd8ff, 0xc8a8ff],
    glow: true,
    blink: true,
    mist: { color: 0xb8a0e8, alpha: 0.1, speed: 0.004 },
    flash: false,
    shafts: 0,
    vignette: 0.78,
  },
  plant: {
    shape: 'spark',
    motion: 'float',
    count: 12,
    colors: [0xfff27a, 0xffffff],
    glow: true,
    blink: true,
    mist: null,
    flash: false,
    shafts: 0,
    vignette: 0.6,
  },
  storm: {
    shape: 'streak',
    motion: 'rain',
    count: 30,
    colors: [0xb8d0f0, 0x8aa8d8],
    glow: false,
    blink: false,
    mist: { color: 0x8aa0c8, alpha: 0.08, speed: 0.02 },
    flash: true,
    shafts: 0,
    vignette: 0.66,
  },
  sky: {
    shape: 'feather',
    motion: 'drift',
    count: 10,
    colors: [0xffffff, 0xffd8f0],
    glow: false,
    blink: false,
    mist: { color: 0xffe8f8, alpha: 0.1, speed: 0.045 },
    flash: false,
    shafts: 0xffd0e8,
    vignette: 0.4,
  },
};
