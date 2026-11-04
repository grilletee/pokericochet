import { describe, expect, it } from 'vitest';
import { FixedStepper, STEP_MS } from '../../src/app/fixedStepper';
import { commandFromInput } from '../../src/app/inputLogic';
import { FrameMetrics, summarize } from '../../src/app/metrics';

describe('FixedStepper', () => {
  it('runs one tick per 1/60 s and keeps the remainder as alpha', () => {
    const s = new FixedStepper();
    expect(s.advance(STEP_MS * 0.5)).toBe(0);
    expect(s.alpha).toBeCloseTo(0.5);
    expect(s.advance(STEP_MS * 0.75)).toBe(1);
    expect(s.alpha).toBeCloseTo(0.25);
  });

  it('is independent of the frame rate: 1 s of time is 60 ticks at 30, 60 or 144 Hz', () => {
    for (const hz of [30, 60, 144]) {
      const s = new FixedStepper();
      let ticks = 0;
      for (let i = 0; i < hz; i++) ticks += s.advance(1000 / hz);
      expect(Math.abs(ticks - 60)).toBeLessThanOrEqual(1);
    }
  });

  it('caps the catch-up at maxSteps and drops the backlog', () => {
    const s = new FixedStepper(STEP_MS, 5);
    expect(s.advance(10_000)).toBe(5);
    expect(s.alpha).toBe(0);
    expect(s.advance(STEP_MS)).toBe(1); // it did not keep a debt
  });

  it('ignores negative elapsed time', () => {
    const s = new FixedStepper();
    expect(s.advance(-50)).toBe(0);
    expect(s.alpha).toBe(0);
  });

  it('alpha is always in [0, 1)', () => {
    const s = new FixedStepper();
    for (const dt of [3, 17, 16.7, 40, 1, 100, 16.66]) {
      s.advance(dt);
      expect(s.alpha).toBeGreaterThanOrEqual(0);
      expect(s.alpha).toBeLessThan(1);
    }
  });
});

describe('commandFromInput', () => {
  const idle = { left: false, right: false, pointerX: null, aimX: null, aimY: null };
  it('maps the keyboard to -1 / 0 / 1 and cancels opposite keys', () => {
    expect(commandFromInput({ ...idle, left: true }, 240, 4, false)).toEqual({
      moveX: -1,
      autoAim: false,
    });
    expect(commandFromInput({ ...idle, right: true }, 240, 4, false)).toEqual({
      moveX: 1,
      autoAim: false,
    });
    expect(commandFromInput({ ...idle, left: true, right: true }, 240, 4, false).moveX).toBe(0);
    expect(commandFromInput(idle, 240, 4, false).moveX).toBe(0);
  });

  it('steers towards the pointer on the floor with a dead zone', () => {
    expect(commandFromInput({ ...idle, pointerX: 300 }, 240, 4, false).moveX).toBe(1);
    expect(commandFromInput({ ...idle, pointerX: 100 }, 240, 4, false).moveX).toBe(-1);
    expect(commandFromInput({ ...idle, pointerX: 242 }, 240, 4, false).moveX).toBe(0);
  });

  it('lets the keyboard win over the pointer', () => {
    const cmd = commandFromInput({ ...idle, left: true, pointerX: 400 }, 240, 4, false);
    expect(cmd.moveX).toBe(-1);
  });

  it('carries the aim point only once the player has set one', () => {
    expect(commandFromInput(idle, 240, 4, false).aimX).toBeUndefined();
    const cmd = commandFromInput({ ...idle, aimX: 120, aimY: 200 }, 240, 4, false);
    expect(cmd.aimX).toBe(120);
    expect(cmd.aimY).toBe(200);
  });

  it('sends the assisted-aim switch with every command', () => {
    expect(commandFromInput(idle, 240, 4, true).autoAim).toBe(true);
    expect(commandFromInput(idle, 240, 4, false).autoAim).toBe(false);
  });
});

describe('metrics', () => {
  it('summarises percentiles', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(summarize(values, 100)).toEqual({ mean: 50.5, p50: 51, p95: 96, p99: 100, max: 100 });
    expect(summarize([], 0).max).toBe(0);
  });

  it('records into preallocated arrays and stops when full', () => {
    const m = new FrameMetrics(2);
    m.record(16, 1, 0.1, 2, 1, 100);
    m.record(17, 1, 0.1, 2, 1, 100);
    m.record(99, 9, 9, 9, 9, 999);
    expect(m.count).toBe(2);
    expect(m.frameMs[1]).toBe(17);
  });

  it('estimates allocation from heap increases and counts drops as collections', () => {
    const m = new FrameMetrics(6);
    for (const heap of [1000, 1100, 1300, 500, 600, 800]) m.record(16, 0, 0, 0, 1, heap);
    // increases: 100 + 200 + 100 + 200 = 600 over 5 intervals; one drop (collection)
    expect(m.allocation()).toEqual({ bytesPerFrame: 120, collections: 1 });
  });
});
