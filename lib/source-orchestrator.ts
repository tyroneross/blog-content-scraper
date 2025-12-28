import { z } from 'zod';
import crypto from 'crypto';
import pLimit from 'p-limit';
import { fetchRSSFeed, RSSItem } from './rss-utils';
import { globalRSSDiscovery, DiscoveredFeed } from './web-scrapers/rss-discovery';
import { globalSitemapParser, SitemapEntry } from './web-scrapers/sitemap-parser';
import { HTMLScraper, ExtractedArticle, ScrapingConfig } from './web-scrapers/html-scraper';
import { ContentExtractor, ExtractedContent } from './web-scrapers/content-extractor';
import { RobotsChecker } from './web-scrapers/robots-checker';
import { getPlaywrightScraper, PlaywrightScraperConfig } from './web-scrapers/playwright-scraper';
import { isNonEnglishLocalePath } from './quality-scorer';

// Create instances
const globalHTMLScraper = new HTMLScraper();
const globalContentExtractor = new ContentExtractor();
const globalRobotsChecker = new RobotsChecker();
import { circuitBreakers } from './circuit-breaker';

// Zod schemas for type safety
export const CandidateArticleSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  publishedAt: z.date(),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  guid: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.enum(['rss', 'sitemap', 'html', 'discovery']),
  extractionMethod: z.enum(['rss', 'sitemap', 'html-links', 'content-extraction']),
  metadata: z.record(z.any()).optional()
});

export type CandidateArticle = z.infer<typeof CandidateArticleSchema>;

export const SourceConfigSchema = z.object({
  sourceType: z.enum(['rss', 'sitemap', 'html', 'auto']),
  allowPaths: z.array(z.string()).optional(),
  denyPaths: z.array(z.string()).optional(),
  maxDepth: z.number().int().min(1).max(5).optional(),
  detectOnly: z.boolean().optional(),
  scrapeConfig: z.object({
    selectors: z.object({
      articleLinks: z.array(z.string()).optional(),
      titleSelectors: z.array(z.string()).optional(),
      dateSelectors: z.array(z.string()).optional(),
      excludeSelectors: z.array(z.string()).optional()
    }).optional(),
    filters: z.object({
      minTitleLength: z.number().optional(),
      maxTitleLength: z.number().optional(),
      includePatterns: z.array(z.string()).optional(),
      excludePatterns: z.array(z.string()).optional()
    }).optional(),
    limits: z.object({
      maxLinksPerPage: z.number().optional(),
      maxPages: z.number().optional()
    }).optional()
  }).optional()
});

export type SourceConfig = z.infer<typeof SourceConfigSchema> & {
  circuitBreaker?: { execute<T>(operation: () => Promise<T>): Promise<T> };
};

export interface OrchestrationResult {
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

export class SourceOrchestrator {
  private readonly maxArticlesPerSource = 1000;
  private readonly recentTimeframe = 48 * 60 * 60 * 1000; // 48 hours

  /**
   * Common content section paths - prioritized for news/blog content
   */
  private readonly contentSectionPaths = [
    '/news', '/blog', '/articles', '/posts', '/stories',
    '/press', '/updates', '/announcements', '/insights',
    '/resources', '/publications', '/research', '/engineering'
  ];

  /**
   * Common blog subdomains to check when scraping root domains
   * Many companies host their blogs on separate subdomains
   */
  private readonly blogSubdomains = [
    'blog', 'blogs', 'news', 'newsroom', 'press',
    'engineering', 'developers', 'ai', 'research'
  ];

  /**
   * Infer path filters from the input URL
   * e.g., if user enters anthropic.com/news, filter results to /news/* paths
   */
  private inferPathFiltersFromUrl(url: string, config: SourceConfig): SourceConfig {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.toLowerCase();

      // If URL has a meaningful path (not just /), infer allowPaths
      if (path && path !== '/' && path.length > 1) {
        for (const contentPath of this.contentSectionPaths) {
          if (path.startsWith(contentPath)) {
            // Only add if user hasn't explicitly set allowPaths
            if (!config.allowPaths?.length) {
              console.log(`🔍 [Orchestrator] Inferring path filter from URL: ${contentPath}/*`);
              return {
                ...config,
                allowPaths: [`${contentPath}/*`, `${contentPath}`]
              };
            }
          }
        }

        // For other paths, use the exact path as prefix
        if (!config.allowPaths?.length && path.length > 3) {
          const pathPrefix = path.endsWith('/') ? path.slice(0, -1) : path;
          console.log(`🔍 [Orchestrator] Inferring path filter from URL: ${pathPrefix}/*`);
          return {
            ...config,
            allowPaths: [`${pathPrefix}/*`, pathPrefix]
          };
        }
      }
    } catch (error) {
      // Ignore URL parsing errors
    }

    return config;
  }

  /**
   * Discover content sections from sitemap when user enters root domain
   * Returns prioritized list of content paths found
   */
  private discoverContentSectionsFromSitemap(entries: { url: string }[]): string[] {
    const pathCounts = new Map<string, number>();

    for (const entry of entries) {
      try {
        const urlObj = new URL(entry.url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);

        if (pathParts.length >= 1) {
          const firstPath = '/' + pathParts[0].toLowerCase();

          // Only count if it's a potential content section
          if (this.contentSectionPaths.includes(firstPath) ||
              firstPath.match(/^\/(news|blog|post|article|stor|update|press)/i)) {
            pathCounts.set(firstPath, (pathCounts.get(firstPath) || 0) + 1);
          }
        }
      } catch {
        // Skip invalid URLs
      }
    }

    // Sort by count (most content first) and return paths with 3+ entries
    const sortedPaths = Array.from(pathCounts.entries())
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([path]) => path);

    if (sortedPaths.length > 0) {
      console.log(`🔍 [Orchestrator] Discovered content sections: ${sortedPaths.join(', ')}`);
    }

    return sortedPaths;
  }

  /**
   * Filter sitemap entries to content sections when processing root domain
   * Also applies non-English locale filtering
   */
  private filterToContentSections(
    articles: CandidateArticle[],
    discoveredPaths: string[]
  ): CandidateArticle[] {
    if (discoveredPaths.length === 0) {
      return articles;
    }

    // Create allow patterns from discovered paths
    const allowPatterns = discoveredPaths.flatMap(p => [`${p}/*`, p]);

    return articles.filter(article => {
      try {
        const urlObj = new URL(article.url);
        const path = urlObj.pathname.toLowerCase();

        // Filter out non-English locale paths (e.g., /fr-be/, /de-ch/)
        if (isNonEnglishLocalePath(path)) {
          return false;
        }

        return allowPatterns.some(pattern => this.matchesPattern(path, pattern));
      } catch {
        return false;
      }
    });
  }

  /**
   * Discover blog subdomains for a given domain
   * e.g., for nvidia.com, check if blogs.nvidia.com exists
   */
  private async discoverBlogSubdomains(domain: string): Promise<string[]> {
    // Extract base domain (remove www. if present)
    const baseDomain = domain.replace(/^www\./, '');
    const discoveredSubdomains: string[] = [];

    console.log(`🔍 [Orchestrator] Checking for blog subdomains of ${baseDomain}...`);

    // Check each potential blog subdomain
    for (const subdomain of this.blogSubdomains) {
      const subdomainUrl = `https://${subdomain}.${baseDomain}`;

      try {
        // Quick HEAD request to check if subdomain exists
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(subdomainUrl, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AtomizeNews/1.0; +https://atomize-news.vercel.app)'
          }
        });

        clearTimeout(timeoutId);

        if (response.ok || response.status === 301 || response.status === 302) {
          console.log(`✅ [Orchestrator] Found blog subdomain: ${subdomainUrl}`);
          discoveredSubdomains.push(subdomainUrl);
        }
      } catch {
        // Subdomain doesn't exist or timeout, skip it
      }
    }

    return discoveredSubdomains;
  }

  /**
   * Main orchestration method - determines source type and extracts content
   */
  async processSource(
    url: string,
    config: SourceConfig = { sourceType: 'auto' }
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();

    // Infer path filters from input URL
    config = this.inferPathFiltersFromUrl(url, config);

    console.log(`🎭 [Orchestrator] Processing source: ${url} (type: ${config.sourceType})`);

    const result: OrchestrationResult = {
      articles: [],
      sourceInfo: {
        detectedType: 'html',
        extractionStats: {
          attempted: 0,
          successful: 0,
          failed: 0,
          filtered: 0
        }
      },
      processingTime: 0,
      errors: []
    };

    try {
      // Apply circuit breaker protection (use custom if provided, otherwise default)
      const breaker = config.circuitBreaker || circuitBreakers.scraping;
      return await breaker.execute(async () => {
        if (config.sourceType === 'auto') {
          return await this.autoDetectAndProcess(url, config, result);
        } else {
          return await this.processKnownType(url, config, result);
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ [Orchestrator] Failed to process source ${url}:`, errorMessage);
      result.errors.push(errorMessage);
      result.processingTime = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Auto-detect source type and process accordingly
   */
  private async autoDetectAndProcess(
    url: string,
    config: SourceConfig,
    result: OrchestrationResult
  ): Promise<OrchestrationResult> {
    console.log(`🔍 [Orchestrator] Auto-detecting source type for ${url}`);

    // Step 1: Try RSS first (most reliable)
    try {
      const rssArticles = await this.processAsRSS(url);
      if (rssArticles.length > 0) {
        result.sourceInfo.detectedType = 'rss';
        // RSS is already curated content - only apply deny filters, not allow filters
        result.articles = this.applyPathFilters(rssArticles, config, { skipAllowFilters: true });
        console.log(`✅ [Orchestrator] Detected as RSS feed: ${result.articles.length} articles`);
        return this.finalizeResult(result);
      }
    } catch (error) {
      result.errors.push(`RSS detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 2: Discover RSS feeds from HTML
    try {
      const discoveredFeeds = await globalRSSDiscovery.discoverFeeds(url);
      if (discoveredFeeds.length > 0) {
        result.sourceInfo.discoveredFeeds = discoveredFeeds;

        // Try the highest confidence discovered feed
        const bestFeed = discoveredFeeds[0];
        const rssArticles = await this.processAsRSS(bestFeed.url);
        if (rssArticles.length > 0) {
          result.sourceInfo.detectedType = 'rss';
          // RSS is already curated content - only apply deny filters, not allow filters
          result.articles = this.applyPathFilters(rssArticles, config, { skipAllowFilters: true });
          console.log(`✅ [Orchestrator] Using discovered RSS feed: ${result.articles.length} articles`);
          return this.finalizeResult(result);
        }
      }
    } catch (error) {
      result.errors.push(`RSS discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 3: Try sitemap parsing
    try {
      const sitemapArticles = await this.processAsSitemap(url);
      if (sitemapArticles.length > 0) {
        result.sourceInfo.detectedType = 'sitemap';

        // If processing root domain, auto-discover and filter to content sections
        const urlObj = new URL(url);
        const isRootDomain = urlObj.pathname === '/' || urlObj.pathname === '';
        if (isRootDomain && !config.allowPaths?.length) {
          const discoveredPaths = this.discoverContentSectionsFromSitemap(sitemapArticles);
          if (discoveredPaths.length > 0) {
            result.articles = this.filterToContentSections(sitemapArticles, discoveredPaths);
          } else {
            result.articles = this.applyPathFilters(sitemapArticles, config);
          }
        } else {
          result.articles = this.applyPathFilters(sitemapArticles, config);
        }

        console.log(`✅ [Orchestrator] Detected as sitemap: ${result.articles.length} articles`);
        return this.finalizeResult(result);
      }
    } catch (error) {
      result.errors.push(`Sitemap detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 4: Discover sitemaps from domain
    try {
      const urlObj = new URL(url);
      const discoveredSitemaps = await globalSitemapParser.discoverSitemaps(urlObj.hostname);
      if (discoveredSitemaps.length > 0) {
        result.sourceInfo.discoveredSitemaps = discoveredSitemaps;

        // Try the first discovered sitemap
        const sitemapArticles = await this.processAsSitemap(discoveredSitemaps[0]);
        if (sitemapArticles.length > 0) {
          result.sourceInfo.detectedType = 'sitemap';

          // If processing root domain, auto-discover and filter to content sections
          const isRootDomain = urlObj.pathname === '/' || urlObj.pathname === '';
          if (isRootDomain && !config.allowPaths?.length) {
            const discoveredPaths = this.discoverContentSectionsFromSitemap(sitemapArticles);
            if (discoveredPaths.length > 0) {
              result.articles = this.filterToContentSections(sitemapArticles, discoveredPaths);
            } else {
              result.articles = this.applyPathFilters(sitemapArticles, config);
            }
          } else {
            result.articles = this.applyPathFilters(sitemapArticles, config);
          }

          console.log(`✅ [Orchestrator] Using discovered sitemap: ${result.articles.length} articles`);
          return this.finalizeResult(result);
        }
      }
    } catch (error) {
      result.errors.push(`Sitemap discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 5: Try blog subdomains (e.g., blogs.nvidia.com for nvidia.com)
    try {
      const urlObj = new URL(url);
      const isRootDomain = urlObj.pathname === '/' || urlObj.pathname === '';

      if (isRootDomain) {
        const blogSubdomains = await this.discoverBlogSubdomains(urlObj.hostname);

        for (const subdomainUrl of blogSubdomains) {
          try {
            // Try RSS first on subdomain
            const rssArticles = await this.processAsRSS(subdomainUrl);
            if (rssArticles.length > 0) {
              result.sourceInfo.detectedType = 'rss';
              result.articles = this.applyPathFilters(rssArticles, config);
              console.log(`✅ [Orchestrator] Found RSS on subdomain ${subdomainUrl}: ${result.articles.length} articles`);
              return this.finalizeResult(result);
            }

            // Try sitemap on subdomain
            const subdomainHostname = new URL(subdomainUrl).hostname;
            const subdomainSitemaps = await globalSitemapParser.discoverSitemaps(subdomainHostname);
            if (subdomainSitemaps.length > 0) {
              result.sourceInfo.discoveredSitemaps = [
                ...(result.sourceInfo.discoveredSitemaps || []),
                ...subdomainSitemaps
              ];

              for (const sitemap of subdomainSitemaps) {
                const sitemapArticles = await this.processAsSitemap(sitemap);
                if (sitemapArticles.length > 0) {
                  result.sourceInfo.detectedType = 'sitemap';
                  result.articles = this.applyPathFilters(sitemapArticles, config);
                  console.log(`✅ [Orchestrator] Found sitemap on subdomain ${subdomainUrl}: ${result.articles.length} articles`);
                  return this.finalizeResult(result);
                }
              }
            }
          } catch (subError) {
            console.log(`⚠️ [Orchestrator] Error processing subdomain ${subdomainUrl}:`, subError);
          }
        }
      }
    } catch (error) {
      result.errors.push(`Subdomain discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 6: Fall back to HTML scraping
    try {
      const htmlArticles = await this.processAsHTML(url, config);
      if (htmlArticles.length > 0) {
        result.sourceInfo.detectedType = 'html';
        result.articles = this.applyPathFilters(htmlArticles, config);
        console.log(`✅ [Orchestrator] Falling back to HTML scraping: ${result.articles.length} articles`);
        return this.finalizeResult(result);
      }
    } catch (error) {
      result.errors.push(`HTML scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 7: Final fallback - Playwright for JS-rendered pages
    try {
      console.log(`🎭 [Orchestrator] Trying Playwright for JS-rendered content...`);
      const playwrightArticles = await this.processAsPlaywright(url, config);
      if (playwrightArticles.length > 0) {
        result.sourceInfo.detectedType = 'html'; // Still categorize as HTML source
        result.articles = this.applyPathFilters(playwrightArticles, config);
        console.log(`✅ [Orchestrator] Playwright extraction successful: ${result.articles.length} articles`);
        return this.finalizeResult(result);
      }
    } catch (error) {
      result.errors.push(`Playwright scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // No articles found by any method
    console.log(`⚠️ [Orchestrator] No articles found for ${url}`);
    return this.finalizeResult(result);
  }

  /**
   * Process source with known type
   */
  private async processKnownType(
    url: string,
    config: SourceConfig,
    result: OrchestrationResult
  ): Promise<OrchestrationResult> {
    console.log(`🎯 [Orchestrator] Processing as ${config.sourceType}: ${url}`);

    try {
      let articles: CandidateArticle[] = [];

      switch (config.sourceType) {
        case 'rss':
          articles = await this.processAsRSS(url);
          result.sourceInfo.detectedType = 'rss';
          break;

        case 'sitemap':
          articles = await this.processAsSitemap(url);
          result.sourceInfo.detectedType = 'sitemap';
          break;

        case 'html':
          articles = await this.processAsHTML(url, config);
          result.sourceInfo.detectedType = 'html';
          break;
      }

      result.articles = this.applyPathFilters(articles, config);
      console.log(`✅ [Orchestrator] Processed ${config.sourceType}: ${result.articles.length} articles`);
      return this.finalizeResult(result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`${config.sourceType} processing failed: ${errorMessage}`);
      return this.finalizeResult(result);
    }
  }

  /**
   * Process URL as RSS feed
   */
  private async processAsRSS(url: string): Promise<CandidateArticle[]> {
    const rssItems = await fetchRSSFeed(url);
    const candidates: CandidateArticle[] = [];

    for (const item of rssItems) {
      try {
        const publishedAt = new Date(item.pubDate);
        if (isNaN(publishedAt.getTime())) {
          continue;
        }

        candidates.push({
          url: item.link,
          title: item.title,
          publishedAt,
          content: item.content,
          excerpt: item.contentSnippet,
          guid: item.guid,
          confidence: 0.9,
          source: 'rss',
          extractionMethod: 'rss',
          metadata: {
            originalGuid: item.guid,
            rssSource: url
          }
        });
      } catch (error) {
        console.warn(`⚠️ [Orchestrator] Error processing RSS item:`, error);
        continue;
      }
    }

    return candidates;
  }

  /**
   * Process URL as sitemap
   */
  private async processAsSitemap(url: string): Promise<CandidateArticle[]> {
    // Don't filter by recency - we want all entries from the sitemap
    // Path filtering and quality scoring will handle relevance
    const sitemapEntries = await globalSitemapParser.parseSitemap(url, {
      filterRecent: false,  // Changed: get all entries, filter later by path
      maxEntries: this.maxArticlesPerSource,
      includeNews: true
    });

    const candidates: CandidateArticle[] = [];

    for (const entry of sitemapEntries) {
      try {
        const publishedAt = entry.lastmod || new Date();

        candidates.push({
          url: entry.url,
          title: entry.news?.title || this.extractTitleFromUrl(entry.url),
          publishedAt,
          guid: this.createGuid(entry.url, publishedAt.toISOString()),
          confidence: entry.news ? 0.8 : 0.6,
          source: 'sitemap',
          extractionMethod: 'sitemap',
          metadata: {
            changefreq: entry.changefreq,
            priority: entry.priority,
            hasNews: !!entry.news,
            sitemapSource: url
          }
        });
      } catch (error) {
        console.warn(`⚠️ [Orchestrator] Error processing sitemap entry:`, error);
        continue;
      }
    }

    return candidates;
  }

  /**
   * Process URL as HTML page
   */
  private async processAsHTML(url: string, config: SourceConfig): Promise<CandidateArticle[]> {
    const scrapingConfig: ScrapingConfig = this.buildScrapingConfig(config);

    const extractedArticles = await globalHTMLScraper.extractFromMultiplePages(url, scrapingConfig, {
      maxPages: config.scrapeConfig?.limits?.maxPages || 3
    });

    const candidates: CandidateArticle[] = [];

    for (const article of extractedArticles) {
      try {
        const publishedAt = article.publishedDate || new Date();

        candidates.push({
          url: article.url,
          title: article.title || this.extractTitleFromUrl(article.url),
          publishedAt,
          excerpt: article.description,
          guid: this.createGuid(article.url, publishedAt.toISOString()),
          confidence: article.confidence,
          source: 'html',
          extractionMethod: 'html-links',
          metadata: {
            extractionSource: article.source,
            htmlSource: url
          }
        });
      } catch (error) {
        console.warn(`⚠️ [Orchestrator] Error processing HTML article:`, error);
        continue;
      }
    }

    return candidates;
  }

  /**
   * Process URL using Playwright for JavaScript-rendered pages
   * Used as fallback when static HTML scraping fails
   */
  private async processAsPlaywright(url: string, config: SourceConfig): Promise<CandidateArticle[]> {
    const playwrightScraper = getPlaywrightScraper();

    const playwrightConfig: PlaywrightScraperConfig = {
      timeout: 30000,
      blockMedia: true,
      ...this.buildScrapingConfig(config)
    };

    const extractedArticles = await playwrightScraper.extractArticleLinks(url, playwrightConfig);
    const candidates: CandidateArticle[] = [];

    for (const article of extractedArticles) {
      try {
        const publishedAt = article.publishedDate || new Date();

        candidates.push({
          url: article.url,
          title: article.title || this.extractTitleFromUrl(article.url),
          publishedAt,
          excerpt: article.description,
          guid: this.createGuid(article.url, publishedAt.toISOString()),
          confidence: article.confidence,
          source: 'html',
          extractionMethod: 'html-links',
          metadata: {
            extractionSource: 'playwright',
            playwrightRendered: true,
            htmlSource: url
          }
        });
      } catch (error) {
        console.warn(`⚠️ [Orchestrator] Error processing Playwright article:`, error);
        continue;
      }
    }

    return candidates;
  }

  /**
   * Apply path filtering based on allowPaths and denyPaths
   * Also filters out non-English locale paths
   *
   * @param articles - Articles to filter
   * @param config - Source configuration
   * @param options - Filtering options
   * @param options.skipAllowFilters - Skip allow path filtering (useful for RSS which is already curated)
   */
  private applyPathFilters(
    articles: CandidateArticle[],
    config: SourceConfig,
    options: { skipAllowFilters?: boolean } = {}
  ): CandidateArticle[] {
    return articles.filter(article => {
      try {
        const urlObj = new URL(article.url);
        const path = urlObj.pathname.toLowerCase();

        // Always filter out non-English locale paths (e.g., /fr-be/, /de-ch/)
        if (isNonEnglishLocalePath(path)) {
          return false;
        }

        // Check deny patterns first (always apply)
        if (config.denyPaths?.length) {
          for (const pattern of config.denyPaths) {
            if (this.matchesPattern(path, pattern)) {
              console.log(`🚫 [Orchestrator] Article blocked by deny pattern "${pattern}": ${article.url}`);
              return false;
            }
          }
        }

        // Skip allow pattern filtering for RSS (RSS is already curated content)
        if (options.skipAllowFilters) {
          return true;
        }

        // Check allow patterns (only for sitemap/HTML sources)
        if (config.allowPaths?.length) {
          for (const pattern of config.allowPaths) {
            if (this.matchesPattern(path, pattern)) {
              return true;
            }
          }
          console.log(`🚫 [Orchestrator] Article not matching any allow pattern: ${article.url}`);
          return false;
        }

        return true;
      } catch (error) {
        console.warn(`⚠️ [Orchestrator] Error applying path filters to ${article.url}:`, error);
        return true; // Default to allowing on error
      }
    });
  }

  /**
   * Check if a path matches a pattern (supports wildcards)
   */
  private matchesPattern(path: string, pattern: string): boolean {
    const patternLower = pattern.toLowerCase();
    const pathLower = path.toLowerCase();

    // Handle exact match
    if (patternLower === pathLower) {
      return true;
    }

    // Handle simple prefix patterns like /news/*
    if (patternLower.endsWith('/*')) {
      const prefix = patternLower.slice(0, -2); // Remove /*
      return pathLower.startsWith(prefix + '/') || pathLower === prefix;
    }

    // Handle wildcard patterns with regex
    const regexPattern = patternLower
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
      .replace(/\*/g, '.*'); // Convert * to .*

    const regex = new RegExp('^' + regexPattern + '$', 'i');
    return regex.test(pathLower);
  }

  /**
   * Build scraping configuration from source config
   */
  private buildScrapingConfig(config: SourceConfig): ScrapingConfig {
    const scrapingConfig: ScrapingConfig = {};

    if (config.scrapeConfig?.selectors) {
      scrapingConfig.selectors = {
        articleLinks: config.scrapeConfig.selectors.articleLinks,
        titleSelectors: config.scrapeConfig.selectors.titleSelectors,
        dateSelectors: config.scrapeConfig.selectors.dateSelectors,
        excludeSelectors: config.scrapeConfig.selectors.excludeSelectors
      };
    }

    if (config.scrapeConfig?.filters) {
      scrapingConfig.filters = {
        minTitleLength: config.scrapeConfig.filters.minTitleLength,
        maxTitleLength: config.scrapeConfig.filters.maxTitleLength,
        includePatterns: config.scrapeConfig.filters.includePatterns?.map(p => new RegExp(p, 'i')),
        excludePatterns: config.scrapeConfig.filters.excludePatterns?.map(p => new RegExp(p, 'i'))
      };
    }

    if (config.scrapeConfig?.limits) {
      scrapingConfig.limits = config.scrapeConfig.limits;
    }

    return scrapingConfig;
  }

  /**
   * Extract title from URL as fallback
   */
  private extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1] || urlObj.hostname;

      return lastPart
        .replace(/[-_]/g, ' ')
        .replace(/\.(html|htm|php|asp|jsp)$/i, '')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    } catch {
      return 'Untitled Article';
    }
  }

  /**
   * Create a consistent GUID for an article
   */
  private createGuid(url: string, publishedAt: string): string {
    return crypto.createHash('sha256').update(url + publishedAt).digest('hex');
  }

  /**
   * Finalize processing result
   */
  private finalizeResult(result: OrchestrationResult): OrchestrationResult {
    const endTime = Date.now();
    result.processingTime = endTime - (Date.now() - result.processingTime);

    // Update extraction stats
    result.sourceInfo.extractionStats = {
      attempted: result.articles.length,
      successful: result.articles.filter(a => a.confidence >= 0.5).length,
      failed: result.errors.length,
      filtered: 0 // This would be calculated during filtering
    };

    // Sort articles by confidence and recency
    result.articles.sort((a, b) => {
      const confidenceDiff = b.confidence - a.confidence;
      if (Math.abs(confidenceDiff) > 0.1) return confidenceDiff;
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    });

    // Limit results
    result.articles = result.articles.slice(0, this.maxArticlesPerSource);

    console.log(`🎭 [Orchestrator] Processing complete: ${result.articles.length} articles in ${result.processingTime}ms`);
    return result;
  }

  /**
   * Extract full content for articles (optional enhancement step)
   */
  async enhanceWithFullContent(
    articles: CandidateArticle[],
    maxArticles: number = 10,
    options: {
      concurrency?: number;
      onProgress?: (completed: number, total: number) => void;
    } = {}
  ): Promise<CandidateArticle[]> {
    const concurrency = options.concurrency || 5;

    const toEnhance = articles
      .filter(a => !a.content || a.content.length < 2000) // Only enhance articles without full content
      .slice(0, maxArticles);

    if (toEnhance.length === 0) {
      console.log(`📖 [Orchestrator] No articles need content enhancement`);
      return articles;
    }

    console.log(`📖 [Orchestrator] Enhancing ${toEnhance.length} articles in PARALLEL (concurrency: ${concurrency})`);

    const limit = pLimit(concurrency);
    let completed = 0;

    await Promise.allSettled(
      toEnhance.map(article =>
        limit(async () => {
          try {
            const extractedContent = await globalContentExtractor.extractContent(article.url);
            if (extractedContent) {
              article.content = extractedContent.content;
              article.excerpt = extractedContent.excerpt || article.excerpt;
              article.confidence = Math.min(article.confidence + 0.1, 1.0);
              article.metadata = {
                ...article.metadata,
                fullContentExtracted: true,
                extractionMethod: extractedContent.extractionMethod,
                wordCount: extractedContent.wordCount,
                readingTime: extractedContent.readingTime
              };
            }
          } catch (error) {
            console.warn(`⚠️ [Orchestrator] Failed to enhance article ${article.url}:`, error);
          } finally {
            completed++;
            options.onProgress?.(completed, toEnhance.length);
          }
        })
      )
    );

    console.log(`📖 [Orchestrator] Content enhancement complete: ${completed}/${toEnhance.length}`);
    return articles;
  }

  /**
   * Validate orchestrator configuration
   */
  static validateConfig(config: any): SourceConfig {
    try {
      return SourceConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid source configuration: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  /**
   * Get source statistics
   */
  async getSourceStats(url: string): Promise<{
    robotsCompliant: boolean;
    hasRSSFeed: boolean;
    hasSitemap: boolean;
    detectedType: string;
    estimatedArticleCount: number;
  }> {
    const robotsCheck = await globalRobotsChecker.isAllowed(url);
    const discoveredFeeds = await globalRSSDiscovery.discoverFeeds(url);

    let hasSitemap = false;
    let estimatedArticleCount = 0;

    try {
      const urlObj = new URL(url);
      const sitemaps = await globalSitemapParser.discoverSitemaps(urlObj.hostname);
      hasSitemap = sitemaps.length > 0;

      if (hasSitemap) {
        const recentEntries = await globalSitemapParser.getRecentEntries(urlObj.hostname, { hoursBack: 48, maxEntries: 100 });
        estimatedArticleCount = recentEntries.length;
      }
    } catch (error) {
      // Ignore sitemap errors for stats
    }

    return {
      robotsCompliant: robotsCheck.allowed,
      hasRSSFeed: discoveredFeeds.length > 0,
      hasSitemap,
      detectedType: discoveredFeeds.length > 0 ? 'rss' : hasSitemap ? 'sitemap' : 'html',
      estimatedArticleCount
    };
  }
}

// Export default instance
export const globalSourceOrchestrator = new SourceOrchestrator();