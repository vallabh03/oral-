/**
 * Bounded-concurrency gate with a bounded wait queue. When the queue is full the caller
 * gets an immediate rejection, which the API turns into 503 + Retry-After (backpressure)
 * instead of letting memory and latency grow without limit under a burst of uploads.
 */
export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(
    private readonly max: number,
    private readonly queueLimit: number,
  ) {}

  get stats() {
    return { active: this.active, queued: this.queue.length, max: this.max, queueLimit: this.queueLimit };
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      if (this.queue.length >= this.queueLimit) throw new SemaphoreFullError();
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }
}

export class SemaphoreFullError extends Error {
  constructor() {
    super("queue full");
  }
}
