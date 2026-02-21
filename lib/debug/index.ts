/**
 * Debug/Metrics Module
 *
 * Provides timing, performance metrics, and debugging info
 * for scraping operations.
 */

// ============================================================================
// Types
// ============================================================================

export interface DebugMetrics {
  /** Total operation time in ms */
  totalTime: number;
  /** Breakdown by phase */
  phases: {
    discovery: number;
    extraction: number;
    formatting: number;
    validation?: number;
  };
  /** Network statistics */
  network: {
    requests: number;
    totalBytes: number;
    avgLatency: number;
    failures: number;
    retries: number;
  };
  /** Cache statistics */
  cache?: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  /** Memory usage */
  memory?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  /** Article processing stats */
  articles: {
    discovered: number;
    extracted: number;
    filtered: number;
    errors: number;
  };
  /** Warnings and issues */
  warnings: string[];
  /** Detailed trace logs */
  trace?: TraceEvent[];
}

export interface TraceEvent {
  timestamp: number;
  phase: string;
  event: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface DebugOptions {
  /** Enable detailed tracing */
  tracing?: boolean;
  /** Log to console */
  verbose?: boolean;
  /** Custom logger */
  logger?: (message: string, data?: any) => void;
}

// ============================================================================
// Debug Session
// ============================================================================

/**
 * Debug session for tracking a scraping operation
 *
 * @example
 * ```typescript
 * const debug = new DebugSession({ tracing: true });
 *
 * debug.startPhase('discovery');
 * // ... do discovery
 * debug.endPhase('discovery');
 *
 * debug.recordRequest({ url, bytes: 1024, latency: 150 });
 *
 * const metrics = debug.getMetrics();
 * console.log(`Total time: ${metrics.totalTime}ms`);
 * ```
 */
export class DebugSession {
  private startTime: number;
  private phaseStartTimes: Map<string, number> = new Map();
  private phaseDurations: Map<string, number> = new Map();
  private networkStats = {
    requests: 0,
    totalBytes: 0,
    totalLatency: 0,
    failures: 0,
    retries: 0
  };
  private articleStats = {
    discovered: 0,
    extracted: 0,
    filtered: 0,
    errors: 0
  };
  private cacheStats = {
    hits: 0,
    misses: 0
  };
  private warnings: string[] = [];
  private trace: TraceEvent[] = [];
  private options: DebugOptions;

  constructor(options: DebugOptions = {}) {
    this.options = options;
    this.startTime = Date.now();

    if (options.verbose) {
      this.log('Debug session started');
    }
  }

  private log(message: string, data?: any): void {
    if (this.options.logger) {
      this.options.logger(message, data);
    } else if (this.options.verbose) {
      console.log(`[Debug] ${message}`, data || '');
    }
  }

  private addTrace(phase: string, event: string, metadata?: Record<string, any>): void {
    if (this.options.tracing) {
      this.trace.push({
        timestamp: Date.now() - this.startTime,
        phase,
        event,
        metadata
      });
    }
  }

  /**
   * Start timing a phase
   */
  startPhase(name: string): void {
    this.phaseStartTimes.set(name, Date.now());
    this.addTrace(name, 'start');
    this.log(`Phase started: ${name}`);
  }

  /**
   * End timing a phase
   */
  endPhase(name: string): number {
    const start = this.phaseStartTimes.get(name);
    if (!start) {
      this.warn(`Phase ${name} was not started`);
      return 0;
    }

    const duration = Date.now() - start;
    this.phaseDurations.set(name, duration);
    this.phaseStartTimes.delete(name);

    this.addTrace(name, 'end', { duration });
    this.log(`Phase ended: ${name} (${duration}ms)`);

    return duration;
  }

  /**
   * Record a network request
   */
  recordRequest(info: {
    url: string;
    bytes?: number;
    latency?: number;
    success?: boolean;
    retry?: boolean;
  }): void {
    this.networkStats.requests++;
    if (info.bytes) this.networkStats.totalBytes += info.bytes;
    if (info.latency) this.networkStats.totalLatency += info.latency;
    if (info.success === false) this.networkStats.failures++;
    if (info.retry) this.networkStats.retries++;

    this.addTrace('network', 'request', info);
  }

  /**
   * Record article discovery
   */
  recordDiscovery(count: number): void {
    this.articleStats.discovered += count;
    this.addTrace('articles', 'discovered', { count });
    this.log(`Discovered ${count} articles`);
  }

  /**
   * Record successful extraction
   */
  recordExtraction(count: number): void {
    this.articleStats.extracted += count;
    this.addTrace('articles', 'extracted', { count });
  }

  /**
   * Record filtered articles
   */
  recordFilter(count: number): void {
    this.articleStats.filtered += count;
    this.addTrace('articles', 'filtered', { count });
  }

  /**
   * Record extraction error
   */
  recordError(error: string | Error): void {
    this.articleStats.errors++;
    const message = error instanceof Error ? error.message : error;
    this.addTrace('error', message);
    this.log(`Error: ${message}`);
  }

  /**
   * Record cache hit
   */
  recordCacheHit(): void {
    this.cacheStats.hits++;
    this.addTrace('cache', 'hit');
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(): void {
    this.cacheStats.misses++;
    this.addTrace('cache', 'miss');
  }

  /**
   * Add a warning
   */
  warn(message: string): void {
    this.warnings.push(message);
    this.addTrace('warning', message);
    this.log(`Warning: ${message}`);
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): DebugMetrics['memory'] | undefined {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external
      };
    }
    return undefined;
  }

  /**
   * Get final metrics
   */
  getMetrics(): DebugMetrics {
    const totalTime = Date.now() - this.startTime;
    const cacheTotal = this.cacheStats.hits + this.cacheStats.misses;

    return {
      totalTime,
      phases: {
        discovery: this.phaseDurations.get('discovery') || 0,
        extraction: this.phaseDurations.get('extraction') || 0,
        formatting: this.phaseDurations.get('formatting') || 0,
        validation: this.phaseDurations.get('validation')
      },
      network: {
        requests: this.networkStats.requests,
        totalBytes: this.networkStats.totalBytes,
        avgLatency: this.networkStats.requests > 0
          ? Math.round(this.networkStats.totalLatency / this.networkStats.requests)
          : 0,
        failures: this.networkStats.failures,
        retries: this.networkStats.retries
      },
      cache: cacheTotal > 0
        ? {
            hits: this.cacheStats.hits,
            misses: this.cacheStats.misses,
            hitRate: this.cacheStats.hits / cacheTotal
          }
        : undefined,
      memory: this.getMemoryUsage(),
      articles: { ...this.articleStats },
      warnings: [...this.warnings],
      trace: this.options.tracing ? [...this.trace] : undefined
    };
  }

  /**
   * Get summary string
   */
  getSummary(): string {
    const m = this.getMetrics();
    const lines = [
      `Total time: ${m.totalTime}ms`,
      `Phases: discovery=${m.phases.discovery}ms, extraction=${m.phases.extraction}ms, formatting=${m.phases.formatting}ms`,
      `Network: ${m.network.requests} requests, ${formatBytes(m.network.totalBytes)}, avg ${m.network.avgLatency}ms`,
      `Articles: ${m.articles.discovered} found, ${m.articles.extracted} extracted, ${m.articles.filtered} filtered, ${m.articles.errors} errors`
    ];

    if (m.cache) {
      lines.push(`Cache: ${m.cache.hits} hits, ${m.cache.misses} misses (${(m.cache.hitRate * 100).toFixed(1)}% hit rate)`);
    }

    if (m.warnings.length > 0) {
      lines.push(`Warnings: ${m.warnings.length}`);
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Global Debug Mode
// ============================================================================

let globalDebugSession: DebugSession | null = null;

/**
 * Enable global debug mode
 *
 * @example
 * ```typescript
 * import { enableDebugMode, getDebugMetrics } from '@tyroneross/omniparse/debug';
 *
 * enableDebugMode({ verbose: true });
 *
 * // Run scraping operations...
 *
 * const metrics = getDebugMetrics();
 * console.log(metrics.getSummary());
 *
 * disableDebugMode();
 * ```
 */
export function enableDebugMode(options?: DebugOptions): DebugSession {
  globalDebugSession = new DebugSession(options);
  (globalThis as any).__SCRAPER_DEBUG__ = globalDebugSession;
  return globalDebugSession;
}

/**
 * Disable global debug mode
 */
export function disableDebugMode(): DebugMetrics | null {
  const metrics = globalDebugSession?.getMetrics() || null;
  globalDebugSession = null;
  delete (globalThis as any).__SCRAPER_DEBUG__;
  return metrics;
}

/**
 * Get current debug session
 */
export function getDebugSession(): DebugSession | null {
  return globalDebugSession || (globalThis as any).__SCRAPER_DEBUG__ || null;
}

/**
 * Get debug metrics from current session
 */
export function getDebugMetrics(): DebugMetrics | null {
  return getDebugSession()?.getMetrics() || null;
}

/**
 * Check if debug mode is enabled
 */
export function isDebugMode(): boolean {
  return getDebugSession() !== null;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * Format duration to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

/**
 * Create a timed function wrapper
 */
export function timed<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  name: string
): T {
  return (async (...args: Parameters<T>) => {
    const session = getDebugSession();
    session?.startPhase(name);
    try {
      const result = await fn(...args);
      return result;
    } finally {
      session?.endPhase(name);
    }
  }) as T;
}

/**
 * Time a synchronous function
 */
export function timedSync<T extends (...args: any[]) => any>(
  fn: T,
  name: string
): T {
  return ((...args: Parameters<T>) => {
    const session = getDebugSession();
    session?.startPhase(name);
    try {
      return fn(...args);
    } finally {
      session?.endPhase(name);
    }
  }) as T;
}
