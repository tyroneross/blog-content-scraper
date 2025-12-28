import * as cheerio from 'cheerio';
import { globalRateLimiter } from '../utils/scraping-rate-limiter';
import { globalRobotsChecker } from './robots-checker';

export interface DiscoveredFeed {
  url: string;
  title?: string;
  type: 'rss' | 'atom' | 'rdf';
  source: 'link-tag' | 'common-path' | 'content-scan';
  confidence: number; // 0-1, higher is better
}

export class RSSDiscovery {
  private readonly userAgent = 'Mozilla/5.0 (compatible; AtomizeNews/1.0; +https://atomize-news.vercel.app)';
  private readonly timeout = 10000; // 10 seconds
  // private readonly maxRedirects = 3; // Currently unused

  /**
   * Discover RSS feeds from a given URL
   */
  async discoverFeeds(url: string): Promise<DiscoveredFeed[]> {
    console.log(`🔍 [RSSDiscovery] Starting feed discovery for ${url}`);
    
    const feeds = new Map<string, DiscoveredFeed>();
    
    try {
      // Step 1: Check if the URL itself is a feed
      const directFeed = await this.checkDirectFeed(url);
      if (directFeed) {
        feeds.set(directFeed.url, directFeed);
        console.log(`✅ [RSSDiscovery] Direct feed found: ${directFeed.url}`);
        return Array.from(feeds.values());
      }

      // Step 2: Check robots.txt compliance
      const robotsCheck = await globalRobotsChecker.isAllowed(url);
      if (!robotsCheck.allowed) {
        console.warn(`🤖 [RSSDiscovery] URL blocked by robots.txt: ${url} - ${robotsCheck.reason}`);
        return [];
      }

      // Step 3: Fetch and parse HTML page
      const html = await this.fetchPage(url);
      if (!html) {
        return [];
      }

      // Step 4: Extract feeds from link tags in HTML
      const linkFeeds = this.extractFeedsFromHTML(html, url);
      linkFeeds.forEach(feed => feeds.set(feed.url, feed));

      // Step 5: Try common feed paths if no feeds found in HTML
      if (feeds.size === 0) {
        const commonPathFeeds = await this.checkCommonPaths(url);
        commonPathFeeds.forEach(feed => feeds.set(feed.url, feed));
      }

      // Step 6: Content-based feed discovery (look for feed-like content)
      if (feeds.size === 0) {
        const contentFeeds = await this.scanForFeedContent(html, url);
        contentFeeds.forEach(feed => feeds.set(feed.url, feed));
      }

      const discoveredFeeds = Array.from(feeds.values());
      discoveredFeeds.sort((a, b) => b.confidence - a.confidence); // Sort by confidence descending

      console.log(`🔍 [RSSDiscovery] Discovered ${discoveredFeeds.length} feeds for ${url}`);
      return discoveredFeeds;

    } catch (error) {
      console.error(`❌ [RSSDiscovery] Error discovering feeds for ${url}:`, error);
      return [];
    }
  }

  /**
   * Check if the URL itself is a direct feed
   */
  private async checkDirectFeed(url: string): Promise<DiscoveredFeed | null> {
    try {
      const response = await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const res = await fetch(url, {
            method: 'HEAD',
            headers: { 'User-Agent': this.userAgent },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          return res;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });

      const contentType = response.headers.get('content-type') || '';
      
      if (this.isFeedContentType(contentType)) {
        const type = this.determineFeedType(contentType);
        return {
          url,
          type,
          source: 'link-tag',
          confidence: 1.0
        };
      }

      return null;
    } catch (error) {
      // Not a direct feed, continue with other discovery methods
      return null;
    }
  }

  /**
   * Fetch HTML page content
   */
  private async fetchPage(url: string): Promise<string | null> {
    try {
      return await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const response = await fetch(url, {
            headers: { 'User-Agent': this.userAgent },
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
      console.error(`❌ [RSSDiscovery] Error fetching page ${url}:`, error);
      return null;
    }
  }

  /**
   * Extract feed URLs from HTML link tags
   */
  private extractFeedsFromHTML(html: string, baseUrl: string): DiscoveredFeed[] {
    const feeds: DiscoveredFeed[] = [];
    
    try {
      const $ = cheerio.load(html);
      
      // Look for RSS/Atom feed links
      $('link[rel="alternate"]').each((_, element) => {
        const $link = $(element);
        const type = $link.attr('type');
        const href = $link.attr('href');
        const title = $link.attr('title');

        if (href && this.isFeedContentType(type || '')) {
          const absoluteUrl = this.resolveUrl(href, baseUrl);
          if (absoluteUrl) {
            feeds.push({
              url: absoluteUrl,
              title: title || undefined,
              type: this.determineFeedType(type || ''),
              source: 'link-tag',
              confidence: 0.9
            });
          }
        }
      });

      // Look for other potential feed links
      $('a[href]').each((_, element) => {
        const $link = $(element);
        const href = $link.attr('href');
        const text = $link.text().toLowerCase().trim();

        if (href && this.isFeedLikeLink(href, text)) {
          const absoluteUrl = this.resolveUrl(href, baseUrl);
          if (absoluteUrl && !feeds.some(f => f.url === absoluteUrl)) {
            feeds.push({
              url: absoluteUrl,
              title: $link.text().trim() || undefined,
              type: this.guessFeedType(href),
              source: 'content-scan',
              confidence: 0.6
            });
          }
        }
      });

    } catch (error) {
      console.error(`❌ [RSSDiscovery] Error parsing HTML for feeds:`, error);
    }

    return feeds;
  }

  /**
   * Check common feed paths
   */
  private async checkCommonPaths(url: string): Promise<DiscoveredFeed[]> {
    const baseUrl = new URL(url);
    const commonPaths = [
      '/feed/',
      '/feed.xml',
      '/rss/',
      '/rss.xml', 
      '/feeds/',
      '/feeds.xml',
      '/atom.xml',
      '/index.xml',
      '/blog/feed/',
      '/blog/rss.xml',
      '/news/feed/',
      '/news/rss.xml'
    ];

    const feeds: DiscoveredFeed[] = [];
    
    for (const path of commonPaths) {
      try {
        const testUrl = `${baseUrl.protocol}//${baseUrl.host}${path}`;
        
        // Check robots.txt for this specific path
        const robotsCheck = await globalRobotsChecker.isAllowed(testUrl);
        if (!robotsCheck.allowed) {
          continue;
        }

        const isValid = await this.validateFeedUrl(testUrl);
        if (isValid) {
          feeds.push({
            url: testUrl,
            type: this.guessFeedType(path),
            source: 'common-path',
            confidence: 0.7
          });
        }
      } catch (error) {
        // Continue checking other paths
        continue;
      }
    }

    return feeds;
  }

  /**
   * Scan HTML content for feed-like patterns
   */
  private async scanForFeedContent(html: string, baseUrl: string): Promise<DiscoveredFeed[]> {
    const feeds: DiscoveredFeed[] = [];
    
    try {
      const $ = cheerio.load(html);
      
      // Look for URLs in the content that might be feeds
      const text = $.text();
      const urlRegex = /https?:\/\/[^\s]+(?:feed|rss|atom)[^\s]*/gi;
      const matches = text.match(urlRegex);
      
      if (matches) {
        for (const match of matches) {
          const cleanUrl = match.replace(/[.,;:!?)]$/, ''); // Remove trailing punctuation
          const absoluteUrl = this.resolveUrl(cleanUrl, baseUrl);
          
          if (absoluteUrl && !feeds.some(f => f.url === absoluteUrl)) {
            const isValid = await this.validateFeedUrl(absoluteUrl);
            if (isValid) {
              feeds.push({
                url: absoluteUrl,
                type: this.guessFeedType(absoluteUrl),
                source: 'content-scan',
                confidence: 0.5
              });
            }
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ [RSSDiscovery] Error scanning content for feeds:`, error);
    }

    return feeds;
  }

  /**
   * Validate if a URL is actually a feed
   */
  private async validateFeedUrl(url: string): Promise<boolean> {
    try {
      return await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // Shorter timeout for validation

        try {
          const response = await fetch(url, {
            method: 'HEAD',
            headers: { 'User-Agent': this.userAgent },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          
          if (!response.ok) {
            return false;
          }

          const contentType = response.headers.get('content-type') || '';
          return this.isFeedContentType(contentType);
          
        } catch (error) {
          clearTimeout(timeoutId);
          return false;
        }
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Resolve relative URLs to absolute URLs
   */
  private resolveUrl(url: string, baseUrl: string): string | null {
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      return null;
    }
  }

  /**
   * Check if content type indicates a feed
   */
  private isFeedContentType(contentType: string): boolean {
    const lowerType = contentType.toLowerCase();
    return lowerType.includes('application/rss+xml') ||
           lowerType.includes('application/atom+xml') ||
           lowerType.includes('application/rdf+xml') ||
           lowerType.includes('text/xml') ||
           lowerType.includes('application/xml');
  }

  /**
   * Determine feed type from content type
   */
  private determineFeedType(contentType: string): 'rss' | 'atom' | 'rdf' {
    const lowerType = contentType.toLowerCase();
    if (lowerType.includes('atom')) return 'atom';
    if (lowerType.includes('rdf')) return 'rdf';
    return 'rss'; // Default to RSS
  }

  /**
   * Guess feed type from URL or text
   */
  private guessFeedType(urlOrText: string): 'rss' | 'atom' | 'rdf' {
    const lower = urlOrText.toLowerCase();
    if (lower.includes('atom')) return 'atom';
    if (lower.includes('rdf')) return 'rdf';
    return 'rss'; // Default to RSS
  }

  /**
   * Check if a link looks like it could be a feed
   */
  private isFeedLikeLink(href: string, text: string): boolean {
    const lowerHref = href.toLowerCase();
    const lowerText = text.toLowerCase();
    
    const feedKeywords = ['rss', 'feed', 'atom', 'xml', 'syndication'];
    
    return feedKeywords.some(keyword => 
      lowerHref.includes(keyword) || lowerText.includes(keyword)
    );
  }
}

// Default global instance
export const globalRSSDiscovery = new RSSDiscovery();