import { stepNotes, stepSeconds, TRACKS, type Track, type TrackId, trackSteps } from './musicScore';

/**
 * Plays the original music of the game (4G-I) with WebAudio: a small sequencer that schedules the
 * notes of the piece a little ahead of time, and fades one piece out while the next fades in (no
 * cut). A piece that does not loop (victory, defeat) plays once and stops. Its volume is the
 * master volume times the music volume of the settings. It shares the audio context of the sound
 * effects, so it wakes with the first gesture like them.
 */

const LOOKAHEAD_S = 0.25;
const TICK_MS = 60;
const FADE_S = 1.2;

interface Playing {
  readonly track: Track;
  readonly bus: GainNode;
  readonly start: number;
  next: number;
}

export class MusicPlayer {
  muted = false;
  masterVolume = 1;
  musicVolume = 0.6;
  private current: Playing | null = null;
  private wanted: TrackId | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private noise: AudioBuffer | null = null;

  constructor(private readonly context: () => AudioContext | null) {}

  /** The piece being played now (null: silence, or the audio has not woken up yet). */
  get nowPlaying(): TrackId | null {
    return this.current?.track.id ?? null;
  }

  /** The piece asked for, playing or waiting for the audio to wake up. */
  get asked(): TrackId | null {
    return this.wanted;
  }

  /** The piece that should play now (null: silence). Cheap to call every frame. */
  play(id: TrackId | null): void {
    if (id === this.wanted) return;
    this.wanted = id;
    const ctx = this.context();
    if (ctx === null || ctx.state !== 'running') return;
    this.switchTo(ctx, id);
  }

  /** Call every frame: starts the wanted piece once the audio has woken up, keeps the volume. */
  update(): void {
    const ctx = this.context();
    if (ctx === null || ctx.state !== 'running') return;
    if (this.wanted !== (this.current?.track.id ?? null)) this.switchTo(ctx, this.wanted);
    if (this.current !== null) {
      this.current.bus.gain.setTargetAtTime(this.level(), ctx.currentTime, 0.1);
    }
  }

  private level(): number {
    return this.muted ? 0 : this.masterVolume * this.musicVolume;
  }

  private switchTo(ctx: AudioContext, id: TrackId | null): void {
    const old = this.current;
    if (old !== null) {
      old.bus.gain.cancelScheduledValues(ctx.currentTime);
      old.bus.gain.setValueAtTime(old.bus.gain.value, ctx.currentTime);
      old.bus.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_S);
      setTimeout(() => old.bus.disconnect(), (FADE_S + 0.3) * 1000);
    }
    this.current = null;
    if (id === null) return;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(this.level(), ctx.currentTime + (old === null ? 0.3 : FADE_S));
    bus.connect(ctx.destination);
    this.current = { track: TRACKS[id], bus, start: ctx.currentTime + 0.05, next: 0 };
    if (this.timer === null) this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  /** Schedules every step that starts before now + LOOKAHEAD. */
  private schedule(): void {
    const ctx = this.context();
    const playing = this.current;
    if (ctx === null || playing === null) return;
    const step = stepSeconds(playing.track);
    const total = trackSteps(playing.track);
    while (playing.start + playing.next * step < ctx.currentTime + LOOKAHEAD_S) {
      if (!playing.track.loop && playing.next >= total) return;
      const t = playing.start + playing.next * step;
      for (const note of stepNotes(playing.track, playing.next)) {
        if (note.wave === 'drums') this.drum(ctx, playing.bus, t, note.drum ?? 'h', note.gain);
        else this.tone(ctx, playing.bus, t, note.freq, note.steps * step, note.wave, note.gain);
      }
      playing.next += 1;
    }
  }

  private tone(
    ctx: AudioContext,
    bus: GainNode,
    t: number,
    freq: number,
    seconds: number,
    wave: OscillatorType,
    gain: number,
  ): void {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.01);
    env.gain.setValueAtTime(gain, t + Math.max(0.02, seconds - 0.05));
    env.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(env).connect(bus);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  private drum(
    ctx: AudioContext,
    bus: GainNode,
    t: number,
    kind: 'k' | 's' | 'h',
    gain: number,
  ): void {
    if (kind === 'k') {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      env.gain.setValueAtTime(gain * 0.5, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(env).connect(bus);
      osc.start(t);
      osc.stop(t + 0.16);
      return;
    }
    if (this.noise === null) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate / 4, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < data.length; i++) {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        data[i] = s / 2147483648 - 1;
      }
      this.noise = buffer;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const env = ctx.createGain();
    const length = kind === 's' ? 0.12 : 0.04;
    env.gain.setValueAtTime(gain * (kind === 's' ? 0.35 : 0.12), t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(env).connect(bus);
    src.start(t);
    src.stop(t + length + 0.01);
  }
}
