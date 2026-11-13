import type { Command, Enemy, GameConfig, Run } from '../domain';
import { smartTarget } from '../domain';
import type { ControlScheme } from '../ui';

/**
 * The logic of the touch schemes (4G-G, "MÓVIL: injugable"): what a thumb does, turned into numbers
 * and then into the commands of the game. Pure: no DOM, no clock (time is given), so it is tested and
 * the bots can use the same functions. `Input` only feeds it pointer events.
 */

/** Arena y from which a finger is the thumb pad of the smart scheme: the lower 40 % of the field. */
export const PAD_ZONE_Y = 430;
/** How many arena pixels the launcher moves per pixel the thumb moves (the thumb has a short reach). */
export const PAD_GAIN = 1.25;
/** A touch shorter than this (ms) and that moved less than `TAP_MOVE` arena pixels is a tap. */
export const TAP_MS = 280;
export const TAP_MOVE = 14;
/** The window (ms) of the finger's movement that decides a flick when it is released. */
export const FLICK_WINDOW_MS = 110;
/** Arena pixels per second a release must be moving at to count as a flick (the direction is used). */
export const FLICK_SPEED = 380;

export interface PadSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

/** What lifting the finger meant. */
export type PadRelease =
  | { readonly kind: 'tap'; readonly x: number; readonly y: number }
  | {
      readonly kind: 'release';
      readonly x: number;
      readonly y: number;
      /** The flick direction (not normalised) when the finger was moving fast, else null. */
      readonly flick: { readonly dx: number; readonly dy: number } | null;
    };

/**
 * One thumb. It moves the launcher RELATIVELY: wherever it lands, the launcher follows how far it
 * drags (so the finger never has to sit on top of the launcher and hide it).
 */
export class ThumbPad {
  active = false;
  private anchorX = 0;
  private anchorPlayerX = 0;
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private samples: PadSample[] = [];
  private x = 0;
  private travelled = 0;

  down(x: number, y: number, t: number, playerX: number): void {
    this.active = true;
    this.anchorX = x;
    this.anchorPlayerX = playerX;
    this.downX = x;
    this.downY = y;
    this.downT = t;
    this.x = x;
    this.travelled = 0;
    this.samples = [{ x, y, t }];
  }

  move(x: number, y: number, t: number): void {
    if (!this.active) return;
    this.travelled = Math.max(this.travelled, Math.hypot(x - this.downX, y - this.downY));
    this.x = x;
    this.samples.push({ x, y, t });
    // Keep only what a flick needs.
    while (this.samples.length > 2 && t - (this.samples[0]?.t ?? t) > FLICK_WINDOW_MS * 3) {
      this.samples.shift();
    }
  }

  /** Where the launcher should be heading (arena x): where it was plus how far the thumb has dragged. */
  target(): number {
    return this.anchorPlayerX + (this.x - this.anchorX) * PAD_GAIN;
  }

  /** Lifts the finger. A short touch that barely moved is a tap; anything else is a release. */
  up(x: number, y: number, t: number): PadRelease {
    this.move(x, y, t);
    this.active = false;
    if (t - this.downT <= TAP_MS && this.travelled <= TAP_MOVE) return { kind: 'tap', x, y };
    return { kind: 'release', x, y, flick: flickOf(this.samples, t) };
  }

  cancel(): void {
    this.active = false;
  }
}

/** The movement of the finger over the last `FLICK_WINDOW_MS`, if it was fast enough to be a flick. */
export function flickOf(
  samples: readonly PadSample[],
  now: number,
): { dx: number; dy: number } | null {
  const last = samples[samples.length - 1];
  if (last === undefined) return null;
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i];
    if (s === undefined || now - s.t > FLICK_WINDOW_MS) break;
    first = s;
  }
  const dt = Math.max(1, last.t - first.t);
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const speed = (Math.hypot(dx, dy) * 1000) / dt;
  return speed >= FLICK_SPEED && last.t !== first.t ? { dx, dy } : null;
}

/** The enemy a tap at (x, y) means: the nearest one whose body (plus a finger's slack) holds it. */
export function enemyAtTap(enemies: readonly Enemy[], x: number, y: number, slack = 26): number {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d <= e.radius + slack && d < bestD) {
      best = e.id;
      bestD = d;
    }
  }
  return best;
}

/**
 * The point the balls of the sling leave towards on a release: a flick gives its direction (never
 * flatter than the domain allows); a quiet release goes at the smart target, or straight up if there is
 * none. In arena pixels, from the launcher.
 */
export function slingAim(
  run: Run,
  config: GameConfig,
  flick: { dx: number; dy: number } | null,
): { x: number; y: number } {
  const originX = run.player.x;
  const originY = config.player.y;
  if (flick !== null) {
    // The finger went up the screen (dy < 0) to throw up: the vertical part is always upwards.
    const up = -Math.max(Math.abs(flick.dy), Math.abs(flick.dx) * 0.35, 1);
    const norm = Math.hypot(flick.dx, up) || 1;
    return { x: originX + (flick.dx / norm) * 400, y: originY + (up / norm) * 400 };
  }
  const target = smartTarget(run, config);
  return target === null ? { x: originX, y: originY - 400 } : { x: target.x, y: target.y };
}

/**
 * The left thumb of the two-thumb scheme (4G-H, 15th playtest: "debería ir a la velocidad del
 * dedo"): the launcher follows the finger's DRAG at once, 1:1 on the screen (`perPixel` arena pixels
 * per screen pixel), from wherever the finger lands, so the thumb never sits on the field. It
 * integrates every movement and clamps at the walls, so turning back answers at once, with no dead
 * travel. Pure.
 */
export class SlideTrack {
  active = false;
  private lastX = 0;
  private value = 0;

  down(screenX: number, value: number): void {
    this.active = true;
    this.lastX = screenX;
    this.value = value;
  }

  /** The finger moved to `screenX`: the target moves as much, kept between `min` and `max`. */
  move(screenX: number, perPixel: number, min: number, max: number): void {
    if (!this.active) return;
    this.value = Math.max(min, Math.min(max, this.value + (screenX - this.lastX) * perPixel));
    this.lastX = screenX;
  }

  target(): number {
    return this.value;
  }

  up(): void {
    this.active = false;
  }
}

/**
 * Arena pixels the launcher moves per screen pixel of the left thumb: 1:1 on the screen, and more
 * when the side panel is narrower than the field, so a sweep of the whole panel crosses the whole
 * field ("el dedo llega al extremo y él va por la mitad").
 */
export function twinMovePerPixel(scale: number, fieldScreenW: number, panelW: number): number {
  const reach = Math.max(1, fieldScreenW / Math.max(1, panelW));
  return reach / Math.max(1e-6, scale);
}

/** How many times the drag of the right thumb moves the aim (a little more than 1:1: a short reach). */
export const AIM_GAIN = 1.6;
/** The aim never goes lower than this above the launcher (the balls always go up). */
export const AIM_FLOOR = 60;

/**
 * The right thumb aims by dragging (4G-H): the aim point moves with the drag, like a mouse, from where
 * it was (it is not where the finger is, so the finger never covers the target). In arena pixels.
 */
export function aimDrag(
  anchor: { readonly x: number; readonly y: number },
  dxScreen: number,
  dyScreen: number,
  scale: number,
  arena: { readonly width: number },
  playerY: number,
): { x: number; y: number } {
  const k = AIM_GAIN / Math.max(1e-6, scale);
  return {
    x: Math.max(0, Math.min(arena.width, anchor.x + dxScreen * k)),
    y: Math.max(0, Math.min(playerY - AIM_FLOOR, anchor.y + dyScreen * k)),
  };
}

/** What the player is doing with the pointer, as the game loop reads it each tick. */
export interface PadInput {
  /** The launcher heads to this arena x while the thumb is down; null when it is not. */
  readonly steerX: number | null;
  /** The two thumbs (4G-H): where the right thumb has put the aim since the last tick, or null. */
  readonly aim?: { readonly x: number; readonly y: number } | null;
  /** A tap since the last tick, in arena pixels, or null. */
  readonly tap: { readonly x: number; readonly y: number } | null;
  /** The release of the thumb since the last tick (sling; a tap counts as a quiet one), or null. */
  readonly release: Extract<PadRelease, { kind: 'release' }> | null;
}

/**
 * The command of a touch scheme for this tick (the app adds the card and replace answers itself).
 * `deadZone` is the same as the pointer's: the launcher does not jitter around its target.
 */
export function commandForScheme(
  scheme: ControlScheme,
  pad: PadInput,
  run: Run,
  config: GameConfig,
  deadZone: number,
): Command {
  let moveX: -1 | 0 | 1 = 0;
  if (pad.steerX !== null) {
    const delta = pad.steerX - run.player.x;
    if (delta > deadZone) moveX = 1;
    else if (delta < -deadZone) moveX = -1;
  }
  switch (scheme) {
    case 'twin':
      // The left thumb says where to be (the domain goes straight there, fast); the right one aims.
      return {
        moveX: 0,
        ...(pad.steerX === null ? {} : { moveTo: pad.steerX }),
        autoAim: false,
        aimMode: 'manual',
        ...(pad.aim === null || pad.aim === undefined ? {} : { aimX: pad.aim.x, aimY: pad.aim.y }),
      };
    case 'smart': {
      // A tap on an enemy fixes it as the target; a tap on empty floor frees the target.
      const lock = pad.tap === null ? undefined : enemyAtTap(run.enemies, pad.tap.x, pad.tap.y);
      return { moveX, autoAim: false, aimMode: 'smart', ...(lock === undefined ? {} : { lock }) };
    }
    case 'motion':
      return { moveX, autoAim: false, aimMode: 'motion' };
    case 'sling': {
      if (pad.release === null) return { moveX, autoAim: false, aimMode: 'sling' };
      const aim = slingAim(run, config, pad.release.flick);
      return { moveX, autoAim: false, aimMode: 'sling', aimX: aim.x, aimY: aim.y, fire: true };
    }
    default:
      return { moveX };
  }
}
