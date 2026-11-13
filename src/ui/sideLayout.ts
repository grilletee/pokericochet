/**
 * The landscape layout of the touch screen (4G-H, 15th playtest: "el HUD y mis Pokémon tapan toda la
 * pantalla"). The field keeps its shape in the middle of the screen; what is left on each side is a
 * panel, and everything that is not the field goes there: the HUD and the team on the left, the bar
 * of the boss, the messages and the Ultimate button on the right. Nothing of the interface is ever
 * over the field. `sidePanels` is pure; `dock` moves an element there and back.
 */

export interface SidePanel {
  /** Left edge and width in host pixels. */
  readonly x: number;
  readonly w: number;
}

export interface SidePanels {
  readonly left: SidePanel;
  readonly right: SidePanel;
  readonly height: number;
}

/** A side narrower than this (host pixels) cannot hold the HUD: no side layout then. */
export const MIN_PANEL = 90;

/**
 * The two side panels of a screen of `screenW` x `screenH` whose field is drawn from `fieldX` and
 * `fieldW` wide, or null when the screen is not landscape or a side is too narrow.
 */
export function sidePanels(
  screenW: number,
  screenH: number,
  fieldX: number,
  fieldW: number,
): SidePanels | null {
  if (screenW <= screenH) return null;
  const rightX = fieldX + fieldW;
  const left = { x: 0, w: fieldX };
  const right = { x: rightX, w: screenW - rightX };
  if (left.w < MIN_PANEL || right.w < MIN_PANEL) return null;
  return { left, right, height: screenH };
}

/** True when a touch screen held upright: the game asks to turn it (4G-H). */
export function asksToRotate(touch: boolean, screenW: number, screenH: number): boolean {
  return touch && screenH > screenW;
}

const base = new WeakMap<HTMLElement, string>();

/**
 * Puts an element in the side layout with `extra` CSS over its own, or back as it was (`extra`
 * null). Whether it is shown (`display`) is kept: the element still decides that itself.
 */
export function dock(element: HTMLElement, extra: string | null): void {
  if (!base.has(element)) base.set(element, element.style.cssText);
  const display = element.style.display;
  element.style.cssText = `${base.get(element) ?? ''}${extra ?? ''}`;
  element.style.display = display;
}
