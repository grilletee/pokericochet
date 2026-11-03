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
