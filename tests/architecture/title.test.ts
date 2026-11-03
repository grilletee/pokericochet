import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GAME_TITLE } from '../../src/app/config';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TITLE_PATTERN = /pok[eé]ricochet/i;

describe('game title', () => {
  it('is defined once, in src/app/config.ts', () => {
    expect(GAME_TITLE).toMatch(TITLE_PATTERN);

    const files = readdirSync(`${ROOT}src`, { recursive: true, encoding: 'utf8' })
      .map((name) => `src/${name.replaceAll('\\', '/')}`)
      .filter((name) => name.endsWith('.ts') && name !== 'src/app/config.ts');
    files.push('index.html');

    const offenders = files.filter((file) =>
      TITLE_PATTERN.test(readFileSync(`${ROOT}${file}`, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
