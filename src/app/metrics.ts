export interface Stats {
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

export function summarize(values: ArrayLike<number>, count: number): Stats {
  if (count === 0) return { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = Array.from({ length: count }, (_, i) => values[i] ?? 0).sort((a, b) => a - b);
  const at = (p: number): number => sorted[Math.min(count - 1, Math.floor(count * p))] ?? 0;
  let sum = 0;
  for (const v of sorted) sum += v;
  return {
    mean: sum / count,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted[count - 1] ?? 0,
  };
}

/**
 * Fixed-capacity record of per-frame measurements. Recording writes into preallocated arrays,
 * so measuring does not add allocations to the thing being measured.
 */
export class FrameMetrics {
  count = 0;
  readonly frameMs: Float64Array;
  readonly tickMs: Float64Array;
  readonly snapshotMs: Float64Array;
  readonly renderMs: Float64Array;
  readonly ticks: Float64Array;
  readonly heapBytes: Float64Array;

  constructor(readonly capacity: number) {
    this.frameMs = new Float64Array(capacity);
    this.tickMs = new Float64Array(capacity);
    this.snapshotMs = new Float64Array(capacity);
    this.renderMs = new Float64Array(capacity);
    this.ticks = new Float64Array(capacity);
    this.heapBytes = new Float64Array(capacity);
  }

  get full(): boolean {
    return this.count >= this.capacity;
  }

  record(
    frameMs: number,
    tickMs: number,
    snapshotMs: number,
    renderMs: number,
    ticks: number,
    heapBytes: number,
  ): void {
    if (this.full) return;
    const i = this.count;
    this.frameMs[i] = frameMs;
    this.tickMs[i] = tickMs;
    this.snapshotMs[i] = snapshotMs;
    this.renderMs[i] = renderMs;
    this.ticks[i] = ticks;
    this.heapBytes[i] = heapBytes;
    this.count += 1;
  }

  /**
   * Heap growth between consecutive frames. A drop means the garbage collector ran, so only
   * increases are added: the result is a lower bound of the bytes allocated per frame, because
   * allocations made in the same interval as a collection are partly hidden.
   */
  allocation(): { bytesPerFrame: number; collections: number } {
    let allocated = 0;
    let collections = 0;
    for (let i = 1; i < this.count; i++) {
      const delta = (this.heapBytes[i] ?? 0) - (this.heapBytes[i - 1] ?? 0);
      if (delta > 0) allocated += delta;
      else if (delta < 0) collections += 1;
    }
    return { bytesPerFrame: this.count > 1 ? allocated / (this.count - 1) : 0, collections };
  }
}
