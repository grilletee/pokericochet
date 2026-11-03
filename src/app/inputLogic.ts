import type { Command } from '../domain';

export interface InputState {
  left: boolean;
  right: boolean;
  /** x in arena units that a finger or mouse button is holding, or null. */
  pointerX: number | null;
}

/**
 * Turns the current input into the per-tick command (ADR-004: the only input is moveX).
 * The keyboard wins over the pointer; the pointer steers towards its x, with a dead zone so the
 * player does not jitter around the target.
 */
export function commandFromInput(input: InputState, playerX: number, deadZone: number): Command {
  if (input.left !== input.right) return { moveX: input.left ? -1 : 1 };
  if (input.pointerX !== null) {
    const delta = input.pointerX - playerX;
    if (delta > deadZone) return { moveX: 1 };
    if (delta < -deadZone) return { moveX: -1 };
  }
  return { moveX: 0 };
}
