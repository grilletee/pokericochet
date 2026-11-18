import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../src/data';
import {
  createRun,
  DIGIT_GLYPHS,
  DIGIT_H,
  DIGIT_W,
  damageEnemy,
  digitChars,
} from '../../src/domain';
import { digitsOf } from '../../src/render/feelRules';
import { makeEnemy } from './fixtures';

/** 4W, block 3 (18th playtest: "el 2, el 5 y otros no se distinguen"): the game's own digits. */
const DIGITS = '0123456789'.split('');

/** The pixels in which two glyphs differ. */
function distance(a: string, b: string): number {
  const ra = DIGIT_GLYPHS[a] ?? [];
  const rb = DIGIT_GLYPHS[b] ?? [];
  let d = 0;
  for (let y = 0; y < DIGIT_H; y++) {
    for (let x = 0; x < DIGIT_W; x++) {
      if ((ra[y]?.[x] === 'x') !== (rb[y]?.[x] === 'x')) d += 1;
    }
  }
  return d;
}

describe('the digits of the game', () => {
  it('every glyph is 7 x 9 and every digit has one', () => {
    for (const [ch, rows] of Object.entries(DIGIT_GLYPHS)) {
      expect(rows, ch).toHaveLength(DIGIT_H);
      for (const row of rows) expect(row, ch).toHaveLength(DIGIT_W);
    }
    for (const d of DIGITS) expect(DIGIT_GLYPHS[d], d).toBeDefined();
  });

  it('no two digits can be taken for each other: they differ in 8 pixels or more', () => {
    for (let i = 0; i < DIGITS.length; i++) {
      for (let j = i + 1; j < DIGITS.length; j++) {
        const a = DIGITS[i] ?? '';
        const b = DIGITS[j] ?? '';
        expect(distance(a, b), `${a} / ${b}`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('the pairs the playtest named are far apart: 2/5, 1/7, 6/8/9, 0/8', () => {
    expect(distance('2', '5')).toBeGreaterThanOrEqual(14);
    expect(distance('1', '7')).toBeGreaterThanOrEqual(14);
    expect(distance('6', '8')).toBeGreaterThanOrEqual(8);
    expect(distance('9', '8')).toBeGreaterThanOrEqual(8);
    expect(distance('6', '9')).toBeGreaterThanOrEqual(14);
    expect(distance('0', '8')).toBeGreaterThanOrEqual(8);
  });

  it('strokes two pixels wide: every lit pixel has a lit neighbour beside it or under it', () => {
    for (const d of DIGITS) {
      const rows = DIGIT_GLYPHS[d] ?? [];
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] !== 'x') continue;
          const near =
            row[x - 1] === 'x' ||
            row[x + 1] === 'x' ||
            rows[y - 1]?.[x] === 'x' ||
            rows[y + 1]?.[x] === 'x';
          expect(near, `${d} at ${x},${y}`).toBe(true);
        }
      });
    }
  });

  it('the killing blow carries its damage, so its number can show (a burn, a splash, a ball)', () => {
    const run = createRun(gameConfig, 1, 'charmander');
    const enemy = makeEnemy({ id: 3, hp: 5 });
    run.enemies = [enemy];
    run.events.length = 0;
    expect(damageEnemy(run, gameConfig, enemy, 2)).toBe(false);
    expect(damageEnemy(run, gameConfig, enemy, 7)).toBe(true);
    const kill = run.events.find((e) => e.type === 'kill');
    expect(kill?.type === 'kill' ? kill.damage : undefined).toBe(7);
  });

  it('a damage number only uses characters of the font', () => {
    expect(digitChars('12/40')).toEqual(['1', '2', '/', '4', '0']);
    expect(digitChars('Nv 3')).toEqual([' ', '3']);
    for (const d of digitsOf(98765, 4)) expect(DIGIT_GLYPHS[String(d)]).toBeDefined();
  });
});
