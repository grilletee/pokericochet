import { describe, expect, it } from 'vitest';
import {
  STRIKE_FRAMES,
  STRIKE_H,
  STRIKE_W,
  type StrikeMotif,
  scale2x,
  strikeRows,
  strikeRowsFine,
} from '../../src/render/bossArt';

/** 4W, block 6: the boss strikes at the pixel of the art bible (2 units), doubled by Scale2x. */
describe('Scale2x', () => {
  it('doubles the tile and invents no colour', () => {
    const rows = ['.dd.', 'dbld', 'dbbd', '.dd.'];
    const out = scale2x(rows);
    expect(out).toHaveLength(8);
    for (const row of out) expect(row).toHaveLength(8);
    const codes = new Set(rows.join(''));
    for (const ch of out.join('')) expect(codes.has(ch)).toBe(true);
  });

  it('a solid block stays solid; a lone pixel stays a 2 x 2 square', () => {
    expect(scale2x(['bb', 'bb'])).toEqual(['bbbb', 'bbbb', 'bbbb', 'bbbb']);
    expect(scale2x(['...', '.b.', '...'])).toEqual([
      '......',
      '......',
      '..bb..',
      '..bb..',
      '......',
      '......',
    ]);
  });

  it('a staircase becomes a finer diagonal (the corner is filled)', () => {
    const out = scale2x(['b..', 'bb.', 'bbb']);
    // The empty corner next to the step takes the colour of the two neighbours that agree.
    expect(out[2]?.[2]).toBe('b');
    expect(out[0]?.[3]).toBe('.');
  });
});

describe('the strikes at the fine pixel', () => {
  const motifs: StrikeMotif[] = [
    'flame',
    'water',
    'rocks',
    'shadow',
    'bolt',
    'vine',
    'icicles',
    'bubbles',
    'rings',
    'fists',
    'blades',
    'shards',
    'swarm',
    'sparkles',
    'shock',
  ];

  it('every motif and frame is twice the tile and keeps its pixels where they were', () => {
    for (const motif of motifs) {
      for (let f = 0; f < STRIKE_FRAMES; f++) {
        const coarse = strikeRows(motif, f);
        const fine = strikeRowsFine(motif, f);
        expect(fine).toHaveLength(STRIKE_H * 2);
        for (const row of fine) expect(row).toHaveLength(STRIKE_W * 2);
        // Scale2x never empties a lit pixel's own 2 x 2 completely.
        coarse.forEach((row, y) => {
          for (let x = 0; x < row.length; x++) {
            if (row[x] === '.') continue;
            const quad = [
              fine[y * 2]?.[x * 2],
              fine[y * 2]?.[x * 2 + 1],
              fine[y * 2 + 1]?.[x * 2],
              fine[y * 2 + 1]?.[x * 2 + 1],
            ];
            expect(
              quad.some((c) => c !== '.'),
              `${motif} ${f} ${x},${y}`,
            ).toBe(true);
          }
        });
      }
    }
  });
});
