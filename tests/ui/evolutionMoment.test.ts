import { describe, expect, it } from 'vitest';
import { SLOW_SCALE, SlowMotion, slowMs, slowSeconds, starterBlurb } from '../../src/ui';
import { signatureLine } from '../../src/ui/screenText';

describe('the slow motion of a stage step (4F-D)', () => {
  it('lasts longer for the maximum stage and slows the loop to a fraction', () => {
    expect(slowMs(2)).toBe(800);
    expect(slowMs(3)).toBe(1300);
    expect(slowMs(3)).toBeGreaterThan(slowMs(2));
    expect(SLOW_SCALE).toBeGreaterThan(0);
    expect(SLOW_SCALE).toBeLessThan(1);
  });

  it('is slow only while the moment lasts, and a new step extends it instead of stacking', () => {
    const slow = new SlowMotion();
    expect(slow.scale(0)).toBe(1);
    slow.start(1000, 800);
    expect(slow.scale(1000)).toBe(SLOW_SCALE);
    expect(slow.scale(1799)).toBe(SLOW_SCALE);
    expect(slow.scale(1800)).toBe(1);
    slow.start(1500, 800); // ends at 2300, later than the first
    expect(slow.scale(2299)).toBe(SLOW_SCALE);
    expect(slow.scale(2300)).toBe(1);
    slow.start(1600, 100); // shorter: the end does not move back
    expect(slow.scale(2200)).toBe(SLOW_SCALE);
    slow.reset();
    expect(slow.scale(1600)).toBe(1);
  });
});

describe('slowSeconds: the real time a run spends in slow motion (M16)', () => {
  const TICK = 1000 / 60;

  it('is zero without steps and the length of the moment for a lone one', () => {
    expect(slowSeconds([], TICK)).toBe(0);
    expect(slowSeconds([{ tick: 600, stage: 2 }], TICK)).toBeCloseTo(0.8, 6);
    expect(slowSeconds([{ tick: 600, stage: 3 }], TICK)).toBeCloseTo(1.3, 6);
  });

  it('adds up steps that are far apart', () => {
    const steps = [
      { tick: 600, stage: 2 },
      { tick: 6000, stage: 3 },
    ];
    expect(slowSeconds(steps, TICK)).toBeCloseTo(2.1, 6);
  });

  it('merges steps that start inside the moment of the previous one', () => {
    // The second starts 10 ticks later: in slow motion that is 10 / 0.35 ticks of real time (~0.48 s).
    const steps = [
      { tick: 600, stage: 2 },
      { tick: 610, stage: 2 },
    ];
    const merged = slowSeconds(steps, TICK);
    expect(merged).toBeGreaterThan(0.8);
    expect(merged).toBeLessThan(1.6);
    expect(merged).toBeCloseTo(0.8 + 10 / 60 / SLOW_SCALE, 3);
  });

  it('a step whose moment ends inside a longer one adds nothing', () => {
    const steps = [
      { tick: 600, stage: 3 },
      { tick: 601, stage: 2 },
    ];
    expect(slowSeconds(steps, TICK)).toBeCloseTo(1.3, 3);
  });
});

describe('the signature on the title screen (4F-D)', () => {
  it('names the real move, the shape and the form it starts with', () => {
    expect(signatureLine('Lanzallamas', 'cross', 'Charmeleon')).toBe(
      'Firma: Lanzallamas, cruz · desde Charmeleon · la lanzas tú',
    );
    expect(signatureLine('Rayo', 'chain', 'Pikachu')).toContain('cadena');
    expect(signatureLine('Surf', 'wave', 'Wartortle')).toContain('ola');
    expect(signatureLine('Latigazo', 'beam', 'Ivysaur')).toContain('columna');
    expect(starterBlurb('fire')).toContain('Fuego');
  });
});
