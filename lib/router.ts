/**
 * Scraper-App Unified Router
 *
 * Provides clear input-type dispatching for web content:
 *
 * - URLs (http/https)  → Page extractor / Article extractor
 * - Raw HTML string    → Fast HTML extractor
 *
 * @example
 * ```typescript
 * import { parse } from '@tyroneross/scraper-app';
 *
 * const result = await parse('https://example.com');     // → Page extractor
 * const result = await parse('<html>...</html>');         // → HTML extractor
 * ```
 */

import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export type InputType =
  | 'url'
  | 'html-string'
  | 'unsupported';

export interface ParseResult {
  /** Original input (URL or HTML string marker) */
  input: string;
  /** Detected input type */
  inputType: InputType;
  /** Page title or URL */
  fileName: string;
  /** Markdown output */
  markdown: string;
  /** Plain text output */
  text: string;
  /** Word count */
  wordCount: number;
  /** Estimated LLM token count */
  estimatedTokens: number;
  /** Processing time in ms */
  parseTime: number;
  /** Type-specific structured data */
  metadata: Record<string, any>;
  /** Any errors or warnings */
  errors?: string[];
}

export interface ScraperParseOptions {
  /** For URLs: extract as article (true) or generic page (false, default) */
  articleMode?: boolean;
  /** Concurrency for parallel operations (default: 4) */
  concurrency?: number;
  /** Progress callback for batch operations */
  onProgress?: (completed: number, total: number) => void;
  /** Suppress console output */
  quiet?: boolean;
}

// ============================================================================
// Input Detection
// ============================================================================

/**
 * Detect the input type from a string.
 *
 * 1. Is it a URL? → url
 * 2. Does it look like HTML? → html-string
 * 3. Otherwise → unsupported
 */
export function detectInputType(input: string): InputType {
  if (/^https?:\/\//i.test(input)) {
    return 'url';
  }

  if (input.includes('<') && input.includes('>') && /<\/?[a-z][\s\S]*>/i.test(input)) {
    return 'html-string';
  }

  return 'unsupported';
}

// ============================================================================
// Main Router
// ============================================================================

/**
 * Parse any web input - unified entry point.
 *
 * Detects URL vs HTML string and dispatches accordingly.
 *
 * @param input - URL or HTML string
 * @param options - Processing options
 * @returns Parsed result with markdown, text, and metadata
 */
export async function parse(
  input: string,
  options: ScraperParseOptions = {}
): Promise<ParseResult> {
  const inputType = detectInputType(input);

  switch (inputType) {
    case 'url':
      return parseUrl(input, options);

    case 'html-string':
      return parseHtmlString(input);

    case 'unsupported':
      throw new Error(
        `Unsupported input: "${input.substring(0, 100)}". ` +
        `Supported: URLs (http/https) or raw HTML strings.`
      );
  }
}

/**
 * Parse multiple URLs/HTML strings in parallel with concurrency control.
 *
 * @param inputs - Array of URLs or HTML strings
 * @param options - Parsing options (concurrency defaults to 4)
 * @returns Array of results in the same order as inputs
 */
export async function parseMultiple(
  inputs: string[],
  options: ScraperParseOptions = {}
): Promise<ParseResult[]> {
  const concurrency = options.concurrency ?? 4;
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(concurrency);
  let completed = 0;

  const promises = inputs.map((input, idx) =>
    limit(async (): Promise<{ idx: number; result: ParseResult }> => {
      try {
        const result = await parse(input, options);
        return { idx, result };
      } catch (error) {
        return {
          idx,
          result: createErrorResult(
            input,
            detectInputType(input),
            error instanceof Error ? error.message : String(error),
            Date.now()
          )
        };
      } finally {
        completed++;
        options.onProgress?.(completed, inputs.length);
      }
    })
  );

  const settled = await Promise.all(promises);
  return settled.sort((a, b) => a.idx - b.idx).map(r => r.result);
}

// ============================================================================
// Per-Type Parsers
// ============================================================================

async function parseUrl(url: string, options: ScraperParseOptions): Promise<ParseResult> {
  const startTime = Date.now();

  if (options.articleMode) {
    const { extractArticle } = await import('./index');
    const article = await extractArticle(url);

    if (!article) {
      return createErrorResult(url, 'url', 'Failed to extract article content', startTime);
    }

    return {
      input: url,
      inputType: 'url',
      fileName: article.title || url,
      markdown: `# ${article.title}\n\n${article.markdown}`,
      text: article.text,
      wordCount: article.wordCount,
      estimatedTokens: Math.ceil(article.text.length / 4),
      parseTime: Date.now() - startTime,
      metadata: {
        title: article.title,
        author: article.author,
        publishedDate: article.publishedDate,
        siteName: article.siteName,
        confidence: article.confidence,
        extractionMethod: article.extractionMethod,
      },
    };
  }

  const { extractPage } = await import('./parsers/page-extractor');
  const page = await extractPage(url);

  if (!page) {
    return createErrorResult(url, 'url', 'Failed to extract page content', startTime);
  }

  return {
    input: url,
    inputType: 'url',
    fileName: page.title,
    markdown: page.markdown,
    text: page.text,
    wordCount: page.wordCount,
    estimatedTokens: Math.ceil(page.text.length / 4),
    parseTime: Date.now() - startTime,
    metadata: {
      title: page.title,
      pageType: page.pageType,
      statusCode: page.statusCode,
      links: page.links.length,
      images: page.images.length,
      headings: page.headings,
      tables: page.tables,
      lang: page.lang,
      canonicalUrl: page.canonicalUrl,
    },
  };
}

async function parseHtmlString(html: string): Promise<ParseResult> {
  const startTime = Date.now();
  const { fastExtract } = await import('./optimizations/index');

  const result = fastExtract(html);

  if (!result) {
    return createErrorResult('<html-string>', 'html-string', 'Failed to extract content from HTML', startTime);
  }

  return {
    input: '<html-string>',
    inputType: 'html-string',
    fileName: result.title || 'HTML Document',
    markdown: result.markdown,
    text: result.text,
    wordCount: result.wordCount,
    estimatedTokens: Math.ceil(result.text.length / 4),
    parseTime: Date.now() - startTime,
    metadata: {
      title: result.title,
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function createErrorResult(
  input: string,
  inputType: InputType,
  error: string,
  startTime: number
): ParseResult {
  return {
    input,
    inputType,
    fileName: input.startsWith('http') ? input : path.basename(input),
    markdown: `# Error\n\n${error}`,
    text: '',
    wordCount: 0,
    estimatedTokens: 0,
    parseTime: Date.now() - startTime,
    metadata: {},
    errors: [error],
  };
}
