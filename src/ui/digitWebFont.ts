import { DIGIT_GLYPHS, DIGIT_H, DIGIT_W } from '../domain';

/**
 * The game's digits as a web font (4W, block 3; 18th playtest: "los números son ilegibles, el 2 y el
 * 5..."). The interface's font (Pixelify Sans) mixes up its 5 and its 8 at small sizes, and every
 * number of the menus is written in it. This builds, from the same hand-drawn glyphs as the damage
 * numbers (`domain/digitFont.ts`), a minimal TrueType font with only the ten digits; the page then
 * declares it as one more face of the family 'Pixelify' limited to U+0030-0039, so the browser takes
 * the digits from it and every other character from Pixelify. No style of the game changes.
 *
 * Pure (bytes in, bytes out) and deterministic; the font is original (our own glyphs), so it needs
 * no licence of its own. Each run of lit pixels in a row is one rectangle, outlined clockwise.
 */
const UNITS = 1000;
/** One pixel of the glyph, in font units: 9 rows make 720 units, about the capitals of Pixelify. */
const PX = 80;
const ASCENT = 800;
const DESCENT = 200;
const ADVANCE = (DIGIT_W + 1) * PX;
const LSB = PX / 2;

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The rectangles of a glyph, in font units (y up, baseline at 0). */
export function glyphRects(rows: readonly string[]): Rect[] {
  const rects: Rect[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== 'x') {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x] === 'x') x += 1;
      rects.push({
        x0: LSB + start * PX,
        x1: LSB + x * PX,
        y0: (DIGIT_H - 1 - y) * PX,
        y1: (DIGIT_H - y) * PX,
      });
    }
  });
  return rects;
}

class Writer {
  private bytes: number[] = [];
  u8(v: number): this {
    this.bytes.push(v & 0xff);
    return this;
  }
  u16(v: number): this {
    return this.u8(v >> 8).u8(v);
  }
  i16(v: number): this {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v: number): this {
    return this.u16((v >>> 16) & 0xffff).u16(v & 0xffff);
  }
  tag(t: string): this {
    for (let i = 0; i < 4; i++) this.u8(t.charCodeAt(i));
    return this;
  }
  zeros(n: number): this {
    for (let i = 0; i < n; i++) this.u8(0);
    return this;
  }
  pad4(): this {
    while (this.bytes.length % 4 !== 0) this.u8(0);
    return this;
  }
  get length(): number {
    return this.bytes.length;
  }
  done(): number[] {
    return this.bytes;
  }
}

/** The TrueType checksum of a table (its 4-byte words summed, modulo 2^32). */
export function tableChecksum(bytes: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const word =
      ((bytes[i] ?? 0) << 24) |
      ((bytes[i + 1] ?? 0) << 16) |
      ((bytes[i + 2] ?? 0) << 8) |
      (bytes[i + 3] ?? 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

function glyph(rects: readonly Rect[]): number[] {
  if (rects.length === 0) return [];
  const w = new Writer();
  w.i16(rects.length)
    .i16(Math.min(...rects.map((r) => r.x0)))
    .i16(Math.min(...rects.map((r) => r.y0)))
    .i16(Math.max(...rects.map((r) => r.x1)))
    .i16(Math.max(...rects.map((r) => r.y1)));
  rects.forEach((_, i) => {
    w.u16(i * 4 + 3);
  });
  w.u16(0); // no instructions
  // Every point is on the curve, and every coordinate a 16-bit delta (flags 0x01).
  for (let i = 0; i < rects.length * 4; i++) w.u8(0x01);
  const points = rects.flatMap((r) => [
    [r.x0, r.y0],
    [r.x0, r.y1],
    [r.x1, r.y1],
    [r.x1, r.y0],
  ]);
  let px = 0;
  for (const [x] of points) {
    w.i16((x ?? 0) - px);
    px = x ?? 0;
  }
  let py = 0;
  for (const [, y] of points) {
    w.i16((y ?? 0) - py);
    py = y ?? 0;
  }
  return w.pad4().done();
}

function nameTable(family: string): number[] {
  const records: [number, string][] = [
    [1, family],
    [2, 'Regular'],
    [3, `${family}-1.0`],
    [4, family],
    [6, `${family}-Regular`],
  ];
  const w = new Writer();
  w.u16(0)
    .u16(records.length)
    .u16(6 + records.length * 12);
  let offset = 0;
  for (const [id, text] of records) {
    w.u16(3)
      .u16(1)
      .u16(0x409)
      .u16(id)
      .u16(text.length * 2)
      .u16(offset);
    offset += text.length * 2;
  }
  for (const [, text] of records) {
    for (const ch of text) w.u16(ch.charCodeAt(0));
  }
  return w.done();
}

/** The font file: .notdef and the digits 0-9 (glyphs 1-10), mapped from U+0030-U+0039. */
export function buildDigitFont(family = 'PixelDigits'): Uint8Array<ArrayBuffer> {
  const digits = '0123456789'.split('');
  const glyphs = [[], ...digits.map((d) => glyph(glyphRects(DIGIT_GLYPHS[d] ?? [])))];
  const numGlyphs = glyphs.length;
  const allRects = digits.map((d) => glyphRects(DIGIT_GLYPHS[d] ?? []));
  const maxContours = Math.max(...allRects.map((r) => r.length));
  const xMax = LSB + DIGIT_W * PX;
  const yMax = DIGIT_H * PX;

  const glyf: number[] = [];
  const loca = new Writer();
  for (const g of glyphs) {
    loca.u32(glyf.length);
    glyf.push(...g);
  }
  loca.u32(glyf.length);

  const head = new Writer()
    .u32(0x00010000)
    .u32(0x00010000)
    .u32(0) // checkSumAdjustment, set at the end
    .u32(0x5f0f3cf5)
    .u16(0x000b)
    .u16(UNITS)
    .zeros(16) // created, modified
    .i16(0)
    .i16(0)
    .i16(xMax)
    .i16(yMax)
    .u16(0)
    .u16(8)
    .i16(2)
    .i16(1) // long offsets in loca
    .i16(0);
  const hhea = new Writer()
    .u32(0x00010000)
    .i16(ASCENT)
    .i16(-DESCENT)
    .i16(0)
    .u16(ADVANCE)
    .i16(0)
    .i16(ADVANCE - xMax)
    .i16(xMax)
    .i16(1)
    .i16(0)
    .i16(0)
    .zeros(8)
    .i16(0)
    .u16(numGlyphs);
  const maxp = new Writer()
    .u32(0x00010000)
    .u16(numGlyphs)
    .u16(maxContours * 4)
    .u16(maxContours)
    .u16(0)
    .u16(0)
    .u16(2)
    .zeros(18);
  const os2 = new Writer()
    .u16(4)
    .i16(ADVANCE)
    .u16(400)
    .u16(5)
    .u16(0)
    .i16(650)
    .i16(600)
    .i16(0)
    .i16(75)
    .i16(650)
    .i16(600)
    .i16(0)
    .i16(350)
    .i16(50)
    .i16(300)
    .i16(0)
    .zeros(10) // panose
    .u32(1)
    .u32(0)
    .u32(0)
    .u32(0)
    .tag('NONE')
    .u16(0x0040)
    .u16(0x30)
    .u16(0x39)
    .i16(ASCENT)
    .i16(-DESCENT)
    .i16(0)
    .u16(ASCENT)
    .u16(DESCENT)
    .u32(1)
    .u32(0)
    .i16(yMax)
    .i16(yMax)
    .u16(0)
    .u16(0x20)
    .u16(1);
  const hmtx = new Writer();
  for (let i = 0; i < numGlyphs; i++) hmtx.u16(ADVANCE).i16(i === 0 ? 0 : LSB);
  const cmap = new Writer()
    .u16(0)
    .u16(1)
    .u16(3)
    .u16(1)
    .u32(12)
    // format 4: one segment for the digits, and the closing one
    .u16(4)
    .u16(32)
    .u16(0)
    .u16(4)
    .u16(4)
    .u16(1)
    .u16(0)
    .u16(0x39)
    .u16(0xffff)
    .u16(0)
    .u16(0x30)
    .u16(0xffff)
    .u16((1 - 0x30) & 0xffff)
    .u16(1)
    .u16(0)
    .u16(0);
  const post = new Writer().u32(0x00030000).u32(0).i16(-100).i16(50).u32(1).zeros(16);

  const tables: [string, number[]][] = [
    ['OS/2', os2.done()],
    ['cmap', cmap.done()],
    ['glyf', glyf],
    ['head', head.done()],
    ['hhea', hhea.done()],
    ['hmtx', hmtx.done()],
    ['loca', loca.done()],
    ['maxp', maxp.done()],
    ['name', nameTable(family)],
    ['post', post.done()],
  ];
  const n = tables.length;
  const pow = 2 ** Math.floor(Math.log2(n));
  const dir = new Writer()
    .u32(0x00010000)
    .u16(n)
    .u16(pow * 16)
    .u16(Math.log2(pow))
    .u16(n * 16 - pow * 16);
  let offset = 12 + n * 16;
  const body = new Writer();
  let headOffset = 0;
  for (const [tag, data] of tables) {
    dir.tag(tag).u32(tableChecksum(data)).u32(offset).u32(data.length);
    if (tag === 'head') headOffset = offset;
    for (const b of data) body.u8(b);
    body.pad4();
    offset = 12 + n * 16 + body.length;
  }
  const bytes = Uint8Array.from([...dir.done(), ...body.done()]);
  // The whole file sums to 0xB1B0AFBA: the head says by how much it was short.
  const adjust = (0xb1b0afba - tableChecksum([...bytes])) >>> 0;
  bytes[headOffset + 8] = adjust >>> 24;
  bytes[headOffset + 9] = (adjust >>> 16) & 0xff;
  bytes[headOffset + 10] = (adjust >>> 8) & 0xff;
  bytes[headOffset + 11] = adjust & 0xff;
  return bytes;
}

/**
 * The @font-face rule that lays the digits over the family `family` (only U+0030-0039), from a
 * `blob:` URL of the built font. Null where the page cannot make one (tests without a DOM).
 */
export function digitFontFace(family: string): string | null {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !('createObjectURL' in URL)) {
    return null;
  }
  const url = URL.createObjectURL(new Blob([buildDigitFont()], { type: 'font/ttf' }));
  return `@font-face{font-family:'${family}';src:url(${url}) format('truetype');font-weight:400 700;font-display:block;unicode-range:U+0030-0039}`;
}
