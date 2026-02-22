/**
 * Batch Operations Module
 *
 * Process multiple URLs concurrently with progress tracking,
 * error handling, and aggregated results.
 */

import type { ScrapeResult, SingleArticleResult } from '../index';

// ============================================================================
// Types
// ============================================================================

export interface BatchOptions {
  /** Max concurrent operations (default: 3) */
  concurrency?: number;
  /** Continue on error (default: true) */
  continueOnError?: boolean;
  /** Progress callback */
  onProgress?: (progress: BatchProgress) => void;
  /** Per-URL result callback */
  onResult?: (url: string, result: BatchItemResult) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Delay between requests in ms (default: 100) */
  delayMs?: number;
  /** Retry failed URLs (default: 1) */
  retries?: number;
  /** Mode: 'article' for direct extraction, 'listing' for discovery */
  mode?: 'article' | 'listing' | 'smart';
  /** Options passed to scraper */
  scraperOptions?: {
    maxArticles?: number;
    qualityThreshold?: number;
    extractFullContent?: boolean;
  };
}

export interface BatchProgress {
  /** Total URLs to process */
  total: number;
  /** Completed URLs */
  completed: number;
  /** Failed URLs */
  failed: number;
  /** Currently processing URLs */
  inProgress: string[];
  /** Percentage complete */
  percentage: number;
  /** Estimated time remaining in ms */
  estimatedRemainingMs?: number;
}

export interface BatchItemResult {
  url: string;
  success: boolean;
  result?: ScrapeResult | SingleArticleResult;
  error?: string;
  durationMs: number;
  retryCount: number;
}

export interface BatchResult {
  /** All processed results by URL */
  results: Map<string, BatchItemResult>;
  /** Summary statistics */
  stats: {
    total: number;
    successful: number;
    failed: number;
    totalDurationMs: number;
    avgDurationMs: number;
  };
  /** Successful results only */
  successful: BatchItemResult[];
  /** Failed results only */
  failed: BatchItemResult[];
  /** All extracted articles (flattened from all sources) */
  articles: Array<{
    url: string;
    title: string;
    sourceUrl: string;
    [key: string]: any;
  }>;
}

// ============================================================================
// Batch Processor
// ============================================================================

/**
 * Process multiple URLs in batch with concurrency control
 *
 * @example
 * ```typescript
 * const urls = [
 *   'https://example.com/article1',
 *   'https://example.com/article2',
 *   'https://example.com/article3'
 * ];
 *
 * const result = await scrapeUrls(urls, {
 *   concurrency: 2,
 *   mode: 'article',
 *   onProgress: (p) => console.log(`${p.percentage}% complete`)
 * });
 *
 * console.log(`${result.stats.successful}/${result.stats.total} succeeded`);
 * console.log(`Total articles: ${result.articles.length}`);
 * ```
 */
export async function scrapeUrls(
  urls: string[],
  options: BatchOptions = {}
): Promise<BatchResult> {
  const {
    concurrency = 3,
    continueOnError = true,
    onProgress,
    onResult,
    signal,
    delayMs = 100,
    retries = 1,
    mode = 'smart',
    scraperOptions = {}
  } = options;

  // Import required functions
  const { extractArticle, scrapeWebsite, smartScrape } = await import('../index');
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(concurrency);

  // Results tracking
  const results = new Map<string, BatchItemResult>();
  const inProgress = new Set<string>();
  let completed = 0;
  let failed = 0;
  const startTime = Date.now();
  const durations: number[] = [];

  // Progress reporter
  const reportProgress = () => {
    if (!onProgress) return;

    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    const remaining = urls.length - completed - failed;
    const estimatedRemainingMs = avgDuration * remaining;

    onProgress({
      total: urls.length,
      completed,
      failed,
      inProgress: Array.from(inProgress),
      percentage: Math.round(((completed + failed) / urls.length) * 100),
      estimatedRemainingMs
    });
  };

  // Process single URL
  const processUrl = async (url: string): Promise<BatchItemResult> => {
    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }

    inProgress.add(url);
    reportProgress();

    const urlStartTime = Date.now();
    let lastError: string | undefined;
    let result: ScrapeResult | SingleArticleResult | undefined;
    let retryCount = 0;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          retryCount++;
          // Exponential backoff
          await delay(delayMs * Math.pow(2, attempt - 1));
        }

        if (mode === 'article') {
          const article = await extractArticle(url);
          if (article) {
            result = article;
          } else {
            throw new Error('Failed to extract article');
          }
        } else if (mode === 'listing') {
          result = await scrapeWebsite(url, {
            ...scraperOptions,
            extractFullContent: scraperOptions.extractFullContent ?? true
          });
        } else {
          // Smart mode
          const smartResult = await smartScrape(url, {
            maxArticles: scraperOptions.maxArticles,
            qualityThreshold: scraperOptions.qualityThreshold
          });

          if (smartResult.mode === 'article') {
            result = smartResult.article;
          } else if (smartResult.mode === 'listing') {
            result = {
              url,
              detectedType: smartResult.detectedAs,
              articles: smartResult.articles,
              stats: smartResult.stats
            } as ScrapeResult;
          } else {
            throw new Error(smartResult.error || 'Smart scrape failed');
          }
        }

        break; // Success, exit retry loop
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        if (attempt === retries) {
          // Final attempt failed
          break;
        }
      }
    }

    inProgress.delete(url);
    const durationMs = Date.now() - urlStartTime;
    durations.push(durationMs);

    const itemResult: BatchItemResult = {
      url,
      success: result !== undefined,
      result,
      error: result ? undefined : lastError,
      durationMs,
      retryCount
    };

    if (result) {
      completed++;
    } else {
      failed++;
    }

    results.set(url, itemResult);
    onResult?.(url, itemResult);
    reportProgress();

    // Delay between requests
    if (delayMs > 0) {
      await delay(delayMs);
    }

    return itemResult;
  };

  // Process all URLs
  const tasks = urls.map(url =>
    limit(async () => {
      try {
        return await processUrl(url);
      } catch (error) {
        if (!continueOnError) throw error;
        const itemResult: BatchItemResult = {
          url,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: 0,
          retryCount: 0
        };
        failed++;
        results.set(url, itemResult);
        reportProgress();
        return itemResult;
      }
    })
  );

  await Promise.all(tasks);

  // Build final result
  const successful = Array.from(results.values()).filter(r => r.success);
  const failedResults = Array.from(results.values()).filter(r => !r.success);
  const totalDurationMs = Date.now() - startTime;

  // Flatten articles from all results
  const articles: BatchResult['articles'] = [];
  for (const item of successful) {
    if (!item.result) continue;

    if ('articles' in item.result && Array.isArray(item.result.articles)) {
      // Listing result
      for (const article of item.result.articles) {
        articles.push({
          ...article,
          sourceUrl: item.url
        });
      }
    } else if ('title' in item.result) {
      // Single article result - spread first, then override
      articles.push({
        ...item.result,
        url: item.url,
        title: item.result.title,
        sourceUrl: item.url
      });
    }
  }

  return {
    results,
    stats: {
      total: urls.length,
      successful: successful.length,
      failed: failedResults.length,
      totalDurationMs,
      avgDurationMs: urls.length > 0 ? Math.round(totalDurationMs / urls.length) : 0
    },
    successful,
    failed: failedResults,
    articles
  };
}

/**
 * Extract articles from multiple URLs (article mode)
 * Convenience wrapper for batch article extraction
 */
export async function extractArticles(
  urls: string[],
  options: Omit<BatchOptions, 'mode'> = {}
): Promise<BatchResult> {
  return scrapeUrls(urls, { ...options, mode: 'article' });
}

/**
 * Discover articles from multiple sites (listing mode)
 * Convenience wrapper for batch site discovery
 */
export async function discoverFromSites(
  urls: string[],
  options: Omit<BatchOptions, 'mode'> = {}
): Promise<BatchResult> {
  return scrapeUrls(urls, { ...options, mode: 'listing' });
}

// ============================================================================
// Utilities
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a batch processor with preset options
 */
export function createBatchProcessor(defaultOptions: BatchOptions = {}) {
  return {
    scrapeUrls: (urls: string[], options?: BatchOptions) =>
      scrapeUrls(urls, { ...defaultOptions, ...options }),
    extractArticles: (urls: string[], options?: Omit<BatchOptions, 'mode'>) =>
      extractArticles(urls, { ...defaultOptions, ...options }),
    discoverFromSites: (urls: string[], options?: Omit<BatchOptions, 'mode'>) =>
      discoverFromSites(urls, { ...defaultOptions, ...options })
  };
}

/**
 * Stream results as they complete (async generator)
 */
export async function* streamResults(
  urls: string[],
  options: BatchOptions = {}
): AsyncGenerator<BatchItemResult> {
  const queue: BatchItemResult[] = [];
  let resolveWait: (() => void) | null = null;
  let done = false;

  const originalOnResult = options.onResult;
  options.onResult = (url, result) => {
    queue.push(result);
    originalOnResult?.(url, result);
    if (resolveWait) {
      resolveWait();
      resolveWait = null;
    }
  };

  // Start batch processing in background
  const batchPromise = scrapeUrls(urls, options).then(() => {
    done = true;
    if (resolveWait) resolveWait();
  });

  // Yield results as they arrive
  while (!done || queue.length > 0) {
    if (queue.length > 0) {
      yield queue.shift()!;
    } else if (!done) {
      await new Promise<void>(resolve => {
        resolveWait = resolve;
      });
    }
  }

  await batchPromise;
}
