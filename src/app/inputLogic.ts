import type { Command } from '../domain';

export interface InputState {
  left: boolean;
  right: boolean;
  /** x in arena units that a finger or mouse button is holding on the floor, or null. */
  pointerX: number | null;
  /** Last point of the arena the player aimed at, or null until they aim (ADR-021). */
  aimX: number | null;
  aimY: number | null;
}

/**
 * Arena y from which a touch steers instead of aiming: the strip below the defence line. A
 * thumb on the floor moves the launcher and another finger anywhere above it aims.
 */
export const FLOOR_Y = 640;

/**
 * Turns the current input into the per-tick command (ADR-004, ADR-021). The keyboard wins over the
 * pointer for movement; the pointer steers towards its x, with a dead zone so the player does not
 * jitter around the target. The aim point goes along every tick once the player has set it.
 */
export function commandFromInput(
  input: InputState,
  playerX: number,
  deadZone: number,
  autoAim: boolean,
): Command {
  let moveX: -1 | 0 | 1 = 0;
  if (input.left !== input.right) {
    moveX = input.left ? -1 : 1;
  } else if (input.pointerX !== null) {
    const delta = input.pointerX - playerX;
    if (delta > deadZone) moveX = 1;
    else if (delta < -deadZone) moveX = -1;
  }
  if (input.aimX === null || input.aimY === null) return { moveX, autoAim };
  return { moveX, autoAim, aimX: input.aimX, aimY: input.aimY };
}
