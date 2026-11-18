import { describe, expect, it } from 'vitest';
import { countdownText, nameSize, shortCountdown } from '../../src/ui/gachaSplash';
import { outlineFor } from '../../src/ui/pixelNumber';

/** 4X, block 3: the pure parts of the banner splash and of the numbers drawn on it. */
describe('the countdown of a weekly banner', () => {
  const s = 1000;
  const m = 60 * s;
  const h = 60 * m;
  const d = 24 * h;

  it('days, hours, minutes and seconds; the last day only the clock', () => {
    expect(countdownText(4 * d + 10 * h + 18 * m + 56 * s)).toBe('4 d 10:18:56');
    expect(countdownText(5 * h + 2 * m + 7 * s)).toBe('05:02:07');
    expect(countdownText(999)).toBe('00:00:00');
    expect(countdownText(0)).toBe('¡Cambia ya!');
    expect(countdownText(-5)).toBe('¡Cambia ya!');
  });

  it('the tabs say it short and never round a day up (4 d 10 h, not "5 días")', () => {
    expect(shortCountdown(4 * d + 10 * h + 59 * m)).toBe('4 d 10 h');
    expect(shortCountdown(3 * h + 12 * m)).toBe('3 h 12 min');
    expect(shortCountdown(12 * m + 30 * s)).toBe('12 min');
    expect(shortCountdown(0)).toBe('Cambia ya');
  });

  it('every second changes it, and it only goes down', () => {
    let last = '';
    for (let t = 3 * d; t > 3 * d - 120 * s; t -= s) {
      const text = countdownText(t);
      expect(text).not.toBe(last);
      last = text;
    }
  });
});

describe('the name over the art', () => {
  it('long names are drawn smaller, so they fit on one line', () => {
    expect(nameSize('Mew')).toBe(72);
    expect(nameSize('Dragonite')).toBe(60);
    expect(nameSize('Pokémon con Estilo')).toBe(38);
    const names = [
      'Mew',
      'Salamence',
      'Kommo-o',
      'Hydreigon',
      'Pokédex Abierta',
      'Santuario Legendario',
    ];
    for (let i = 1; i < names.length; i++) {
      const a = names[i - 1] ?? '';
      const b = names[i] ?? '';
      if (b.length > a.length) expect(nameSize(b)).toBeLessThanOrEqual(nameSize(a));
    }
  });
});

describe('the outline of the digits (4X: "1■■" on the draw buttons)', () => {
  it('a dark number gets a light outline; a light one, ink', () => {
    expect(outlineFor('#0b0d1a')).toBe('#fff6e0');
    expect(outlineFor('#14172b')).toBe('#fff6e0');
    expect(outlineFor('#ffd75a')).toBe('#0b0d1a');
    expect(outlineFor('#f6f3e8')).toBe('#0b0d1a');
    expect(outlineFor('#ff5fd2')).toBe('#0b0d1a');
    // Not a colour it can read: ink, as before.
    expect(outlineFor('gold')).toBe('#0b0d1a');
  });
});
