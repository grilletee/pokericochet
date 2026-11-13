import { describe, expect, it } from 'vitest';
import { FINAL_BOSSES } from '../../src/data/config/bosses';
import { GAME_TYPES } from '../../src/domain';
import {
  STRIKE_FRAMES,
  STRIKE_H,
  STRIKE_W,
  strikeLook,
  strikeRows,
} from '../../src/render/bossArt';
import { arenaOf, floorSignature, LEGEND_ARENAS } from '../../src/render/legendArena';

describe('the look of a boss attack by type (4G-H, 15th playtest)', () => {
  it('every type has its look, and the ones the author named are what they say', () => {
    for (const type of GAME_TYPES) expect(strikeLook(type).motif).toBeTruthy();
    expect(strikeLook('fire').motif).toBe('flame');
    expect(strikeLook('water').motif).toBe('water');
    expect(strikeLook('rock').motif).toBe('rocks');
    expect(strikeLook('ghost').motif).toBe('shadow');
    // Flames rise, water and rocks fall.
    expect(strikeLook('fire').scroll).toBeLessThan(0);
    expect(strikeLook('water').scroll).toBeGreaterThan(0);
    expect(strikeLook('rock').scroll).toBeGreaterThan(0);
  });

  it('the looks are really different pictures, of the right size, and they move frame to frame', () => {
    const motifs = [...new Set(GAME_TYPES.map((t) => strikeLook(t).motif))];
    expect(motifs.length).toBeGreaterThanOrEqual(14);
    const pictures = new Set<string>();
    for (const motif of motifs) {
      const frames = Array.from({ length: STRIKE_FRAMES }, (_, f) => strikeRows(motif, f));
      for (const rows of frames) {
        expect(rows).toHaveLength(STRIKE_H);
        for (const row of rows) expect(row).toHaveLength(STRIKE_W);
        // Something is drawn.
        expect(rows.join('').replaceAll('.', '').length).toBeGreaterThan(10);
      }
      // Animated: not all four frames are the same picture.
      expect(new Set(frames.map((r) => r.join('/'))).size).toBeGreaterThan(1);
      pictures.add(frames[0]?.join('/') ?? '');
    }
    expect(pictures.size).toBe(motifs.length);
  });
});

describe('the arena of each legendary (4G-H)', () => {
  it('every final boss has its own arena, and no two look the same', () => {
    const signatures = new Set<string>();
    for (const species of FINAL_BOSSES) {
      expect(LEGEND_ARENAS[species], species).toBeDefined();
      signatures.add(floorSignature(species));
    }
    expect(signatures.size).toBe(FINAL_BOSSES.length);
  });

  it('the arenas use many kinds of floor and of dust', () => {
    const floors = new Set(FINAL_BOSSES.map((s) => arenaOf(s).floor));
    const motions = new Set(FINAL_BOSSES.map((s) => arenaOf(s).motion));
    expect(floors.size).toBeGreaterThanOrEqual(10);
    expect(motions.size).toBe(3);
    expect(arenaOf('kyogre').floor).toBe('abyss');
    expect(arenaOf('groudon').floor).toBe('magma');
  });
});
