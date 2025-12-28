/**
 * @package blog-content-scraper SDK
 *
 * Intelligent web scraper for extracting blog/news content from any website.
 * Supports RSS feeds, sitemaps, and HTML scraping with automatic detection.
 *
 * @example
 * ```typescript
 * import { scrapeWebsite, createRateLimiter } from 'blog-content-scraper';
 *
 * // Simple usage
 * const result = await scrapeWebsite('https://techcrunch.com');
 * console.log(result.articles);
 *
 * // With options
 * const result = await scrapeWebsite('https://example.com/blog', {
 *   maxArticles: 10,
 *   extractFullContent: true,
 *   qualityThreshold: 0.5
 * });
 * ```
 */

// Main orchestrator
export {
  globalSourceOrchestrator,
  SourceOrchestrator,
  CandidateArticleSchema,
  SourceConfigSchema
} from './source-orchestrator';

export type {
  CandidateArticle,
  SourceConfig,
  OrchestrationResult
} from './source-orchestrator';

// Rate limiter with presets
export {
  ScrapingRateLimiter,
  createRateLimiter,
  globalRateLimiter,
  RATE_LIMITER_PRESETS,
  type RateLimiterConfig,
  type RateLimiterPreset
} from './scraping-rate-limiter';

// Quality scoring
export {
  calculateArticleQualityScore,
  DEFAULT_QUALITY_CONFIG,
  DEFAULT_DENY_PATHS,
  DEFAULT_ALLOW_PATHS,
  isNonEnglishLocalePath
} from './quality-scorer';

// Circuit breaker for resilience
export {
  CircuitBreaker,
  circuitBreakers
} from './circuit-breaker';

// Types
export type {
  ScrapedArticle,
  ScraperTestResult,
  ScraperTestRequest,
  ProgressState,
  ProgressStage,
  QualityScoreConfig,
  ContentValidation,
  ExtractedContent,
  ScraperPlugin
} from './types';

// Formatters
export { convertToMarkdown } from './formatters/html-to-markdown';
export { cleanText, stripHTML } from './formatters/text-cleaner';

// Re-export scraper components for advanced usage
export { globalRSSDiscovery, type DiscoveredFeed } from './web-scrapers/rss-discovery';
export { globalSitemapParser, type SitemapEntry } from './web-scrapers/sitemap-parser';
export { HTMLScraper, type ExtractedArticle, type ScrapingConfig } from './web-scrapers/html-scraper';
export { ContentExtractor } from './web-scrapers/content-extractor';

/**
 * Simplified scraping function for common use cases
 *
 * @param url - Website URL to scrape
 * @param options - Scraping options
 * @returns Promise with scraped articles and metadata
 *
 * @example
 * ```typescript
 * const result = await scrapeWebsite('https://techcrunch.com', {
 *   maxArticles: 5,
 *   extractFullContent: true
 * });
 *
 * for (const article of result.articles) {
 *   console.log(article.title, article.url);
 * }
 * ```
 */
export async function scrapeWebsite(
  url: string,
  options: {
    /** Maximum articles to return (default: 10) */
    maxArticles?: number;
    /** Extract full article content (default: true) */
    extractFullContent?: boolean;
    /** Minimum quality score 0-1 (default: 0.5) */
    qualityThreshold?: number;
    /** Source type: 'auto' | 'rss' | 'sitemap' | 'html' (default: 'auto') */
    sourceType?: 'auto' | 'rss' | 'sitemap' | 'html';
    /** URL patterns to allow (e.g., ['/blog/*', '/news/*']) */
    allowPaths?: string[];
    /** URL patterns to deny (e.g., ['/about', '/careers/*']) */
    denyPaths?: string[];
    /** Progress callback for long-running operations */
    onProgress?: (completed: number, total: number) => void;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
  } = {}
) {
  const { globalSourceOrchestrator } = await import('./source-orchestrator');
  const { calculateArticleQualityScore, DEFAULT_DENY_PATHS } = await import('./quality-scorer');
  const { convertToMarkdown } = await import('./formatters/html-to-markdown');
  const { cleanText, stripHTML } = await import('./formatters/text-cleaner');

  const {
    maxArticles = 10,
    extractFullContent = true,
    qualityThreshold = 0.5,
    sourceType = 'auto',
    allowPaths = [],
    denyPaths = DEFAULT_DENY_PATHS,
    onProgress,
    signal
  } = options;

  // Check for cancellation
  if (signal?.aborted) {
    throw new Error('Operation cancelled');
  }

  // Process source
  const result = await globalSourceOrchestrator.processSource(url, {
    sourceType,
    allowPaths,
    denyPaths,
    detectOnly: false
  });

  // Check for cancellation
  if (signal?.aborted) {
    throw new Error('Operation cancelled');
  }

  // Enhance with full content if requested
  let articles = result.articles.slice(0, maxArticles);

  if (extractFullContent && articles.length > 0) {
    articles = await globalSourceOrchestrator.enhanceWithFullContent(
      articles,
      maxArticles,
      { onProgress }
    );
  }

  // Calculate quality scores and format output
  const scoredArticles = articles.map(article => {
    const extracted = {
      title: article.title,
      excerpt: article.excerpt,
      content: article.content,
      textContent: article.content || '',
      publishedTime: article.publishedAt.toISOString()
    };

    const qualityScore = calculateArticleQualityScore(extracted);
    const fullContent = extractFullContent ? article.content : undefined;

    return {
      url: article.url,
      title: article.title,
      publishedDate: article.publishedAt.toISOString(),
      description: article.excerpt,
      fullContent,
      fullContentMarkdown: fullContent ? convertToMarkdown(fullContent) : undefined,
      fullContentText: fullContent ? cleanText(stripHTML(fullContent)) : undefined,
      confidence: article.confidence,
      source: article.source,
      qualityScore,
      metadata: article.metadata
    };
  });

  // Filter by quality threshold
  const filteredArticles = scoredArticles.filter(a => a.qualityScore >= qualityThreshold);

  return {
    url,
    detectedType: result.sourceInfo.detectedType,
    articles: filteredArticles,
    stats: {
      totalDiscovered: result.articles.length,
      afterQualityFilter: filteredArticles.length,
      processingTime: result.processingTime
    },
    discoveredFeeds: result.sourceInfo.discoveredFeeds,
    discoveredSitemaps: result.sourceInfo.discoveredSitemaps,
    errors: result.errors
  };
}
