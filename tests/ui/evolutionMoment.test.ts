import { describe, expect, it } from 'vitest';
import { GamePause, pauseMs, pauseSeconds, starterBlurb } from '../../src/ui';
import { signatureLine } from '../../src/ui/screenText';

describe('the pause of a stage step (4F-E)', () => {
  it('lasts about a second, a little longer for the maximum stage', () => {
    expect(pauseMs(2)).toBe(1000);
    expect(pauseMs(3)).toBe(1200);
    expect(pauseMs(3)).toBeGreaterThan(pauseMs(2));
  });

  it('is on only while the moment lasts, and a new step extends it instead of stacking', () => {
    const pause = new GamePause();
    expect(pause.active(0)).toBe(false);
    pause.start(1000, 1000);
    expect(pause.active(1000)).toBe(true);
    expect(pause.active(1999)).toBe(true);
    expect(pause.active(2000)).toBe(false);
    pause.start(1500, 1000); // ends at 2500, later than the first
    expect(pause.active(2499)).toBe(true);
    expect(pause.active(2500)).toBe(false);
    pause.start(1600, 100); // shorter: the end does not move back
    expect(pause.active(2400)).toBe(true);
    pause.reset();
    expect(pause.active(1600)).toBe(false);
  });
});

describe('pauseSeconds: the real time a run spends paused by evolutions (M16)', () => {
  it('is zero without steps and the length of the pause for a lone one', () => {
    expect(pauseSeconds([])).toBe(0);
    expect(pauseSeconds([{ tick: 600, stage: 2 }])).toBeCloseTo(1, 6);
    expect(pauseSeconds([{ tick: 600, stage: 3 }])).toBeCloseTo(1.2, 6);
  });

  it('adds up steps on different ticks (the game is stopped, so they never overlap)', () => {
    const steps = [
      { tick: 600, stage: 2 },
      { tick: 601, stage: 3 },
    ];
    expect(pauseSeconds(steps)).toBeCloseTo(2.2, 6);
  });

  it('merges steps on the same tick into one pause of the longest', () => {
    const steps = [
      { tick: 600, stage: 2 },
      { tick: 600, stage: 3 },
      { tick: 600, stage: 2 },
    ];
    expect(pauseSeconds(steps)).toBeCloseTo(1.2, 6);
  });
});

describe('the signature on the title screen (4F-D)', () => {
  it('names the real move, the shape and the form it starts with', () => {
    expect(signatureLine('Lanzallamas', 'cross', 'Charmeleon')).toContain('Lanzallamas, cruz');
    expect(signatureLine('Rayo', 'chain', 'Pikachu')).toContain('cadena');
    expect(signatureLine('Surf', 'wave', 'Wartortle')).toContain('ola');
    expect(signatureLine('Latigazo', 'beam', 'Ivysaur')).toContain('columna');
    expect(signatureLine('Latigazo', 'beam', 'Ivysaur')).toContain('desde Ivysaur');
    expect(starterBlurb('fire')).toContain('Fuego');
  });
});
