import { fieldMargin, playerSpeedMult } from './bossFight';
import type { GameConfig } from './config';
import type { Hazard, Run } from './run';

/**
 * The guarantee of dodgeability (4G-G, "siempre un hueco"): at every moment, the zones of danger that
 * are announced or active (from bosses AND ordinary enemies) must leave somewhere safe for the player
 * to stand, wide enough for the body plus a margin, and the player must be able to REACH it at its
 * own speed in the time it has. Pure and deterministic: no randomness, no clock.
 */

/**
 * Width of the player's body, in arena pixels (a point is not a person). Since 4G-I it is ALSO the
 * hitbox: an attack hurts when it touches any part of the body, not only its centre (16th playtest:
 * "si no te dan de lleno, no te dan"). It is the width the launcher is drawn (16 art pixels x 2): a
 * graze that looks like a hit is one. 40 (4 more on each side) took the dodging bot from 22 % to 2 %.
 * The guarantee of a way through is measured with the same width.
 */
export const PLAYER_WIDTH = 32;
/**
 * Free floor beside the body ON EACH SIDE, so a gap is a gap and not a pixel. 4G-I: with the body as
 * hitbox, the old rule (body plus 16 in total) left windows a person could not hit; now every side
 * keeps 12 pixels of slack.
 */
export const SAFE_MARGIN = 12;
/** The narrowest free gap between two zones (or a zone and the wall): body plus margin on both sides. */
export const MIN_GAP = PLAYER_WIDTH + 2 * SAFE_MARGIN;
/** The step of the time sampling, in ticks. */
const STEP = 2;
/** Part of the speed the player is trusted to use (a person is not a robot). */
const SPEED_TRUST = 0.85;

interface Span {
  readonly from: number;
  readonly to: number;
}

/** When and where a hazard hurts: the ticks from now it is dangerous, and where it stands then. */
interface Threat {
  readonly from: number;
  readonly to: number;
  /** Centre of the zone at `from`, its speed per tick and its width. */
  readonly x: number;
  readonly speed: number;
  readonly width: number;
}

/** Does this hazard hurt at all, and while? A harmless one (zone, gust, portal) never closes a gap. */
function threatOf(hazard: Hazard, config: GameConfig): Threat | undefined {
  const wait = Math.max(0, hazard.telegraph);
  // An open portal carries whoever touches it to its pair, maybe into a zone: it cannot be walked
  // across, so for the guarantee it is a wall for as long as it lasts.
  if (hazard.kind === 'portal') {
    return {
      from: wait,
      to: wait + Math.max(STEP + 1, hazard.active),
      x: hazard.x,
      speed: 0,
      width: hazard.width,
    };
  }
  if (hazard.damage <= 0) return undefined;
  switch (hazard.kind) {
    case 'column':
    case 'comb':
    case 'rain':
      if (hazard.struck && wait <= 0) return undefined;
      return {
        from: wait,
        to: wait + Math.max(STEP + 1, hazard.active),
        x: hazard.x,
        speed: 0,
        width: hazard.width,
      };
    case 'sweep':
      if (hazard.struck && wait <= 0) return undefined;
      return {
        from: wait,
        to: wait + Math.max(STEP + 1, hazard.active),
        x: hazard.x,
        speed: hazard.speed,
        width: hazard.width,
      };
    case 'crack':
      return {
        from: wait,
        to: wait + Math.max(STEP + 1, hazard.active),
        x: hazard.x,
        speed: 0,
        width: hazard.width,
      };
    case 'shot': {
      if (hazard.active < 0) return undefined;
      const fall = Math.max(0, config.player.y - 8 - hazard.y) / Math.max(1, hazard.speed);
      const arrive = wait + ((fall + 0.999) | 0);
      return {
        from: arrive - 1,
        to: arrive + STEP + 1,
        x: hazard.x,
        speed: 0,
        width: hazard.width,
      };
    }
    default:
      return undefined;
  }
}

/** The free stretches of floor left in `free` once a zone [a, b] is taken out. */
function carve(free: Span[], a: number, b: number): Span[] {
  const out: Span[] = [];
  for (const s of free) {
    if (b < s.from || a > s.to) {
      out.push(s);
      continue;
    }
    if (a > s.from) out.push({ from: s.from, to: a });
    if (b < s.to) out.push({ from: b, to: s.to });
  }
  return out;
}

/**
 * Can a player standing at `run.player.x` always reach a place that is safe, with the hazards on the
 * field plus `extra` (not yet on the field)? The safe floor at each sampled tick is the field minus
 * every zone that hurts then, grown by half of `MIN_GAP` on each side; the places the player can be
 * are what it could reach from where it was, at its speed, and that is still safe.
 */
export function isDodgeable(run: Run, config: GameConfig, extra: readonly Hazard[] = []): boolean {
  const threats: Threat[] = [];
  for (const h of run.hazards) {
    const t = threatOf(h, config);
    if (t !== undefined) threats.push(t);
  }
  for (const h of extra) {
    const t = threatOf(h, config);
    if (t !== undefined) threats.push(t);
  }
  // A gust does not hurt: it pushes, so the player drifts (and is slower against it).
  const gusts: { from: number; to: number; push: number }[] = [];
  for (const h of [...run.hazards, ...extra]) {
    if (h.kind !== 'gust') continue;
    const wait = Math.max(0, h.telegraph);
    gusts.push({ from: wait, to: wait + Math.max(0, h.active), push: h.speed });
  }
  if (extra.length > 0 && threats.length === 0) return true;
  let horizon = 0;
  for (const t of threats) horizon = Math.max(horizon, t.to);
  const margin = fieldMargin(run, config);
  const lo = margin;
  const hi = config.arena.width - margin;
  const reach = config.player.speed * playerSpeedMult(run, config) * SPEED_TRUST * STEP;
  const grow = MIN_GAP / 2;
  let reachable: Span[] = [{ from: run.player.x, to: run.player.x }];
  for (let tau = 0; tau <= horizon; tau += STEP) {
    let free: Span[] = [{ from: lo, to: hi }];
    for (const t of threats) {
      if (tau < t.from || tau > t.to) continue;
      const centre = t.x + t.speed * Math.max(0, tau - t.from);
      free = carve(free, centre - t.width / 2 - grow, centre + t.width / 2 + grow);
      if (free.length === 0) return false;
    }
    let drift = 0;
    for (const g of gusts) if (tau >= g.from && tau <= g.to) drift += g.push * STEP;
    const next: Span[] = [];
    for (const r of reachable) {
      const a = Math.max(lo, r.from - reach + drift);
      const b = Math.min(hi, r.to + reach + drift);
      for (const s of free) {
        const from = Math.max(a, s.from);
        const to = Math.min(b, s.to);
        if (from <= to) next.push({ from, to });
      }
    }
    if (next.length === 0) return false;
    reachable = next;
  }
  return true;
}
