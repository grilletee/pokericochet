import { describe, expect, it } from 'vitest';
import type { WaveAdvice } from '../../src/domain';
import {
  BOSS_CARTEL_MS,
  BOSS_WARNING_TICKS,
  bossCartel,
  bossCountdown,
  CARTEL_MS,
  countdown,
  SignQueue,
  waveCartel,
  waveLabel,
} from '../../src/ui';

const advice = (over: Partial<WaveAdvice> = {}): WaveAdvice => ({
  index: 2,
  total: 7,
  theme: 'fire-volcano',
  types: ['fire'],
  effective: ['water'],
  resisted: ['fire', 'grass'],
  ticksLeft: 2000,
  ticksTotal: 2700,
  boss: null,
  ...over,
});

describe('the clock of the strip (ADR-050)', () => {
  it('rounds up, so time left never shows as 0:00', () => {
    expect(countdown(0)).toBe('0:00');
    expect(countdown(1)).toBe('0:01');
    expect(countdown(60)).toBe('0:01');
    expect(countdown(61)).toBe('0:02');
    expect(countdown(72 * 60)).toBe('1:12');
    expect(countdown(-5)).toBe('0:00');
  });

  it('names the wave as the HUD counts it', () => {
    expect(waveLabel(0, 7)).toBe('Oleada 1/7');
    expect(waveLabel(6, 7)).toBe('Oleada 7/7');
  });

  it('says how long until the next boss, and "ya viene" when it is about to appear', () => {
    expect(bossCountdown({ number: 1, interludes: 3, final: false, ticks: 72 * 60 })).toBe(
      'Jefe 1/3 en 1:12',
    );
    expect(bossCountdown({ number: 4, interludes: 3, final: true, ticks: 30 * 60 })).toBe(
      'Jefe final en 0:30',
    );
    expect(bossCountdown({ number: 2, interludes: 3, final: false, ticks: 0 })).toBe(
      'Jefe 2/3: ya viene',
    );
    expect(BOSS_WARNING_TICKS).toBe(5 * 60);
  });
});

describe('the cartel of a wave (ADR-050)', () => {
  it('has the wave, its theme, its types and what is effective', () => {
    const text = waveCartel(advice(), 'Volcán');
    expect(text.title).toBe('OLEADA 3/7 · Volcán');
    expect(text.types).toEqual(['fire']);
    expect(text.effectiveLabel).toBe('Eficaz:');
    expect(text.effective).toEqual(['water']);
    expect(text.boss).toBeNull();
  });

  it('shows at most three effective types', () => {
    const text = waveCartel(advice({ effective: ['water', 'grass', 'electric', 'fire'] }), 'X');
    expect(text.effective).toEqual(['water', 'grass', 'electric']);
  });

  it('says so when no type has an edge, instead of an empty "Eficaz:"', () => {
    const text = waveCartel(advice({ effective: [] }), 'Tormenta');
    expect(text.effectiveLabel).toBe('Ningún tipo tiene ventaja');
    expect(text.effective).toEqual([]);
  });

  it('announces the boss that comes as this wave ends, and only that one', () => {
    const coming = advice({
      boss: { number: 1, interludes: 3, final: false, ticks: 2000 },
    });
    expect(waveCartel(coming, 'Volcán').boss).toBe('Al acabar: Jefe 1/3');
    const later = advice({ boss: { number: 1, interludes: 3, final: false, ticks: 4700 } });
    expect(waveCartel(later, 'Volcán').boss).toBeNull();
    const last = advice({ boss: { number: 4, interludes: 3, final: true, ticks: 2000 } });
    expect(waveCartel(last, 'Volcán').boss).toBe('Al acabar: Jefe final');
  });

  it('has no theme name when there is none', () => {
    expect(waveCartel(advice(), '').title).toBe('OLEADA 3/7');
  });
});

describe('the cartel of a boss (ADR-050)', () => {
  it('has its number, its name, its type and what beats it', () => {
    const text = bossCartel('Jefe 2/3', 'gyarados', ['water'], ['grass', 'electric']);
    expect(text.title).toBe('JEFE 2/3 · Gyarados');
    expect(text.types).toEqual(['water']);
    expect(text.effective).toEqual(['grass', 'electric']);
  });

  it('shows at most three effective types, and says so when none has an edge', () => {
    const many = bossCartel(
      'Jefe final',
      'moltres',
      ['fire'],
      ['water', 'grass', 'electric', 'fire'],
    );
    expect(many.effective).toEqual(['water', 'grass', 'electric']);
    const none = bossCartel('Jefe 1/3', 'electabuzz', ['electric'], []);
    expect(none.effectiveLabel).toBe('Ningún tipo tiene ventaja');
  });
});

describe('A1 the signs show one at a time and each lasts its time', () => {
  it('a second sign waits behind the first instead of replacing it', () => {
    const queue = new SignQueue<string>();
    queue.push('wave', CARTEL_MS, 1000);
    queue.push('boss', BOSS_CARTEL_MS, 1000); // arrives on the same tick as the wave sign
    expect(queue.current).toBe('wave');
    expect(queue.waiting).toBe(1);
    queue.update(1000 + CARTEL_MS - 1);
    expect(queue.current).toBe('wave'); // still up: it was not cut short
    queue.update(1000 + CARTEL_MS);
    expect(queue.current).toBe('boss');
    queue.update(1000 + CARTEL_MS + BOSS_CARTEL_MS - 1);
    expect(queue.current).toBe('boss');
    queue.update(1000 + CARTEL_MS + BOSS_CARTEL_MS);
    expect(queue.current).toBeNull();
  });

  it('every sign lasts at least two seconds', () => {
    expect(CARTEL_MS).toBeGreaterThanOrEqual(2000);
    expect(BOSS_CARTEL_MS).toBeGreaterThanOrEqual(CARTEL_MS);
  });

  it('shows a sign at once when none is up, and clear empties everything', () => {
    const queue = new SignQueue<string>();
    expect(queue.current).toBeNull();
    queue.push('a', 2000, 50);
    expect(queue.current).toBe('a');
    queue.push('b', 2000, 60);
    queue.clear();
    expect(queue.current).toBeNull();
    expect(queue.waiting).toBe(0);
  });
});
