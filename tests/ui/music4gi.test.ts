import { describe, expect, it } from 'vitest';
import {
  midiFreq,
  stepNotes,
  stepSeconds,
  TRACKS,
  type TrackId,
  trackFor,
  trackSteps,
} from '../../src/ui';

/** 4G-I, block 6 (16th playtest: "falta música"): the original score of the game, as data. */
const ids = Object.keys(TRACKS) as TrackId[];

describe('the six pieces of the game', () => {
  it('menu, waves, boss, final, victory and defeat; the first four loop, the last two are stingers', () => {
    expect(ids.sort()).toEqual(['boss', 'defeat', 'final', 'menu', 'victory', 'waves']);
    for (const id of ['menu', 'waves', 'boss', 'final'] as const)
      expect(TRACKS[id].loop).toBe(true);
    for (const id of ['victory', 'defeat'] as const) expect(TRACKS[id].loop).toBe(false);
  });

  it('every voice of a piece has the same length, and only valid tokens', () => {
    for (const id of ids) {
      const track = TRACKS[id];
      const lengths = track.voices.map((voice) => voice.steps.split(' ').length);
      expect(new Set(lengths).size, id).toBe(1);
      for (const voice of track.voices) {
        for (const token of voice.steps.split(' ')) {
          const ok = voice.wave === 'drums' ? /^[ksh.]$/.test(token) : /^(-?\d+|-|\.)$/.test(token);
          expect(ok, `${id}: ${token}`).toBe(true);
        }
      }
    }
  });

  it('the pieces are different music: their tempo, key or notes differ', () => {
    const signature = (id: TrackId) => {
      const t = TRACKS[id];
      return `${t.bpm}:${t.key}:${t.voices.map((v) => v.steps).join('|')}`;
    };
    expect(new Set(ids.map(signature)).size).toBe(ids.length);
    // The boss is faster than the menu, the final has drums and the longest loop.
    expect(TRACKS.boss.bpm).toBeGreaterThan(TRACKS.menu.bpm);
    expect(trackSteps(TRACKS.final)).toBeGreaterThan(trackSteps(TRACKS.waves));
  });

  it('notes are in the range of hearing a speaker plays well, and held notes last', () => {
    for (const id of ids) {
      const track = TRACKS[id];
      for (let i = 0; i < trackSteps(track); i++) {
        for (const note of stepNotes(track, i)) {
          if (note.wave === 'drums') continue;
          expect(note.freq).toBeGreaterThan(40);
          expect(note.freq).toBeLessThan(2500);
          expect(note.steps).toBeGreaterThanOrEqual(1);
        }
      }
    }
    expect(midiFreq(69)).toBe(440);
    // The menu bass holds its first note for a whole bar (8 steps).
    expect(stepNotes(TRACKS.menu, 0).some((n) => n.wave === 'triangle' && n.steps === 8)).toBe(
      true,
    );
    expect(stepSeconds(TRACKS.waves)).toBeCloseTo(30 / 132, 9);
  });

  it('a stinger plays once; a loop wraps around', () => {
    const victory = TRACKS.victory;
    expect(stepNotes(victory, trackSteps(victory) + 1)).toEqual([]);
    const waves = TRACKS.waves;
    expect(stepNotes(waves, trackSteps(waves))).toEqual(stepNotes(waves, 0));
  });
});

describe('which piece plays', () => {
  it('follows the screen and the fight', () => {
    const base = { menu: false, bossAlive: false, finalBoss: false, result: null } as const;
    expect(trackFor({ ...base, menu: true })).toBe('menu');
    expect(trackFor(base)).toBe('waves');
    expect(trackFor({ ...base, bossAlive: true })).toBe('boss');
    expect(trackFor({ ...base, bossAlive: true, finalBoss: true })).toBe('final');
    expect(trackFor({ ...base, result: 'won' })).toBe('victory');
    expect(trackFor({ ...base, result: 'lost' })).toBe('defeat');
  });
});
