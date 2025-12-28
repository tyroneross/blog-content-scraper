import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import * as cheerio from 'cheerio';
import { globalRateLimiter } from '../utils/scraping-rate-limiter';
import { globalRobotsChecker } from './robots-checker';

export interface ExtractedContent {
  url: string;
  title: string;
  content: string;
  textContent: string;
  excerpt?: string;
  byline?: string;
  publishedTime?: Date;
  siteName?: string;
  lang?: string;
  
  // Structured data
  structured?: {
    jsonLd?: any;
    openGraph?: Record<string, string>;
    twitterCard?: Record<string, string>;
    microdata?: any[];
  };

  // Metadata
  wordCount: number;
  readingTime: number; // in minutes
  confidence: number; // 0-1, how confident we are in the extraction
  
  // Processing info
  extractionMethod: 'readability' | 'fallback' | 'structured';
  extractedAt: Date;
  errors?: string[];
}

interface SSRFProtection {
  isPrivateIP(url: string): boolean;
  isLocalhost(url: string): boolean;
  isAllowedProtocol(url: string): boolean;
}

export class ContentExtractor {
  private readonly userAgent = 'Mozilla/5.0 (compatible; AtomizeNews/1.0; +https://atomize-news.vercel.app)';
  private readonly timeout = 15000; // 15 seconds
  private readonly maxContentSize = 10 * 1024 * 1024; // 10MB max
  private readonly minContentLength = 200; // Minimum 200 characters
  private readonly wordsPerMinute = 200; // Average reading speed
  private readonly ssrfProtection: SSRFProtection;

  constructor() {
    this.ssrfProtection = {
      isPrivateIP: (url: string): boolean => {
        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname;
          
          // Check for private IP ranges
          const privateRanges = [
            /^127\./,                    // 127.0.0.0/8 (loopback)
            /^10\./,                     // 10.0.0.0/8 (private)
            /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12 (private)
            /^192\.168\./,               // 192.168.0.0/16 (private)
            /^169\.254\./,               // 169.254.0.0/16 (link-local)
            /^::1$/,                     // IPv6 loopback
            /^fe80:/,                    // IPv6 link-local
            /^fc00:/,                    // IPv6 unique local
            /^fd00:/                     // IPv6 unique local
          ];
          
          return privateRanges.some(range => range.test(hostname));
        } catch {
          return true; // If we can't parse, block it
        }
      },
      
      isLocalhost: (url: string): boolean => {
        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname.toLowerCase();
          return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
        } catch {
          return true;
        }
      },
      
      isAllowedProtocol: (url: string): boolean => {
        try {
          const urlObj = new URL(url);
          return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        } catch {
          return false;
        }
      }
    };
  }

  /**
   * Extract content from a URL
   */
  async extractContent(url: string): Promise<ExtractedContent | null> {
    console.log(`📖 [ContentExtractor] Starting content extraction from ${url}`);
    
    try {
      // SSRF protection
      if (!this.ssrfProtection.isAllowedProtocol(url)) {
        throw new Error(`Disallowed protocol: ${url}`);
      }
      
      if (this.ssrfProtection.isPrivateIP(url) || this.ssrfProtection.isLocalhost(url)) {
        throw new Error(`Private/local IP not allowed: ${url}`);
      }

      // Check robots.txt compliance
      const robotsCheck = await globalRobotsChecker.isAllowed(url);
      if (!robotsCheck.allowed) {
        console.warn(`🤖 [ContentExtractor] URL blocked by robots.txt: ${url} - ${robotsCheck.reason}`);
        return null;
      }

      const html = await this.fetchContent(url);
      if (!html) {
        return null;
      }

      // Extract content using multiple methods
      const extracted = await this.extractFromHTML(html, url);
      
      if (!extracted) {
        console.warn(`⚠️ [ContentExtractor] No content extracted from ${url}`);
        return null;
      }

      // Validate extracted content
      if (extracted.textContent.length < this.minContentLength) {
        console.warn(`⚠️ [ContentExtractor] Content too short (${extracted.textContent.length} chars): ${url}`);
        return null;
      }

      console.log(`✅ [ContentExtractor] Successfully extracted ${extracted.wordCount} words from ${url}`);
      return extracted;

    } catch (error) {
      console.error(`❌ [ContentExtractor] Error extracting content from ${url}:`, error);
      return null;
    }
  }

  /**
   * Extract content from multiple URLs
   */
  async extractBatch(urls: string[]): Promise<(ExtractedContent | null)[]> {
    console.log(`📖 [ContentExtractor] Starting batch extraction of ${urls.length} URLs`);
    
    const results: Promise<ExtractedContent | null>[] = urls.map(url => 
      this.extractContent(url).catch(error => {
        console.error(`❌ [ContentExtractor] Error in batch extraction for ${url}:`, error);
        return null;
      })
    );

    const extracted = await Promise.all(results);
    const successful = extracted.filter(Boolean).length;
    
    console.log(`📖 [ContentExtractor] Batch complete: ${successful}/${urls.length} successful`);
    return extracted;
  }

  private async fetchContent(url: string): Promise<string | null> {
    try {
      return await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const response = await fetch(url, {
            headers: { 
              'User-Agent': this.userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9'
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const contentLength = response.headers.get('content-length');
          if (contentLength && parseInt(contentLength) > this.maxContentSize) {
            throw new Error(`Content too large: ${contentLength} bytes`);
          }

          const html = await response.text();
          
          if (html.length > this.maxContentSize) {
            throw new Error(`Content too large: ${html.length} bytes`);
          }

          return html;

        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });
    } catch (error) {
      console.error(`❌ [ContentExtractor] Error fetching content from ${url}:`, error);
      return null;
    }
  }

  private async extractFromHTML(html: string, url: string): Promise<ExtractedContent | null> {
    const errors: string[] = [];
    
    try {
      // Try Readability first (most reliable)
      const readabilityResult = this.extractWithReadability(html, url);
      if (readabilityResult && readabilityResult.textContent.length >= this.minContentLength) {
        return {
          ...readabilityResult,
          extractionMethod: 'readability',
          confidence: 0.9
        };
      } else {
        errors.push('Readability extraction failed or content too short');
      }
    } catch (error) {
      errors.push(`Readability error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      // Fallback to manual extraction
      const fallbackResult = this.extractWithFallback(html, url);
      if (fallbackResult && fallbackResult.textContent.length >= this.minContentLength) {
        return {
          ...fallbackResult,
          extractionMethod: 'fallback',
          confidence: 0.6,
          errors
        };
      } else {
        errors.push('Fallback extraction failed or content too short');
      }
    } catch (error) {
      errors.push(`Fallback error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // If both methods fail, return null
    console.error(`❌ [ContentExtractor] All extraction methods failed for ${url}:`, errors);
    return null;
  }

  private extractWithReadability(html: string, url: string): ExtractedContent | null {
    try {
      const dom = new JSDOM(html, { url });
      const document = dom.window.document;
      
      const reader = new Readability(document);
      const article = reader.parse();
      
      if (!article) {
        return null;
      }

      // Extract structured data
      const structured = this.extractStructuredData(html, url);
      
      // Calculate metrics
      const wordCount = this.countWords(article.textContent);
      const readingTime = Math.ceil(wordCount / this.wordsPerMinute);

      return {
        url,
        title: article.title || '',
        content: article.content || '',
        textContent: article.textContent || '',
        excerpt: article.excerpt || undefined,
        byline: article.byline || undefined,
        publishedTime: this.extractPublishedTime(html),
        siteName: article.siteName || this.extractSiteName(html),
        lang: this.extractLanguage(html),
        structured,
        wordCount,
        readingTime,
        confidence: 0.9,
        extractionMethod: 'readability',
        extractedAt: new Date()
      };

    } catch (error) {
      console.error(`❌ [ContentExtractor] Readability extraction failed:`, error);
      return null;
    }
  }

  private extractWithFallback(html: string, url: string): ExtractedContent | null {
    try {
      const $ = cheerio.load(html);
      
      // Remove unwanted elements
      const unwantedSelectors = [
        'script', 'style', 'nav', 'header', 'footer', 
        '.advertisement', '.ads', '.social-share', '.comments',
        '.sidebar', '.navigation', '.menu', '.popup', '.modal'
      ];
      
      unwantedSelectors.forEach(selector => $(selector).remove());

      // Try to find the main content
      let content = '';
      let title = '';
      
      // Extract title
      title = $('h1').first().text().trim() || 
              $('title').text().trim() ||
              $('meta[property="og:title"]').attr('content') || '';

      // Try different content selectors
      const contentSelectors = [
        'article', 
        '.article-content', 
        '.post-content',
        '.entry-content',
        '.content',
        'main',
        '#content',
        '.story-body'
      ];

      for (const selector of contentSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          content = element.html() || '';
          if (content.length > this.minContentLength) {
            break;
          }
        }
      }

      // If no specific content area found, try to extract from body
      if (content.length < this.minContentLength) {
        content = $('body').html() || '';
      }

      if (!content || content.length < this.minContentLength) {
        return null;
      }

      const textContent = $(content).text().trim();
      const wordCount = this.countWords(textContent);
      const readingTime = Math.ceil(wordCount / this.wordsPerMinute);
      
      // Extract structured data
      const structured = this.extractStructuredData(html, url);

      return {
        url,
        title,
        content,
        textContent,
        excerpt: textContent.substring(0, 300) + '...',
        publishedTime: this.extractPublishedTime(html),
        siteName: this.extractSiteName(html),
        lang: this.extractLanguage(html),
        structured,
        wordCount,
        readingTime,
        confidence: 0.6,
        extractionMethod: 'fallback',
        extractedAt: new Date()
      };

    } catch (error) {
      console.error(`❌ [ContentExtractor] Fallback extraction failed:`, error);
      return null;
    }
  }

  private extractStructuredData(html: string, _url: string) {
    const structured: ExtractedContent['structured'] = {};

    try {
      const $ = cheerio.load(html);

      // Extract JSON-LD
      const jsonLdScripts: any[] = [];
      $('script[type="application/ld+json"]').each((_, element) => {
        try {
          const jsonText = $(element).html();
          if (jsonText) {
            const data = JSON.parse(jsonText);
            jsonLdScripts.push(data);
          }
        } catch {
          // Skip malformed JSON-LD
        }
      });
      
      if (jsonLdScripts.length > 0) {
        structured.jsonLd = jsonLdScripts;
      }

      // Extract OpenGraph tags
      const openGraph: Record<string, string> = {};
      $('meta[property^="og:"]').each((_, element) => {
        const property = $(element).attr('property');
        const content = $(element).attr('content');
        if (property && content) {
          openGraph[property] = content;
        }
      });
      
      if (Object.keys(openGraph).length > 0) {
        structured.openGraph = openGraph;
      }

      // Extract Twitter Card tags
      const twitterCard: Record<string, string> = {};
      $('meta[name^="twitter:"]').each((_, element) => {
        const name = $(element).attr('name');
        const content = $(element).attr('content');
        if (name && content) {
          twitterCard[name] = content;
        }
      });
      
      if (Object.keys(twitterCard).length > 0) {
        structured.twitterCard = twitterCard;
      }

      // Extract microdata (basic support)
      const microdata: any[] = [];
      $('[itemscope]').each((_, element) => {
        const $item = $(element);
        const itemType = $item.attr('itemtype');
        if (itemType) {
          const item: any = { '@type': itemType };
          $item.find('[itemprop]').each((_, propElement) => {
            const $prop = $(propElement);
            const propName = $prop.attr('itemprop');
            const propValue = $prop.attr('content') || $prop.text().trim();
            if (propName && propValue) {
              item[propName] = propValue;
            }
          });
          microdata.push(item);
        }
      });
      
      if (microdata.length > 0) {
        structured.microdata = microdata;
      }

    } catch (error) {
      console.warn(`⚠️ [ContentExtractor] Error extracting structured data:`, error);
    }

    return Object.keys(structured).length > 0 ? structured : undefined;
  }

  private extractPublishedTime(html: string): Date | undefined {
    try {
      const $ = cheerio.load(html);
      
      // Try different selectors for published time
      const timeSelectors = [
        'meta[property="article:published_time"]',
        'meta[name="datePublished"]',
        'meta[name="publishdate"]',
        'time[datetime]',
        '.published-date',
        '.publish-date',
        '.article-date'
      ];

      for (const selector of timeSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          const timeStr = element.attr('content') || element.attr('datetime') || element.text().trim();
          if (timeStr) {
            const date = new Date(timeStr);
            if (!isNaN(date.getTime())) {
              return date;
            }
          }
        }
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  private extractSiteName(html: string): string | undefined {
    try {
      const $ = cheerio.load(html);
      
      return $('meta[property="og:site_name"]').attr('content') ||
             $('meta[name="application-name"]').attr('content') ||
             undefined;
    } catch {
      return undefined;
    }
  }

  private extractLanguage(html: string): string | undefined {
    try {
      const $ = cheerio.load(html);
      
      return $('html').attr('lang') ||
             $('meta[name="language"]').attr('content') ||
             $('meta[http-equiv="content-language"]').attr('content') ||
             undefined;
    } catch {
      return undefined;
    }
  }

  private countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Validate extracted content quality
   */
  validateContent(content: ExtractedContent): {
    isValid: boolean;
    issues: string[];
    score: number; // 0-1
  } {
    const issues: string[] = [];
    let score = 1.0;

    // Check minimum content length
    if (content.textContent.length < this.minContentLength) {
      issues.push(`Content too short: ${content.textContent.length} characters`);
      score -= 0.5;
    }

    // Check title quality
    if (!content.title || content.title.length < 10) {
      issues.push('Missing or too short title');
      score -= 0.2;
    } else if (content.title.length > 200) {
      issues.push('Title too long');
      score -= 0.1;
    }

    // Check content-to-HTML ratio (detect pages with too much markup)
    const htmlLength = content.content.length;
    const textLength = content.textContent.length;
    const ratio = textLength / htmlLength;
    
    if (ratio < 0.1) {
      issues.push('Low text-to-HTML ratio - may be poorly extracted');
      score -= 0.2;
    }

    // Check for duplicate content indicators
    const sentences = content.textContent.split('.').filter(s => s.trim().length > 10);
    const uniqueSentences = new Set(sentences);
    const duplicateRatio = (sentences.length - uniqueSentences.size) / sentences.length;
    
    if (duplicateRatio > 0.3) {
      issues.push('High duplicate content detected');
      score -= 0.3;
    }

    return {
      isValid: issues.length === 0 && score >= 0.5,
      issues,
      score: Math.max(0, score)
    };
  }
}

// Default global instance
export const globalContentExtractor = new ContentExtractor();