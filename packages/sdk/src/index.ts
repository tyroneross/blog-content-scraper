/**
 * @tyroneross/blog-scraper
 *
 * A powerful web scraping SDK for extracting blog articles and content.
 * No LLM required - uses Mozilla Readability and intelligent quality scoring.
 *
 * @example Simple usage
 * ```typescript
 * import { scrape } from '@tyroneross/blog-scraper';
 *
 * const result = await scrape('https://example.com/blog');
 * console.log(`Found ${result.articles.length} articles`);
 * ```
 *
 * @example Advanced usage with custom components
 * ```typescript
 * import { ContentExtractor, QualityScorer } from '@tyroneross/blog-scraper';
 *
 * const extractor = new ContentExtractor();
 * const content = await extractor.extractContent(url);
 * ```
 */

// ============================================================================
// HIGH-LEVEL API (Recommended for most users)
// ============================================================================

export { scrape, quickScrape, createScraper, type ScrapeOptions } from './scraper';

// ============================================================================
// MODULAR COMPONENTS (For advanced users who need granular control)
// ============================================================================

// Orchestration
export {
  SourceOrchestrator,
  globalSourceOrchestrator,
  type SourceConfig,
  type CandidateArticle,
  type OrchestrationResult
} from './orchestrator/source-orchestrator';

// Content Extractors
export {
  ContentExtractor,
  globalContentExtractor,
  type ExtractedContent as ExtractorExtractedContent
} from './extractors/content-extractor';

export {
  HTMLScraper,
  type ExtractedArticle,
  type ScrapingConfig
} from './extractors/html-scraper';

export {
  RSSDiscovery,
  globalRSSDiscovery,
  type DiscoveredFeed
} from './extractors/rss-discovery';

export {
  SitemapParser,
  globalSitemapParser,
  type SitemapEntry
} from './extractors/sitemap-parser';

export {
  RobotsChecker,
  globalRobotsChecker
} from './extractors/robots-checker';

// Quality Scoring
export {
  calculateArticleQualityScore,
  validateContent,
  shouldDenyUrl,
  getQualityBreakdown,
  DEFAULT_QUALITY_CONFIG,
  DEFAULT_DENY_PATHS
} from './quality/quality-scorer';

// Utilities
export {
  CircuitBreaker,
  circuitBreakers
} from './utils/circuit-breaker';

export {
  ScrapingRateLimiter,
  globalRateLimiter
} from './utils/scraping-rate-limiter';

export {
  fetchRSSFeed,
  type RSSItem
} from './utils/rss-utils';

// Formatters
export {
  convertToMarkdown,
  htmlToMarkdown,
  stripNonArticleContent
} from './formatters/html-to-markdown';

export {
  cleanText,
  decodeHTMLEntities,
  normalizeWhitespace,
  detectParagraphs,
  removeUrls,
  truncateText,
  stripHTML
} from './formatters/text-cleaner';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type {
  ScrapedArticle,
  ScraperTestResult,
  ScraperTestRequest,
  ScraperTestProps,
  ScraperResultsProps,
  ScraperPlugin,
  QualityScoreConfig,
  ContentValidation,
  ExtractedContent,
  // Progress tracking types
  ScrapePhase,
  ScrapeProgress,
  OnProgressCallback
} from './types';

// ============================================================================
// ERROR CLASSES
// ============================================================================

export {
  ScraperError,
  RequestTimeoutError,
  RequestAbortedError,
  RateLimitError,
  RobotsBlockedError,
  ContentExtractionError,
  NoContentFoundError,
  InvalidUrlError,
  CircuitOpenError,
  isScraperError,
  isAbortError
} from './errors';

// ============================================================================
// VERSION
// ============================================================================

export const VERSION = '0.2.0';
