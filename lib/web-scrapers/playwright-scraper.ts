/**
 * Playwright-based scraper for JavaScript-rendered pages
 *
 * Used as a fallback when static HTML scraping fails (e.g., Next.js, React, Vue sites)
 * Returns the same ExtractedArticle format as HTMLScraper for consistency
 */

import { chromium, Browser, Page } from 'playwright';
import { ExtractedArticle, ScrapingConfig } from './html-scraper';

export interface PlaywrightScraperConfig extends ScrapingConfig {
  /** Wait for specific selector before extracting (optional) */
  waitForSelector?: string;
  /** Maximum time to wait for page load in ms (default: 30000) */
  timeout?: number;
  /** Whether to block images/fonts for faster loading (default: true) */
  blockMedia?: boolean;
  /** Custom viewport size */
  viewport?: { width: number; height: number };
}

export class PlaywrightScraper {
  private browser: Browser | null = null;
  private readonly userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  private readonly defaultConfig: PlaywrightScraperConfig = {
    timeout: 30000,
    blockMedia: true,
    viewport: { width: 1280, height: 720 },
    selectors: {
      articleLinks: [
        'article a[href]',
        '.article a[href]',
        '.post a[href]',
        '.story a[href]',
        '.news-item a[href]',
        '.card a[href]',
        '[class*="article"] a[href]',
        '[class*="post"] a[href]',
        '[class*="news"] a[href]',
        '[class*="story"] a[href]',
        'h1 a[href]',
        'h2 a[href]',
        'h3 a[href]',
        '.headline a[href]',
        '.title a[href]',
        // Common list patterns
        'ul li a[href]',
        '.list-item a[href]',
        '[role="listitem"] a[href]',
      ],
      excludeSelectors: [
        'nav',
        'header',
        'footer',
        '.navigation',
        '.menu',
        '.sidebar',
        '.advertisement',
        '.ads',
        '.comments',
        '.social-share',
        '[aria-hidden="true"]',
      ]
    },
    filters: {
      minTitleLength: 10,
      maxTitleLength: 300,
      excludePatterns: [
        /\/(tag|category|author|search|archive|login|register|contact|about|privacy|terms)\//i,
        /\.(pdf|jpg|jpeg|png|gif|mp4|zip|doc)$/i,
        /#/,
        /javascript:/i,
        /mailto:/i
      ]
    },
    limits: {
      maxLinksPerPage: 100
    }
  };

  /**
   * Initialize browser instance
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      console.log('🎭 [Playwright] Launching browser...');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Close browser instance
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('🎭 [Playwright] Browser closed');
    }
  }

  /**
   * Extract article links from a JavaScript-rendered page
   */
  async extractArticleLinks(
    url: string,
    config: PlaywrightScraperConfig = {}
  ): Promise<ExtractedArticle[]> {
    console.log(`🎭 [Playwright] Extracting articles from ${url}`);

    const mergedConfig = this.mergeConfig(this.defaultConfig, config);
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: this.userAgent,
      viewport: mergedConfig.viewport,
    });

    const page = await context.newPage();
    const articles: ExtractedArticle[] = [];

    try {
      // Block unnecessary resources for faster loading
      if (mergedConfig.blockMedia) {
        await page.route('**/*', (route) => {
          const resourceType = route.request().resourceType();
          if (['image', 'font', 'media'].includes(resourceType)) {
            route.abort();
          } else {
            route.continue();
          }
        });
      }

      // Navigate to page
      console.log(`🎭 [Playwright] Loading ${url}...`);
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: mergedConfig.timeout
      });

      // Wait for custom selector if specified
      if (mergedConfig.waitForSelector) {
        await page.waitForSelector(mergedConfig.waitForSelector, {
          timeout: mergedConfig.timeout
        });
      }

      // Give JS a moment to finish rendering
      await page.waitForTimeout(1000);

      // Remove excluded elements
      for (const selector of mergedConfig.selectors?.excludeSelectors || []) {
        await page.evaluate((sel) => {
          document.querySelectorAll(sel).forEach(el => el.remove());
        }, selector);
      }

      // Extract articles using configured selectors
      const extractedData = await page.evaluate((selectors) => {
        const results: Array<{
          url: string;
          title: string;
          date?: string;
          description?: string;
        }> = [];
        const seenUrls = new Set<string>();

        for (const selector of selectors) {
          const links = document.querySelectorAll(selector);

          links.forEach((link) => {
            const anchor = link as HTMLAnchorElement;
            const href = anchor.href;

            if (!href || seenUrls.has(href)) return;
            seenUrls.add(href);

            // Get title from link text or nearby heading
            let title = anchor.textContent?.trim() || '';

            // Try to find better title from parent article/card
            const parent = anchor.closest('article, [class*="card"], [class*="post"], [class*="item"], li');
            if (parent) {
              const heading = parent.querySelector('h1, h2, h3, h4, .title, .headline');
              if (heading) {
                const headingText = heading.textContent?.trim();
                if (headingText && headingText.length > title.length) {
                  title = headingText;
                }
              }

              // Get description
              const desc = parent.querySelector('p, .excerpt, .summary, .description');
              const description = desc?.textContent?.trim();

              // Get date
              const dateEl = parent.querySelector('time, [datetime], .date, .published');
              const date = dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim();

              if (title && title.length >= 10) {
                results.push({
                  url: href,
                  title,
                  date,
                  description: description?.substring(0, 300)
                });
              }
            } else if (title && title.length >= 10) {
              results.push({ url: href, title });
            }
          });
        }

        return results;
      }, mergedConfig.selectors?.articleLinks || []);

      // Process and filter results
      for (const item of extractedData) {
        if (articles.length >= (mergedConfig.limits?.maxLinksPerPage || 100)) break;

        // Apply URL filters
        if (!this.passesFilters(item.url, mergedConfig.filters)) continue;

        // Parse date if available
        let publishedDate: Date | undefined;
        if (item.date) {
          const parsed = new Date(item.date);
          if (!isNaN(parsed.getTime())) {
            publishedDate = parsed;
          }
        }

        // Calculate confidence based on data quality
        let confidence = 0.6; // Base confidence for Playwright extraction
        if (publishedDate) confidence += 0.1;
        if (item.description) confidence += 0.1;
        if (this.isLikelyArticleUrl(item.url)) confidence += 0.1;

        articles.push({
          url: item.url,
          title: item.title,
          publishedDate,
          description: item.description,
          confidence: Math.min(confidence, 1.0),
          source: 'link-text'
        });
      }

      console.log(`🎭 [Playwright] Extracted ${articles.length} articles from ${url}`);

    } catch (error) {
      console.error(`❌ [Playwright] Error extracting from ${url}:`, error);
    } finally {
      await context.close();
    }

    return articles;
  }

  /**
   * Fetch fully rendered HTML content from a page
   * Useful for content extraction on JS-rendered article pages
   */
  async fetchRenderedContent(url: string, config: PlaywrightScraperConfig = {}): Promise<string | null> {
    console.log(`🎭 [Playwright] Fetching rendered content from ${url}`);

    const mergedConfig = this.mergeConfig(this.defaultConfig, config);
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: this.userAgent,
      viewport: mergedConfig.viewport,
    });

    const page = await context.newPage();

    try {
      // Don't block images for content extraction - we might need them
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: mergedConfig.timeout
      });

      // Wait for custom selector if specified
      if (mergedConfig.waitForSelector) {
        await page.waitForSelector(mergedConfig.waitForSelector, {
          timeout: mergedConfig.timeout
        });
      }

      // Give JS a moment to finish rendering
      await page.waitForTimeout(1000);

      // Get the full HTML
      const html = await page.content();
      console.log(`🎭 [Playwright] Fetched ${html.length} bytes of rendered HTML`);

      return html;

    } catch (error) {
      console.error(`❌ [Playwright] Error fetching content from ${url}:`, error);
      return null;
    } finally {
      await context.close();
    }
  }

  /**
   * Check if URL passes filters
   */
  private passesFilters(url: string, filters?: ScrapingConfig['filters']): boolean {
    if (!filters) return true;

    // Check exclude patterns
    if (filters.excludePatterns?.some(pattern => pattern.test(url))) {
      return false;
    }

    // Check include patterns if specified
    if (filters.includePatterns?.length &&
        !filters.includePatterns.some(pattern => pattern.test(url))) {
      return false;
    }

    return true;
  }

  /**
   * Check if URL looks like an article
   */
  private isLikelyArticleUrl(url: string): boolean {
    const articlePatterns = [
      /\/article[s]?\//i,
      /\/post[s]?\//i,
      /\/story\//i,
      /\/stories\//i,
      /\/news\//i,
      /\/blog\//i,
      /\/\d{4}\/\d{2}\/\d{2}\//,
      /\/\d{4}\/\d{2}\//
    ];

    return articlePatterns.some(pattern => pattern.test(url));
  }

  /**
   * Merge configurations
   */
  private mergeConfig(
    defaultConfig: PlaywrightScraperConfig,
    userConfig: PlaywrightScraperConfig
  ): PlaywrightScraperConfig {
    return {
      ...defaultConfig,
      ...userConfig,
      selectors: {
        ...defaultConfig.selectors,
        ...userConfig.selectors,
        articleLinks: [
          ...(defaultConfig.selectors?.articleLinks || []),
          ...(userConfig.selectors?.articleLinks || [])
        ],
        excludeSelectors: [
          ...(defaultConfig.selectors?.excludeSelectors || []),
          ...(userConfig.selectors?.excludeSelectors || [])
        ]
      },
      filters: {
        ...defaultConfig.filters,
        ...userConfig.filters
      },
      limits: {
        ...defaultConfig.limits,
        ...userConfig.limits
      }
    };
  }
}

// Global instance with lazy initialization
let globalPlaywrightScraper: PlaywrightScraper | null = null;

export function getPlaywrightScraper(): PlaywrightScraper {
  if (!globalPlaywrightScraper) {
    globalPlaywrightScraper = new PlaywrightScraper();
  }
  return globalPlaywrightScraper;
}

// Cleanup function for graceful shutdown
export async function closePlaywrightScraper(): Promise<void> {
  if (globalPlaywrightScraper) {
    await globalPlaywrightScraper.close();
    globalPlaywrightScraper = null;
  }
}
