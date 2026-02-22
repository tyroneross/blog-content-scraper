/**
 * Single Web Page Extractor
 *
 * Handles extraction of any single web page URL - not limited to blog articles.
 * Works with landing pages, documentation, product pages, wiki entries, etc.
 * Falls back gracefully through multiple extraction strategies.
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import * as cheerio from 'cheerio';
import { globalRateLimiter } from '../scraping-rate-limiter';
import { globalRobotsChecker } from '../web-scrapers/robots-checker';
import { convertToMarkdown } from '../formatters/html-to-markdown';
import { cleanText, stripHTML } from '../formatters/text-cleaner';

export interface PageContent {
  url: string;
  /** Page title */
  title: string;
  /** Raw HTML of the main content */
  html: string;
  /** Markdown formatted content */
  markdown: string;
  /** Plain text content */
  text: string;
  /** Short excerpt */
  excerpt: string;
  /** Page type detected */
  pageType: 'article' | 'landing' | 'documentation' | 'product' | 'wiki' | 'generic';
  /** HTTP status code */
  statusCode: number;
  /** Content-Type header */
  contentType: string;
  /** Word count */
  wordCount: number;
  /** Estimated reading time in minutes */
  readingTime: number;
  /** Extraction confidence 0-1 */
  confidence: number;
  /** Extraction method used */
  extractionMethod: 'readability' | 'main-content' | 'body-fallback';
  /** Page language */
  lang?: string;
  /** Page description from meta tags */
  description?: string;
  /** Canonical URL if different */
  canonicalUrl?: string;
  /** OpenGraph metadata */
  openGraph?: Record<string, string>;
  /** All links found on the page */
  links: PageLink[];
  /** Images found on the page */
  images: PageImage[];
  /** Page headings structure */
  headings: PageHeading[];
  /** Tables found on the page */
  tables: PageTable[];
  /** Extraction timestamp */
  extractedAt: Date;
  /** Errors during extraction */
  errors?: string[];
}

export interface PageLink {
  url: string;
  text: string;
  isExternal: boolean;
}

export interface PageImage {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface PageHeading {
  level: number;
  text: string;
}

export interface PageTable {
  headers: string[];
  rows: string[][];
}

export interface PageExtractOptions {
  /** Include all links found on the page (default: true) */
  includeLinks?: boolean;
  /** Include images metadata (default: true) */
  includeImages?: boolean;
  /** Include table data (default: true) */
  includeTables?: boolean;
  /** Include heading structure (default: true) */
  includeHeadings?: boolean;
  /** Maximum content size in bytes (default: 10MB) */
  maxContentSize?: number;
  /** Request timeout in milliseconds (default: 15000) */
  timeout?: number;
  /** Custom user agent */
  userAgent?: string;
  /** Skip robots.txt check (default: false) */
  skipRobotsCheck?: boolean;
  /** Minimum content length to accept (default: 50, lower than article extractor) */
  minContentLength?: number;
}

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; OmniParse/1.0; +https://github.com/tyroneross/scraper-app)';
const WORDS_PER_MINUTE = 200;

/**
 * Extract content from any single web page URL.
 *
 * Unlike `extractArticle()` which is optimized for blog posts/news articles,
 * `extractPage()` works with any web page including landing pages,
 * documentation, product pages, and wiki entries.
 *
 * @param url - The web page URL to extract
 * @param options - Extraction options
 * @returns Extracted page content or null if extraction fails
 *
 * @example
 * ```typescript
 * import { extractPage } from '@tyroneross/scraper-app';
 *
 * const page = await extractPage('https://example.com/about');
 * console.log(page.title);
 * console.log(page.markdown);
 * console.log(page.links.length, 'links found');
 * ```
 */
export async function extractPage(
  url: string,
  options: PageExtractOptions = {}
): Promise<PageContent | null> {
  const {
    includeLinks = true,
    includeImages = true,
    includeTables = true,
    includeHeadings = true,
    maxContentSize = 10 * 1024 * 1024,
    timeout = 15000,
    userAgent = DEFAULT_USER_AGENT,
    skipRobotsCheck = false,
    minContentLength = 50,
  } = options;

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`Invalid protocol: ${parsedUrl.protocol}`);
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid URL: "${url}". Expected format: https://example.com/path`);
    }
    throw error;
  }

  // SSRF protection
  if (isPrivateOrLocal(parsedUrl.hostname)) {
    throw new Error(`Private/local IP not allowed: ${url}`);
  }

  // robots.txt check
  if (!skipRobotsCheck) {
    const robotsCheck = await globalRobotsChecker.isAllowed(url);
    if (!robotsCheck.allowed) {
      return null;
    }
  }

  const errors: string[] = [];

  // Fetch HTML
  let html: string;
  let statusCode: number;
  let contentType: string;
  try {
    const result = await fetchPage(url, { timeout, userAgent, maxContentSize });
    html = result.html;
    statusCode = result.statusCode;
    contentType = result.contentType;
  } catch (error) {
    return null;
  }

  // Load HTML into cheerio for metadata extraction
  const $ = cheerio.load(html);

  // Extract metadata
  const title = extractTitle($);
  const description = extractDescription($);
  const lang = $('html').attr('lang') || $('meta[name="language"]').attr('content') || undefined;
  const canonicalUrl = $('link[rel="canonical"]').attr('href') || undefined;
  const openGraph = extractOpenGraph($);

  // Detect page type
  const pageType = detectPageType($, parsedUrl);

  // Extract main content through multiple strategies
  let mainHtml: string;
  let extractionMethod: 'readability' | 'main-content' | 'body-fallback';
  let confidence: number;

  // Strategy 1: Mozilla Readability
  const readabilityResult = extractWithReadability(html, url);
  if (readabilityResult && readabilityResult.textContent.length >= minContentLength) {
    mainHtml = readabilityResult.content;
    extractionMethod = 'readability';
    confidence = 0.9;
  } else {
    // Strategy 2: Main content area detection
    const mainContentResult = extractMainContent($);
    if (mainContentResult && stripHTML(mainContentResult).trim().length >= minContentLength) {
      mainHtml = mainContentResult;
      extractionMethod = 'main-content';
      confidence = 0.7;
      if (readabilityResult) {
        errors.push('Readability extraction succeeded but content was too short; fell back to main-content');
      }
    } else {
      // Strategy 3: Full body fallback
      removeNonContentElements($);
      mainHtml = $('body').html() || '';
      extractionMethod = 'body-fallback';
      confidence = 0.4;
      errors.push('Fell back to body content extraction');
    }
  }

  const markdown = convertToMarkdown(mainHtml);
  const text = cleanText(stripHTML(mainHtml));
  const wordCount = countWords(text);
  const readingTime = Math.ceil(wordCount / WORDS_PER_MINUTE);
  const excerpt = description || text.substring(0, 200) + (text.length > 200 ? '...' : '');

  // Extract structural elements
  const links = includeLinks ? extractLinks($, parsedUrl) : [];
  const images = includeImages ? extractImages($, parsedUrl) : [];
  const headings = includeHeadings ? extractHeadings($) : [];
  const tables = includeTables ? extractTables($) : [];

  return {
    url,
    title,
    html: mainHtml,
    markdown,
    text,
    excerpt,
    pageType,
    statusCode,
    contentType,
    wordCount,
    readingTime,
    confidence,
    extractionMethod,
    lang,
    description,
    canonicalUrl,
    openGraph: Object.keys(openGraph).length > 0 ? openGraph : undefined,
    links,
    images,
    headings,
    tables,
    extractedAt: new Date(),
    errors: errors.length > 0 ? errors : undefined,
  };
}

// --- Internal helpers ---

function isPrivateOrLocal(hostname: string): boolean {
  // Normalize hostname
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Exact matches
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;

  // IPv4 private ranges
  const privateIPv4 = [
    /^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./, /^169\.254\./, /^0\./,
  ];
  if (privateIPv4.some(r => r.test(h))) return true;

  // IPv6 private ranges
  const privateIPv6 = [/^fe80:/i, /^fc00:/i, /^fd00:/i, /^::ffff:127\./i, /^::ffff:10\./i,
    /^::ffff:192\.168\./i, /^::ffff:172\.(1[6-9]|2[0-9]|3[01])\./i, /^::ffff:0\./i];
  if (privateIPv6.some(r => r.test(h))) return true;

  // Block .local, .internal, and numeric-only hostnames that could be IPs
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;

  return false;
}

async function fetchPage(
  url: string,
  opts: { timeout: number; userAgent: string; maxContentSize: number }
): Promise<{ html: string; statusCode: number; contentType: string }> {
  return globalRateLimiter.execute(url, async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': opts.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > opts.maxContentSize) {
        throw new Error(`Content too large: ${contentLength} bytes`);
      }

      const html = await response.text();
      if (html.length > opts.maxContentSize) {
        throw new Error(`Content too large: ${html.length} bytes`);
      }

      return {
        html,
        statusCode: response.status,
        contentType: response.headers.get('content-type') || 'text/html',
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  });
}

function extractWithReadability(
  html: string,
  url: string
): { content: string; textContent: string } | null {
  try {
    const virtualConsole = new (require('jsdom').VirtualConsole)();
    virtualConsole.on('error', () => {});

    const dom = new JSDOM(html, {
      url,
      virtualConsole,
    });

    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.content) return null;

    return {
      content: article.content,
      textContent: article.textContent || '',
    };
  } catch {
    return null;
  }
}

function extractMainContent($: cheerio.CheerioAPI): string | null {
  const selectors = [
    'main',
    '[role="main"]',
    'article',
    '.content',
    '#content',
    '.main-content',
    '#main-content',
    '.page-content',
    '.post-content',
    '.entry-content',
    '.article-content',
    '.documentation-content',
    '.doc-content',
    '.wiki-content',
    '.markdown-body',
  ];

  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length > 0) {
      const html = el.html();
      if (html && html.length > 100) {
        return html;
      }
    }
  }

  return null;
}

function removeNonContentElements($: cheerio.CheerioAPI): void {
  const remove = [
    'script', 'style', 'nav', 'header', 'footer', 'aside',
    '.advertisement', '.ads', '.social-share', '.comments',
    '.sidebar', '.navigation', '.menu', '.popup', '.modal',
    '.cookie-banner', '.newsletter-signup', '[role="banner"]',
    '[role="navigation"]', '[role="complementary"]',
  ];
  remove.forEach(s => $(s).remove());
}

function extractTitle($: cheerio.CheerioAPI): string {
  return (
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    $('title').text().trim() ||
    'Untitled Page'
  );
}

function extractDescription($: cheerio.CheerioAPI): string | undefined {
  return (
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    undefined
  );
}

function extractOpenGraph($: cheerio.CheerioAPI): Record<string, string> {
  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr('property');
    const content = $(el).attr('content');
    if (prop && content) og[prop] = content;
  });
  return og;
}

function detectPageType(
  $: cheerio.CheerioAPI,
  parsedUrl: URL
): PageContent['pageType'] {
  const path = parsedUrl.pathname.toLowerCase();

  // Check JSON-LD for explicit type
  const jsonLd = $('script[type="application/ld+json"]').first().html();
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd);
      const type = (data['@type'] || '').toLowerCase();
      if (['article', 'newsarticle', 'blogposting'].includes(type)) return 'article';
      if (['product', 'offer'].includes(type)) return 'product';
    } catch { /* ignore */ }
  }

  // URL-based heuristics
  if (/\/(docs?|documentation|guide|manual|reference|api)\b/i.test(path)) return 'documentation';
  if (/\/(wiki|w)\//i.test(path)) return 'wiki';
  if (/\/(product|shop|store|item)\//i.test(path)) return 'product';
  if (/\/(blog|news|article|post)\//i.test(path)) return 'article';

  // Content-based heuristics
  if ($('article').length > 0 || $('.post-content').length > 0) return 'article';
  if ($('.product-page, .product-detail, [itemtype*="Product"]').length > 0) return 'product';

  // Check if it looks like a landing/home page
  if (path === '/' || path === '') return 'landing';

  return 'generic';
}

function extractLinks($: cheerio.CheerioAPI, baseUrl: URL): PageLink[] {
  const links: PageLink[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href || !text || href.startsWith('#') || href.startsWith('javascript:')) return;

    try {
      const absoluteUrl = new URL(href, baseUrl.origin).href;
      if (seen.has(absoluteUrl)) return;
      seen.add(absoluteUrl);

      const isExternal = new URL(absoluteUrl).hostname !== baseUrl.hostname;
      links.push({ url: absoluteUrl, text, isExternal });
    } catch { /* skip malformed URLs */ }
  });

  return links;
}

function extractImages($: cheerio.CheerioAPI, baseUrl: URL): PageImage[] {
  const images: PageImage[] = [];
  const seen = new Set<string>();

  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (!src) return;

    try {
      const absoluteSrc = new URL(src, baseUrl.origin).href;
      if (seen.has(absoluteSrc)) return;
      seen.add(absoluteSrc);

      images.push({
        src: absoluteSrc,
        alt: $(el).attr('alt') || undefined,
        width: parseInt($(el).attr('width') || '') || undefined,
        height: parseInt($(el).attr('height') || '') || undefined,
      });
    } catch { /* skip malformed URLs */ }
  });

  return images;
}

function extractHeadings($: cheerio.CheerioAPI): PageHeading[] {
  const headings: PageHeading[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = (el as any).tagName?.toLowerCase() || '';
    const level = parseInt(tag.replace('h', ''));
    const text = $(el).text().trim();
    if (text && level >= 1 && level <= 6) headings.push({ level, text });
  });
  return headings;
}

function extractTables($: cheerio.CheerioAPI): PageTable[] {
  const tables: PageTable[] = [];

  $('table').each((_, tableEl) => {
    const headers: string[] = [];
    const rows: string[][] = [];

    $(tableEl).find('thead th, thead td').each((_, th) => {
      headers.push($(th).text().trim());
    });

    // If no thead, use first row as headers
    if (headers.length === 0) {
      const firstRow = $(tableEl).find('tr').first();
      firstRow.find('th, td').each((_, td) => {
        headers.push($(td).text().trim());
      });
    }

    $(tableEl).find('tbody tr, tr').each((i, tr) => {
      // Skip header row if we already extracted it
      if (i === 0 && headers.length > 0 && $(tableEl).find('thead').length === 0) return;

      const row: string[] = [];
      $(tr).find('td, th').each((_, td) => {
        row.push($(td).text().trim());
      });
      if (row.length > 0) rows.push(row);
    });

    if (headers.length > 0 || rows.length > 0) {
      tables.push({ headers, rows });
    }
  });

  return tables;
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
