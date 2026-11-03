/** Simulation step: 60 Hz, fixed (ADR-004). */
export const STEP_MS = 1000 / 60;

/**
 * Fixed-step accumulator. Real elapsed time goes in, a whole number of simulation ticks comes
 * out, and the leftover fraction becomes the interpolation factor for rendering. If a frame
 * takes so long that more than `maxSteps` ticks are due, the excess time is dropped instead of
 * trying to catch up (otherwise a slow frame would make the next one even slower).
 */
export class FixedStepper {
  private accumulator = 0;

  constructor(
    private readonly stepMs: number = STEP_MS,
    private readonly maxSteps = 5,
  ) {}

  /** Number of ticks to simulate for this frame. */
  advance(elapsedMs: number): number {
    this.accumulator += Math.max(0, elapsedMs);
    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < this.maxSteps) {
      this.accumulator -= this.stepMs;
      steps += 1;
    }
    if (this.accumulator >= this.stepMs) this.accumulator = 0; // drop the backlog
    return steps;
  }

  /** Fraction of a step already elapsed since the last tick, in [0, 1). */
  get alpha(): number {
    return this.accumulator / this.stepMs;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
