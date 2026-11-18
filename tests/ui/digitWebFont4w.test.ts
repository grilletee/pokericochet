import { describe, expect, it } from 'vitest';
import { DIGIT_GLYPHS } from '../../src/domain';
import { buildDigitFont, glyphRects, tableChecksum } from '../../src/ui/digitWebFont';

/** 4W, block 3: the game's digits as a web font, laid over the interface's font for 0-9. */
const u16 = (b: Uint8Array, at: number): number => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const u32 = (b: Uint8Array, at: number): number => ((u16(b, at) << 16) | u16(b, at + 2)) >>> 0;

function tables(font: Uint8Array): Map<string, { offset: number; length: number; sum: number }> {
  const n = u16(font, 4);
  const out = new Map<string, { offset: number; length: number; sum: number }>();
  for (let i = 0; i < n; i++) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(...font.slice(at, at + 4));
    out.set(tag, { sum: u32(font, at + 4), offset: u32(font, at + 8), length: u32(font, at + 12) });
  }
  return out;
}

describe('the digits font file', () => {
  const font = buildDigitFont();

  it('is a TrueType font with the ten tables a browser asks for, in order', () => {
    expect(u32(font, 0)).toBe(0x00010000);
    const tags = [...tables(font).keys()];
    expect(tags).toEqual([
      'OS/2',
      'cmap',
      'glyf',
      'head',
      'hhea',
      'hmtx',
      'loca',
      'maxp',
      'name',
      'post',
    ]);
    expect([...tags].sort()).toEqual(tags);
  });

  it('every table is 4-byte aligned and its checksum is right; the file sums to the magic number', () => {
    for (const [tag, t] of tables(font)) {
      expect(t.offset % 4, tag).toBe(0);
      const bytes = [...font.slice(t.offset, t.offset + t.length)];
      // The head is summed with its adjustment at zero.
      if (tag === 'head') bytes.splice(8, 4, 0, 0, 0, 0);
      expect(tableChecksum(bytes), tag).toBe(t.sum);
    }
    expect(tableChecksum([...font])).toBe(0xb1b0afba);
  });

  it('maps exactly the digits 0-9 to glyphs 1-10', () => {
    const cmap = tables(font).get('cmap');
    if (cmap === undefined) throw new Error('no cmap');
    const sub = cmap.offset + 12;
    expect(u16(font, sub)).toBe(4); // format 4
    expect(u16(font, sub + 14)).toBe(0x39); // end of the first segment
    expect(u16(font, sub + 20)).toBe(0x30); // its start
    expect((0x30 + u16(font, sub + 24)) & 0xffff).toBe(1); // '0' -> glyph 1
    const maxp = tables(font).get('maxp');
    expect(u16(font, (maxp?.offset ?? 0) + 4)).toBe(11);
  });

  it('is the same file every time (deterministic)', () => {
    expect([...buildDigitFont()]).toEqual([...font]);
  });
});

describe('the outline of a digit', () => {
  it('is one rectangle per run of lit pixels in a row, and covers every lit pixel', () => {
    for (const [digit, rows] of Object.entries(DIGIT_GLYPHS)) {
      if (!/\d/.test(digit)) continue;
      const rects = glyphRects(rows);
      const runs = rows.reduce((n, row) => n + (row.match(/x+/g)?.length ?? 0), 0);
      expect(rects, digit).toHaveLength(runs);
      const lit = rows.reduce((n, row) => n + [...row].filter((c) => c === 'x').length, 0);
      const area = rects.reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
      expect(area, digit).toBe(lit * 80 * 80);
      for (const r of rects) {
        expect(r.x1).toBeGreaterThan(r.x0);
        expect(r.y1).toBeGreaterThan(r.y0);
        expect(r.y0).toBeGreaterThanOrEqual(0); // on or above the baseline
      }
    }
  });
});
