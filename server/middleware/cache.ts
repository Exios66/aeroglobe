type CacheRecord<T> = {
  data: T;
  expiresAt: number;
};

class ServerCache {
  private store = new Map<string, CacheRecord<unknown>>();

  get<T>(key: string): T | null {
    const cached = this.store.get(key);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return cached.data as T;
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export const serverCache = new ServerCache();
