// Cached, polite downloading: a file already on disk is never requested again, real requests
// are spaced out, and failures are retried a few times with a growing pause.

export interface FetchDeps {
  exists(path: string): boolean;
  read(path: string): Uint8Array;
  write(path: string, data: Uint8Array): void;
  /** Resolves with the body, or rejects with an Error carrying the HTTP status. */
  download(url: string): Promise<Uint8Array>;
  sleep(ms: number): Promise<void>;
}

export interface FetchOptions {
  /** Pause before every real request (never before a cache hit). */
  readonly delayMs: number;
  readonly retries: number;
}

export interface FetchResult {
  readonly data: Uint8Array;
  readonly fromCache: boolean;
}

export class PoliteFetcher {
  /** Real requests made so far; the first one needs no pause. */
  private requests = 0;

  constructor(
    private readonly deps: FetchDeps,
    private readonly options: FetchOptions,
  ) {}

  get networkRequests(): number {
    return this.requests;
  }

  async get(url: string, cachePath: string): Promise<FetchResult> {
    if (this.deps.exists(cachePath)) return { data: this.deps.read(cachePath), fromCache: true };
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      if (this.requests > 0 || attempt > 0) {
        await this.deps.sleep(this.options.delayMs * (attempt + 1));
      }
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
  }
}
