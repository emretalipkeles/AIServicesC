/**
 * Minimal concurrency-limited task runner. Bounds how many async tasks run in parallel
 * instead of firing every task at once (which is what caused hundreds of simultaneous AI
 * calls to be scheduled for a single large document upload batch, tripping provider rate
 * limits and silently failing most of them).
 *
 * Not a queue/job system - just a simple in-process semaphore. Good enough for
 * fire-and-forget background work within a single request or script run.
 */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {
    if (maxConcurrent < 1) {
      throw new Error('maxConcurrent must be at least 1');
    }
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}
