/**
 * The rules of the "game feel" of a hit (4V, block 1; art bible §6), as pure functions with tests:
 * when a damage number is shown and how, how often an enemy may flash white, and how the numbers
 * of quick hits on the same enemy join into one. No canvas and no PixiJS here.
 */

/** Damage numbers alive at once. */
export const NUMBER_CAP = 28;
/** Above this share of the cap only the hits that matter (very effective ones) get a number. */
export const NUMBER_BUSY = 0.6;
/** Hits on the same enemy within this time add up into the number that is already there. */
export const NUMBER_JOIN_MS = 170;
export const NUMBER_LIFE_MS = 620;
/** An enemy flashes white for this long, and not again until the gap has passed. */
export const FLASH_MS = 70;
export const FLASH_GAP_MS = 130;

/** Whether a hit gets a number of its own, with `alive` numbers already on screen. */
export function showsNumber(alive: number, damage: number, effectiveness: number): boolean {
  if (Math.round(damage) < 1) return false;
  if (alive >= NUMBER_CAP) return false;
  if (alive >= NUMBER_CAP * NUMBER_BUSY && effectiveness <= 1) return false;
  return true;
}

export interface NumberLook {
  readonly color: number;
  /** Size in art pixels per pixel of the digit. */
  readonly scale: number;
}

const STRONG: NumberLook = { color: 0xffd75a, scale: 1.25 };
const WEAK: NumberLook = { color: 0x9aa6c0, scale: 0.75 };
const PLAIN: NumberLook = { color: 0xf6f3e8, scale: 1 };

/** Gold and big for a very effective hit, grey and small for a weak one, cream otherwise. */
export function numberLook(effectiveness: number): NumberLook {
  if (effectiveness > 1) return STRONG;
  if (effectiveness < 1) return WEAK;
  return PLAIN;
}

/** Whether an enemy that last started a flash at `lastStart` may flash again at `now`. */
export function mayFlash(now: number, lastStart: number): boolean {
  return now - lastStart >= FLASH_GAP_MS;
}

/** The digits of a damage number, most significant first; at most `max` of them (then all nines). */
export function digitsOf(value: number, max: number): number[] {
  const whole = Math.max(0, Math.round(value));
  const top = 10 ** max - 1;
  const text = String(Math.min(whole, top));
  return [...text].map(Number);
}

/**
 * How a number moves over its life `t` in [0, 1]: it pops (bigger for the first moments), rises
 * fast and then slowly, and fades out in steps at the end.
 */
export function numberPop(t: number): number {
  return t < 0.13 ? 1 + 0.35 * (1 - t / 0.13) : 1;
}

export function numberRise(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function numberAlpha(t: number): number {
  return t < 0.7 ? 1 : Math.min(1, Math.max(0, Math.ceil((1 - t) * 10) / 3));
}
