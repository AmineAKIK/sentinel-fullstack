interface RateLimitEntry {
  count: number;
  lastAttemptAt: number;
}

export interface RateLimit {
  getCount(key: number): number;
  increment(key: number): number;
  reset(key: number): void;
  isExceeded(key: number): boolean;
}

export function createRateLimit(maxAttempts: number, ttlMs: number): RateLimit {
  const store = new Map<number, RateLimitEntry>();

  function getCount(key: number): number {
    const entry = store.get(key);
    if (!entry) return 0;
    if (Date.now() - entry.lastAttemptAt > ttlMs) {
      store.delete(key);
      return 0;
    }
    return entry.count;
  }

  function increment(key: number): number {
    const count = getCount(key) + 1;
    store.set(key, { count, lastAttemptAt: Date.now() });
    return count;
  }

  function reset(key: number): void {
    store.delete(key);
  }

  function isExceeded(key: number): boolean {
    return getCount(key) >= maxAttempts;
  }

  return { getCount, increment, reset, isExceeded };
}
