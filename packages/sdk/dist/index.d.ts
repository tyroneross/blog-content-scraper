import { z } from 'zod';

/**
 * @package @tyroneross/scraper-testing
 * Core types for web scraper testing
 */
interface ScrapedArticle {
    url: string;
    title: string;
    publishedDate?: Date | string;
    description?: string;
    fullContent?: string;
    fullContentMarkdown?: string;
    fullContentText?: string;
    confidence: number;
    source: 'link-text' | 'meta-data' | 'structured-data';
    qualityScore?: number;
    metadata?: Record<string, any>;
}
interface ScraperTestResult {
    url: string;
    detectedType: 'rss' | 'sitemap' | 'html' | 'unknown';
    confidence: 'high' | 'medium' | 'low';
    articles: ScrapedArticle[];
    extractionStats: {
        attempted: number;
        successful: number;
        failed: number;
        filtered: number;
        totalDiscovered?: number;
        afterDenyFilter?: number;
        afterContentValidation?: number;
        afterQualityFilter?: number;
    };
    processingTime: number;
    errors: string[];
    timestamp: string;
}
interface ScraperTestRequest {
    url: string;
    sourceType?: 'auto' | 'rss' | 'sitemap' | 'html';
    maxArticles?: number;
    extractFullContent?: boolean;
    denyPaths?: string[];
    qualityThreshold?: number;
}
interface ScraperTestProps {
    onTestComplete?: (result: ScraperTestResult) => void;
    onTestStart?: (url: string) => void;
    onError?: (error: Error) => void;
    className?: string;
    defaultUrl?: string;
    plugins?: ScraperPlugin[];
}
interface ScraperResultsProps {
    result: ScraperTestResult | null;
    loading?: boolean;
    error?: string | null;
    className?: string;
}
/**
 * Plugin system for extending scraper functionality
 * Allows users to add their own LLM-based enhancements
 */
interface ScraperPlugin {
    name: string;
    version: string;
    /**
     * Called before scraping starts
     * Useful for validation, rate limiting, or pre-processing
     */
    beforeScrape?: (url: string) => Promise<void>;
    /**
     * Called after all articles are scraped
     * Useful for batch processing or re-ranking
     */
    afterScrape?: (articles: ScrapedArticle[]) => Promise<ScrapedArticle[]>;
    /**
     * Called for each article individually
     * Useful for adding AI-based quality scores or classifications
     */
    enhanceArticle?: (article: ScrapedArticle) => Promise<ScrapedArticle>;
    /**
     * Called to determine if an article should be filtered out
     * Return true to keep the article, false to filter it out
     */
    filterArticle?: (article: ScrapedArticle) => Promise<boolean>;
}
/**
 * Quality scoring configuration
 */
interface QualityScoreConfig {
    contentWeight?: number;
    dateWeight?: number;
    authorWeight?: number;
    schemaWeight?: number;
    readingTimeWeight?: number;
    threshold?: number;
}
/**
 * Content validation result
 */
interface ContentValidation {
    isValid: boolean;
    score: number;
    reasons: string[];
}
/**
 * Extracted content structure
 */
interface ExtractedContent$1 {
    title?: string;
    byline?: string;
    content?: string;
    textContent?: string;
    length?: number;
    excerpt?: string;
    siteName?: string;
    publishedTime?: Date | string;
    lang?: string;
    readingTime?: number;
    structured?: {
        jsonLd?: any;
        openGraph?: Record<string, string>;
        twitter?: Record<string, string>;
    };
}
/**
 * Progress phases during scraping
 */
type ScrapePhase = 'initializing' | 'detecting' | 'discovering' | 'filtering' | 'extracting' | 'scoring' | 'complete' | 'error';
/**
 * Progress status reported during scraping
 */
interface ScrapeProgress {
    /** Current phase of the scraping process */
    phase: ScrapePhase;
    /** Human-readable status message */
    message: string;
    /** Current item being processed (1-indexed) */
    current?: number;
    /** Total items to process */
    total?: number;
    /** Percentage complete (0-100) */
    percent?: number;
    /** Articles found so far */
    articlesFound?: number;
    /** Current URL being processed */
    currentUrl?: string;
    /** Detected source type */
    detectedType?: 'rss' | 'sitemap' | 'html';
    /** Elapsed time in milliseconds */
    elapsedMs?: number;
}
/**
 * Callback function for progress updates
 */
type OnProgressCallback = (progress: ScrapeProgress) => void;

/**
 * @package @tyroneross/blog-scraper
 * High-level API for easy scraping
 *
 * Features:
 * - Progress callbacks for real-time status updates
 * - AbortSignal support for cancellation
 * - Typed errors for better error handling
 */

/**
 * Options for the scrape function
 */
interface ScrapeOptions {
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
declare function scrape(url: string, options?: ScrapeOptions): Promise<ScraperTestResult>;
/**
 * Quick scrape - returns just the article URLs and titles (fast)
 *
 * @example
 * ```typescript
 * const urls = await quickScrape('https://example.com/blog');
 * console.log(urls); // ['url1', 'url2', ...]
 * ```
 */
declare function quickScrape(url: string, options?: {
    signal?: AbortSignal;
    onProgress?: OnProgressCallback;
}): Promise<string[]>;
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
declare function createScraper(defaultOptions?: ScrapeOptions): {
    scrape: (url: string, options?: ScrapeOptions) => Promise<ScraperTestResult>;
    quickScrape: (url: string, options?: {
        signal?: AbortSignal;
        onProgress?: OnProgressCallback;
    }) => Promise<string[]>;
};

interface DiscoveredFeed {
    url: string;
    title?: string;
    type: 'rss' | 'atom' | 'rdf';
    source: 'link-tag' | 'common-path' | 'content-scan';
    confidence: number;
}
declare class RSSDiscovery {
    private readonly userAgent;
    private readonly timeout;
    /**
     * Discover RSS feeds from a given URL
     */
    discoverFeeds(url: string): Promise<DiscoveredFeed[]>;
    /**
     * Check if the URL itself is a direct feed
     */
    private checkDirectFeed;
    /**
     * Fetch HTML page content
     */
    private fetchPage;
    /**
     * Extract feed URLs from HTML link tags
     */
    private extractFeedsFromHTML;
    /**
     * Check common feed paths
     */
    private checkCommonPaths;
    /**
     * Scan HTML content for feed-like patterns
     */
    private scanForFeedContent;
    /**
     * Validate if a URL is actually a feed
     */
    private validateFeedUrl;
    /**
     * Resolve relative URLs to absolute URLs
     */
    private resolveUrl;
    /**
     * Check if content type indicates a feed
     */
    private isFeedContentType;
    /**
     * Determine feed type from content type
     */
    private determineFeedType;
    /**
     * Guess feed type from URL or text
     */
    private guessFeedType;
    /**
     * Check if a link looks like it could be a feed
     */
    private isFeedLikeLink;
}
declare const globalRSSDiscovery: RSSDiscovery;

declare const CandidateArticleSchema: z.ZodObject<{
    url: z.ZodString;
    title: z.ZodString;
    publishedAt: z.ZodDate;
    content: z.ZodOptional<z.ZodString>;
    excerpt: z.ZodOptional<z.ZodString>;
    guid: z.ZodString;
    confidence: z.ZodNumber;
    source: z.ZodEnum<["rss", "sitemap", "html", "discovery"]>;
    extractionMethod: z.ZodEnum<["rss", "sitemap", "html-links", "content-extraction"]>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    url: string;
    source: "sitemap" | "rss" | "html" | "discovery";
    confidence: number;
    title: string;
    extractionMethod: "sitemap" | "rss" | "html-links" | "content-extraction";
    publishedAt: Date;
    guid: string;
    content?: string | undefined;
    excerpt?: string | undefined;
    metadata?: Record<string, any> | undefined;
}, {
    url: string;
    source: "sitemap" | "rss" | "html" | "discovery";
    confidence: number;
    title: string;
    extractionMethod: "sitemap" | "rss" | "html-links" | "content-extraction";
    publishedAt: Date;
    guid: string;
    content?: string | undefined;
    excerpt?: string | undefined;
    metadata?: Record<string, any> | undefined;
}>;
type CandidateArticle = z.infer<typeof CandidateArticleSchema>;
declare const SourceConfigSchema: z.ZodObject<{
    sourceType: z.ZodEnum<["rss", "sitemap", "html", "auto"]>;
    allowPaths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    denyPaths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    maxDepth: z.ZodOptional<z.ZodNumber>;
    detectOnly: z.ZodOptional<z.ZodBoolean>;
    scrapeConfig: z.ZodOptional<z.ZodObject<{
        selectors: z.ZodOptional<z.ZodObject<{
            articleLinks: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            titleSelectors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            dateSelectors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            excludeSelectors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            excludeSelectors?: string[] | undefined;
            articleLinks?: string[] | undefined;
            titleSelectors?: string[] | undefined;
            dateSelectors?: string[] | undefined;
        }, {
            excludeSelectors?: string[] | undefined;
            articleLinks?: string[] | undefined;
            titleSelectors?: string[] | undefined;
            dateSelectors?: string[] | undefined;
        }>>;
        filters: z.ZodOptional<z.ZodObject<{
            minTitleLength: z.ZodOptional<z.ZodNumber>;
            maxTitleLength: z.ZodOptional<z.ZodNumber>;
            includePatterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            excludePatterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            minTitleLength?: number | undefined;
            maxTitleLength?: number | undefined;
            excludePatterns?: string[] | undefined;
            includePatterns?: string[] | undefined;
        }, {
            minTitleLength?: number | undefined;
            maxTitleLength?: number | undefined;
            excludePatterns?: string[] | undefined;
            includePatterns?: string[] | undefined;
        }>>;
        limits: z.ZodOptional<z.ZodObject<{
            maxLinksPerPage: z.ZodOptional<z.ZodNumber>;
            maxPages: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            maxLinksPerPage?: number | undefined;
            maxPages?: number | undefined;
        }, {
            maxLinksPerPage?: number | undefined;
            maxPages?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        filters?: {
            minTitleLength?: number | undefined;
            maxTitleLength?: number | undefined;
            excludePatterns?: string[] | undefined;
            includePatterns?: string[] | undefined;
        } | undefined;
        selectors?: {
            excludeSelectors?: string[] | undefined;
            articleLinks?: string[] | undefined;
            titleSelectors?: string[] | undefined;
            dateSelectors?: string[] | undefined;
        } | undefined;
        limits?: {
            maxLinksPerPage?: number | undefined;
            maxPages?: number | undefined;
        } | undefined;
    }, {
        filters?: {
            minTitleLength?: number | undefined;
            maxTitleLength?: number | undefined;
            excludePatterns?: string[] | undefined;
            includePatterns?: string[] | undefined;
        } | undefined;
        selectors?: {
            excludeSelectors?: string[] | undefined;
            articleLinks?: string[] | undefined;
            titleSelectors?: string[] | undefined;
            dateSelectors?: string[] | undefined;
        } | undefined;
        limits?: {
            maxLinksPerPage?: number | undefined;
            maxPages?: number | undefined;
        } | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    sourceType: "sitemap" | "rss" | "html" | "auto";
    maxDepth?: number | undefined;
    allowPaths?: string[] | undefined;
    denyPaths?: string[] | undefined;
    detectOnly?: boolean | undefined;
    scrapeConfig?: {
        filters?: {
            minTitleLength?: number | undefined;
            maxTitleLength?: number | undefined;
            excludePatterns?: string[] | undefined;
            includePatterns?: string[] | undefined;
        } | undefined;
        selectors?: {
            excludeSelectors?: string[] | undefined;
            articleLinks?: string[] | undefined;
            titleSelectors?: string[] | undefined;
            dateSelectors?: string[] | undefined;
        } | undefined;
        limits?: {
            maxLinksPerPage?: number | undefined;
            maxPages?: number | undefined;
        } | undefined;
    } | undefined;
}, {
    sourceType: "sitemap" | "rss" | "html" | "auto";
    maxDepth?: number | undefined;
    allowPaths?: string[] | undefined;
    denyPaths?: string[] | undefined;
    detectOnly?: boolean | undefined;
    scrapeConfig?: {
        filters?: {
            minTitleLength?: number | undefined;
            maxTitleLength?: number | undefined;
            excludePatterns?: string[] | undefined;
            includePatterns?: string[] | undefined;
        } | undefined;
        selectors?: {
            excludeSelectors?: string[] | undefined;
            articleLinks?: string[] | undefined;
            titleSelectors?: string[] | undefined;
            dateSelectors?: string[] | undefined;
        } | undefined;
        limits?: {
            maxLinksPerPage?: number | undefined;
            maxPages?: number | undefined;
        } | undefined;
    } | undefined;
}>;
type SourceConfig = z.infer<typeof SourceConfigSchema> & {
    circuitBreaker?: {
        execute<T>(operation: () => Promise<T>): Promise<T>;
    };
};
interface OrchestrationResult {
    articles: CandidateArticle[];
    sourceInfo: {
        detectedType: 'rss' | 'sitemap' | 'html';
        discoveredFeeds?: DiscoveredFeed[];
        discoveredSitemaps?: string[];
        extractionStats: {
            attempted: number;
            successful: number;
            failed: number;
            filtered: number;
        };
    };
    processingTime: number;
    errors: string[];
}
declare class SourceOrchestrator {
    private readonly maxArticlesPerSource;
    /**
     * Main orchestration method - determines source type and extracts content
     */
    processSource(url: string, config?: SourceConfig): Promise<OrchestrationResult>;
    /**
     * Auto-detect source type and process accordingly
     */
    private autoDetectAndProcess;
    /**
     * Process source with known type
     */
    private processKnownType;
    /**
     * Process URL as RSS feed
     */
    private processAsRSS;
    /**
     * Process URL as sitemap
     */
    private processAsSitemap;
    /**
     * Process URL as HTML page
     */
    private processAsHTML;
    /**
     * Apply path filtering based on allowPaths and denyPaths
     */
    private applyPathFilters;
    /**
     * Check if a path matches a pattern (supports wildcards)
     */
    private matchesPattern;
    /**
     * Build scraping configuration from source config
     */
    private buildScrapingConfig;
    /**
     * Extract title from URL as fallback
     */
    private extractTitleFromUrl;
    /**
     * Create a consistent GUID for an article
     */
    private createGuid;
    /**
     * Finalize processing result
     */
    private finalizeResult;
    /**
     * Extract full content for articles (optional enhancement step)
     */
    enhanceWithFullContent(articles: CandidateArticle[], maxArticles?: number): Promise<CandidateArticle[]>;
    /**
     * Validate orchestrator configuration
     */
    static validateConfig(config: any): SourceConfig;
    /**
     * Get source statistics
     */
    getSourceStats(url: string): Promise<{
        robotsCompliant: boolean;
        hasRSSFeed: boolean;
        hasSitemap: boolean;
        detectedType: string;
        estimatedArticleCount: number;
    }>;
}
declare const globalSourceOrchestrator: SourceOrchestrator;

interface ExtractedContent {
    url: string;
    title: string;
    content: string;
    textContent: string;
    excerpt?: string;
    byline?: string;
    publishedTime?: Date;
    siteName?: string;
    lang?: string;
    structured?: {
        jsonLd?: any;
        openGraph?: Record<string, string>;
        twitterCard?: Record<string, string>;
        microdata?: any[];
    };
    wordCount: number;
    readingTime: number;
    confidence: number;
    extractionMethod: 'readability' | 'fallback' | 'structured';
    extractedAt: Date;
    errors?: string[];
}
declare class ContentExtractor {
    private readonly userAgent;
    private readonly timeout;
    private readonly maxContentSize;
    private readonly minContentLength;
    private readonly wordsPerMinute;
    private readonly ssrfProtection;
    constructor();
    /**
     * Extract content from a URL
     */
    extractContent(url: string): Promise<ExtractedContent | null>;
    /**
     * Extract content from multiple URLs
     */
    extractBatch(urls: string[]): Promise<(ExtractedContent | null)[]>;
    private fetchContent;
    private extractFromHTML;
    private extractWithReadability;
    private extractWithFallback;
    private extractStructuredData;
    private extractPublishedTime;
    private extractSiteName;
    private extractLanguage;
    private countWords;
    /**
     * Validate extracted content quality
     */
    validateContent(content: ExtractedContent): {
        isValid: boolean;
        issues: string[];
        score: number;
    };
}
declare const globalContentExtractor: ContentExtractor;

declare const PERPLEXITY_MODELS: {
    readonly SONAR: "llama-3.1-sonar-small-128k-online";
    readonly SONAR_PRO: "llama-3.1-sonar-large-128k-online";
};
interface ScrapingConfig {
    selectors?: {
        articleLinks?: string[];
        titleSelectors?: string[];
        dateSelectors?: string[];
        excludeSelectors?: string[];
    };
    filters?: {
        minTitleLength?: number;
        maxTitleLength?: number;
        includePatterns?: RegExp[];
        excludePatterns?: RegExp[];
        allowedDomains?: string[];
    };
    limits?: {
        maxLinksPerPage?: number;
        maxDepth?: number;
    };
    perplexityFallback?: {
        enabled?: boolean;
        model?: typeof PERPLEXITY_MODELS[keyof typeof PERPLEXITY_MODELS];
        useForRobotsBlocked?: boolean;
        useForParseFailed?: boolean;
        searchRecency?: 'hour' | 'day' | 'week' | 'month';
    };
}
interface ExtractedArticle {
    url: string;
    title?: string;
    publishedDate?: Date;
    description?: string;
    confidence: number;
    source: 'link-text' | 'meta-data' | 'structured-data';
}
declare class HTMLScraper {
    private readonly userAgent;
    private readonly timeout;
    private readonly defaultConfig;
    /**
     * Extract article links from a webpage
     */
    extractArticleLinks(url: string, config?: ScrapingConfig): Promise<ExtractedArticle[]>;
    /**
     * Extract articles from multiple pages with pagination support
     */
    extractFromMultiplePages(startUrl: string, config?: ScrapingConfig, options?: {
        maxPages?: number;
        paginationSelector?: string;
        nextPagePatterns?: RegExp[];
    }): Promise<ExtractedArticle[]>;
    private fetchPage;
    private parseArticleLinks;
    private extractArticleInfo;
    private extractStructuredData;
    private findNextPageUrls;
    private deduplicateArticles;
    private passesFilters;
    private isLikelyArticleUrl;
    private parseDate;
    private resolveUrl;
    private mergeConfig;
    /**
     * Use Perplexity API to extract articles when traditional scraping fails
     * Requires PERPLEXITY_API_KEY environment variable to be set
     */
    private extractWithPerplexity;
}

interface SitemapEntry {
    url: string;
    lastmod?: Date;
    changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
    priority?: number;
    images?: SitemapImage[];
    news?: SitemapNews;
}
interface SitemapImage {
    loc: string;
    caption?: string;
    title?: string;
}
interface SitemapNews {
    title: string;
    publishedDate?: Date;
    keywords?: string[];
}
declare class SitemapParser {
    private readonly userAgent;
    private readonly timeout;
    private readonly maxSitemapSize;
    private readonly maxEntries;
    private readonly recentTimeframe;
    /**
     * Parse sitemap from URL and return entries
     */
    parseSitemap(url: string, options?: {
        filterRecent?: boolean;
        maxEntries?: number;
        includeImages?: boolean;
        includeNews?: boolean;
    }): Promise<SitemapEntry[]>;
    /**
     * Discover sitemaps from domain
     */
    discoverSitemaps(domain: string): Promise<string[]>;
    /**
     * Get recent entries from all sitemaps for a domain
     */
    getRecentEntries(domain: string, options?: {
        hoursBack?: number;
        maxEntries?: number;
    }): Promise<SitemapEntry[]>;
    private fetchSitemap;
    private checkSitemapExists;
    private isSitemapIndex;
    private parseSitemapIndex;
    private parseRegularSitemap;
    /**
     * Validate sitemap format
     */
    validateSitemapFormat(xml: string): {
        valid: boolean;
        errors: string[];
    };
}
declare const globalSitemapParser: SitemapParser;

declare class RobotsChecker {
    private cache;
    private readonly cacheTimeout;
    private readonly userAgent;
    private readonly requestTimeout;
    /**
     * Check if a URL is allowed to be crawled according to robots.txt
     */
    isAllowed(url: string): Promise<{
        allowed: boolean;
        crawlDelay?: number;
        sitemaps: string[];
        reason?: string;
    }>;
    /**
     * Get sitemaps listed in robots.txt for a domain
     */
    getSitemaps(domain: string): Promise<string[]>;
    /**
     * Get the recommended crawl delay for a domain
     */
    getCrawlDelay(domain: string): Promise<number | undefined>;
    private getRobotsTxt;
    private parseRobotsTxt;
    private completeRule;
    private checkRules;
    private findBestMatchingRule;
    private matchesPattern;
    clearCache(): void;
    getCacheStats(): {
        size: number;
        entries: {
            url: string;
            fetchedAt: string;
            expiresAt: string;
            rulesCount: number;
            sitemapsCount: number;
        }[];
    };
}
declare const globalRobotsChecker: RobotsChecker;

/**
 * @package @tyroneross/scraper-testing
 * Article quality scoring system
 *
 * No LLM required - uses metadata and content signals to determine article quality
 */

/**
 * Default quality score configuration
 * These weights were optimized through testing with 1,788 real articles
 */
declare const DEFAULT_QUALITY_CONFIG: Required<QualityScoreConfig>;
/**
 * Default patterns to block non-article pages
 * These cover common non-article paths across websites
 */
declare const DEFAULT_DENY_PATHS: string[];
/**
 * Validate content quality (Tier 2 filtering)
 * Checks length, title quality, and text-to-HTML ratio
 *
 * @param extracted - Extracted content from article
 * @returns Validation result with score and reasons
 */
declare function validateContent(extracted: ExtractedContent$1): ContentValidation;
/**
 * Calculate article quality score (Tier 3 filtering)
 *
 * Score breakdown:
 * - Content validation (60%): Length, title quality, text-to-HTML ratio
 * - Publication date (12%): Articles should have timestamps
 * - Author/byline (8%): Professional articles cite authors
 * - Schema.org metadata (8%): Structured data indicates article pages
 * - Reading time (12%): Substantial content (2+ min read)
 *
 * @param extracted - Extracted content from article
 * @param config - Optional quality score configuration
 * @returns Quality score between 0-1
 */
declare function calculateArticleQualityScore(extracted: ExtractedContent$1, config?: QualityScoreConfig): number;
/**
 * Check if a URL should be denied based on path patterns
 *
 * @param url - URL to check
 * @param denyPaths - Patterns to deny (supports wildcards with *)
 * @returns True if URL should be denied
 */
declare function shouldDenyUrl(url: string, denyPaths?: string[]): boolean;
/**
 * Get quality score breakdown for debugging
 * Useful for understanding why an article scored a certain way
 *
 * @param extracted - Extracted content from article
 * @param config - Optional quality score configuration
 * @returns Breakdown of quality score components
 */
declare function getQualityBreakdown(extracted: ExtractedContent$1, config?: QualityScoreConfig): {
    contentValidation: number;
    publishedDate: number;
    author: number;
    schema: number;
    readingTime: number;
    total: number;
    passesThreshold: boolean;
};

interface CircuitBreakerOptions {
    failureThreshold: number;
    timeout: number;
    resetTimeout: number;
    name: string;
}
declare class CircuitBreaker {
    private failures;
    private lastFailureTime;
    private state;
    private options;
    constructor(options: CircuitBreakerOptions);
    execute<T>(operation: () => Promise<T>): Promise<T>;
    private executeWithTimeout;
    private onSuccess;
    private onFailure;
    getState(): {
        state: "CLOSED" | "OPEN" | "HALF_OPEN";
        failures: number;
        lastFailureTime: number;
    };
}
declare const circuitBreakers: {
    rss: CircuitBreaker;
    scraping: CircuitBreaker;
    scrapingTest: CircuitBreaker;
};

declare class ScrapingRateLimiter {
    private hosts;
    private readonly baseDelay;
    private readonly maxBackoff;
    private readonly maxConcurrent;
    private activeRequests;
    constructor(options?: {
        requestsPerSecond?: number;
        maxBackoff?: number;
        maxConcurrent?: number;
    });
    execute<T>(url: string, operation: () => Promise<T>, options?: {
        priority?: number;
        maxRetries?: number;
    }): Promise<T>;
    private extractHost;
    private enqueueRequest;
    private processQueue;
    private handleRequestError;
    private shouldRetry;
    private shouldBackoff;
    private wait;
    getStats(): Record<string, any>;
}
declare const globalRateLimiter: ScrapingRateLimiter;

interface RSSItem {
    title: string;
    link: string;
    pubDate: string;
    guid: string;
    content?: string;
    contentSnippet?: string;
}
declare function fetchRSSFeed(url: string, _sourceId?: string): Promise<RSSItem[]>;

/**
 * Convert HTML to clean Markdown
 * - Preserves headings, bold, lists, links, code blocks
 * - Strips navigation, forms, UI elements
 * - Smart paragraph detection
 */
declare function htmlToMarkdown(html: string): string;
/**
 * Strip non-article content from HTML before conversion
 * Removes navigation, forms, UI elements
 */
declare function stripNonArticleContent(html: string): string;
/**
 * Convert HTML to Markdown with full cleaning
 * This is the main function developers should use
 */
declare function convertToMarkdown(html: string, options?: {
    cleanNonArticle?: boolean;
    smartParagraphs?: boolean;
}): string;

/**
 * Text cleanup utilities
 * Normalize whitespace, remove excessive line breaks, clean HTML entities
 */
/**
 * Clean text content
 * - Normalize whitespace between paragraphs
 * - Remove excessive line breaks
 * - Decode HTML entities
 * - Trim redundant spaces
 */
declare function cleanText(text: string): string;
/**
 * Decode HTML entities (&nbsp;, &amp;, etc.)
 */
declare function decodeHTMLEntities(text: string): string;
/**
 * Normalize whitespace
 * - Replace multiple spaces with single space
 * - Replace tabs with spaces
 * - Remove trailing/leading whitespace from lines
 */
declare function normalizeWhitespace(text: string): string;
/**
 * Detect paragraph boundaries and add proper spacing
 * Looks for sentence endings followed by capital letters
 */
declare function detectParagraphs(text: string): string;
/**
 * Remove URLs from text
 * Useful for cleaning up citations or references
 */
declare function removeUrls(text: string): string;
/**
 * Truncate text to a maximum length
 * Breaks at word boundaries and adds ellipsis
 */
declare function truncateText(text: string, maxLength: number): string;
/**
 * Extract plain text from HTML
 * Quick and dirty HTML stripping
 */
declare function stripHTML(html: string): string;

/**
 * @package @tyroneross/blog-scraper
 * Typed error classes for better error handling
 *
 * Based on Azure SDK TypeScript guidelines:
 * https://azure.github.io/azure-sdk/typescript_design.html
 */
/**
 * Base error class for all scraper errors
 */
declare class ScraperError extends Error {
    /** Error code for programmatic handling */
    readonly code: string;
    /** Original error that caused this error */
    readonly cause?: Error;
    /** URL being scraped when error occurred */
    readonly url?: string;
    constructor(message: string, options?: {
        code?: string;
        cause?: Error;
        url?: string;
    });
}
/**
 * Thrown when a request times out
 */
declare class RequestTimeoutError extends ScraperError {
    /** Timeout duration in milliseconds */
    readonly timeout: number;
    constructor(message: string, options: {
        timeout: number;
        url?: string;
        cause?: Error;
    });
}
/**
 * Thrown when a request is aborted via AbortSignal
 */
declare class RequestAbortedError extends ScraperError {
    constructor(message?: string, options?: {
        url?: string;
    });
}
/**
 * Thrown when rate limit is exceeded
 */
declare class RateLimitError extends ScraperError {
    /** Time to wait before retrying (ms) */
    readonly retryAfter?: number;
    /** Host that rate limited the request */
    readonly host: string;
    constructor(message: string, options: {
        host: string;
        retryAfter?: number;
        url?: string;
    });
}
/**
 * Thrown when robots.txt disallows crawling
 */
declare class RobotsBlockedError extends ScraperError {
    /** The disallowed path */
    readonly disallowedPath: string;
    constructor(message: string, options: {
        url: string;
        disallowedPath: string;
    });
}
/**
 * Thrown when content extraction fails
 */
declare class ContentExtractionError extends ScraperError {
    /** The extraction phase that failed */
    readonly phase: 'fetch' | 'parse' | 'extract' | 'convert';
    constructor(message: string, options: {
        url: string;
        phase: 'fetch' | 'parse' | 'extract' | 'convert';
        cause?: Error;
    });
}
/**
 * Thrown when no content sources are found
 */
declare class NoContentFoundError extends ScraperError {
    /** Sources that were tried */
    readonly triedSources: ('rss' | 'sitemap' | 'html')[];
    constructor(message: string, options: {
        url: string;
        triedSources: ('rss' | 'sitemap' | 'html')[];
    });
}
/**
 * Thrown when URL is invalid or inaccessible
 */
declare class InvalidUrlError extends ScraperError {
    /** HTTP status code if applicable */
    readonly statusCode?: number;
    constructor(message: string, options: {
        url: string;
        statusCode?: number;
        cause?: Error;
    });
}
/**
 * Thrown when circuit breaker is open (too many failures)
 */
declare class CircuitOpenError extends ScraperError {
    /** When the circuit breaker will reset */
    readonly resetTime: number;
    constructor(message: string, options: {
        url?: string;
        resetTime: number;
    });
}
/**
 * Type guard to check if an error is a ScraperError
 */
declare function isScraperError(error: unknown): error is ScraperError;
/**
 * Type guard to check if error was caused by abort
 */
declare function isAbortError(error: unknown): error is RequestAbortedError;

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

declare const VERSION = "0.2.0";

export { type CandidateArticle, CircuitBreaker, CircuitOpenError, ContentExtractionError, ContentExtractor, type ContentValidation, DEFAULT_DENY_PATHS, DEFAULT_QUALITY_CONFIG, type DiscoveredFeed, type ExtractedArticle, type ExtractedContent$1 as ExtractedContent, type ExtractedContent as ExtractorExtractedContent, HTMLScraper, InvalidUrlError, NoContentFoundError, type OnProgressCallback, type OrchestrationResult, type QualityScoreConfig, RSSDiscovery, type RSSItem, RateLimitError, RequestAbortedError, RequestTimeoutError, RobotsBlockedError, RobotsChecker, type ScrapeOptions, type ScrapePhase, type ScrapeProgress, type ScrapedArticle, ScraperError, type ScraperPlugin, type ScraperResultsProps, type ScraperTestProps, type ScraperTestRequest, type ScraperTestResult, type ScrapingConfig, ScrapingRateLimiter, type SitemapEntry, SitemapParser, type SourceConfig, SourceOrchestrator, VERSION, calculateArticleQualityScore, circuitBreakers, cleanText, convertToMarkdown, createScraper, decodeHTMLEntities, detectParagraphs, fetchRSSFeed, getQualityBreakdown, globalContentExtractor, globalRSSDiscovery, globalRateLimiter, globalRobotsChecker, globalSitemapParser, globalSourceOrchestrator, htmlToMarkdown, isAbortError, isScraperError, normalizeWhitespace, quickScrape, removeUrls, scrape, shouldDenyUrl, stripHTML, stripNonArticleContent, truncateText, validateContent };
