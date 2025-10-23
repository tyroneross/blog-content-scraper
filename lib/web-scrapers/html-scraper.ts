import * as cheerio from 'cheerio';
import { globalRateLimiter } from '../scraping-rate-limiter';
import { globalRobotsChecker } from './robots-checker';

// Optional Perplexity integration - users need to provide their own API key
// Set PERPLEXITY_API_KEY environment variable to enable
const PERPLEXITY_MODELS = {
  SONAR: 'llama-3.1-sonar-small-128k-online',
  SONAR_PRO: 'llama-3.1-sonar-large-128k-online'
} as const;

export interface ScrapingConfig {
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

export interface ExtractedArticle {
  url: string;
  title?: string;
  publishedDate?: Date;
  description?: string;
  confidence: number; // 0-1, how confident we are this is an article
  source: 'link-text' | 'meta-data' | 'structured-data';
}

export class HTMLScraper {
  private readonly userAgent = 'Mozilla/5.0 (compatible; AtomizeNews/1.0; +https://atomize-news.vercel.app)';
  private readonly timeout = 10000; // 10 seconds
  private readonly defaultConfig: ScrapingConfig = {
    selectors: {
      articleLinks: [
        'article a[href]',
        '.article a[href]',
        '.post a[href]', 
        '.story a[href]',
        '.news-item a[href]',
        '.content-item a[href]',
        'h1 a[href]',
        'h2 a[href]',
        'h3 a[href]',
        '.headline a[href]',
        '.title a[href]'
      ],
      titleSelectors: [
        'h1',
        'h2', 
        'h3',
        '.headline',
        '.title',
        '.article-title',
        '.post-title',
        '.story-title'
      ],
      dateSelectors: [
        'time[datetime]',
        '.date',
        '.published',
        '.timestamp',
        '.publish-date',
        '.article-date'
      ],
      excludeSelectors: [
        '.advertisement',
        '.ads',
        '.sidebar',
        '.footer',
        '.navigation',
        '.menu',
        '.comments',
        '.related'
      ]
    },
    filters: {
      minTitleLength: 10,
      maxTitleLength: 200,
      includePatterns: [
        /\/article\//i,
        /\/post\//i,
        /\/story\//i,
        /\/news\//i,
        /\/blog\//i,
        /\/\d{4}\/\d{2}\/\d{2}\//,  // Date patterns
        /\/\d{4}\/\d{2}\//
      ],
      excludePatterns: [
        /\/(tag|category|author|search|archive)\//i,
        /\/(login|register|contact|about)\//i,
        /\.(pdf|jpg|jpeg|png|gif|mp4|zip|doc)$/i,
        /#/,  // Skip hash links
        /javascript:/i,
        /mailto:/i
      ]
    },
    limits: {
      maxLinksPerPage: 100,
      maxDepth: 3
    }
  };

  /**
   * Extract article links from a webpage
   */
  async extractArticleLinks(
    url: string,
    config: ScrapingConfig = {}
  ): Promise<ExtractedArticle[]> {
    console.log(`📰 [HTMLScraper] Starting to extract articles from ${url}`);

    try {
      // Check robots.txt compliance
      const robotsCheck = await globalRobotsChecker.isAllowed(url);
      if (!robotsCheck.allowed) {
        console.warn(`🤖 [HTMLScraper] URL blocked by robots.txt: ${url} - ${robotsCheck.reason}`);

        // Try Perplexity fallback if enabled for robots.txt blocks
        if (config.perplexityFallback?.enabled && config.perplexityFallback?.useForRobotsBlocked) {
          console.log(`🔄 [HTMLScraper] Attempting Perplexity fallback for robots-blocked URL`);
          return await this.extractWithPerplexity(url, config);
        }

        return [];
      }

      const html = await this.fetchPage(url);
      if (!html) {
        // Try Perplexity fallback if fetch failed
        if (config.perplexityFallback?.enabled && config.perplexityFallback?.useForParseFailed) {
          console.log(`🔄 [HTMLScraper] Attempting Perplexity fallback for failed fetch`);
          return await this.extractWithPerplexity(url, config);
        }
        return [];
      }

      const mergedConfig = this.mergeConfig(this.defaultConfig, config);
      const articles = this.parseArticleLinks(html, url, mergedConfig);

      // If no articles found and Perplexity fallback is enabled
      if (articles.length === 0 && config.perplexityFallback?.enabled && config.perplexityFallback?.useForParseFailed) {
        console.log(`🔄 [HTMLScraper] No articles found, attempting Perplexity fallback`);
        return await this.extractWithPerplexity(url, config);
      }

      console.log(`📰 [HTMLScraper] Extracted ${articles.length} article links from ${url}`);
      return articles;

    } catch (error) {
      console.error(`❌ [HTMLScraper] Error extracting articles from ${url}:`, error);

      // Try Perplexity fallback on error
      if (config.perplexityFallback?.enabled) {
        console.log(`🔄 [HTMLScraper] Attempting Perplexity fallback after error`);
        return await this.extractWithPerplexity(url, config);
      }

      return [];
    }
  }

  /**
   * Extract articles from multiple pages with pagination support
   */
  async extractFromMultiplePages(
    startUrl: string,
    config: ScrapingConfig = {},
    options: {
      maxPages?: number;
      paginationSelector?: string;
      nextPagePatterns?: RegExp[];
    } = {}
  ): Promise<ExtractedArticle[]> {
    const maxPages = options.maxPages || 5;
    const allArticles: ExtractedArticle[] = [];
    const visitedUrls = new Set<string>();
    const urlsToVisit = [startUrl];

    let pageCount = 0;

    while (urlsToVisit.length > 0 && pageCount < maxPages) {
      const currentUrl = urlsToVisit.shift()!;
      
      if (visitedUrls.has(currentUrl)) {
        continue;
      }

      visitedUrls.add(currentUrl);
      pageCount++;

      console.log(`📰 [HTMLScraper] Processing page ${pageCount}/${maxPages}: ${currentUrl}`);

      try {
        const articles = await this.extractArticleLinks(currentUrl, config);
        allArticles.push(...articles);

        // Look for next page links if we haven't hit the limit
        if (pageCount < maxPages) {
          const nextPageUrls = await this.findNextPageUrls(currentUrl, options);
          for (const nextUrl of nextPageUrls) {
            if (!visitedUrls.has(nextUrl)) {
              urlsToVisit.push(nextUrl);
            }
          }
        }

      } catch (error) {
        console.warn(`⚠️ [HTMLScraper] Error processing page ${currentUrl}:`, error);
        continue;
      }
    }

    // Remove duplicates and sort by confidence
    const uniqueArticles = this.deduplicateArticles(allArticles);
    uniqueArticles.sort((a, b) => b.confidence - a.confidence);

    console.log(`📰 [HTMLScraper] Total extracted ${uniqueArticles.length} unique articles from ${pageCount} pages`);
    return uniqueArticles;
  }

  private async fetchPage(url: string): Promise<string | null> {
    try {
      return await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const response = await fetch(url, {
            headers: { 
              'User-Agent': this.userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('text/html')) {
            throw new Error(`Not HTML content: ${contentType}`);
          }

          return await response.text();

        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });
    } catch (error) {
      console.error(`❌ [HTMLScraper] Error fetching page ${url}:`, error);
      return null;
    }
  }

  private parseArticleLinks(
    html: string, 
    baseUrl: string, 
    config: ScrapingConfig
  ): ExtractedArticle[] {
    const articles: ExtractedArticle[] = [];
    
    try {
      const $ = cheerio.load(html);
      const seenUrls = new Set<string>();

      // Remove excluded sections first
      config.selectors?.excludeSelectors?.forEach(selector => {
        $(selector).remove();
      });

      // Extract links using configured selectors
      config.selectors?.articleLinks?.forEach(selector => {
        $(selector).each((_, element) => {
          const $link = $(element);
          const href = $link.attr('href');
          
          if (!href) return;

          const absoluteUrl = this.resolveUrl(href, baseUrl);
          if (!absoluteUrl || seenUrls.has(absoluteUrl)) {
            return;
          }

          // Apply filters
          if (!this.passesFilters(absoluteUrl, config.filters)) {
            return;
          }

          seenUrls.add(absoluteUrl);

          // Extract article information
          const article = this.extractArticleInfo($link, $, absoluteUrl);
          if (article && articles.length < (config.limits?.maxLinksPerPage || 100)) {
            articles.push(article);
          }
        });
      });

      // Look for structured data (JSON-LD, microdata)
      const structuredArticles = this.extractStructuredData($, baseUrl);
      structuredArticles.forEach(article => {
        if (!seenUrls.has(article.url)) {
          seenUrls.add(article.url);
          articles.push(article);
        }
      });

    } catch (error) {
      console.error(`❌ [HTMLScraper] Error parsing HTML:`, error);
    }

    return articles;
  }

  private extractArticleInfo(
    $link: cheerio.Cheerio<any>, 
    $: cheerio.CheerioAPI,
    url: string
  ): ExtractedArticle | null {
    let title = $link.text().trim();
    let confidence = 0.5;
    let publishedDate: Date | undefined;
    let description: string | undefined;

    // Try to find better title from parent elements
    if (!title || title.length < 5) {
      const $parent = $link.closest('article, .article, .post, .story, .news-item');
      if ($parent.length > 0) {
        const betterTitle = $parent.find('h1, h2, h3, .headline, .title').first().text().trim();
        if (betterTitle && betterTitle.length > title.length) {
          title = betterTitle;
          confidence += 0.2;
        }
      }
    }

    // Extract date information
    const $dateElement = $link.closest('article, .article, .post').find('time[datetime], .date, .published').first();
    if ($dateElement.length > 0) {
      const dateText = $dateElement.attr('datetime') || $dateElement.text().trim();
      if (dateText) {
        const date = this.parseDate(dateText);
        if (date) {
          publishedDate = date;
          confidence += 0.1;
        }
      }
    }

    // Extract description
    const $parent = $link.closest('article, .article, .post, .story');
    if ($parent.length > 0) {
      description = $parent.find('.excerpt, .summary, p').first().text().trim();
      if (description && description.length > 50) {
        description = description.substring(0, 300) + '...';
        confidence += 0.1;
      }
    }

    // Boost confidence based on URL patterns
    if (this.isLikelyArticleUrl(url)) {
      confidence += 0.2;
    }

    // Boost confidence based on title quality
    if (title && title.length >= 20 && title.length <= 120) {
      confidence += 0.1;
    }

    if (!title || title.length < 10) {
      return null;
    }

    return {
      url,
      title,
      publishedDate,
      description,
      confidence: Math.min(confidence, 1.0),
      source: 'link-text'
    };
  }

  private extractStructuredData($: cheerio.CheerioAPI, baseUrl: string): ExtractedArticle[] {
    const articles: ExtractedArticle[] = [];

    // Extract JSON-LD structured data
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const jsonText = $(element).html();
        if (!jsonText) return;

        const data = JSON.parse(jsonText);
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (item['@type'] === 'Article' || item['@type'] === 'NewsArticle') {
            const url = item.url || item.mainEntityOfPage?.['@id'];
            if (url) {
              const absoluteUrl = this.resolveUrl(url, baseUrl);
              if (absoluteUrl) {
                articles.push({
                  url: absoluteUrl,
                  title: item.headline || item.name,
                  publishedDate: item.datePublished ? new Date(item.datePublished) : undefined,
                  description: item.description,
                  confidence: 0.9,
                  source: 'structured-data'
                });
              }
            }
          }
        }
      } catch (error) {
        // Skip malformed JSON-LD
      }
    });

    return articles;
  }

  private async findNextPageUrls(
    currentUrl: string, 
    options: {
      paginationSelector?: string;
      nextPagePatterns?: RegExp[];
    }
  ): Promise<string[]> {
    try {
      const html = await this.fetchPage(currentUrl);
      if (!html) return [];

      const $ = cheerio.load(html);
      const nextUrls: string[] = [];

      // Look for pagination links
      const paginationSelector = options.paginationSelector || 
        'a[rel="next"], .pagination a, .next a, .pager a, [class*="next"] a';
      
      $(paginationSelector).each((_, element) => {
        const $link = $(element);
        const href = $link.attr('href');
        const text = $link.text().toLowerCase().trim();
        
        if (href && (text.includes('next') || text.includes('→') || text === '>')) {
          const absoluteUrl = this.resolveUrl(href, currentUrl);
          if (absoluteUrl) {
            nextUrls.push(absoluteUrl);
          }
        }
      });

      return Array.from(new Set(nextUrls)); // Remove duplicates

    } catch (error) {
      console.warn(`⚠️ [HTMLScraper] Error finding next page URLs:`, error);
      return [];
    }
  }

  private deduplicateArticles(articles: ExtractedArticle[]): ExtractedArticle[] {
    const seen = new Map<string, ExtractedArticle>();
    
    for (const article of articles) {
      const existing = seen.get(article.url);
      if (!existing || article.confidence > existing.confidence) {
        seen.set(article.url, article);
      }
    }

    return Array.from(seen.values());
  }

  private passesFilters(url: string, filters?: ScrapingConfig['filters']): boolean {
    if (!filters) return true;

    const urlLower = url.toLowerCase();

    // Check exclude patterns first
    if (filters.excludePatterns?.some(pattern => pattern.test(url))) {
      return false;
    }

    // Check include patterns
    if (filters.includePatterns?.length && 
        !filters.includePatterns.some(pattern => pattern.test(url))) {
      return false;
    }

    // Check allowed domains
    if (filters.allowedDomains?.length) {
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.toLowerCase();
        if (!filters.allowedDomains.some(allowed => 
          domain === allowed.toLowerCase() || domain.endsWith('.' + allowed.toLowerCase())
        )) {
          return false;
        }
      } catch {
        return false;
      }
    }

    return true;
  }

  private isLikelyArticleUrl(url: string): boolean {
    const urlLower = url.toLowerCase();
    
    const articlePatterns = [
      /\/article[s]?\//,
      /\/post[s]?\//,
      /\/story\//,
      /\/stories\//,
      /\/news\//,
      /\/blog\//,
      /\/\d{4}\/\d{2}\/\d{2}\//,  // Date-based URLs
      /\/\d{4}\/\d{2}\//
    ];

    return articlePatterns.some(pattern => pattern.test(urlLower));
  }

  private parseDate(dateString: string): Date | null {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        // Try common date formats
        const formats = [
          /(\d{4})-(\d{2})-(\d{2})/,  // YYYY-MM-DD
          /(\d{2})\/(\d{2})\/(\d{4})/,  // MM/DD/YYYY
          /(\d{2})\.(\d{2})\.(\d{4})/   // DD.MM.YYYY
        ];

        for (const format of formats) {
          const match = dateString.match(format);
          if (match) {
            const [, p1, p2, p3] = match;
            // Assume first format is YYYY-MM-DD
            const testDate = new Date(`${p1}-${p2}-${p3}`);
            if (!isNaN(testDate.getTime())) {
              return testDate;
            }
          }
        }
        return null;
      }
      return date;
    } catch {
      return null;
    }
  }

  private resolveUrl(url: string, baseUrl: string): string | null {
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      return null;
    }
  }

  private mergeConfig(defaultConfig: ScrapingConfig, userConfig: ScrapingConfig): ScrapingConfig {
    return {
      selectors: {
        ...defaultConfig.selectors,
        ...userConfig.selectors,
        articleLinks: [
          ...(defaultConfig.selectors?.articleLinks || []),
          ...(userConfig.selectors?.articleLinks || [])
        ]
      },
      filters: {
        ...defaultConfig.filters,
        ...userConfig.filters,
        includePatterns: [
          ...(defaultConfig.filters?.includePatterns || []),
          ...(userConfig.filters?.includePatterns || [])
        ],
        excludePatterns: [
          ...(defaultConfig.filters?.excludePatterns || []),
          ...(userConfig.filters?.excludePatterns || [])
        ]
      },
      limits: {
        ...defaultConfig.limits,
        ...userConfig.limits
      },
      perplexityFallback: {
        ...defaultConfig.perplexityFallback,
        ...userConfig.perplexityFallback
      }
    };
  }

  /**
   * Use Perplexity API to extract articles when traditional scraping fails
   * Requires PERPLEXITY_API_KEY environment variable to be set
   */
  private async extractWithPerplexity(
    url: string,
    config: ScrapingConfig
  ): Promise<ExtractedArticle[]> {
    try {
      // Check if Perplexity API key is available
      if (!process.env.PERPLEXITY_API_KEY) {
        console.warn(`⚠️ [HTMLScraper] Perplexity API key not configured - set PERPLEXITY_API_KEY env variable`);
        return [];
      }

      const domain = new URL(url).hostname;
      const query = `Find recent news articles and stories from ${domain}. List article titles and URLs.`;

      console.log(`🔍 [HTMLScraper] Using Perplexity to find articles from ${domain}`);

      // Direct Perplexity API call
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
        },
        body: JSON.stringify({
          model: config.perplexityFallback?.model || PERPLEXITY_MODELS.SONAR,
          messages: [{ role: 'user', content: query }],
          max_tokens: 1000,
          return_citations: true,
          search_recency_filter: config.perplexityFallback?.searchRecency || 'day'
        })
      });

      if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const articles: ExtractedArticle[] = [];

      // Extract from citations if available
      if (data.citations && Array.isArray(data.citations)) {
        for (const citation of data.citations) {
          try {
            const citationUrl = citation as string;
            const citationDomain = new URL(citationUrl).hostname;

            if (citationDomain === domain || citationDomain.includes(domain.split('.')[0])) {
              articles.push({
                url: citationUrl,
                title: citationUrl.split('/').pop() || domain,
                confidence: 0.7,
                source: 'meta-data' as const
              });
            }
          } catch {
            continue;
          }
        }
      }

      // Apply limits
      const maxLinks = config.limits?.maxLinksPerPage || 100;
      const limitedArticles = articles.slice(0, maxLinks);

      console.log(`✨ [HTMLScraper] Perplexity found ${limitedArticles.length} articles`);

      return limitedArticles;

    } catch (error) {
      console.error(`❌ [HTMLScraper] Perplexity fallback failed:`, error);
      return [];
    }
  }
}

// Default global instance
export const globalHTMLScraper = new HTMLScraper();