import type { GameType } from '../domain';

/**
 * The music of the game. ORIGINAL music written for this game as data and played by a small chiptune
 * sequencer (`music.ts`): square, triangle and sawtooth voices and a noise drum. Nothing of the music
 * of the Pokémon games and no version of it: every melody below is our own (LICENSES-ASSETS.md).
 *
 * 4G-I: six pieces (menu, waves, boss, final, victory, defeat). 4G-J (block 5; 17th playtest: "durante
 * la partida acaba siendo repetitiva; debería cambiar, ser más variada o más larga"):
 * - SIX wave pieces, one per family of biomes (adventure, forest, sea, fire, mystic, sky), 16 bars
 *   each (A, A', B, C; about 30 s a loop instead of 7): the music changes with the biome of the wave;
 * - a second boss piece, so the bosses between waves alternate;
 * - LAYERS that come in with the tension (`Voice.layer`): an arpeggio when the wave presses (layer 1),
 *   more drums and a high line when it is close to lost (layer 2); the fury of a boss is layer 1.
 * Pure: `stepNotes(track, step, tension)` says what starts on a step, so it is tested.
 *
 * A voice is a line of steps (eighth notes) separated by spaces: a number is a note in semitones
 * from the key of the piece, `-` holds the previous note one more step, `.` is silence. A drum voice
 * uses `k` (kick), `s` (snare), `h` (hi-hat) and `.`.
 */

export type WaveTrackId =
  | 'waves'
  | 'waves-forest'
  | 'waves-sea'
  | 'waves-fire'
  | 'waves-mystic'
  | 'waves-sky';

export type TrackId = 'menu' | WaveTrackId | 'boss' | 'boss2' | 'final' | 'victory' | 'defeat';

export type VoiceWave = 'square' | 'triangle' | 'sawtooth' | 'drums';

export interface Voice {
  readonly wave: VoiceWave;
  readonly gain: number;
  /** Octave shift of the voice (0 = the key of the piece). */
  readonly octave: number;
  readonly steps: string;
  /** The tension from which it plays (0: always; 1: the wave presses; 2: close to lost). */
  readonly layer?: number;
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

const layered = (layer: number, voice: Voice): Voice => ({ ...voice, layer });

/** A chord as semitones from the key: a root and its quality (major or minor). */
type Chord = readonly [root: number, quality: 'M' | 'm'];

const tonesOf = ([root, quality]: Chord): readonly number[] =>
  quality === 'M' ? [root, root + 4, root + 7] : [root, root + 3, root + 7];

/**
 * A line made from a pattern repeated over the chords, one bar each. Pattern tokens: `r` the root,
 * `o` the root an octave up, `f` the fifth, `0`-`5` the tones of the chord (3-5 an octave up), `-`, `.`.
 */
function overChords(chords: readonly Chord[], pattern: string): string {
  const tokens = pattern.split(' ');
  return chords
    .map((chord) => {
      const tones = tonesOf(chord);
      return tokens
        .map((t) => {
          if (t === 'r') return String(chord[0]);
          if (t === 'o') return String(chord[0] + 12);
          if (t === 'f') return String(chord[0] + 7);
          if (/^[0-5]$/.test(t)) {
            const n = Number(t);
            return String((tones[n % 3] ?? 0) + 12 * Math.floor(n / 3));
          }
          return t;
        })
        .join(' ');
    })
    .join(' ');
}

/** A drum bar repeated `times`, and an optional last bar instead of the final repetition. */
const drumLine = (bar: string, times: number, last = bar): string =>
  [...Array.from({ length: times - 1 }, () => bar), last].join(' ');

const chords = (spec: string): Chord[] =>
  spec.split(' ').map((c) => {
    const quality = c.endsWith('m') ? 'm' : 'M';
    return [Number(c.replace(/[mM]$/, '')), quality] as Chord;
  });

/**
 * A wave piece of 16 bars: bass, melody and drums always; an arpeggio from tension 1; a second drum
 * line and a high echo of the chords from tension 2.
 */
function wavePiece(
  id: WaveTrackId,
  bpm: number,
  key: number,
  harmony: string,
  melody: readonly string[],
  style: {
    readonly bass: string;
    readonly bassWave: VoiceWave;
    readonly arp: string;
    readonly drums: string;
    readonly fill: string;
    readonly urgent: string;
  },
): Track {
  const progression = chords(harmony);
  return {
    id,
    bpm,
    key,
    loop: true,
    voices: [
      v(
        style.bassWave,
        style.bassWave === 'sawtooth' ? 0.08 : 0.17,
        -1,
        overChords(progression, style.bass),
      ),
      v('square', 0.05, 1, ...melody),
      v('drums', 0.5, 0, drumLine(style.drums, 16, style.fill)),
      layered(1, v('square', 0.028, 1, overChords(progression, style.arp))),
      layered(2, v('drums', 0.32, 0, drumLine(style.urgent, 16))),
      layered(2, v('triangle', 0.06, 2, overChords(progression, '0 . 1 . 2 . 1 .'))),
    ],
  };
}

/** Every piece. Every voice of a piece has the same number of steps. */
export const TRACKS: Readonly<Record<TrackId, Track>> = {
  // Calm and a little mysterious: an arpeggio over a slow bass, A minor, 96 bpm, 8 bars (4G-J: a
  // second half that answers the first).
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
        '-4 - - - - - - -',
        '-2 - - - - - - -',
        '0 - - - -5 - - -',
        '-7 - - - -1 - - -',
      ),
      v(
        'square',
        0.05,
        1,
        '0 3 7 10 7 3 0 3',
        '-5 -1 2 7 2 -1 -5 -1',
        '-4 0 3 8 3 0 -4 0',
        '-2 2 5 9 11 9 5 2',
        '-4 0 3 7 8 7 3 0',
        '-2 2 5 10 9 5 2 -2',
        '0 3 7 12 -5 -1 2 7',
        '-7 -4 0 5 -1 2 6 11',
      ),
      v(
        'square',
        0.045,
        1,
        '12 - - 15 - 14 - 12',
        '10 - - - 7 - - -',
        '8 - 10 - 12 - 15 -',
        '14 - - - 11 - - -',
        '15 - - 12 - 10 - 8',
        '9 - - - 14 - - -',
        '12 - 15 - 14 - 10 -',
        '12 - - - 11 - - -',
      ),
    ],
  },
  // Adventure (meadow, dojo, power plant): bright and driving, E minor, 132 bpm.
  waves: wavePiece(
    'waves',
    132,
    52,
    '0m -4M -7m -2M 0m -4M -7m -5M 3M -2M 0m -4M 5m 3M -2M -5M',
    [
      '7 - 10 12 - 10 7 5',
      '3 - 7 8 - 7 3 -',
      '5 - 3 5 7 - 10 -',
      '12 - 11 - 14 - 15 -',
      '7 - 10 12 - 10 7 5',
      '3 - 7 8 - 10 12 -',
      '12 - 10 8 - 7 5 -',
      '7 - 11 - 14 - 11 -',
      '15 - 19 - 22 - 19 17',
      '14 - - - 10 - 17 -',
      '15 - 12 - 19 - 17 15',
      '12 - - - 8 - - -',
      '17 - 20 - 24 - 20 17',
      '19 - 15 - 22 - 19 -',
      '17 - 14 - 10 - 14 17',
      '18 - 15 - 11 - - -',
    ],
    {
      bass: 'r . r o r . r o',
      bassWave: 'triangle',
      arp: '0 1 2 1 0 1 2 1',
      drums: 'k h s h k k s h',
      fill: 'k h s s k s s s',
      urgent: 'h h h h h h h s',
    },
  ),
  // Forest, fairy glade (grass, bug, fairy): bouncy and warm, G major, 116 bpm.
  'waves-forest': wavePiece(
    'waves-forest',
    116,
    55,
    '0M 5M 0M 7M 0M 5M 7M 0M -3m 5M 0M 7M 2m 7M 4m -3m',
    [
      '12 - 16 - 19 - 16 14',
      '17 - - 21 - 19 17 -',
      '16 - 12 - 14 - 16 -',
      '19 - - - 14 - - -',
      '12 - 16 - 19 - 21 19',
      '17 - 21 - 24 - 21 -',
      '19 - 23 - 26 - 23 19',
      '24 - - - 19 - - -',
      '16 - 12 - 9 - 12 16',
      '17 - 21 - 17 - 12 -',
      '16 - 19 - 24 - 19 -',
      '23 - - 21 19 - - -',
      '17 - 14 - 21 - 17 -',
      '19 - 23 - 19 - 14 -',
      '16 - 19 - 23 - 19 16',
      '16 - - - 12 - - -',
    ],
    {
      bass: 'r . f . o . f .',
      bassWave: 'triangle',
      arp: '0 2 1 2 3 2 1 2',
      drums: 'k . h . s . h .',
      fill: 'k . h . s s s h',
      urgent: '. h . h . h s h',
    },
  ),
  // Coast, swamp, frozen peak (water, ice): flowing, D minor, 108 bpm, long notes over the waves.
  'waves-sea': wavePiece(
    'waves-sea',
    108,
    50,
    '0m 5M 0m -2M 0m 5M 3M -2M -4M -2M 0m 7m -4M -2M 0m 0m',
    [
      '19 - - - 17 - 15 -',
      '17 - - - 21 - - -',
      '19 - 15 - 12 - - -',
      '14 - - - 10 - - -',
      '19 - - - 22 - 19 -',
      '21 - - - 24 - 21 -',
      '22 - 19 - 15 - - -',
      '17 - - - 14 - - -',
      '15 - - - 12 - 8 -',
      '14 - - - 17 - - -',
      '15 - 19 - 24 - 22 19',
      '22 - - - 19 - - -',
      '20 - - - 15 - 12 -',
      '17 - - - 14 - 22 -',
      '19 - - - - - - -',
      '15 - 12 - 7 - - -',
    ],
    {
      bass: 'r - - - f - - -',
      bassWave: 'triangle',
      arp: '0 1 2 3 2 1 0 1',
      drums: 'k . . h . . s .',
      fill: 'k . . h . s s s',
      urgent: 'h . h . h . h h',
    },
  ),
  // Volcano, cave, dragon sky (fire, dragon, rock, ground): heavy, C minor, 144 bpm.
  'waves-fire': wavePiece(
    'waves-fire',
    144,
    48,
    '0m 3M -4M -2M 0m 3M 5m 7M -4M -2M 0m 0m 5m 7m -4M -2M',
    [
      '12 . 12 15 . 12 10 12',
      '15 . 15 17 . 15 12 -',
      '8 . 12 15 . 12 8 7',
      '10 - 14 - 17 - 14 10',
      '12 . 12 15 . 12 10 12',
      '19 - 17 15 - 12 - -',
      '17 . 20 17 . 15 12 -',
      '11 - 14 - 19 - - -',
      '20 - 19 - 15 - 12 -',
      '17 - 14 - 10 - 14 -',
      '15 - 19 - 24 - 22 19',
      '15 - - - 12 - - -',
      '17 - 20 - 24 - 20 17',
      '19 - 22 - 26 - 22 19',
      '20 - 15 - 12 - 15 20',
      '22 - 17 - 14 - 17 -',
    ],
    {
      bass: 'r r . r r . o .',
      bassWave: 'sawtooth',
      arp: '0 . 1 . 2 . 1 .',
      drums: 'k . s k . k s .',
      fill: 'k k s k k k s s',
      urgent: 'h h h h h h h h',
    },
  ),
  // Haunted house, ruins (ghost, psychic, dark, poison): eerie, B minor with a flat second, 104 bpm.
  'waves-mystic': wavePiece(
    'waves-mystic',
    104,
    47,
    '0m 1M 0m -2M 0m 1M 5m 7M -4M 1M 0m -2M 5m 7M 0m 0m',
    [
      '19 - - 18 19 - 15 -',
      '17 - - - 13 - - -',
      '15 - 12 - 15 - 19 -',
      '17 - 14 - 10 - - -',
      '19 - - 18 19 - 22 -',
      '20 - - - 17 - 13 -',
      '17 - 20 - 24 - 20 -',
      '23 - - - 19 - - -',
      '15 - - - 12 - 8 -',
      '13 - 17 - 20 - 17 -',
      '19 - 15 - 12 - 15 -',
      '14 - - - 17 - - -',
      '20 - 17 - 24 - 20 -',
      '23 - 19 - 26 - 23 -',
      '24 - 22 - 19 - 15 -',
      '12 - - - - - - -',
    ],
    {
      bass: 'r - - . r - f .',
      bassWave: 'triangle',
      arp: '2 1 0 1 2 1 0 .',
      drums: 'k . . . s . . h',
      fill: 'k . . . s . s s',
      urgent: '. h . h . h . h',
    },
  ),
  // Storm, power, the sky (flying, electric, steel): uplifting, A major, 136 bpm.
  'waves-sky': wavePiece(
    'waves-sky',
    136,
    57,
    '0M 7M -3m 5M 0M 7M 5M 7M -3m 5M 0M 7M 2m 5M 7M 7M',
    [
      '12 - 16 - 19 - 16 -',
      '19 - 23 - 26 - 23 -',
      '16 - 12 - 9 - 12 -',
      '17 - 21 - 24 - 21 -',
      '24 - 23 - 19 - 16 -',
      '23 - - - 19 - 14 -',
      '21 - 17 - 12 - 17 -',
      '19 - - - 23 - - -',
      '16 - 16 12 - 9 12 16',
      '17 - 17 21 - 24 21 17',
      '19 - 16 12 - 16 19 24',
      '26 - - - 23 - - -',
      '21 - 17 - 14 - 17 21',
      '24 - 21 - 17 - 21 24',
      '26 - 23 - 19 - 23 26',
      '23 - - - - - - -',
    ],
    {
      bass: 'r . r . f . o .',
      bassWave: 'triangle',
      arp: '0 1 2 3 0 1 2 3',
      drums: 'k h s h k h s h',
      fill: 'k h s h s s s s',
      urgent: 'h . h h . h h .',
    },
  ),
  // A boss between waves: tense, syncopated, F# minor, 150 bpm, 4 bars; the fury brings an arpeggio.
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
      layered(1, v('square', 0.03, 2, overChords(chords('0m 0m 0m 3M'), '0 1 2 1 0 1 2 1'))),
      layered(2, v('drums', 0.3, 0, drumLine('h h h h h h h h', 4))),
    ],
  },
  // The second boss piece (4G-J): driving, D minor, 156 bpm, 8 bars; the bosses alternate.
  boss2: {
    id: 'boss2',
    bpm: 156,
    key: 50,
    loop: true,
    voices: [
      v('sawtooth', 0.085, -1, overChords(chords('0m 0m -4M -2M 0m 0m 1M 7M'), 'r r . r r . o .')),
      v(
        'square',
        0.05,
        1,
        '12 . 15 . 12 . 10 -',
        '12 . 15 . 17 . 15 -',
        '12 . 15 . 20 . 19 -',
        '17 . 14 . 10 . 14 -',
        '24 . 22 . 19 . 15 -',
        '19 . 17 . 15 . 12 -',
        '13 . 17 . 20 . 17 -',
        '19 - 23 - 26 - - -',
      ),
      v('drums', 0.55, 0, drumLine('k . s k . k s .', 8, 'k k s k s s s s')),
      layered(
        1,
        v('square', 0.03, 2, overChords(chords('0m 0m -4M -2M 0m 0m 1M 7M'), '2 1 0 1 2 1 0 1')),
      ),
      layered(2, v('drums', 0.3, 0, drumLine('h h h h h h s h', 8))),
    ],
  },
  // The final legendary: grand and dark, D minor, 120 bpm, 8 bars, slow chords under a long line;
  // its fury (layer 1) brings a racing arpeggio and the drums double.
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
      layered(
        1,
        v('square', 0.03, 2, overChords(chords('0m -2M -4M -5M 0m 3M -2M -5M'), '0 1 2 3 2 1 0 1')),
      ),
      layered(1, v('drums', 0.35, 0, drumLine('. h . h . h . h', 8))),
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

/**
 * What starts on step `index` of the piece (looping pieces wrap around) at a `tension` (0-2): the
 * voices of a higher layer stay silent. Pure.
 */
export function stepNotes(track: Track, index: number, tension = 0): readonly StepNote[] {
  const total = trackSteps(track);
  if (!track.loop && index >= total) return [];
  const at = ((index % total) + total) % total;
  const out: StepNote[] = [];
  for (const voice of track.voices) {
    if ((voice.layer ?? 0) > tension) continue;
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

/** The wave piece of each type: the main type of the biome of the wave chooses the music (4G-J). */
const WAVE_OF_TYPE: Readonly<Record<GameType, WaveTrackId>> = {
  normal: 'waves',
  fighting: 'waves',
  electric: 'waves-sky',
  flying: 'waves-sky',
  steel: 'waves-sky',
  grass: 'waves-forest',
  bug: 'waves-forest',
  fairy: 'waves-forest',
  water: 'waves-sea',
  ice: 'waves-sea',
  fire: 'waves-fire',
  dragon: 'waves-fire',
  rock: 'waves-fire',
  ground: 'waves-fire',
  ghost: 'waves-mystic',
  psychic: 'waves-mystic',
  dark: 'waves-mystic',
  poison: 'waves-mystic',
};

export function waveTrackFor(biomeType: GameType | null): WaveTrackId {
  return biomeType === null ? 'waves' : WAVE_OF_TYPE[biomeType];
}

/** Which piece plays now, from what is on screen (4G-I; 4G-J: by biome and by boss). */
export function trackFor(view: {
  readonly menu: boolean;
  readonly bossAlive: boolean;
  readonly finalBoss: boolean;
  readonly result: 'won' | 'lost' | null;
  /** The main type of the biome of the wave (null: none yet). */
  readonly biome?: GameType | null;
  /** How many bosses between waves came before this one (0 for the first). */
  readonly bossIndex?: number;
}): TrackId | null {
  if (view.result === 'won') return 'victory';
  if (view.result === 'lost') return 'defeat';
  if (view.menu) return 'menu';
  if (view.bossAlive) {
    if (view.finalBoss) return 'final';
    return (view.bossIndex ?? 0) % 2 === 1 ? 'boss2' : 'boss';
  }
  return waveTrackFor(view.biome ?? null);
}

/**
 * The tension of the music (4G-J): 0 calm; 1 the wave presses (many enemies, or the fury of a boss);
 * 2 close to lost (little health left, an enemy at the line, or a boss close to the line). Pure.
 */
export function musicTension(view: {
  readonly hpShare: number;
  readonly enemies: number;
  readonly nearLine: boolean;
  readonly fury: boolean;
  readonly bossNearLine: boolean;
}): number {
  if (view.hpShare <= 0.3 || view.nearLine || view.bossNearLine) return 2;
  if (view.fury || view.enemies >= 10) return 1;
  return 0;
}
