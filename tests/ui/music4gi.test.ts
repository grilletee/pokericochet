import { describe, expect, it } from 'vitest';
import { GAME_TYPES } from '../../src/domain';
import {
  midiFreq,
  musicTension,
  stepNotes,
  stepSeconds,
  TRACKS,
  type TrackId,
  trackFor,
  trackSteps,
  waveTrackFor,
} from '../../src/ui';

/**
 * 4G-I, block 6 (16th playtest: "falta música") and 4G-J, block 5 (17th: "acaba siendo repetitiva"):
 * the original score of the game, as data.
 */
const ids = Object.keys(TRACKS) as TrackId[];
const waveIds = ids.filter((id) => id.startsWith('waves'));

describe('the pieces of the game', () => {
  it('menu, six wave pieces, two bosses, final, victory and defeat; stingers play once', () => {
    expect(ids.sort()).toEqual(
      [
        'boss',
        'boss2',
        'defeat',
        'final',
        'menu',
        'victory',
        'waves',
        'waves-fire',
        'waves-forest',
        'waves-mystic',
        'waves-sea',
        'waves-sky',
      ].sort(),
    );
    for (const id of ids) {
      expect(TRACKS[id].loop).toBe(id !== 'victory' && id !== 'defeat');
    }
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
    expect(TRACKS.boss.bpm).toBeGreaterThan(TRACKS.menu.bpm);
  });

  it('the wave pieces are longer than before (16 bars, about 30 s a loop) and have three layers', () => {
    for (const id of waveIds) {
      const track = TRACKS[id];
      expect(trackSteps(track), id).toBe(128);
      const seconds = trackSteps(track) * stepSeconds(track);
      expect(seconds, id).toBeGreaterThan(25);
      expect(new Set(track.voices.map((v) => v.layer ?? 0))).toEqual(new Set([0, 1, 2]));
    }
    // The menu doubled too (8 bars).
    expect(trackSteps(TRACKS.menu)).toBe(64);
  });

  it('notes are in the range a speaker plays well, and held notes last', () => {
    for (const id of ids) {
      const track = TRACKS[id];
      for (let i = 0; i < trackSteps(track); i++) {
        for (const note of stepNotes(track, i, 2)) {
          if (note.wave === 'drums') continue;
          expect(note.freq, id).toBeGreaterThan(40);
          expect(note.freq, id).toBeLessThan(2500);
          expect(note.steps).toBeGreaterThanOrEqual(1);
        }
      }
    }
    expect(midiFreq(69)).toBe(440);
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

  it('the tension adds layers: more notes at 1 and at 2, the same base at 0', () => {
    for (const id of [...waveIds, 'boss', 'boss2', 'final'] as TrackId[]) {
      const track = TRACKS[id];
      let calm = 0;
      let press = 0;
      let close = 0;
      for (let i = 0; i < trackSteps(track); i++) {
        calm += stepNotes(track, i, 0).length;
        press += stepNotes(track, i, 1).length;
        close += stepNotes(track, i, 2).length;
        // A layer only adds: the notes of a lower tension are all there.
        expect(stepNotes(track, i, 1).slice(0, stepNotes(track, i, 0).length)).toEqual(
          stepNotes(track, i, 0),
        );
      }
      expect(press, id).toBeGreaterThan(calm);
      expect(close, id).toBeGreaterThanOrEqual(press);
    }
  });
});

describe('which piece plays, and how tense', () => {
  it('follows the screen, the biome of the wave and the fight', () => {
    const base = { menu: false, bossAlive: false, finalBoss: false, result: null } as const;
    expect(trackFor({ ...base, menu: true })).toBe('menu');
    expect(trackFor(base)).toBe('waves');
    expect(trackFor({ ...base, biome: 'water' })).toBe('waves-sea');
    expect(trackFor({ ...base, biome: 'fire' })).toBe('waves-fire');
    expect(trackFor({ ...base, bossAlive: true })).toBe('boss');
    expect(trackFor({ ...base, bossAlive: true, bossIndex: 1 })).toBe('boss2');
    expect(trackFor({ ...base, bossAlive: true, bossIndex: 2 })).toBe('boss');
    expect(trackFor({ ...base, bossAlive: true, finalBoss: true, bossIndex: 3 })).toBe('final');
    expect(trackFor({ ...base, result: 'won' })).toBe('victory');
    expect(trackFor({ ...base, result: 'lost' })).toBe('defeat');
  });

  it('every type has a wave piece, and all six are used', () => {
    const used = new Set(GAME_TYPES.map((t) => waveTrackFor(t)));
    expect(used.size).toBe(6);
    expect(waveTrackFor(null)).toBe('waves');
  });

  it('tension: calm, pressing (many enemies or the fury), close to lost (health, the line)', () => {
    const calm = { hpShare: 1, enemies: 3, nearLine: false, fury: false, bossNearLine: false };
    expect(musicTension(calm)).toBe(0);
    expect(musicTension({ ...calm, enemies: 12 })).toBe(1);
    expect(musicTension({ ...calm, fury: true })).toBe(1);
    expect(musicTension({ ...calm, hpShare: 0.3 })).toBe(2);
    expect(musicTension({ ...calm, nearLine: true })).toBe(2);
    expect(musicTension({ ...calm, bossNearLine: true })).toBe(2);
  });
});
