interface AttemptRecord {
  count: number;
  firstAttempt: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export class LoginRateLimiter {
  private attempts = new Map<string, AttemptRecord>();

  check(key: string): { allowed: boolean; retryAfterMs?: number } {
    this.cleanup();
    const record = this.attempts.get(key);

    if (!record) {
      return { allowed: true };
    }

    if (record.count >= MAX_ATTEMPTS) {
      const elapsed = Date.now() - record.firstAttempt;
      if (elapsed < WINDOW_MS) {
        return { allowed: false, retryAfterMs: WINDOW_MS - elapsed };
      }
      this.attempts.delete(key);
      return { allowed: true };
    }

    return { allowed: true };
  }

  recordFailure(key: string): void {
    const record = this.attempts.get(key);
    if (record) {
      record.count++;
    } else {
      this.attempts.set(key, { count: 1, firstAttempt: Date.now() });
    }
  }

  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    this.attempts.forEach((record, key) => {
      if (now - record.firstAttempt > WINDOW_MS) {
        expiredKeys.push(key);
      }
    });
    expiredKeys.forEach((key) => this.attempts.delete(key));
  }
}
