import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GAME_TITLE } from '../../src/app/config';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TITLE_PATTERN = /pok[eé]bounce/i;
/** 4X: the name of before; it must be gone from the game and its page. */
const OLD_TITLE = /pok[eé]ricochet/i;

/** Every source file of the game and its page. */
function gameFiles(): string[] {
  const files = readdirSync(`${ROOT}src`, { recursive: true, encoding: 'utf8' })
    .map((name) => `src/${name.replaceAll('\\', '/')}`)
    .filter((name) => name.endsWith('.ts'));
  files.push('index.html');
  return files;
}

describe('game title', () => {
  it('is defined once, in src/app/config.ts', () => {
    expect(GAME_TITLE).toMatch(TITLE_PATTERN);
    const offenders = gameFiles()
      .filter((file) => file !== 'src/app/config.ts')
      .filter((file) => TITLE_PATTERN.test(readFileSync(`${ROOT}${file}`, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('4X: the old name is nowhere in the game (PokéRicochet became PokéBounce)', () => {
    expect(GAME_TITLE).toBe('PokéBounce');
    const left = gameFiles().filter((file) =>
      OLD_TITLE.test(
        readFileSync(`${ROOT}${file}`, 'utf8')
          // The comment that records the rename is the one place it may be named.
          .replace('"PokéRicochet" became "PokéBounce"', ''),
      ),
    );
    expect(left).toEqual([]);
  });
});
