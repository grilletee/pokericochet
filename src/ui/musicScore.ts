/**
 * The music of the game (4G-I, 16th playtest: "falta música"). ORIGINAL music written for this game
 * as data and played by a small chiptune sequencer (`music.ts`): square and triangle voices, a noise
 * drum. Nothing of the music of the Pokémon games and no version of it: the melodies below are our
 * own (see LICENSES-ASSETS.md). Six pieces: the menu, the waves, a boss between waves, the final
 * legendary, the victory and the defeat. Pure: `stepNotes` says what starts on a step, so it is tested.
 *
 * A voice is a line of steps (eighth notes) separated by spaces: a number is a note in semitones
 * from the key of the piece, `-` holds the previous note one more step, `.` is silence. A drum voice
 * uses `k` (kick), `s` (snare), `h` (hi-hat) and `.`.
 */

export type TrackId = 'menu' | 'waves' | 'boss' | 'final' | 'victory' | 'defeat';

export type VoiceWave = 'square' | 'triangle' | 'sawtooth' | 'drums';

export interface Voice {
  readonly wave: VoiceWave;
  readonly gain: number;
  /** Octave shift of the voice (0 = the key of the piece). */
  readonly octave: number;
  readonly steps: string;
}

export interface Track {
  readonly id: TrackId;
  readonly bpm: number;
  /** MIDI number of the key note (60 = middle C). */
  readonly key: number;
  /** Loops for ever, or plays once (a stinger). */
  readonly loop: boolean;
  readonly voices: readonly Voice[];
}

const v = (wave: VoiceWave, gain: number, octave: number, ...bars: string[]): Voice => ({
  wave,
  gain,
  octave,
  steps: bars.join(' '),
});

/** The six pieces. Every voice of a piece has the same number of steps. */
export const TRACKS: Readonly<Record<TrackId, Track>> = {
  // Calm and a little mysterious: an arpeggio over a slow bass, A minor, 96 bpm, 4 bars.
  menu: {
    id: 'menu',
    bpm: 96,
    key: 57,
    loop: true,
    voices: [
      v(
        'triangle',
        0.16,
        -1,
        '0 - - - - - - -',
        '-5 - - - - - - -',
        '-4 - - - - - - -',
        '-2 - - - -1 - - -',
      ),
      v(
        'square',
        0.05,
        1,
        '0 3 7 10 7 3 0 3',
        '-5 -1 2 7 2 -1 -5 -1',
        '-4 0 3 8 3 0 -4 0',
        '-2 2 5 9 11 9 5 2',
      ),
      v(
        'square',
        0.045,
        1,
        '12 - - 15 - 14 - 12',
        '10 - - - 7 - - -',
        '8 - 10 - 12 - 15 -',
        '14 - - - 11 - - -',
      ),
    ],
  },
  // The waves: bright and driving, E minor, 132 bpm, 4 bars.
  waves: {
    id: 'waves',
    bpm: 132,
    key: 52,
    loop: true,
    voices: [
      v(
        'triangle',
        0.17,
        -1,
        '0 . 0 12 0 . 0 12',
        '-4 . -4 8 -4 . -4 8',
        '-7 . -7 5 -7 . -7 5',
        '-2 . -2 10 -5 . -5 7',
      ),
      v(
        'square',
        0.05,
        1,
        '7 - 10 12 - 10 7 5',
        '3 - 7 8 - 7 3 -',
        '5 - 3 5 7 - 10 -',
        '12 - 11 - 14 - 15 -',
      ),
      v(
        'square',
        0.035,
        0,
        '. 7 . 7 . 7 . 7',
        '. 8 . 8 . 8 . 8',
        '. 5 . 5 . 5 . 5',
        '. 10 . 10 . 11 . 11',
      ),
      v(
        'drums',
        0.5,
        0,
        'k h s h k k s h',
        'k h s h k h s h',
        'k h s h k k s h',
        'k h s s k s s s',
      ),
    ],
  },
  // A boss between waves: tense, syncopated, F# minor, 150 bpm, 4 bars.
  boss: {
    id: 'boss',
    bpm: 150,
    key: 54,
    loop: true,
    voices: [
      v(
        'sawtooth',
        0.09,
        -1,
        '0 0 . 0 0 . 1 .',
        '0 0 . 0 0 . -2 .',
        '0 0 . 0 0 . 1 .',
        '3 3 . 1 1 . -1 .',
      ),
      v(
        'square',
        0.05,
        1,
        '12 . 13 . 12 . 10 -',
        '12 . 13 . 15 . 13 -',
        '12 . 13 . 12 . 10 -',
        '15 . 13 . 12 . 11 -',
      ),
      v(
        'drums',
        0.55,
        0,
        'k . s k . k s .',
        'k . s k . k s h',
        'k . s k . k s .',
        'k k s k k k s s',
      ),
    ],
  },
  // The final legendary: grand and dark, D minor, 120 bpm, 8 bars, slow chords under a long line.
  final: {
    id: 'final',
    bpm: 120,
    key: 50,
    loop: true,
    voices: [
      v(
        'sawtooth',
        0.08,
        -1,
        '0 - 0 - 0 - 0 -',
        '-2 - -2 - -2 - -2 -',
        '-4 - -4 - -4 - -4 -',
        '-5 - -5 - -1 - -1 -',
        '0 - 0 - 0 - 0 -',
        '3 - 3 - 3 - 3 -',
        '-2 - -2 - -4 - -4 -',
        '-5 - -5 - -5 - -1 -',
      ),
      v(
        'square',
        0.05,
        1,
        '12 - - - 15 - 14 -',
        '12 - 10 - 9 - - -',
        '8 - - - 12 - 10 -',
        '7 - - - 11 - - -',
        '12 - - - 17 - 15 -',
        '19 - 17 - 15 - - -',
        '14 - 12 - 10 - 8 -',
        '7 - 8 - 11 - - -',
      ),
      v(
        'drums',
        0.5,
        0,
        'k . . . s . . .',
        'k . . k s . . .',
        'k . . . s . . .',
        'k . k . s . s s',
        'k . . . s . . .',
        'k . . k s . . .',
        'k . . . s . . .',
        'k k k k s s s s',
      ),
    ],
  },
  // The victory: a short fanfare in C major that rises and holds.
  victory: {
    id: 'victory',
    bpm: 140,
    key: 60,
    loop: false,
    voices: [
      v('square', 0.07, 0, '0 4 7 12 - 7 12 -', '14 - 16 - 19 - - -'),
      v('triangle', 0.16, -1, '0 - - - -5 - - -', '-3 - - - 0 - - -'),
      v('drums', 0.45, 0, 'k . s . k . s .', 'k . k . s s s .'),
    ],
  },
  // The defeat: a slow fall in C minor that ends low.
  defeat: {
    id: 'defeat',
    bpm: 84,
    key: 60,
    loop: false,
    voices: [
      v('square', 0.055, 0, '7 - 6 - 3 - - -', '2 - -1 - 0 - - -'),
      v('triangle', 0.15, -1, '0 - - - -4 - - -', '-5 - - - -12 - - -'),
    ],
  },
};

/** A note that starts on a step: its frequency (Hz, 0 for a drum), length in steps, wave and gain. */
export interface StepNote {
  readonly freq: number;
  readonly steps: number;
  readonly wave: VoiceWave;
  readonly gain: number;
  /** For a drum: which one. */
  readonly drum?: 'k' | 's' | 'h';
}

/** Number of steps of a piece (the longest voice). */
export function trackSteps(track: Track): number {
  return Math.max(...track.voices.map((voice) => voice.steps.split(' ').length));
}

/** Seconds a step lasts (an eighth note). */
export function stepSeconds(track: Track): number {
  return 30 / track.bpm;
}

/** Frequency of a MIDI note. */
export function midiFreq(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** What starts on step `index` of the piece (looping pieces wrap around). Pure. */
export function stepNotes(track: Track, index: number): readonly StepNote[] {
  const total = trackSteps(track);
  if (!track.loop && index >= total) return [];
  const at = ((index % total) + total) % total;
  const out: StepNote[] = [];
  for (const voice of track.voices) {
    const tokens = voice.steps.split(' ');
    const token = tokens[at] ?? '.';
    if (token === '.' || token === '-') continue;
    if (voice.wave === 'drums') {
      if (token === 'k' || token === 's' || token === 'h') {
        out.push({ freq: 0, steps: 1, wave: 'drums', gain: voice.gain, drum: token });
      }
      continue;
    }
    let length = 1;
    while (tokens[(at + length) % tokens.length] === '-' && length < tokens.length) length += 1;
    const note = track.key + Number(token) + 12 * voice.octave;
    out.push({ freq: midiFreq(note), steps: length, wave: voice.wave, gain: voice.gain });
  }
  return out;
}

/** Which piece plays now, from what is on screen (4G-I). */
export function trackFor(view: {
  readonly menu: boolean;
  readonly bossAlive: boolean;
  readonly finalBoss: boolean;
  readonly result: 'won' | 'lost' | null;
}): TrackId | null {
  if (view.result === 'won') return 'victory';
  if (view.result === 'lost') return 'defeat';
  if (view.menu) return 'menu';
  if (view.bossAlive) return view.finalBoss ? 'final' : 'boss';
  return 'waves';
}
