import * as cheerio from 'cheerio';
import { globalRateLimiter } from '../utils/scraping-rate-limiter';
import { globalRobotsChecker } from './robots-checker';

export interface SitemapEntry {
  url: string;
  lastmod?: Date;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
  images?: SitemapImage[];
  news?: SitemapNews;
}

export interface SitemapImage {
  loc: string;
  caption?: string;
  title?: string;
}

export interface SitemapNews {
  title: string;
  publishedDate?: Date;
  keywords?: string[];
}

export interface SitemapIndex {
  sitemaps: {
    loc: string;
    lastmod?: Date;
  }[];
}

export class SitemapParser {
  private readonly userAgent = 'Mozilla/5.0 (compatible; AtomizeNews/1.0; +https://atomize-news.vercel.app)';
  private readonly timeout = 15000; // 15 seconds for sitemaps
  private readonly maxSitemapSize = 50 * 1024 * 1024; // 50MB max
  private readonly maxEntries = 50000; // Max entries per sitemap
  private readonly recentTimeframe = 48 * 60 * 60 * 1000; // 48 hours in ms

  /**
   * Parse sitemap from URL and return entries
   */
  async parseSitemap(
    url: string, 
    options: {
      filterRecent?: boolean;
      maxEntries?: number;
      includeImages?: boolean;
      includeNews?: boolean;
    } = {}
  ): Promise<SitemapEntry[]> {
    console.log(`🗺️ [Sitemap] Starting to parse ${url}`);
    
    try {
      // Check robots.txt compliance
      const robotsCheck = await globalRobotsChecker.isAllowed(url);
      if (!robotsCheck.allowed) {
        console.warn(`🤖 [Sitemap] URL blocked by robots.txt: ${url} - ${robotsCheck.reason}`);
        return [];
      }

      const xml = await this.fetchSitemap(url);
      if (!xml) {
        return [];
      }

      // Detect if this is a sitemap index or regular sitemap
      if (this.isSitemapIndex(xml)) {
        return await this.parseSitemapIndex(xml, options);
      } else {
        return this.parseRegularSitemap(xml, options);
      }

    } catch (error) {
      console.error(`❌ [Sitemap] Error parsing sitemap ${url}:`, error);
      return [];
    }
  }

  /**
   * Discover sitemaps from domain
   */
  async discoverSitemaps(domain: string): Promise<string[]> {
    const sitemaps: string[] = [];
    
    try {
      // First, check robots.txt for sitemap declarations
      const robotsSitemaps = await globalRobotsChecker.getSitemaps(domain);
      sitemaps.push(...robotsSitemaps);

      // Try common sitemap paths
      const commonPaths = [
        '/sitemap.xml',
        '/sitemap_index.xml',
        '/sitemaps.xml',
        '/sitemap/',
        '/news-sitemap.xml'
      ];

      for (const path of commonPaths) {
        const sitemapUrl = `https://${domain}${path}`;
        
        // Skip if already found in robots.txt
        if (sitemaps.includes(sitemapUrl)) {
          continue;
        }

        const exists = await this.checkSitemapExists(sitemapUrl);
        if (exists) {
          sitemaps.push(sitemapUrl);
        }
      }

      console.log(`🗺️ [Sitemap] Discovered ${sitemaps.length} sitemaps for ${domain}`);
      return Array.from(new Set(sitemaps)); // Remove duplicates

    } catch (error) {
      console.error(`❌ [Sitemap] Error discovering sitemaps for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Get recent entries from all sitemaps for a domain
   */
  async getRecentEntries(
    domain: string, 
    options: { hoursBack?: number; maxEntries?: number } = {}
  ): Promise<SitemapEntry[]> {
    const hoursBack = options.hoursBack || 48;
    const maxEntries = options.maxEntries || 1000;
    
    const sitemaps = await this.discoverSitemaps(domain);
    const allEntries: SitemapEntry[] = [];

    for (const sitemapUrl of sitemaps) {
      try {
        const entries = await this.parseSitemap(sitemapUrl, {
          filterRecent: true,
          maxEntries: Math.floor(maxEntries / sitemaps.length), // Distribute quota
          includeNews: true
        });
        allEntries.push(...entries);
      } catch (error) {
        console.warn(`⚠️ [Sitemap] Error parsing ${sitemapUrl}:`, error);
        continue;
      }
    }

    // Filter by time and sort by lastmod
    const cutoffTime = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
    const recentEntries = allEntries
      .filter(entry => entry.lastmod && entry.lastmod >= cutoffTime)
      .sort((a, b) => {
        if (!a.lastmod || !b.lastmod) return 0;
        return b.lastmod.getTime() - a.lastmod.getTime();
      })
      .slice(0, maxEntries);

    console.log(`🗺️ [Sitemap] Found ${recentEntries.length} recent entries from ${domain}`);
    return recentEntries;
  }

  private async fetchSitemap(url: string): Promise<string | null> {
    try {
      return await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const response = await fetch(url, {
            headers: { 
              'User-Agent': this.userAgent,
              'Accept': 'application/xml, text/xml, */*',
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const contentLength = response.headers.get('content-length');
          if (contentLength && parseInt(contentLength) > this.maxSitemapSize) {
            throw new Error(`Sitemap too large: ${contentLength} bytes`);
          }

          const xml = await response.text();
          
          if (xml.length > this.maxSitemapSize) {
            throw new Error(`Sitemap too large: ${xml.length} bytes`);
          }

          return xml;

        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });
    } catch (error) {
      console.error(`❌ [Sitemap] Error fetching ${url}:`, error);
      return null;
    }
  }

  private async checkSitemapExists(url: string): Promise<boolean> {
    try {
      return await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch(url, {
            method: 'HEAD',
            headers: { 'User-Agent': this.userAgent },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          return response.ok;

        } catch (error) {
          clearTimeout(timeoutId);
          return false;
        }
      });
    } catch (error) {
      return false;
    }
  }

  private isSitemapIndex(xml: string): boolean {
    return xml.includes('<sitemapindex') || xml.includes('</sitemapindex>');
  }

  private async parseSitemapIndex(
    xml: string, 
    options: any
  ): Promise<SitemapEntry[]> {
    console.log(`🗺️ [Sitemap] Parsing sitemap index`);
    
    const $ = cheerio.load(xml, { xmlMode: true });
    const sitemaps: string[] = [];
    const allEntries: SitemapEntry[] = [];

    // Extract sitemap URLs from index
    $('sitemap').each((_, element) => {
      const $element = $(element);
      const loc = $element.find('loc').first().text().trim();
      if (loc) {
        sitemaps.push(loc);
      }
    });

    console.log(`🗺️ [Sitemap] Found ${sitemaps.length} sitemaps in index`);

    // Parse each individual sitemap
    const entriesPerSitemap = Math.floor((options.maxEntries || this.maxEntries) / sitemaps.length);
    
    for (const sitemapUrl of sitemaps.slice(0, 10)) { // Limit to 10 sitemaps to avoid timeouts
      try {
        const sitemapXml = await this.fetchSitemap(sitemapUrl);
        if (sitemapXml) {
          const entries = this.parseRegularSitemap(sitemapXml, {
            ...options,
            maxEntries: entriesPerSitemap
          });
          allEntries.push(...entries);
        }
      } catch (error) {
        console.warn(`⚠️ [Sitemap] Error parsing sitemap ${sitemapUrl}:`, error);
        continue;
      }
    }

    return allEntries;
  }

  private parseRegularSitemap(
    xml: string, 
    options: {
      filterRecent?: boolean;
      maxEntries?: number;
      includeImages?: boolean;
      includeNews?: boolean;
    }
  ): SitemapEntry[] {
    console.log(`🗺️ [Sitemap] Parsing regular sitemap`);
    
    const $ = cheerio.load(xml, { xmlMode: true });
    const entries: SitemapEntry[] = [];
    const maxEntries = options.maxEntries || this.maxEntries;
    const cutoffTime = options.filterRecent 
      ? new Date(Date.now() - this.recentTimeframe) 
      : null;

    $('url').each((_index, element) => {
      if (entries.length >= maxEntries) {
        return false; // Break the loop
      }

      const $element = $(element);
      const loc = $element.find('loc').first().text().trim();

      if (!loc) return undefined;

      const entry: SitemapEntry = { url: loc };

      // Parse lastmod
      const lastmodText = $element.find('lastmod').first().text().trim();
      if (lastmodText) {
        const lastmod = new Date(lastmodText);
        if (!isNaN(lastmod.getTime())) {
          entry.lastmod = lastmod;
        }
      }

      // Filter by recency if requested
      if (cutoffTime && entry.lastmod && entry.lastmod < cutoffTime) {
        return undefined; // Skip this entry
      }

      // Parse changefreq
      const changefreq = $element.find('changefreq').first().text().trim();
      if (changefreq) {
        entry.changefreq = changefreq as any;
      }

      // Parse priority
      const priorityText = $element.find('priority').first().text().trim();
      if (priorityText) {
        const priority = parseFloat(priorityText);
        if (!isNaN(priority)) {
          entry.priority = priority;
        }
      }

      // Parse images if requested
      if (options.includeImages) {
        const images: SitemapImage[] = [];
        $element.find('image\\:image').each((_, imgElement) => {
          const $img = $(imgElement);
          const imgLoc = $img.find('image\\:loc').first().text().trim();
          if (imgLoc) {
            images.push({
              loc: imgLoc,
              caption: $img.find('image\\:caption').first().text().trim() || undefined,
              title: $img.find('image\\:title').first().text().trim() || undefined,
            });
          }
        });
        if (images.length > 0) {
          entry.images = images;
        }
      }

      // Parse news if requested
      if (options.includeNews) {
        const $news = $element.find('news\\:news');
        if ($news.length > 0) {
          const title = $news.find('news\\:title').first().text().trim();
          if (title) {
            entry.news = { title };

            const pubDateText = $news.find('news\\:publication_date').first().text().trim();
            if (pubDateText) {
              const pubDate = new Date(pubDateText);
              if (!isNaN(pubDate.getTime())) {
                entry.news.publishedDate = pubDate;
              }
            }

            const keywords = $news.find('news\\:keywords').first().text().trim();
            if (keywords) {
              entry.news.keywords = keywords.split(',').map(k => k.trim());
            }
          }
        }
      }

      entries.push(entry);
      return undefined;
    });

    console.log(`🗺️ [Sitemap] Parsed ${entries.length} entries from sitemap`);
    return entries;
  }

  /**
   * Validate sitemap format
   */
  validateSitemapFormat(xml: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const $ = cheerio.load(xml, { xmlMode: true });
      
      // Check for root element
      const hasUrlset = $('urlset').length > 0;
      const hasSitemapIndex = $('sitemapindex').length > 0;
      
      if (!hasUrlset && !hasSitemapIndex) {
        errors.push('Missing required root element: <urlset> or <sitemapindex>');
      }

      // Check URL count (for regular sitemaps)
      if (hasUrlset) {
        const urlCount = $('url').length;
        if (urlCount > 50000) {
          errors.push(`Too many URLs: ${urlCount} (max: 50,000)`);
        }
      }

      // Validate URL entries
      $('url').each((index, element) => {
        const $element = $(element);
        const loc = $element.find('loc').first().text().trim();

        if (!loc) {
          errors.push(`URL entry ${index + 1} missing <loc> element`);
        } else {
          try {
            new URL(loc);
          } catch {
            errors.push(`Invalid URL in entry ${index + 1}: ${loc}`);
          }
        }

        // Validate lastmod format
        const lastmod = $element.find('lastmod').first().text().trim();
        if (lastmod) {
          const date = new Date(lastmod);
          if (isNaN(date.getTime())) {
            errors.push(`Invalid lastmod date in entry ${index + 1}: ${lastmod}`);
          }
        }

        // Validate priority
        const priority = $element.find('priority').first().text().trim();
        if (priority) {
          const priorityNum = parseFloat(priority);
          if (isNaN(priorityNum) || priorityNum < 0 || priorityNum > 1) {
            errors.push(`Invalid priority in entry ${index + 1}: ${priority} (must be 0-1)`);
          }
        }
      });

    } catch (error) {
      errors.push(`XML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Default global instance
export const globalSitemapParser = new SitemapParser();