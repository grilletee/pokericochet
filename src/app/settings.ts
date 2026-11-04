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
