/**
 * Single Web Page Extraction Module
 *
 * Extracts content from any single web page URL - not limited to blog articles.
 * Handles landing pages, documentation, product pages, and other generic web content.
 *
 * Differences from extractArticle:
 * - Does not require article-like structure (no Readability minimum content threshold)
 * - Preserves full page structure including navigation context
 * - Extracts all links, images, and metadata from the page
 * - Returns structured sections (headers with their content)
 * - Supports raw HTML output alongside cleaned content
 */

import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { convertToMarkdown } from '../formatters/html-to-markdown';
import { cleanText, stripHTML } from '../formatters/text-cleaner';
import { globalRateLimiter } from '../scraping-rate-limiter';
import { estimateTokens } from '../llm/index';

// ============================================================================
// Types
// ============================================================================

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

export interface PageSection {
  heading: string;
  level: number; // 1-6 for h1-h6
  content: string;
}

export interface PageMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
  canonical?: string;
  favicon?: string;
  ogImage?: string;
  ogType?: string;
  language?: string;
  charset?: string;
  viewport?: string;
  robots?: string;
  generator?: string;
  themeColor?: string;
}

export interface ExtractedPage {
  url: string;
  /** Page title from <title> or <h1> */
  title: string;
  /** Raw HTML content of the page body */
  html: string;
  /** Cleaned markdown content */
  markdown: string;
  /** Plain text content */
  text: string;
  /** Cleaned article-like content (Readability output if available) */
  articleContent?: string;
  /** Short description/excerpt */
  description: string;
  /** All links found on the page */
  links: PageLink[];
  /** All images found on the page */
  images: PageImage[];
  /** Content sections organized by headings */
  sections: PageSection[];
  /** Page metadata from <head> */
  metadata: PageMetadata;
  /** Structured data (JSON-LD, OpenGraph, etc.) */
  structured?: {
    jsonLd?: any[];
    openGraph?: Record<string, string>;
    twitterCard?: Record<string, string>;
  };
  /** Word count of text content */
  wordCount: number;
  /** Estimated token count */
  tokens: number;
  /** HTTP status code */
  statusCode: number;
  /** Content type header */
  contentType: string;
  /** Response time in ms */
  responseTime: number;
  /** Timestamp of extraction */
  extractedAt: Date;
}

export interface ExtractPageOptions {
  /** Include full list of links (default: true) */
  includeLinks?: boolean;
  /** Include full list of images (default: true) */
  includeImages?: boolean;
  /** Extract section structure (default: true) */
  extractSections?: boolean;
  /** Try Readability extraction for article content (default: true) */
  tryReadability?: boolean;
  /** Request timeout in ms (default: 15000) */
  timeout?: number;
  /** Custom User-Agent string */
  userAgent?: string;
  /** Custom headers */
  headers?: Record<string, string>;
}

// ============================================================================
// Core Implementation
// ============================================================================

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; OmniParse/1.0; +https://github.com/tyroneross/omniparse)';
const DEFAULT_TIMEOUT = 15000;
const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Extract content from any single web page URL.
 *
 * Unlike extractArticle which is optimized for blog posts/news articles,
 * extractPage handles any type of web page and returns comprehensive
 * structured data about the page.
 *
 * @param url - The URL to extract content from
 * @param options - Extraction options
 * @returns Extracted page data or null if fetch fails
 *
 * @example
 * ```typescript
 * import { extractPage } from '@tyroneross/omniparse/page';
 *
 * // Extract any web page
 * const page = await extractPage('https://example.com/about');
 *
 * console.log(page.title);           // Page title
 * console.log(page.markdown);        // Full page as markdown
 * console.log(page.links.length);    // Number of links found
 * console.log(page.sections);        // Content organized by headings
 * console.log(page.metadata);        // Meta tags, OG data, etc.
 * console.log(page.tokens);          // Estimated token count
 * ```
 */
export async function extractPage(
  url: string,
  options: ExtractPageOptions = {}
): Promise<ExtractedPage | null> {
  const {
    includeLinks = true,
    includeImages = true,
    extractSections = true,
    tryReadability = true,
    timeout = DEFAULT_TIMEOUT,
    userAgent = DEFAULT_USER_AGENT,
    headers = {},
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

  const startTime = Date.now();

  try {
    // Fetch page content
    const { html, statusCode, contentType } = await fetchPage(url, {
      timeout,
      userAgent,
      headers,
    });

    const responseTime = Date.now() - startTime;
    const $ = cheerio.load(html);

    // Extract metadata from <head>
    const metadata = extractMetadata($, parsedUrl);

    // Extract title
    const title = extractTitle($);

    // Extract description
    const description = extractDescription($);

    // Remove script, style, and other non-content elements for text extraction
    const $clean = cheerio.load(html);
    $clean('script, style, noscript, svg, canvas').remove();

    // Get body HTML for markdown conversion
    const bodyHtml = $clean('body').html() || $clean.html() || '';

    // Convert to markdown and text
    const markdown = convertToMarkdown(bodyHtml);
    const text = cleanText(stripHTML(bodyHtml));

    // Try Readability for article-like content
    let articleContent: string | undefined;
    if (tryReadability) {
      articleContent = tryReadabilityExtraction(html, url) || undefined;
    }

    // Extract links
    const links = includeLinks ? extractLinks($, parsedUrl) : [];

    // Extract images
    const images = includeImages ? extractImages($, parsedUrl) : [];

    // Extract sections
    const sections = extractSections ? extractPageSections($clean) : [];

    // Extract structured data
    const structured = extractStructuredData($);

    // Calculate metrics
    const wordCount = countWords(text);
    const tokens = estimateTokens(text);

    return {
      url,
      title,
      html: bodyHtml,
      markdown,
      text,
      articleContent: articleContent || undefined,
      description,
      links,
      images,
      sections,
      metadata,
      structured: Object.keys(structured).length > 0 ? structured : undefined,
      wordCount,
      tokens,
      statusCode,
      contentType,
      responseTime,
      extractedAt: new Date(),
    };
  } catch (error) {
    console.error(`[PageExtractor] Error extracting ${url}:`, error);
    return null;
  }
}

/**
 * Extract content from raw HTML string (no network request).
 *
 * Useful when you already have the HTML and don't need to fetch it.
 *
 * @param html - Raw HTML string
 * @param sourceUrl - The source URL (used for resolving relative links)
 * @returns Extracted page data
 */
export function extractPageFromHTML(
  html: string,
  sourceUrl: string
): Omit<ExtractedPage, 'statusCode' | 'contentType' | 'responseTime'> {
  const parsedUrl = new URL(sourceUrl);
  const $ = cheerio.load(html);

  const metadata = extractMetadata($, parsedUrl);
  const title = extractTitle($);
  const description = extractDescription($);

  const $clean = cheerio.load(html);
  $clean('script, style, noscript, svg, canvas').remove();
  const bodyHtml = $clean('body').html() || $clean.html() || '';

  const markdown = convertToMarkdown(bodyHtml);
  const text = cleanText(stripHTML(bodyHtml));
  const articleContent = tryReadabilityExtraction(html, sourceUrl);

  const links = extractLinks($, parsedUrl);
  const images = extractImages($, parsedUrl);
  const sections = extractPageSections($clean);
  const structured = extractStructuredData($);

  const wordCount = countWords(text);
  const tokens = estimateTokens(text);

  return {
    url: sourceUrl,
    title,
    html: bodyHtml,
    markdown,
    text,
    articleContent: articleContent || undefined,
    description,
    links,
    images,
    sections,
    metadata,
    structured: Object.keys(structured).length > 0 ? structured : undefined,
    wordCount,
    tokens,
    extractedAt: new Date(),
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function fetchPage(
  url: string,
  options: { timeout: number; userAgent: string; headers: Record<string, string> }
): Promise<{ html: string; statusCode: number; contentType: string }> {
  return await globalRateLimiter.execute(url, async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': options.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate',
          ...options.headers,
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_CONTENT_SIZE) {
        throw new Error(`Content too large: ${contentLength} bytes`);
      }

      const html = await response.text();
      if (html.length > MAX_CONTENT_SIZE) {
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

function extractTitle($: cheerio.CheerioAPI): string {
  return (
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    $('title').text().trim() ||
    ''
  );
}

function extractDescription($: cheerio.CheerioAPI): string {
  return (
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') ||
    ''
  );
}

function extractMetadata($: cheerio.CheerioAPI, baseUrl: URL): PageMetadata {
  const meta: PageMetadata = {};

  meta.title = $('title').text().trim() || undefined;
  meta.description = $('meta[name="description"]').attr('content') || undefined;

  const keywordsStr = $('meta[name="keywords"]').attr('content');
  if (keywordsStr) {
    meta.keywords = keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
  }

  meta.canonical = $('link[rel="canonical"]').attr('href') || undefined;
  meta.favicon = resolveFavicon($, baseUrl);
  meta.ogImage = $('meta[property="og:image"]').attr('content') || undefined;
  meta.ogType = $('meta[property="og:type"]').attr('content') || undefined;
  meta.language = $('html').attr('lang') || $('meta[name="language"]').attr('content') || undefined;
  meta.charset = $('meta[charset]').attr('charset') || undefined;
  meta.viewport = $('meta[name="viewport"]').attr('content') || undefined;
  meta.robots = $('meta[name="robots"]').attr('content') || undefined;
  meta.generator = $('meta[name="generator"]').attr('content') || undefined;
  meta.themeColor = $('meta[name="theme-color"]').attr('content') || undefined;

  return meta;
}

function resolveFavicon($: cheerio.CheerioAPI, baseUrl: URL): string | undefined {
  const faviconHref =
    $('link[rel="icon"]').attr('href') ||
    $('link[rel="shortcut icon"]').attr('href');

  if (faviconHref) {
    try {
      return new URL(faviconHref, baseUrl.origin).href;
    } catch {
      return faviconHref;
    }
  }
  return undefined;
}

function extractLinks($: cheerio.CheerioAPI, baseUrl: URL): PageLink[] {
  const links: PageLink[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href || !text || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      return;
    }

    try {
      const resolved = new URL(href, baseUrl.origin).href;
      if (seen.has(resolved)) return;
      seen.add(resolved);

      const isExternal = new URL(resolved).hostname !== baseUrl.hostname;
      links.push({ url: resolved, text, isExternal });
    } catch {
      // Skip malformed URLs
    }
  });

  return links;
}

function extractImages($: cheerio.CheerioAPI, baseUrl: URL): PageImage[] {
  const images: PageImage[] = [];
  const seen = new Set<string>();

  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (!src || src.startsWith('data:')) return;

    try {
      const resolved = new URL(src, baseUrl.origin).href;
      if (seen.has(resolved)) return;
      seen.add(resolved);

      images.push({
        src: resolved,
        alt: $(el).attr('alt') || undefined,
        width: parseInt($(el).attr('width') || '0') || undefined,
        height: parseInt($(el).attr('height') || '0') || undefined,
      });
    } catch {
      // Skip malformed URLs
    }
  });

  return images;
}

function extractPageSections($: cheerio.CheerioAPI): PageSection[] {
  const sections: PageSection[] = [];

  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tagName = (el as any).tagName?.toLowerCase() || '';
    const level = parseInt(tagName.replace('h', '')) || 0;
    if (level < 1 || level > 6) return;

    const heading = $(el).text().trim();
    if (!heading) return;

    // Get content until next heading of same or higher level
    let content = '';
    let next = $(el).next();
    while (next.length) {
      const nextTag = (next[0] as any).tagName?.toLowerCase() || '';
      if (/^h[1-6]$/.test(nextTag)) {
        const nextLevel = parseInt(nextTag.replace('h', ''));
        if (nextLevel <= level) break;
      }
      content += next.text().trim() + '\n';
      next = next.next();
    }

    sections.push({
      heading,
      level,
      content: content.trim(),
    });
  });

  return sections;
}

function extractStructuredData($: cheerio.CheerioAPI): {
  jsonLd?: any[];
  openGraph?: Record<string, string>;
  twitterCard?: Record<string, string>;
} {
  const result: {
    jsonLd?: any[];
    openGraph?: Record<string, string>;
    twitterCard?: Record<string, string>;
  } = {};

  // JSON-LD
  const jsonLdScripts: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).html();
      if (text) jsonLdScripts.push(JSON.parse(text));
    } catch { /* skip */ }
  });
  if (jsonLdScripts.length > 0) result.jsonLd = jsonLdScripts;

  // OpenGraph
  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr('property');
    const content = $(el).attr('content');
    if (prop && content) og[prop] = content;
  });
  if (Object.keys(og).length > 0) result.openGraph = og;

  // Twitter Card
  const tc: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr('name');
    const content = $(el).attr('content');
    if (name && content) tc[name] = content;
  });
  if (Object.keys(tc).length > 0) result.twitterCard = tc;

  return result;
}

function tryReadabilityExtraction(html: string, url: string): string | null {
  try {
    const virtualConsole = new (require('jsdom').VirtualConsole)();
    virtualConsole.on('error', () => { /* suppress */ });

    const dom = new JSDOM(html, {
      url,
      virtualConsole,
      runScripts: 'outside-only',
      resources: 'usable',
    });

    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    return article?.content || null;
  } catch {
    return null;
  }
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
