/**
 * @package @tyroneross/blog-scraper
 * High-level API for easy scraping
 *
 * Features:
 * - Progress callbacks for real-time status updates
 * - AbortSignal support for cancellation
 * - Typed errors for better error handling
 */

import { globalSourceOrchestrator, SourceConfig } from './orchestrator/source-orchestrator';
import { globalContentExtractor } from './extractors/content-extractor';
import {
  calculateArticleQualityScore,
  shouldDenyUrl,
  DEFAULT_DENY_PATHS
} from './quality/quality-scorer';
import { ScrapedArticle, ScraperTestResult, ScrapeProgress, OnProgressCallback } from './types';
import { convertToMarkdown } from './formatters/html-to-markdown';
import { cleanText } from './formatters/text-cleaner';
import { RequestAbortedError, NoContentFoundError } from './errors';

/**
 * Options for the scrape function
 */
export interface ScrapeOptions {
  /** Source type detection mode (default: 'auto') */
  sourceType?: 'auto' | 'rss' | 'sitemap' | 'html';

  /** Maximum number of articles to return (default: 50) */
  maxArticles?: number;

  /** Extract full article content (default: true) */
  extractFullContent?: boolean;

  /** URL patterns to exclude (default: common non-article paths) */
  denyPaths?: string[];

  /** Minimum quality score 0-1 (default: 0.6) */
  qualityThreshold?: number;

  /**
   * Progress callback - called multiple times during scraping
   * Use this to update UI with real-time status
   *
   * @example
   * ```typescript
   * await scrape(url, {
   *   onProgress: (status) => {
   *     console.log(`${status.phase}: ${status.message}`);
   *     if (status.percent) updateProgressBar(status.percent);
   *   }
   * });
   * ```
   */
  onProgress?: OnProgressCallback;

  /**
   * AbortSignal for cancellation support
   * Pass an AbortController's signal to enable cancellation
   *
   * @example
   * ```typescript
   * const controller = new AbortController();
   * cancelButton.onclick = () => controller.abort();
   *
   * await scrape(url, { signal: controller.signal });
   * ```
   *
   * @example Timeout after 30 seconds
   * ```typescript
   * await scrape(url, { signal: AbortSignal.timeout(30000) });
   * ```
   */
  signal?: AbortSignal;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Number of retry attempts for failed requests (default: 2) */
  retries?: number;

  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Check if the operation should be aborted
 */
function checkAborted(signal?: AbortSignal, url?: string): void {
  if (signal?.aborted) {
    throw new RequestAbortedError('Scraping was cancelled', { url });
  }
}

/**
 * Helper to emit progress updates
 */
function emitProgress(
  onProgress: OnProgressCallback | undefined,
  progress: ScrapeProgress
): void {
  if (onProgress) {
    try {
      onProgress(progress);
    } catch {
      // Don't let progress callback errors break the scrape
    }
  }
}

/**
 * Main scraping function - simple interface for extracting articles
 *
 * @example Basic usage
 * ```typescript
 * import { scrape } from '@tyroneross/blog-scraper';
 *
 * const result = await scrape('https://example.com/blog');
 * console.log(`Found ${result.articles.length} articles`);
 * ```
 *
 * @example With progress tracking
 * ```typescript
 * const result = await scrape('https://example.com/blog', {
 *   onProgress: (status) => {
 *     console.log(`[${status.phase}] ${status.message}`);
 *     if (status.percent) {
 *       updateProgressBar(status.percent);
 *     }
 *   }
 * });
 * ```
 *
 * @example With cancellation
 * ```typescript
 * const controller = new AbortController();
 *
 * // Cancel after 10 seconds
 * setTimeout(() => controller.abort(), 10000);
 *
 * try {
 *   const result = await scrape(url, { signal: controller.signal });
 * } catch (e) {
 *   if (e instanceof RequestAbortedError) {
 *     console.log('Scraping was cancelled');
 *   }
 * }
 * ```
 *
 * @param url - URL to scrape (RSS feed, sitemap, or HTML page)
 * @param options - Optional scraping configuration
 * @returns Promise with scraping results
 */
export async function scrape(
  url: string,
  options: ScrapeOptions = {}
): Promise<ScraperTestResult> {
  const startTime = Date.now();

  // Set defaults
  const {
    sourceType = 'auto',
    maxArticles = 50,
    extractFullContent = true,
    denyPaths = DEFAULT_DENY_PATHS,
    qualityThreshold = 0.6,
    onProgress,
    signal,
    debug = false
  } = options;

  const log = debug ? console.log.bind(console) : () => {};

  log(`[Scraper] Starting scrape of ${url}`);
  log(`   Source type: ${sourceType}`);
  log(`   Max articles: ${maxArticles}`);
  log(`   Extract full content: ${extractFullContent}`);
  log(`   Quality threshold: ${qualityThreshold}`);

  const errors: string[] = [];
  let totalDiscovered = 0;
  let afterDenyFilter = 0;
  let afterContentValidation = 0;
  let afterQualityFilter = 0;

  // Helper to get elapsed time
  const elapsed = () => Date.now() - startTime;

  try {
    // Check for abort before starting
    checkAborted(signal, url);

    // Step 1: Initialize
    emitProgress(onProgress, {
      phase: 'initializing',
      message: 'Starting scrape...',
      elapsedMs: elapsed()
    });

    // Step 2: Detect source type
    emitProgress(onProgress, {
      phase: 'detecting',
      message: `Detecting content source type for ${new URL(url).hostname}...`,
      elapsedMs: elapsed()
    });

    checkAborted(signal, url);

    // Step 3: Orchestrate content discovery
    const config: SourceConfig = {
      sourceType,
      denyPaths
    };

    emitProgress(onProgress, {
      phase: 'discovering',
      message: 'Discovering articles...',
      elapsedMs: elapsed()
    });

    const orchestrationResult = await globalSourceOrchestrator.processSource(url, config);
    totalDiscovered = orchestrationResult.articles.length;
    errors.push(...orchestrationResult.errors);

    checkAborted(signal, url);

    emitProgress(onProgress, {
      phase: 'discovering',
      message: `Found ${totalDiscovered} candidate articles`,
      articlesFound: totalDiscovered,
      detectedType: orchestrationResult.sourceInfo.detectedType,
      elapsedMs: elapsed()
    });

    log(`[Scraper] Discovered ${totalDiscovered} candidate articles`);

    if (totalDiscovered === 0) {
      throw new NoContentFoundError(
        `No articles found at ${url}`,
        { url, triedSources: [orchestrationResult.sourceInfo.detectedType] }
      );
    }

    // Step 4: Apply deny path filter
    emitProgress(onProgress, {
      phase: 'filtering',
      message: 'Filtering blocked paths...',
      elapsedMs: elapsed()
    });

    let candidateArticles = orchestrationResult.articles.filter(article => {
      const shouldDeny = shouldDenyUrl(article.url, denyPaths);
      return !shouldDeny;
    });
    afterDenyFilter = candidateArticles.length;

    emitProgress(onProgress, {
      phase: 'filtering',
      message: `${afterDenyFilter} articles after filtering`,
      articlesFound: afterDenyFilter,
      elapsedMs: elapsed()
    });

    log(`[Scraper] After deny filter: ${afterDenyFilter} articles`);

    checkAborted(signal, url);

    // Step 5: Extract full content if requested
    let scrapedArticles: ScrapedArticle[] = [];

    if (extractFullContent && candidateArticles.length > 0) {
      const articlesToProcess = candidateArticles.slice(0, maxArticles * 2);
      const totalToExtract = Math.min(articlesToProcess.length, maxArticles * 2);

      emitProgress(onProgress, {
        phase: 'extracting',
        message: `Extracting content from ${totalToExtract} articles...`,
        current: 0,
        total: totalToExtract,
        percent: 0,
        elapsedMs: elapsed()
      });

      log(`[Scraper] Extracting full content for ${totalToExtract} articles`);

      for (let i = 0; i < articlesToProcess.length; i++) {
        const candidate = articlesToProcess[i];

        // Check for abort before each extraction
        checkAborted(signal, candidate.url);

        emitProgress(onProgress, {
          phase: 'extracting',
          message: `Extracting article ${i + 1}/${totalToExtract}...`,
          current: i + 1,
          total: totalToExtract,
          percent: Math.round(((i + 1) / totalToExtract) * 100),
          currentUrl: candidate.url,
          articlesFound: scrapedArticles.length,
          elapsedMs: elapsed()
        });

        try {
          const extractedContent = await globalContentExtractor.extractContent(candidate.url);

          if (!extractedContent) {
            errors.push(`Failed to extract content from ${candidate.url}`);
            continue;
          }

          // Convert to markdown
          const markdown = convertToMarkdown(extractedContent.content || '');
          const cleanedText = cleanText(extractedContent.textContent || '');

          // Calculate quality score
          const qualityScore = calculateArticleQualityScore(extractedContent);

          scrapedArticles.push({
            url: candidate.url,
            title: extractedContent.title || candidate.title,
            publishedDate: extractedContent.publishedTime,
            description: extractedContent.excerpt || candidate.excerpt,
            fullContent: extractedContent.content,
            fullContentMarkdown: markdown,
            fullContentText: cleanedText,
            confidence: candidate.confidence,
            source: extractedContent.structured?.jsonLd ? 'structured-data' :
                    extractedContent.byline ? 'meta-data' : 'link-text',
            qualityScore,
            metadata: {
              ...candidate.metadata,
              wordCount: extractedContent.wordCount,
              readingTime: extractedContent.readingTime,
              byline: extractedContent.byline,
              siteName: extractedContent.siteName,
              lang: extractedContent.lang
            }
          });

          // Stop if we have enough
          if (scrapedArticles.length >= maxArticles) {
            break;
          }
        } catch (error) {
          // Re-throw abort errors
          if (error instanceof RequestAbortedError) {
            throw error;
          }

          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Error processing ${candidate.url}: ${errorMsg}`);
          continue;
        }
      }
    } else {
      // No full content extraction, just return candidates
      scrapedArticles = candidateArticles.slice(0, maxArticles).map(candidate => ({
        url: candidate.url,
        title: candidate.title,
        publishedDate: candidate.publishedAt,
        description: candidate.excerpt,
        confidence: candidate.confidence,
        source: candidate.source === 'rss' ? 'structured-data' :
                candidate.source === 'sitemap' ? 'meta-data' : 'link-text',
        qualityScore: 0.5, // Default score when not extracting full content
        metadata: candidate.metadata
      }));
    }

    afterContentValidation = scrapedArticles.length;

    checkAborted(signal, url);

    // Step 6: Apply quality filter
    emitProgress(onProgress, {
      phase: 'scoring',
      message: `Scoring ${afterContentValidation} articles...`,
      elapsedMs: elapsed()
    });

    log(`[Scraper] After content extraction: ${afterContentValidation} articles`);

    const filteredArticles = scrapedArticles.filter(article => {
      const score = article.qualityScore ?? 0;
      return score >= qualityThreshold;
    });
    afterQualityFilter = filteredArticles.length;

    log(`[Scraper] After quality filter: ${afterQualityFilter} articles (threshold: ${qualityThreshold})`);

    // Build final result
    const processingTime = Date.now() - startTime;
    const result: ScraperTestResult = {
      url,
      detectedType: orchestrationResult.sourceInfo.detectedType,
      confidence: afterQualityFilter > 0 ? 'high' :
                  afterContentValidation > 0 ? 'medium' : 'low',
      articles: filteredArticles,
      extractionStats: {
        attempted: totalDiscovered,
        successful: afterQualityFilter,
        failed: errors.length,
        filtered: totalDiscovered - afterQualityFilter,
        totalDiscovered,
        afterDenyFilter,
        afterContentValidation,
        afterQualityFilter
      },
      processingTime,
      errors,
      timestamp: new Date().toISOString()
    };

    emitProgress(onProgress, {
      phase: 'complete',
      message: `Complete! Found ${afterQualityFilter} quality articles`,
      articlesFound: afterQualityFilter,
      percent: 100,
      elapsedMs: processingTime
    });

    log(`[Scraper] Complete! ${afterQualityFilter} articles in ${processingTime}ms`);
    return result;

  } catch (error) {
    // Handle abort errors specially
    if (error instanceof RequestAbortedError) {
      emitProgress(onProgress, {
        phase: 'error',
        message: 'Scraping was cancelled',
        elapsedMs: elapsed()
      });
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`[Scraper] Fatal error: ${errorMessage}`);

    emitProgress(onProgress, {
      phase: 'error',
      message: `Error: ${errorMessage}`,
      elapsedMs: elapsed()
    });

    return {
      url,
      detectedType: 'unknown',
      confidence: 'low',
      articles: [],
      extractionStats: {
        attempted: totalDiscovered,
        successful: 0,
        failed: 1,
        filtered: totalDiscovered,
        totalDiscovered,
        afterDenyFilter,
        afterContentValidation,
        afterQualityFilter
      },
      processingTime: Date.now() - startTime,
      errors: [errorMessage, ...errors],
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Quick scrape - returns just the article URLs and titles (fast)
 *
 * @example
 * ```typescript
 * const urls = await quickScrape('https://example.com/blog');
 * console.log(urls); // ['url1', 'url2', ...]
 * ```
 */
export async function quickScrape(
  url: string,
  options?: { signal?: AbortSignal; onProgress?: OnProgressCallback }
): Promise<string[]> {
  const result = await scrape(url, {
    extractFullContent: false,
    maxArticles: 100,
    qualityThreshold: 0,
    signal: options?.signal,
    onProgress: options?.onProgress
  });

  return result.articles.map(a => a.url);
}

/**
 * Create a scraper with default options
 * Useful for configuring once and reusing
 *
 * @example
 * ```typescript
 * const myScraper = createScraper({
 *   qualityThreshold: 0.7,
 *   maxArticles: 20,
 *   debug: true
 * });
 *
 * const result1 = await myScraper.scrape('https://site1.com/blog');
 * const result2 = await myScraper.scrape('https://site2.com/blog');
 * ```
 */
export function createScraper(defaultOptions: ScrapeOptions = {}) {
  return {
    scrape: (url: string, options?: ScrapeOptions) =>
      scrape(url, { ...defaultOptions, ...options }),

    quickScrape: (url: string, options?: { signal?: AbortSignal; onProgress?: OnProgressCallback }) =>
      quickScrape(url, { ...options })
  };
}
