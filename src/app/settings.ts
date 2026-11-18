import { CONTROL_SCHEMES, type ControlScheme, defaultSchemeFor, isControlScheme } from '../ui';
import type { KeyValueStore } from './bestRun';

/** localStorage key of the mute switch (neutral name, like the best-run key). */
export const MUTED_KEY = 'muted.v1';

export function loadMuted(store: KeyValueStore | null): boolean {
  try {
    return store?.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Best effort: a blocked storage just means the choice is not remembered. */
export function saveMuted(store: KeyValueStore | null, muted: boolean): void {
  try {
    store?.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // ignore
  }
}

/** localStorage key of the first-time notices already shown (4W, block 4). */
export const TIPS_KEY = 'tips.v1';

/** The first-time notices this player has seen. */
export function loadTips(store: KeyValueStore | null): ReadonlySet<string> {
  try {
    const raw = store?.getItem(TIPS_KEY) ?? '';
    return new Set(raw.split(',').filter((t) => /^[a-z0-9-]{1,32}$/.test(t)));
  } catch {
    return new Set();
  }
}

/** Marks a notice as seen; true when it had not been (so it is shown now, once). */
export function markTip(store: KeyValueStore | null, tip: string): boolean {
  const seen = loadTips(store);
  if (seen.has(tip)) return false;
  try {
    store?.setItem(TIPS_KEY, [...seen, tip].sort().join(','));
  } catch {
    // ignore: a blocked storage shows the notice again next time, which is harmless
  }
  return true;
}

/** localStorage key of the assisted-aim switch. */
export const AUTO_AIM_KEY = 'autoAim.v1';

/** Manual aim is the default (ADR-021): only an explicit choice turns the assist on. */
export function loadAutoAim(store: KeyValueStore | null): boolean {
  try {
    return store?.getItem(AUTO_AIM_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveAutoAim(store: KeyValueStore | null, auto: boolean): void {
  try {
    store?.setItem(AUTO_AIM_KEY, auto ? '1' : '0');
  } catch {
    // ignore
  }
}

/**
 * 4X (19th playtest, the author's cousin: "el Ultimate con la tecla 1 es incómodo"): the key that
 * throws the Ultimate, next to the movement keys. The right click always throws it too.
 */
export const ULTIMATE_KEYS = ['KeyQ', 'KeyE', 'KeyF', 'KeyW'] as const;
export type UltimateKey = (typeof ULTIMATE_KEYS)[number];
export const DEFAULT_ULTIMATE_KEY: UltimateKey = 'KeyQ';
export const ULTIMATE_KEY_KEY = 'ultimateKey.v1';

export function isUltimateKey(value: unknown): value is UltimateKey {
  return typeof value === 'string' && (ULTIMATE_KEYS as readonly string[]).includes(value);
}

/** The letter a key code shows on the screen: "KeyQ" -> "Q". */
export function keyLabel(code: UltimateKey): string {
  return code.slice(3);
}

export function loadUltimateKey(store: KeyValueStore | null): UltimateKey {
  try {
    const raw = store?.getItem(ULTIMATE_KEY_KEY);
    return isUltimateKey(raw) ? raw : DEFAULT_ULTIMATE_KEY;
  } catch {
    return DEFAULT_ULTIMATE_KEY;
  }
}

export function saveUltimateKey(store: KeyValueStore | null, key: UltimateKey): void {
  try {
    store?.setItem(ULTIMATE_KEY_KEY, key);
  } catch {
    // ignore
  }
}

/** localStorage key of the control scheme (4G-G). */
export const CONTROLS_KEY = 'controls.v1';

/**
 * The scheme to play with: the one the player chose, else the one that suits the device (a touch
 * screen starts with the smart aim). A bad or missing value falls back to the device default.
 */
export function loadScheme(store: KeyValueStore | null, coarsePointer: boolean): ControlScheme {
  try {
    const raw = store?.getItem(CONTROLS_KEY);
    // A portrait prototype of the 4G-G remembered on the phone gives way to the default (4G-H: they
    // are hidden now); `?controls=` still opens them.
    if (isControlScheme(raw) && CONTROL_SCHEMES.find((s) => s.id === raw)?.hidden !== true) {
      return raw;
    }
  } catch {
    // fall through to the default
  }
  return defaultSchemeFor(coarsePointer);
}

export function saveScheme(store: KeyValueStore | null, scheme: ControlScheme): void {
  try {
    store?.setItem(CONTROLS_KEY, scheme);
  } catch {
    // ignore
  }
}

/** Volumes (0..1): everything, the sound effects, the cries of the Pokémon (4G-F) and the music (4G-I). */
export interface Volumes {
  readonly master: number;
  readonly effects: number;
  readonly cries: number;
  readonly music: number;
}

/** The cries start low (13th playtest: "demasiado alto"); the music under the effects. */
export const DEFAULT_VOLUMES: Volumes = { master: 1, effects: 1, cries: 0.4, music: 0.6 };

/** localStorage key of the volumes. */
export const VOLUMES_KEY = 'volumes.v1';

const unit = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

export function loadVolumes(store: KeyValueStore | null): Volumes {
  try {
    const raw = store?.getItem(VOLUMES_KEY);
    if (raw === null || raw === undefined) return DEFAULT_VOLUMES;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_VOLUMES;
    const v = parsed as Record<string, unknown>;
    return {
      master: unit(v.master, DEFAULT_VOLUMES.master),
      effects: unit(v.effects, DEFAULT_VOLUMES.effects),
      cries: unit(v.cries, DEFAULT_VOLUMES.cries),
      music: unit(v.music, DEFAULT_VOLUMES.music),
    };
  } catch {
    return DEFAULT_VOLUMES;
  }
}

export function saveVolumes(store: KeyValueStore | null, volumes: Volumes): void {
  try {
    store?.setItem(VOLUMES_KEY, JSON.stringify(volumes));
  } catch {
    // ignore
  }
}
