import type { GameEvent } from '../domain';

/**
 * Hit-stop (4V, block 1; art bible §6): the game freezes for a few hundredths of a second on the
 * hits that matter, so they are felt. It is presentation only: the app simply does not advance the
 * simulation while a stop lasts, exactly like the pause of an evolution, so the run is the same
 * `f(seed, commands, config)` with or without it.
 */

/** How long each kind of moment stops the game, in milliseconds (0 = it does not). */
export const HIT_STOP_MS = {
  /** The player threw an Ultimate and it landed. */
  ultimate: 60,
  /** The player lost health. */
  hurt: 70,
  /** A boss lost its temper (its fury at half health). */
  fury: 90,
  /** A boss was defeated. */
  bossDown: 110,
} as const;
/** Never two stops closer than this: a string of hits must not feel like a stutter. */
export const HIT_STOP_GAP_MS = 250;

/** The stop an event asks for, or 0. */
export function hitStopOf(event: GameEvent): number {
  switch (event.type) {
    case 'move':
      return event.manual ? HIT_STOP_MS.ultimate : 0;
    case 'playerHurt':
      return HIT_STOP_MS.hurt;
    case 'bossPhase':
      return HIT_STOP_MS.fury;
    case 'bossDefeated':
      return HIT_STOP_MS.bossDown;
    default:
      return 0;
  }
}

export class HitStop {
  private until = -Infinity;
  private lastStart = -Infinity;

  /** Asks for a stop of `ms` at time `now`; ignored if the last one started too recently. */
  request(now: number, ms: number): boolean {
    if (ms <= 0 || now - this.lastStart < HIT_STOP_GAP_MS) return false;
    this.lastStart = now;
    this.until = now + ms;
    return true;
  }

  /** True while the game is stopped. */
  active(now: number): boolean {
    return now < this.until;
  }

  reset(): void {
    this.until = -Infinity;
    this.lastStart = -Infinity;
  }
}
