/**
 * @package omniscraper SDK
 *
 * Intelligent web scraper for extracting blog/news content from any website.
 * Supports RSS feeds, sitemaps, and HTML scraping with automatic detection.
 *
 * @example
 * ```typescript
 * import { scrapeWebsite, extractArticle } from '@tyroneross/omniscraper';
 *
 * // Extract a single article directly
 * const article = await extractArticle('https://example.com/blog/my-post');
 * console.log(article.title, article.markdown);
 *
 * // Discover multiple articles from a site
 * const result = await scrapeWebsite('https://techcrunch.com');
 * console.log(result.articles);
 *
 * // Smart mode: auto-detects single article vs listing page
 * const result = await scrapeWebsite('https://example.com/blog/my-post', {
 *   maxArticles: 10,
 *   extractFullContent: true
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

// Page extractor (single web page support)
export { extractPage, type PageContent, type PageExtractOptions } from './parsers/page-extractor';

// Unified router (auto-detects input type and dispatches to correct parser)
export {
  parse,
  detectInputType,
  type InputType,
  type ParseResult,
  type OmniparseOptions
} from './router';

// ============================================================================
// Configuration & Utilities
// ============================================================================

/**
 * Global configuration for the scraper SDK
 */
let globalConfig = {
  quiet: false
};

/**
 * Set global SDK configuration
 *
 * @example
 * ```typescript
 * import { configure } from '@tyroneross/omniscraper';
 *
 * // Suppress all console output
 * configure({ quiet: true });
 * ```
 */
export function configure(options: { quiet?: boolean }) {
  if (options.quiet !== undefined) {
    globalConfig.quiet = options.quiet;
  }
}

/**
 * Check if SDK is in quiet mode
 */
export function isQuietMode(): boolean {
  return globalConfig.quiet;
}

/**
 * Validate URL format
 * @throws Error if URL is malformed
 */
function validateUrl(url: string): URL {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Invalid protocol: ${parsed.protocol}. Expected http: or https:`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid URL: "${url}". Expected format: https://example.com/path`);
    }
    throw error;
  }
}

// ============================================================================
// Type Exports (for TypeScript users)
// ============================================================================

/**
 * Options for scrapeWebsite function
 */
export interface ScrapeOptions {
  /** Maximum articles to return (default: 10) */
  maxArticles?: number;
  /** Extract full article content (default: true) */
  extractFullContent?: boolean;
  /** Minimum quality score 0-1 (default: 0.3) */
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
  /** Treat URL as a single article and extract directly (skips discovery) */
  singleArticle?: boolean;
  /** Suppress console output */
  quiet?: boolean;
}

/**
 * Result from scrapeWebsite function
 */
export interface ScrapeResult {
  url: string;
  detectedType: string;
  articles: Array<{
    url: string;
    title: string;
    publishedDate?: string;
    description?: string;
    fullContent?: string;
    fullContentMarkdown?: string;
    fullContentText?: string;
    confidence: number;
    source: string;
    qualityScore: number;
    metadata?: Record<string, any>;
  }>;
  stats: {
    totalDiscovered: number;
    afterQualityFilter: number;
    processingTime: number;
  };
  discoveredFeeds?: any[];
  discoveredSitemaps?: any[];
  errors?: string[];
}

// ============================================================================
// Main API
// ============================================================================

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
  options: ScrapeOptions = {}
): Promise<ScrapeResult> {
  // Validate URL early
  validateUrl(url);
  const { globalSourceOrchestrator } = await import('./source-orchestrator');
  const { calculateArticleQualityScore, DEFAULT_DENY_PATHS } = await import('./quality-scorer');
  const { convertToMarkdown } = await import('./formatters/html-to-markdown');
  const { cleanText, stripHTML } = await import('./formatters/text-cleaner');

  const {
    maxArticles = 10,
    extractFullContent = true,
    qualityThreshold = 0.3, // Lowered from 0.5 to avoid filtering out valid content
    sourceType = 'auto',
    allowPaths = [],
    denyPaths = DEFAULT_DENY_PATHS,
    onProgress,
    signal,
    singleArticle = false,
    quiet = globalConfig.quiet
  } = options;

  // Set quiet mode for this operation if specified
  const originalQuiet = globalConfig.quiet;
  if (quiet) globalConfig.quiet = true;

  // Check for cancellation
  if (signal?.aborted) {
    throw new Error('Operation cancelled');
  }

  // Single article mode: extract directly without discovery
  if (singleArticle) {
    const { globalContentExtractor } = await import('./web-scrapers/content-extractor');
    const startTime = Date.now();

    const extracted = await globalContentExtractor.extractContent(url);
    if (!extracted) {
      return {
        url,
        detectedType: 'single-article',
        articles: [],
        stats: {
          totalDiscovered: 0,
          afterQualityFilter: 0,
          processingTime: Date.now() - startTime
        },
        errors: ['Failed to extract content from URL']
      };
    }

    // Calculate quality score
    const qualityScore = calculateArticleQualityScore({
      title: extracted.title,
      excerpt: extracted.excerpt,
      content: extracted.content,
      textContent: extracted.textContent,
      publishedTime: extracted.publishedTime?.toISOString()
    });

    const article = {
      url: extracted.url,
      title: extracted.title,
      publishedDate: extracted.publishedTime?.toISOString(),
      description: extracted.excerpt,
      fullContent: extracted.content,
      fullContentMarkdown: convertToMarkdown(extracted.content),
      fullContentText: cleanText(stripHTML(extracted.content)),
      confidence: extracted.confidence,
      source: 'direct-extraction',
      qualityScore,
      metadata: {
        wordCount: extracted.wordCount,
        readingTime: extracted.readingTime,
        byline: extracted.byline,
        siteName: extracted.siteName,
        lang: extracted.lang,
        extractionMethod: extracted.extractionMethod
      }
    };

    return {
      url,
      detectedType: 'single-article',
      articles: [article],
      stats: {
        totalDiscovered: 1,
        afterQualityFilter: 1,
        processingTime: Date.now() - startTime
      },
      errors: []
    };
  }

  // Process source (discovery mode)
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

/**
 * URL patterns that indicate a single article (not a listing page)
 */
const ARTICLE_URL_PATTERNS = [
  // Date-based patterns: /2024/12/30/title, /2024/12/title, /2024/title
  /\/\d{4}\/\d{1,2}\/\d{1,2}\/[^/]+\/?$/,
  /\/\d{4}\/\d{1,2}\/[^/]+\/?$/,
  /\/\d{4}\/[^/]+\/?$/,

  // Slug patterns: /blog/my-article-slug, /news/article-title-here
  /\/(blog|news|articles?|posts?|stories?|insights?)\/[a-z0-9][-a-z0-9]{10,}[-a-z0-9]\/?$/i,

  // ID patterns: /article/12345, /p/abc123
  /\/(article|post|p|story)\/[a-z0-9]+\/?$/i,

  // WordPress-style: /my-article-title/ (long slug with hyphens)
  /\/[a-z0-9][-a-z0-9]{20,}\/?$/i,
];

/**
 * URL patterns that indicate a listing/index page
 */
const LISTING_URL_PATTERNS = [
  /^\/?$/,                           // Root
  /\/(blog|news|articles?)\/?\??$/i, // /blog, /news, /articles
  /\/page\/\d+\/?$/,                 // Pagination
  /\/category\/[^/]+\/?$/,           // Category pages
  /\/tag\/[^/]+\/?$/,                // Tag pages
  /\/author\/[^/]+\/?$/,             // Author pages
  /\/archive\/?$/,                   // Archive pages
  /\?.*page=/,                       // Query pagination
];

/**
 * Detect if a URL looks like a single article or a listing page
 */
function detectUrlType(url: string): 'article' | 'listing' | 'unknown' {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;

    // Check listing patterns first (more specific)
    for (const pattern of LISTING_URL_PATTERNS) {
      if (pattern.test(path)) {
        return 'listing';
      }
    }

    // Check article patterns
    for (const pattern of ARTICLE_URL_PATTERNS) {
      if (pattern.test(path)) {
        return 'article';
      }
    }

    // Heuristic: paths with 3+ segments ending in text are likely articles
    const segments = path.split('/').filter(Boolean);
    if (segments.length >= 2) {
      const lastSegment = segments[segments.length - 1];
      // Long slug with hyphens is likely an article
      if (lastSegment.length > 15 && lastSegment.includes('-') && !/^\d+$/.test(lastSegment)) {
        return 'article';
      }
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Single article extraction result with all content formats
 */
export interface SingleArticleResult {
  url: string;
  title: string;
  /** Raw HTML content */
  html: string;
  /** Markdown formatted content */
  markdown: string;
  /** Plain text content */
  text: string;
  /** Short excerpt/summary */
  excerpt: string;
  /** Author name if detected */
  author?: string;
  /** Publication date */
  publishedDate?: string;
  /** Site name */
  siteName?: string;
  /** Language code */
  lang?: string;
  /** Word count */
  wordCount: number;
  /** Estimated reading time in minutes */
  readingTime: number;
  /** Extraction confidence 0-1 */
  confidence: number;
  /** Extraction method used */
  extractionMethod: 'readability' | 'fallback' | 'structured';
  /** Structured data (JSON-LD, OpenGraph, etc.) */
  structured?: {
    jsonLd?: any;
    openGraph?: Record<string, string>;
    twitterCard?: Record<string, string>;
  };
}

/**
 * Extract content from a single article URL directly.
 *
 * Use this when you have a specific article URL and want to extract its content
 * without discovering other articles on the site.
 *
 * @param url - The article URL to extract
 * @returns Extracted article with HTML, Markdown, and text content
 *
 * @example
 * ```typescript
 * const article = await extractArticle('https://example.com/blog/my-post');
 *
 * console.log(article.title);      // "My Blog Post Title"
 * console.log(article.markdown);   // Full content in Markdown
 * console.log(article.text);       // Plain text content
 * console.log(article.wordCount);  // 1234
 * console.log(article.readingTime); // 6 minutes
 * ```
 */
export async function extractArticle(url: string): Promise<SingleArticleResult | null> {
  // Validate URL early
  validateUrl(url);

  const { globalContentExtractor } = await import('./web-scrapers/content-extractor');
  const { convertToMarkdown } = await import('./formatters/html-to-markdown');
  const { cleanText, stripHTML } = await import('./formatters/text-cleaner');

  const extracted = await globalContentExtractor.extractContent(url);

  if (!extracted) {
    return null;
  }

  return {
    url: extracted.url,
    title: extracted.title,
    html: extracted.content,
    markdown: convertToMarkdown(extracted.content),
    text: cleanText(stripHTML(extracted.content)),
    excerpt: extracted.excerpt || extracted.textContent.substring(0, 200) + '...',
    author: extracted.byline,
    publishedDate: extracted.publishedTime?.toISOString(),
    siteName: extracted.siteName,
    lang: extracted.lang,
    wordCount: extracted.wordCount,
    readingTime: extracted.readingTime,
    confidence: extracted.confidence,
    extractionMethod: extracted.extractionMethod,
    structured: extracted.structured ? {
      jsonLd: extracted.structured.jsonLd,
      openGraph: extracted.structured.openGraph,
      twitterCard: extracted.structured.twitterCard
    } : undefined
  };
}

/**
 * Smart scrape function that auto-detects single articles vs listing pages.
 *
 * - If URL looks like a single article → extracts that article directly
 * - If URL looks like a listing page → discovers articles via RSS/sitemap/HTML
 * - Use `forceMode` to override auto-detection
 *
 * @param url - Website or article URL
 * @param options - Scraping options
 * @returns Single article or list of discovered articles
 *
 * @example
 * ```typescript
 * // Auto-detect: this looks like an article, extracts directly
 * const result = await smartScrape('https://blog.example.com/2024/12/my-post');
 * if (result.mode === 'article') {
 *   console.log(result.article.title);
 * }
 *
 * // Auto-detect: this looks like a listing, discovers articles
 * const result = await smartScrape('https://blog.example.com/');
 * if (result.mode === 'listing') {
 *   console.log(result.articles.length);
 * }
 *
 * // Force article mode even if URL looks like listing
 * const result = await smartScrape(url, { forceMode: 'article' });
 * ```
 */
export async function smartScrape(
  url: string,
  options: {
    /** Force extraction mode: 'article' or 'listing' */
    forceMode?: 'article' | 'listing';
    /** Maximum articles for listing mode (default: 10) */
    maxArticles?: number;
    /** Minimum quality score 0-1 (default: 0.3) */
    qualityThreshold?: number;
    /** Source type for listing mode (default: 'auto') */
    sourceType?: 'auto' | 'rss' | 'sitemap' | 'html';
  } = {}
): Promise<
  | { mode: 'article'; article: SingleArticleResult; detectedAs: 'article' | 'listing' | 'unknown' }
  | { mode: 'listing'; articles: Awaited<ReturnType<typeof scrapeWebsite>>['articles']; stats: any; detectedAs: 'article' | 'listing' | 'unknown' }
  | { mode: 'failed'; error: string; detectedAs: 'article' | 'listing' | 'unknown' }
> {
  const {
    forceMode,
    maxArticles = 10,
    qualityThreshold = 0.3,
    sourceType = 'auto'
  } = options;

  const detectedType = detectUrlType(url);
  const mode = forceMode || (detectedType === 'article' ? 'article' : 'listing');

  if (mode === 'article') {
    const article = await extractArticle(url);
    if (article) {
      return { mode: 'article', article, detectedAs: detectedType };
    }
    // Fall back to listing mode if article extraction fails
    const result = await scrapeWebsite(url, { maxArticles, qualityThreshold, sourceType, extractFullContent: true });
    if (result.articles.length > 0) {
      return { mode: 'listing', articles: result.articles, stats: result.stats, detectedAs: detectedType };
    }
    return { mode: 'failed', error: 'Could not extract content from URL', detectedAs: detectedType };
  }

  // Listing mode
  const result = await scrapeWebsite(url, { maxArticles, qualityThreshold, sourceType, extractFullContent: true });
  return { mode: 'listing', articles: result.articles, stats: result.stats, detectedAs: detectedType };
}

/**
 * Check if a URL looks like a single article
 */
export function isArticleUrl(url: string): boolean {
  return detectUrlType(url) === 'article';
}

/**
 * Check if a URL looks like a listing/index page
 */
export function isListingUrl(url: string): boolean {
  return detectUrlType(url) === 'listing';
}
