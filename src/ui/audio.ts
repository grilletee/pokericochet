import type { GameEvent } from '../domain';

/** The few sounds of the game. */
export type SoundId =
  | 'bounce'
  | 'kill'
  | 'evolve'
  | 'move'
  | 'signature'
  | 'ready'
  | 'hybrid'
  | 'captureDrop'
  | 'damage'
  | 'hurt'
  | 'win'
  | 'lose'
  | 'collect'
  | 'capture'
  | 'charge'
  | 'alarm'
  | 'tension';

/** Which sound, if any, an event makes. A ball hit is the "bounce": walls emit no event. */
export function soundFor(event: GameEvent): SoundId | null {
  switch (event.type) {
    case 'hit':
      return 'bounce';
    case 'kill':
      return 'kill';
    case 'stage':
    case 'evolve':
      return 'evolve';
    case 'move':
      return event.manual ? 'signature' : 'move';
    case 'hybrid':
      return 'hybrid';
    // The boss starts to charge its strong attack: a low rising hum, a warning (4G-H: no alarm of
    // "exposed" any more). The final boss arrives under a low drone.
    case 'bossCore':
      return event.open ? 'charge' : null;
    case 'bossSpawn':
      return event.final ? 'tension' : null;
    case 'captureDrop':
      return 'captureDrop';
    case 'collect':
      return 'collect';
    case 'capture':
      return 'capture';
    case 'train':
      return 'collect';
    // Any health lost (a leak, a boss attack, an enemy shot) has its own sound (4G-F playtest: "no
    // suena nada"). The old 'leak' sound is gone: the same hit would sound twice.
    case 'playerHurt':
      return 'hurt';
    case 'won':
      return 'win';
    case 'lost':
      return 'lose';
    default:
      return null;
  }
}

/** Minimum gap, in ms, between two sounds of the same kind (a busy fight must not be a buzz). */
const MIN_GAP_MS: Record<SoundId, number> = {
  bounce: 45,
  kill: 70,
  evolve: 0,
  move: 140,
  signature: 0,
  ready: 400,
  hybrid: 0,
  captureDrop: 0,
  damage: 120,
  // Every hit must be heard, but two within the blink would only be a buzz.
  hurt: 250,
  win: 0,
  lose: 0,
  collect: 60,
  capture: 0,
  charge: 400,
  alarm: 800,
  tension: 0,
};

/** Decides whether a sound may play now, per kind. Pure: time is given, never read. */
export class Throttle {
  private readonly last = new Map<SoundId, number>();

  allow(id: SoundId, now: number): boolean {
    const previous = this.last.get(id);
    if (previous !== undefined && now - previous < MIN_GAP_MS[id]) return false;
    this.last.set(id, now);
    return true;
  }
}

interface Note {
  readonly from: number;
  readonly to: number;
  readonly seconds: number;
  readonly wave: OscillatorType;
  readonly gain: number;
  /** Start offset in seconds. */
  readonly at?: number;
}

/** Each sound as a few synthesised notes (frequencies in Hz). Original, no samples. */
const RECIPES: Record<SoundId, readonly Note[]> = {
  bounce: [{ from: 330, to: 220, seconds: 0.06, wave: 'triangle', gain: 0.08 }],
  kill: [{ from: 520, to: 880, seconds: 0.09, wave: 'square', gain: 0.06 }],
  // A move with a name (ADR-039): a short rising sweep, quieter than a kill so it never drowns the rest.
  move: [{ from: 300, to: 720, seconds: 0.16, wave: 'sawtooth', gain: 0.07 }],
  // The starter's signature (4F-D): a low thump under a bright rising sweep, bigger than any move.
  signature: [
    { from: 120, to: 60, seconds: 0.3, wave: 'sawtooth', gain: 0.12 },
    { from: 400, to: 1100, seconds: 0.28, wave: 'square', gain: 0.07 },
    { from: 800, to: 1400, seconds: 0.3, wave: 'sine', gain: 0.09, at: 0.1 },
  ],
  // The signature is charged: two soft bells that ask to be pressed.
  ready: [
    { from: 880, to: 880, seconds: 0.12, wave: 'sine', gain: 0.09 },
    { from: 1320, to: 1320, seconds: 0.2, wave: 'sine', gain: 0.09, at: 0.1 },
  ],
  // Evolution: a rising run that ends on a held chord.
  evolve: [
    { from: 392, to: 392, seconds: 0.1, wave: 'triangle', gain: 0.12 },
    { from: 494, to: 494, seconds: 0.1, wave: 'triangle', gain: 0.12, at: 0.09 },
    { from: 587, to: 587, seconds: 0.1, wave: 'triangle', gain: 0.12, at: 0.18 },
    { from: 784, to: 784, seconds: 0.45, wave: 'triangle', gain: 0.12, at: 0.27 },
    { from: 988, to: 988, seconds: 0.45, wave: 'sine', gain: 0.08, at: 0.27 },
  ],
  // Hybrid: two voices that slide into each other.
  hybrid: [
    { from: 330, to: 440, seconds: 0.3, wave: 'sawtooth', gain: 0.06 },
    { from: 494, to: 440, seconds: 0.3, wave: 'triangle', gain: 0.1 },
    { from: 660, to: 880, seconds: 0.35, wave: 'sine', gain: 0.1, at: 0.28 },
  ],
  // A ball dropped by an enemy: a short bright ping that says look at the field.
  captureDrop: [
    { from: 1175, to: 1175, seconds: 0.07, wave: 'sine', gain: 0.1 },
    { from: 1568, to: 1568, seconds: 0.14, wave: 'sine', gain: 0.1, at: 0.07 },
  ],
  damage: [{ from: 180, to: 70, seconds: 0.22, wave: 'sawtooth', gain: 0.12 }],
  // Hurt: a heavy low thump with a harsh falling buzz on top and a sharp crack at the start, louder
  // than anything else in the fight so it is never missed.
  hurt: [
    { from: 150, to: 45, seconds: 0.32, wave: 'sine', gain: 0.26 },
    { from: 260, to: 90, seconds: 0.26, wave: 'sawtooth', gain: 0.16 },
    { from: 1800, to: 300, seconds: 0.07, wave: 'square', gain: 0.1 },
  ],
  collect: [{ from: 440, to: 660, seconds: 0.07, wave: 'sine', gain: 0.1 }],
  // Capture joins the team: a three-note jingle, the most recognisable sound of the game.
  capture: [
    { from: 523, to: 523, seconds: 0.09, wave: 'square', gain: 0.07 },
    { from: 659, to: 659, seconds: 0.09, wave: 'square', gain: 0.07, at: 0.09 },
    { from: 784, to: 1047, seconds: 0.28, wave: 'square', gain: 0.07, at: 0.18 },
    { from: 1047, to: 1047, seconds: 0.28, wave: 'sine', gain: 0.1, at: 0.18 },
  ],
  // A boss near the defence line (4G-I): three falling sirens, the only real alarm of the game.
  alarm: [
    { from: 880, to: 520, seconds: 0.22, wave: 'square', gain: 0.09 },
    { from: 880, to: 520, seconds: 0.22, wave: 'square', gain: 0.09, at: 0.26 },
    { from: 880, to: 520, seconds: 0.22, wave: 'square', gain: 0.09, at: 0.52 },
  ],
  // The charge of a strong attack: a low hum that rises, a warning and not an alarm (4G-H).
  charge: [
    { from: 70, to: 140, seconds: 0.7, wave: 'sawtooth', gain: 0.09 },
    { from: 140, to: 280, seconds: 0.7, wave: 'triangle', gain: 0.05 },
  ],
  // The final boss: a low drone with a slow swell and a dissonant fifth-less interval, 3 s of dread.
  tension: [
    { from: 55, to: 48, seconds: 3, wave: 'sawtooth', gain: 0.13 },
    { from: 58, to: 51, seconds: 3, wave: 'triangle', gain: 0.12 },
    { from: 82, to: 110, seconds: 2.2, wave: 'sine', gain: 0.07, at: 0.6 },
    { from: 740, to: 698, seconds: 0.8, wave: 'sine', gain: 0.05, at: 1.6 },
  ],
  win: [
    { from: 523, to: 523, seconds: 0.14, wave: 'square', gain: 0.08 },
    { from: 659, to: 659, seconds: 0.14, wave: 'square', gain: 0.08, at: 0.14 },
    { from: 784, to: 784, seconds: 0.14, wave: 'square', gain: 0.08, at: 0.28 },
    { from: 1047, to: 1047, seconds: 0.4, wave: 'square', gain: 0.08, at: 0.42 },
  ],
  lose: [
    { from: 330, to: 262, seconds: 0.25, wave: 'sawtooth', gain: 0.1 },
    { from: 262, to: 196, seconds: 0.25, wave: 'sawtooth', gain: 0.1, at: 0.25 },
    { from: 196, to: 98, seconds: 0.5, wave: 'sawtooth', gain: 0.1, at: 0.5 },
  ],
};

/**
 * Minimal sound: tones synthesised with Web Audio, no files. The audio context can only start
 * after a user gesture, so `unlock()` is called from the first key or pointer press; until then
 * (and while muted) `play` does nothing.
 */
export class SoundFx {
  muted: boolean;
  /** The master and effects volumes, 0..1 (4G-F, Ajustes): every note is scaled by both. */
  masterVolume = 1;
  effectsVolume = 1;
  private context: AudioContext | null = null;
  private readonly throttle = new Throttle();

  constructor(muted = false) {
    this.muted = muted;
  }

  /** Creates or resumes the audio context; call from a user gesture. Safe to call often. */
  unlock(): void {
    try {
      if (this.context === null) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor === undefined) return;
        this.context = new Ctor();
      }
      if (this.context.state === 'suspended') void this.context.resume();
    } catch {
      this.context = null; // no audio on this device: the game plays on in silence
    }
  }

  playEvent(event: GameEvent, now: number): void {
    const id = soundFor(event);
    if (id !== null) this.play(id, now);
  }

  play(id: SoundId, now: number): void {
    const context = this.context;
    if (this.muted || context === null || context.state !== 'running') return;
    if (!this.throttle.allow(id, now)) return;
    const start = context.currentTime;
    for (const note of RECIPES[id]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const t0 = start + (note.at ?? 0);
      oscillator.type = note.wave;
      oscillator.frequency.setValueAtTime(note.from, t0);
      oscillator.frequency.linearRampToValueAtTime(note.to, t0 + note.seconds);
      gain.gain.setValueAtTime(note.gain * this.masterVolume * this.effectsVolume, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.seconds);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(t0);
      oscillator.stop(t0 + note.seconds + 0.02);
    }
  }
}

/** Small corner button that mutes and unmutes; `onChange` receives the new muted state. */
export class SoundToggle {
  private readonly button: HTMLButtonElement;

  constructor(
    host: HTMLElement,
    private muted: boolean,
    private readonly onChange: (muted: boolean) => void,
  ) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.dataset.soundToggle = '';
    this.button.style.cssText =
      'position:absolute;right:12px;top:10px;min-height:44px;min-width:44px;padding:4px 12px;border-radius:8px;' +
      'border:2px solid #5b6aa8;background:rgba(27,37,64,0.85);color:#e8ecf8;' +
      'font-family:system-ui,sans-serif;font-size:13px;cursor:pointer;pointer-events:auto;';
    this.button.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.button.addEventListener('click', () => {
      this.muted = !this.muted;
      this.render();
      this.onChange(this.muted);
    });
    this.render();
    host.append(this.button);
  }

  private render(): void {
    this.button.textContent = this.muted ? 'Sonido: no' : 'Sonido: sí';
  }
}
