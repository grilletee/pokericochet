/**
 * The cries of the Pokémon (4G-E): `src/assets/cries/<species>.ogg`, from PokeAPI/cries, downloaded
 * by `pnpm fetch-data`, NOT in the repo (like the sprites, ADR-018). Vite resolves the glob at build
 * time: a build without them has an empty map and the game is simply silent at a boss entrance.
 */
const urls = import.meta.glob('../assets/cries/*.ogg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byId = new Map<string, string>();
for (const [path, url] of Object.entries(urls)) {
  const id = /([^/]+)\.ogg$/.exec(path)?.[1];
  if (id !== undefined) byId.set(id, url);
}

/** Plays the cry of a species at a volume 0..1; does nothing without the file or while muted. */
export function playCry(species: string, volume: number, muted: boolean): void {
  const url = byId.get(species);
  if (url === undefined || muted) return;
  try {
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    void audio.play().catch(() => {});
  } catch {
    // no audio in this environment
  }
}
