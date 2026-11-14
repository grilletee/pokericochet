import { emptyProfile, exportProfile, importProfile, migrateProfile, type Profile } from '../meta';
import type { KeyValueStore } from './bestRun';
import { GAME_TITLE } from './config';

/**
 * Where the persistent profile lives (ADR-025, 4G-I): `localStorage` under a versioned key, read
 * through the migrations of `meta/profile.ts`. A stored profile of a newer version than this game is
 * left untouched (the game plays with a profile in memory and never overwrites it). Export and import
 * move it as a JSON file, so the collection is never lost.
 */
export const PROFILE_KEY = 'profile.v1';

export interface LoadedProfile {
  readonly profile: Profile;
  /** False when the stored profile is of a newer version: it must not be saved over. */
  readonly writable: boolean;
}

export function loadProfile(
  store: KeyValueStore | null,
  known: (species: string) => boolean,
  gachaSeed: number,
): LoadedProfile {
  try {
    const raw = store?.getItem(PROFILE_KEY);
    if (raw === null || raw === undefined)
      return { profile: emptyProfile(gachaSeed), writable: true };
    const migrated = migrateProfile(JSON.parse(raw), known, gachaSeed);
    return migrated === null
      ? { profile: emptyProfile(gachaSeed), writable: false }
      : { profile: migrated, writable: true };
  } catch {
    return { profile: emptyProfile(gachaSeed), writable: true };
  }
}

export function saveProfile(store: KeyValueStore | null, loaded: LoadedProfile): void {
  if (!loaded.writable) return;
  try {
    store?.setItem(PROFILE_KEY, JSON.stringify(loaded.profile));
  } catch {
    // full or blocked storage: the profile lives on in memory for this session
  }
}

/** Offers the profile as a file to download. */
export function downloadProfile(profile: Profile): void {
  const blob = new Blob([exportProfile(profile)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${GAME_TITLE}-guardado.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Asks for a file and reads it as a profile; `done` gets the profile or the reason it failed. */
export function pickProfileFile(
  known: (species: string) => boolean,
  gachaSeed: number,
  done: (result: { readonly profile: Profile } | { readonly error: string }) => void,
): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file === undefined) return;
    void file.text().then((text) => done(importProfile(text, known, gachaSeed)));
  });
  input.click();
}
