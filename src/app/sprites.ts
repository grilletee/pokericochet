import { Assets, type Texture } from 'pixi.js';

/**
 * Species art, if it was fetched. The sprites live in src/assets/sprites/<species>.png, are NOT
 * in the repo and are downloaded by `pnpm fetch-data` (ADR-018). Vite resolves this glob at build
 * time, so a build without sprites simply gets an empty map and the game draws its own markers:
 * no request fails, nothing is hard-wired to the franchise art.
 */
const urls = import.meta.glob('../assets/sprites/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Species id -> URL of its sprite, for the species that have one. */
export function spriteUrls(): Map<string, string> {
  const found = new Map<string, string>();
  for (const [path, url] of Object.entries(urls)) {
    const id = /([^/]+)\.png$/.exec(path)?.[1];
    if (id !== undefined) found.set(id, url);
  }
  return found;
}

/**
 * Loads the textures in the order of `speciesIds` (the species codes of the snapshot). Species
 * without art, or whose image fails to load, stay `undefined`: the renderer falls back to markers.
 */
export async function loadSpeciesTextures(
  speciesIds: readonly string[],
): Promise<(Texture | undefined)[]> {
  const available = spriteUrls();
  return Promise.all(
    speciesIds.map(async (id) => {
      const url = available.get(id);
      if (url === undefined) return undefined;
      try {
        const texture = await Assets.load<Texture>(url);
        texture.source.scaleMode = 'nearest'; // pixel art stays crisp
        return texture;
      } catch {
        return undefined;
      }
    }),
  );
}
