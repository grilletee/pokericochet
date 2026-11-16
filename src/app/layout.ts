import type { GameConfig } from '../domain';
import type { KeyValueStore } from './bestRun';

/**
 * The layout of a phone held sideways (4G-J, block 4; 17th playtest: "en el móvil el juego se ve muy
 * pequeño en horizontal, con barras laterales que no me gustan"). Two variants to compare, chosen in
 * the settings or forced with `?layout=a|b`; the controls do not change. The tablet (and the desktop)
 * keep the layout they had.
 *
 * - A: the field takes the whole height (full screen when the browser allows it) and the biome goes
 *   on behind it across the side bands, dimmed; the HUD, the team and the ULTI button float over the
 *   bands, see-through, with no opaque panels. The rules of the game are untouched.
 * - B: the same, with a WIDER field (`WIDE_ARENA` instead of 480): more of the screen is play. It
 *   changes the game (more room to dodge, enemies farther apart), so the bots measure it.
 */
export type PhoneLayout = 'a' | 'b';

export const LAYOUT_KEY = 'layout.v1';

/** The width of the field of the variant B (arena units; the height stays 720). */
export const WIDE_ARENA = 576;

export function isPhoneLayout(value: unknown): value is PhoneLayout {
  return value === 'a' || value === 'b';
}

/**
 * A phone: a coarse pointer and a short side under 540 CSS pixels (a phone held sideways is ~360-430
 * tall; a tablet is 740 or more).
 */
export function isPhone(coarse: boolean, screenW: number, screenH: number): boolean {
  return coarse && Math.min(screenW, screenH) < 540;
}

/**
 * The layout in force: `?layout=` wins (on any device, to try it); else, on a phone, the stored
 * choice, or A; else none (the tablet and the desktop stay as they were).
 */
export function resolveLayout(
  param: string | null,
  stored: string | null,
  phone: boolean,
): PhoneLayout | null {
  if (isPhoneLayout(param)) return param;
  if (!phone) return null;
  return isPhoneLayout(stored) ? stored : 'a';
}

export function loadLayout(store: KeyValueStore | null): string | null {
  try {
    return store?.getItem(LAYOUT_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveLayout(store: KeyValueStore | null, layout: PhoneLayout): void {
  try {
    store?.setItem(LAYOUT_KEY, layout);
  } catch {
    // ignore: the choice is just not remembered
  }
}

/** The config a run is played with in a layout: only B changes it (a wider field). */
export function layoutConfig(config: GameConfig, layout: PhoneLayout | null): GameConfig {
  if (layout !== 'b') return config;
  return { ...config, arena: { ...config.arena, width: WIDE_ARENA } };
}
