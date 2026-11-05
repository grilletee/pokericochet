// Cached, polite downloading: a file already on disk is never requested again, real requests
// are spaced out, and failures are retried a few times with a growing pause. Up to `concurrency`
// requests run at once (4H-B1, ADR-048), each "worker" keeping its own pause between its requests,
// so the rate stays low: 4 workers with 500 ms is about 6 requests a second, not 16.

export interface FetchDeps {
  exists(path: string): boolean;
  read(path: string): Uint8Array;
  write(path: string, data: Uint8Array): void;
  /** Resolves with the body, or rejects with an Error carrying the HTTP status. */
  download(url: string): Promise<Uint8Array>;
  sleep(ms: number): Promise<void>;
}

export interface FetchOptions {
  /** Pause before every real request of a worker (never before its first one, never for a cache hit). */
  readonly delayMs: number;
  readonly retries: number;
  /** Requests at once; 1 (the default) is the sequential behaviour of before. */
  readonly concurrency?: number;
}

export interface FetchResult {
  readonly data: Uint8Array;
  readonly fromCache: boolean;
}

export class PoliteFetcher {
  /** Real requests made so far (attempts, retries included). */
  private requests = 0;
  /** Worker slots not in use, and whether each slot has already made a request (it then pauses). */
  private readonly free: number[];
  private readonly used: boolean[];
  private readonly waiting: ((slot: number) => void)[] = [];
  /** Downloads in progress by cache path, so two callers asking for the same file share one request. */
  private readonly inflight = new Map<string, Promise<FetchResult>>();

  constructor(
    private readonly deps: FetchDeps,
    private readonly options: FetchOptions,
  ) {
    const slots = Math.max(1, Math.floor(options.concurrency ?? 1));
    this.free = Array.from({ length: slots }, (_, i) => slots - 1 - i);
    this.used = Array.from({ length: slots }, () => false);
  }

  get networkRequests(): number {
    return this.requests;
  }

  get(url: string, cachePath: string): Promise<FetchResult> {
    if (this.deps.exists(cachePath)) {
      return Promise.resolve({ data: this.deps.read(cachePath), fromCache: true });
    }
    const running = this.inflight.get(cachePath);
    if (running !== undefined) return running;
    const job = this.download(url, cachePath).finally(() => this.inflight.delete(cachePath));
    this.inflight.set(cachePath, job);
    return job;
  }

  private acquire(): Promise<number> {
    const slot = this.free.pop();
    if (slot !== undefined) return Promise.resolve(slot);
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release(slot: number): void {
    const next = this.waiting.shift();
    if (next !== undefined) next(slot);
    else this.free.push(slot);
  }

  private async download(url: string, cachePath: string): Promise<FetchResult> {
    const slot = await this.acquire();
    try {
      let lastError: unknown;
      for (let attempt = 0; attempt <= this.options.retries; attempt++) {
        if (this.used[slot] || attempt > 0) {
          // Too Many Requests: wait much longer before trying again.
          const tooMany = attempt > 0 && String(lastError).includes('429') ? 4 : 1;
          await this.deps.sleep(this.options.delayMs * (attempt + 1) * tooMany);
        }
        this.used[slot] = true;
        this.requests += 1;
        try {
          const data = await this.deps.download(url);
          this.deps.write(cachePath, data);
          return { data, fromCache: false };
        } catch (error) {
          lastError = error;
        }
      }
      throw new Error(`could not download ${url}: ${String(lastError)}`);
    } finally {
      this.release(slot);
    }
  }
}
