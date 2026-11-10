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

/** Volumes (0..1): everything, the sound effects and the cries of the Pokémon (4G-F). */
export interface Volumes {
  readonly master: number;
  readonly effects: number;
  readonly cries: number;
}

/** The cries start low (13th playtest: "demasiado alto"). */
export const DEFAULT_VOLUMES: Volumes = { master: 1, effects: 1, cries: 0.4 };

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
