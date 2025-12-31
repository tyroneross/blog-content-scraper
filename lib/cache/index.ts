/**
 * Caching Layer Module
 *
 * Provides multiple caching strategies for scraped content:
 * - Memory (LRU): Fast, in-process caching
 * - File: Persistent disk-based caching
 * - Redis: Distributed caching for multi-instance deployments
 *
 * @see https://www.npmjs.com/package/lru-cache
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  size(): Promise<number>;
  keys(): Promise<string[]>;
}

export interface CacheOptions {
  /** Cache provider type */
  provider: 'memory' | 'file' | CacheProvider;
  /** Time to live in milliseconds (default: 1 hour) */
  ttlMs?: number;
  /** Maximum items in cache (memory only, default: 1000) */
  maxSize?: number;
  /** Maximum memory in bytes (memory only, default: 100MB) */
  maxMemory?: number;
  /** Cache directory (file only, default: .cache/scraper) */
  cacheDir?: string;
  /** Key prefix (default: 'scraper:') */
  keyPrefix?: string;
  /** Whether to cache full content (default: true) */
  cacheContent?: boolean;
  /** Compression for large content (default: false) */
  compress?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
  size: number;
}

// ============================================================================
// Memory Cache (LRU)
// ============================================================================

/**
 * In-memory LRU cache
 *
 * Uses a Map with manual LRU tracking for simplicity.
 * For production with high throughput, consider using the lru-cache package.
 */
export class MemoryCache implements CacheProvider {
  private cache = new Map<string, CacheEntry<any>>();
  private accessOrder: string[] = [];
  private readonly maxSize: number;
  private readonly maxMemory: number;
  private readonly defaultTtl: number;
  private currentMemory = 0;

  // Stats
  private hits = 0;
  private misses = 0;

  constructor(options: {
    maxSize?: number;
    maxMemory?: number;
    ttlMs?: number;
  } = {}) {
    this.maxSize = options.maxSize || 1000;
    this.maxMemory = options.maxMemory || 100 * 1024 * 1024; // 100MB
    this.defaultTtl = options.ttlMs || 60 * 60 * 1000; // 1 hour
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      await this.delete(key);
      this.misses++;
      return null;
    }

    // Update access order (LRU)
    this.updateAccessOrder(key);
    this.hits++;

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs || this.defaultTtl;
    const now = Date.now();
    const size = this.estimateSize(value);

    // Evict if necessary
    await this.evictIfNeeded(size);

    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      expiresAt: now + ttl,
      size
    };

    // Remove old entry if exists
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key)!;
      this.currentMemory -= oldEntry.size;
    }

    this.cache.set(key, entry);
    this.currentMemory += size;
    this.updateAccessOrder(key);
  }

  async delete(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.currentMemory -= entry.size;
    this.accessOrder = this.accessOrder.filter(k => k !== key);

    return true;
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder = [];
    this.currentMemory = 0;
    this.hits = 0;
    this.misses = 0;
  }

  async size(): Promise<number> {
    return this.cache.size;
  }

  async keys(): Promise<string[]> {
    return Array.from(this.cache.keys());
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this.hits / total : 0
    };
  }

  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  private async evictIfNeeded(requiredSize: number): Promise<void> {
    // Evict by count
    while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
      const lruKey = this.accessOrder.shift()!;
      await this.delete(lruKey);
    }

    // Evict by memory
    while (this.currentMemory + requiredSize > this.maxMemory && this.accessOrder.length > 0) {
      const lruKey = this.accessOrder.shift()!;
      await this.delete(lruKey);
    }
  }

  private estimateSize(value: any): number {
    try {
      const str = JSON.stringify(value);
      return str.length * 2; // Approximate memory usage (2 bytes per char)
    } catch {
      return 1024; // Default estimate
    }
  }
}

// ============================================================================
// File Cache
// ============================================================================

/**
 * File-based persistent cache
 *
 * Stores cached items as JSON files on disk.
 * Good for development and single-instance deployments.
 */
export class FileCache implements CacheProvider {
  private readonly cacheDir: string;
  private readonly defaultTtl: number;

  constructor(options: {
    cacheDir?: string;
    ttlMs?: number;
  } = {}) {
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.cache', 'scraper');
    this.defaultTtl = options.ttlMs || 60 * 60 * 1000; // 1 hour

    // Ensure cache directory exists
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private getFilePath(key: string): string {
    const hash = crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
    return path.join(this.cacheDir, `${hash}.json`);
  }

  async get<T>(key: string): Promise<T | null> {
    const filePath = this.getFilePath(key);

    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CacheEntry<T>;

      // Check expiration
      if (Date.now() > data.expiresAt) {
        await this.delete(key);
        return null;
      }

      return data.value;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const filePath = this.getFilePath(key);
    const ttl = ttlMs || this.defaultTtl;
    const now = Date.now();

    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      expiresAt: now + ttl,
      size: 0
    };

    this.ensureDir();
    fs.writeFileSync(filePath, JSON.stringify(entry), 'utf-8');
  }

  async delete(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async clear(): Promise<void> {
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
    } catch {
      // Directory might not exist
    }
  }

  async size(): Promise<number> {
    try {
      const files = fs.readdirSync(this.cacheDir);
      return files.filter(f => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }

  async keys(): Promise<string[]> {
    // File cache doesn't store original keys, only hashes
    return [];
  }

  /**
   * Clean up expired entries
   */
  async prune(): Promise<number> {
    let pruned = 0;

    try {
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (now > data.expiresAt) {
            fs.unlinkSync(filePath);
            pruned++;
          }
        } catch {
          // Invalid file, remove it
          fs.unlinkSync(filePath);
          pruned++;
        }
      }
    } catch {
      // Directory might not exist
    }

    return pruned;
  }
}

// ============================================================================
// Cache Manager
// ============================================================================

/**
 * Cache manager that wraps a provider and adds convenience methods
 */
export class CacheManager {
  private provider: CacheProvider;
  private readonly keyPrefix: string;
  private readonly defaultTtl: number;

  constructor(options: CacheOptions) {
    this.keyPrefix = options.keyPrefix || 'scraper:';
    this.defaultTtl = options.ttlMs || 60 * 60 * 1000;

    if (options.provider === 'memory') {
      this.provider = new MemoryCache({
        maxSize: options.maxSize,
        maxMemory: options.maxMemory,
        ttlMs: options.ttlMs
      });
    } else if (options.provider === 'file') {
      this.provider = new FileCache({
        cacheDir: options.cacheDir,
        ttlMs: options.ttlMs
      });
    } else {
      this.provider = options.provider;
    }
  }

  private prefixKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Generate a cache key from URL and options
   */
  static generateKey(url: string, options?: Record<string, any>): string {
    const normalized = url.toLowerCase().replace(/\/$/, '');
    const optionsHash = options
      ? crypto.createHash('md5').update(JSON.stringify(options)).digest('hex').substring(0, 8)
      : '';

    return crypto.createHash('sha256')
      .update(`${normalized}:${optionsHash}`)
      .digest('hex')
      .substring(0, 24);
  }

  async get<T>(key: string): Promise<T | null> {
    return this.provider.get<T>(this.prefixKey(key));
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    return this.provider.set(this.prefixKey(key), value, ttlMs || this.defaultTtl);
  }

  async delete(key: string): Promise<boolean> {
    return this.provider.delete(this.prefixKey(key));
  }

  async has(key: string): Promise<boolean> {
    return this.provider.has(this.prefixKey(key));
  }

  async clear(): Promise<void> {
    return this.provider.clear();
  }

  async size(): Promise<number> {
    return this.provider.size();
  }

  /**
   * Get or compute a value
   */
  async getOrSet<T>(
    key: string,
    compute: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await compute();
    await this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Wrap a function with caching
   */
  wrap<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    keyGenerator: (...args: Parameters<T>) => string,
    ttlMs?: number
  ): T {
    return (async (...args: Parameters<T>) => {
      const key = keyGenerator(...args);
      return this.getOrSet(key, () => fn(...args), ttlMs);
    }) as T;
  }

  /**
   * Get the underlying provider
   */
  getProvider(): CacheProvider {
    return this.provider;
  }

  /**
   * Get stats (memory cache only)
   */
  getStats(): CacheStats | null {
    if (this.provider instanceof MemoryCache) {
      return this.provider.getStats();
    }
    return null;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a cache instance
 *
 * @example
 * ```typescript
 * // Memory cache (default)
 * const cache = createCache({ provider: 'memory', ttlMs: 3600000 });
 *
 * // File cache
 * const cache = createCache({ provider: 'file', cacheDir: './.cache' });
 *
 * // Use with scraper
 * const key = CacheManager.generateKey(url);
 * const cached = await cache.get(key);
 * if (cached) return cached;
 *
 * const result = await scrapeWebsite(url);
 * await cache.set(key, result);
 * ```
 */
export function createCache(options: CacheOptions): CacheManager {
  return new CacheManager(options);
}

// Default global cache instance
let globalCache: CacheManager | null = null;

/**
 * Get or create the global cache instance
 */
export function getGlobalCache(options?: CacheOptions): CacheManager {
  if (!globalCache) {
    globalCache = createCache(options || { provider: 'memory' });
  }
  return globalCache;
}

/**
 * Set the global cache instance
 */
export function setGlobalCache(cache: CacheManager): void {
  globalCache = cache;
}

/**
 * Clear the global cache
 */
export async function clearGlobalCache(): Promise<void> {
  if (globalCache) {
    await globalCache.clear();
  }
}
