import Parser from 'rss-parser';
import crypto from 'crypto';

const parser = new Parser({
  timeout: 15000, // Increased timeout
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; AtomizeNews/1.0; +https://atomize-news.vercel.app)'
  }
});

export interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  guid: string;
  content?: string;
  contentSnippet?: string;
}

/**
 * Creates a content-based hash for article deduplication.
 * Uses normalized title + date + source instead of URL to handle:
 * - URL tracking parameters (utm_source, etc.)
 * - URL redirects (HTTP vs HTTPS, www vs non-www)
 * - Cross-posting (same article on multiple sites)
 *
 * @param title - Article title
 * @param link - Article URL (legacy, kept for backward compatibility)
 * @param publishedAt - Publication date (defaults to now)
 * @param source - Source name (defaults to 'unknown')
 * @returns SHA-256 hash as hex string
 */
export function createGuidHash(
  title: string,
  _link: string,
  publishedAt: Date = new Date(),
  source: string = 'unknown'
): string {
  // Normalize title: lowercase, collapse whitespace, remove punctuation
  const normalizedTitle = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, ''); // Remove punctuation for better matching

  // Extract date bucket (YYYY-MM-DD) - same day articles might be duplicates
  const dateKey = publishedAt.toISOString().split('T')[0];

  // Normalize source name
  const normalizedSource = source.toLowerCase().trim();

  // Create composite key: title | date | source
  const composite = `${normalizedTitle}|${dateKey}|${normalizedSource}`;

  // Generate SHA-256 hash
  const hash = crypto.createHash('sha256').update(composite).digest('hex');

  // Log for debugging (in development)
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 [GuidHash] Generated hash for: "${title.substring(0, 50)}..." from ${source} on ${dateKey}`);
  }

  return hash;
}

export async function fetchRSSFeed(url: string, _sourceId?: string): Promise<RSSItem[]> {
  // const now = new Date(); // Currently unused

  try {
    console.log(`🔄 [RSS] Fetching feed from ${url}`);
    
    const feed = await parser.parseURL(url);
    
    if (!feed.items || feed.items.length === 0) {
      console.warn(`⚠️ [RSS] Feed from ${url} contains no items`);
      return [];
    }

    const items = feed.items.map(item => ({
      title: item.title || 'Untitled',
      link: item.link || '',
      pubDate: item.pubDate || new Date().toISOString(),
      guid: item.guid || item.link || crypto.randomUUID(),
      content: item.content || item['content:encoded'] || '',
      contentSnippet: item.contentSnippet || ''
    }));

    console.log(`✅ [RSS] Successfully fetched ${items.length} items from ${url}`);
    return items;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [RSS] Failed to fetch RSS from ${url}:`, errorMessage);

    // Log specific error types for debugging
    if (error instanceof Error) {
      if (error.message.includes('Invalid character')) {
        console.error(`🔍 [RSS] XML parsing error - feed may be malformed or contain HTML`);
      } else if (error.message.includes('timeout')) {
        console.error(`🔍 [RSS] Request timeout - server may be slow or unreachable`);
      } else if (error.message.includes('ENOTFOUND')) {
        console.error(`🔍 [RSS] Domain not found - check URL spelling`);
      } else if (error.message.includes('ECONNREFUSED')) {
        console.error(`🔍 [RSS] Connection refused - server may be down`);
      }
    }

    return [];
  }
}

// Enhanced RSS validation with better error handling
export async function validateRSSFeed(url: string): Promise<{
  isValid: boolean;
  error?: string;
  feedTitle?: string;
  itemCount?: number;
  contentType?: string;
}> {
  try {
    console.log(`🔍 [Validation] Validating RSS feed: ${url}`);
    
    // First check if URL is reachable
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AtomizeNews/1.0; +https://atomize-news.vercel.app)'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return {
        isValid: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        contentType: response.headers.get('content-type') || undefined
      };
    }

    const contentType = response.headers.get('content-type') || '';
    
    // Check if content type suggests RSS/XML
    const isRssContentType = 
      contentType.includes('application/rss+xml') ||
      contentType.includes('application/xml') ||
      contentType.includes('text/xml') ||
      contentType.includes('application/atom+xml');

    if (!isRssContentType && contentType.includes('text/html')) {
      return {
        isValid: false,
        error: 'URL returns HTML content instead of RSS feed',
        contentType
      };
    }

    // Now fetch and parse the actual RSS content
    const feed = await parser.parseURL(url);

    if (!feed.title) {
      return {
        isValid: false,
        error: 'RSS feed has no title - may be malformed',
        contentType
      };
    }

    if (!feed.items || feed.items.length === 0) {
      return {
        isValid: false,
        error: 'RSS feed contains no items',
        contentType,
        feedTitle: feed.title
      };
    }

    console.log(`✅ [Validation] RSS feed validated successfully: ${feed.title} (${feed.items.length} items)`);
    
    return {
      isValid: true,
      feedTitle: feed.title,
      itemCount: feed.items.length,
      contentType
    };

  } catch (error) {
    let errorMessage = 'Unknown validation error';
    
    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.name === 'AbortError') {
        errorMessage = 'Request timeout - URL may be unreachable';
      } else if (error.message.includes('Invalid character')) {
        errorMessage = 'Invalid RSS/XML format - feed may be malformed';
      } else if (error.message.includes('getaddrinfo ENOTFOUND')) {
        errorMessage = 'Domain not found - check URL spelling';
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Connection refused - server may be down';
      } else {
        errorMessage = error.message;
      }
    }

    console.error(`❌ [Validation] RSS validation failed for ${url}:`, errorMessage);
    
    return {
      isValid: false,
      error: errorMessage
    };
  }
}