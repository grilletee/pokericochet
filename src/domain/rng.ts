import { imul32 } from './int32';

/** sfc32 state: four 32-bit words. Plain data, so it can be cloned and hashed. */
export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** splitmix32 step used to expand a seed into the four state words. */
function mix(state: number): number {
  let z = state;
  z = imul32(z ^ (z >>> 16), 0x85ebca6b);
  z = imul32(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) | 0;
}

export function createRng(seed: number): RngState {
  let s = seed >>> 0;
  s = (s + 0x9e3779b9) | 0;
  const a = mix(s);
  s = (s + 0x9e3779b9) | 0;
  const b = mix(s);
  s = (s + 0x9e3779b9) | 0;
  const c = mix(s);
  s = (s + 0x9e3779b9) | 0;
  const d = mix(s);
  const rng: RngState = { a, b, c, d };
  for (let i = 0; i < 12; i++) nextU32(rng); // warm-up
  return rng;
}

/**
 * Independent stream per system, derived from the run seed and a label ("spawn", "aim", ...).
 * Consuming one stream never moves another.
 */
export function deriveRng(seed: number, label: string): RngState {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) h = imul32(h ^ label.charCodeAt(i), 0x01000193);
  return createRng((imul32((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ h) >>> 0);
}

export function cloneRng(rng: RngState): RngState {
  return { a: rng.a, b: rng.b, c: rng.c, d: rng.d };
}

/** Next uint32 in [0, 2^32). */
export function nextU32(rng: RngState): number {
  let t = (rng.a + rng.b) | 0;
  rng.a = rng.b ^ (rng.b >>> 9);
  rng.b = (rng.c + (rng.c << 3)) | 0;
  rng.c = (rng.c << 21) | (rng.c >>> 11);
  rng.d = (rng.d + 1) | 0;
  t = (t + rng.d) | 0;
  rng.c = (rng.c + t) | 0;
  return t >>> 0;
}

/** Float in [0, 1). */
export function nextFloat(rng: RngState): number {
  return nextU32(rng) / 4294967296;
}

/** Integer in [0, n). The bias for n far below 2^32 is negligible for gameplay. */
export function nextInt(rng: RngState, n: number): number {
  return Math.floor(nextFloat(rng) * n);
}
