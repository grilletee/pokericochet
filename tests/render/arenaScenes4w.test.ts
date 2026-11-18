import { describe, expect, it } from 'vitest';
import { furyOf, LEGEND_ARENAS, looksLikeDanger, safeGlow } from '../../src/render/legendArena';

/**
 * 4W, block 6 (18th playtest: "la arena final a mejorar"): the arenas are painted scenes now
 * (`arenaSceneDef` in scenes.ts, whose switch covers every kind of floor or does not compile).
 */
describe('the arenas of the legendaries', () => {
  it('the fury keeps the kind of floor (the same scene painter, other colours)', () => {
    for (const spec of Object.values(LEGEND_ARENAS)) expect(furyOf(spec).floor).toBe(spec.floor);
  });
});

describe('no red of danger in the background (art bible §5)', () => {
  const isDangerRed = looksLikeDanger;

  it('tells the red of danger from an orange or a pink', () => {
    for (const red of [0xff4a3a, 0xd02020, 0xd8304a, 0xff5060]) expect(isDangerRed(red)).toBe(true);
    for (const other of [0xff6a10, 0xffb02a, 0xff7fb0, 0x8a5acb, 0x707088, 0xffffff]) {
      expect(isDangerRed(other)).toBe(false);
    }
  });

  it('a red glow is moved towards violet; any other colour is kept', () => {
    expect(isDangerRed(0xd02020)).toBe(true);
    expect(isDangerRed(safeGlow(0xd02020))).toBe(false);
    expect(isDangerRed(safeGlow(0xff4a3a))).toBe(false);
    for (const c of [0x8ee0ff, 0xffe050, 0x40d8c8, 0xffb02a, 0x6ae070]) expect(safeGlow(c)).toBe(c);
  });

  it('no arena keeps a glow or a dust of that red, calm or in fury', () => {
    for (const [species, spec] of Object.entries(LEGEND_ARENAS)) {
      for (const look of [spec, furyOf(spec)]) {
        expect(isDangerRed(safeGlow(look.glow)), species).toBe(false);
        for (const dust of look.dust) expect(isDangerRed(safeGlow(dust)), species).toBe(false);
      }
    }
  });
});
