/**
 * Omniparse Unified Router
 *
 * Provides clear input-type dispatching so local files are never routed
 * to the web scraper. The router detects the input type and dispatches
 * to the correct parser:
 *
 * - URLs (http/https)      → Web scraper (extractPage / extractArticle)
 * - .xlsx/.xls/.csv/.ods   → Excel parser
 * - .pptx                  → PowerPoint parser
 * - .py                    → Python source parser
 * - .pdf                   → PDF text extractor
 * - Raw HTML string        → Fast HTML extractor
 * - Directory path         → Batch process all supported files
 *
 * This ensures no accidental cross-routing between local and remote processing.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export type InputType =
  | 'url'
  | 'excel'
  | 'pptx'
  | 'python'
  | 'pdf'
  | 'html-string'
  | 'directory'
  | 'unsupported';

export interface ParseResult {
  /** Original input (file path or URL) */
  input: string;
  /** Detected input type */
  inputType: InputType;
  /** File name (basename or URL) */
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

export interface OmniparseOptions {
  /** For URLs: extract as article (true) or generic page (false, default) */
  articleMode?: boolean;
  /** For Excel: specific sheet names to extract */
  sheets?: string[];
  /**
   * For Excel: parse mode
   * - 'text': Cell data only. Fast. No rich content extraction. (default)
   * - 'full': Full structure — images, charts, comments, merged cells, hyperlinks.
   *           Also generates LLM chunks and structural summary.
   */
  parseMode?: 'text' | 'full';
  /** For PPTX: include speaker notes (default: true) */
  includeNotes?: boolean;
  /** For directories: process recursively (default: false) */
  recursive?: boolean;
  /** Concurrency for parallel document parsing in directories (default: 4) */
  concurrency?: number;
  /** Progress callback for batch/directory operations */
  onProgress?: (completed: number, total: number) => void;
  /** Suppress console output */
  quiet?: boolean;
}

// ============================================================================
// Input Detection
// ============================================================================

const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv', '.tsv', '.ods', '.xlsb']);
const PPTX_EXTENSIONS = new Set(['.pptx']);
const PYTHON_EXTENSIONS = new Set(['.py']);
const PDF_EXTENSIONS = new Set(['.pdf']);

/**
 * Detect the input type from a string.
 *
 * This is the core routing logic. It checks in order:
 * 1. Is it a URL? → url
 * 2. Does it look like HTML? → html-string
 * 3. Is it a directory path? → directory
 * 4. Is it a file with a known extension? → specific parser
 * 5. Otherwise → unsupported
 */
export function detectInputType(input: string): InputType {
  // Check for URL first (most distinct)
  if (/^https?:\/\//i.test(input)) {
    return 'url';
  }

  // Check for raw HTML string (contains HTML tags)
  if (input.includes('<') && input.includes('>') && /<\/?[a-z][\s\S]*>/i.test(input)) {
    return 'html-string';
  }

  // Check if it's a file system path
  try {
    const resolved = path.resolve(input);

    if (fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved);

      if (stat.isDirectory()) {
        return 'directory';
      }

      if (stat.isFile()) {
        const ext = path.extname(resolved).toLowerCase();

        if (EXCEL_EXTENSIONS.has(ext)) return 'excel';
        if (PPTX_EXTENSIONS.has(ext)) return 'pptx';
        if (PYTHON_EXTENSIONS.has(ext)) return 'python';
        if (PDF_EXTENSIONS.has(ext)) return 'pdf';

        return 'unsupported';
      }
    }

    // File doesn't exist - check extension anyway for better error messages
    const ext = path.extname(input).toLowerCase();
    if (EXCEL_EXTENSIONS.has(ext)) return 'excel';
    if (PPTX_EXTENSIONS.has(ext)) return 'pptx';
    if (PYTHON_EXTENSIONS.has(ext)) return 'python';
    if (PDF_EXTENSIONS.has(ext)) return 'pdf';
  } catch {
    // Not a valid path
  }

  return 'unsupported';
}

// ============================================================================
// Main Router
// ============================================================================

/**
 * Parse any input - the unified entry point for Omniparse.
 *
 * Detects the input type and dispatches to the appropriate parser.
 * Local files are never sent to the web scraper. URLs are never
 * processed as local files.
 *
 * @param input - File path, URL, or HTML string
 * @param options - Processing options
 * @returns Parsed result with markdown, text, and metadata
 *
 * @example
 * ```typescript
 * import { parse } from '@tyroneross/omniparse';
 *
 * // Automatically routes to the correct parser
 * const result = await parse('./report.xlsx');     // → Excel parser
 * const result = await parse('./deck.pptx');       // → PPTX parser
 * const result = await parse('./script.py');       // → Python parser
 * const result = await parse('https://example.com'); // → Web scraper
 * const result = await parse('./data/');           // → Batch all files
 * ```
 */
export async function parse(
  input: string,
  options: OmniparseOptions = {}
): Promise<ParseResult | ParseResult[]> {
  const inputType = detectInputType(input);

  switch (inputType) {
    case 'url':
      return parseUrl(input, options);

    case 'excel':
      return parseExcel(input, options);

    case 'pptx':
      return parsePptx(input, options);

    case 'python':
      return parsePython(input);

    case 'pdf':
      return parsePdf(input);

    case 'html-string':
      return parseHtmlString(input);

    case 'directory':
      return parseDirectory(input, options);

    case 'unsupported':
      throw new Error(
        `Unsupported input: "${input.substring(0, 100)}". ` +
        `Supported: URLs (http/https), .xlsx, .xls, .csv, .pptx, .py, .pdf, or directories.`
      );
  }
}

/**
 * Parse multiple inputs in parallel with concurrency control.
 *
 * Accepts any mix of file paths, URLs, and HTML strings.
 * Each input is routed to the correct parser independently.
 *
 * @param inputs - Array of file paths, URLs, or HTML strings
 * @param options - Parsing options (concurrency defaults to 4)
 * @returns Array of results in the same order as inputs
 *
 * @example
 * ```typescript
 * import { parseMultiple } from '@tyroneross/omniparse';
 *
 * const results = await parseMultiple([
 *   './report.xlsx',
 *   './deck.pptx',
 *   './script.py',
 *   'https://example.com/blog/post',
 * ], { concurrency: 4 });
 * ```
 */
export async function parseMultiple(
  inputs: string[],
  options: OmniparseOptions = {}
): Promise<ParseResult[]> {
  const concurrency = options.concurrency ?? 4;
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(concurrency);
  let completed = 0;

  const promises = inputs.map((input, idx) =>
    limit(async (): Promise<{ idx: number; results: ParseResult[] }> => {
      try {
        const result = await parse(input, options);
        const results = Array.isArray(result) ? result : [result];
        return { idx, results };
      } catch (error) {
        return {
          idx,
          results: [createErrorResult(
            input,
            detectInputType(input),
            error instanceof Error ? error.message : String(error),
            Date.now()
          )]
        };
      } finally {
        completed++;
        options.onProgress?.(completed, inputs.length);
      }
    })
  );

  const settled = await Promise.all(promises);
  // Flatten results preserving input order
  return settled.sort((a, b) => a.idx - b.idx).flatMap(r => r.results);
}

// ============================================================================
// Per-Type Parsers
// ============================================================================

async function parseUrl(url: string, options: OmniparseOptions): Promise<ParseResult> {
  const startTime = Date.now();

  if (options.articleMode) {
    // Use article extractor for blog/news URLs
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

  // Use page extractor for generic URLs
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

async function parseExcel(filePath: string, options: OmniparseOptions): Promise<ParseResult> {
  const startTime = Date.now();
  const { parseExcelFile } = await import('./parsers/excel-parser-fast');

  const result = parseExcelFile(filePath, {
    sheets: options.sheets,
    parseMode: options.parseMode,
  });

  const metadata: Record<string, any> = {
    format: result.format,
    parseMode: result.parseMode,
    sheetCount: result.sheetCount,
    totalRows: result.totalRows,
    totalCells: result.totalCells,
    sheets: result.sheets.map(s => ({
      name: s.name,
      headers: s.headers,
      rowCount: s.rowCount,
      columnCount: s.columnCount,
    })),
    properties: result.properties,
  };

  // Full mode: include rich content metadata
  if (result.structureSummary) {
    metadata.structureSummary = result.structureSummary;
  }
  if (result.chunks) {
    metadata.chunks = result.chunks;
  }
  if (result.richContent) {
    metadata.richContent = {
      imageCount: result.richContent.images.length,
      chartCount: result.richContent.charts.length,
      commentCount: result.richContent.comments.length,
      hyperlinkCount: result.richContent.hyperlinks.length,
      mergedCellCount: result.richContent.mergedCells.length,
      namedRangeCount: result.richContent.namedRanges.length,
      // Include chart data (for replication) but not raw image base64 (too large for metadata)
      charts: result.richContent.charts,
      comments: result.richContent.comments,
      hyperlinks: result.richContent.hyperlinks,
      mergedCells: result.richContent.mergedCells,
      namedRanges: result.richContent.namedRanges,
      // Image metadata without base64 (access images via result.richContent.images directly)
      images: result.richContent.images.map(i => ({
        fileName: i.fileName,
        contentType: i.contentType,
        size: i.size,
        sheetName: i.sheetName,
        cellRef: i.cellRef,
      })),
    };
  }

  return {
    input: filePath,
    inputType: 'excel',
    fileName: result.fileName,
    markdown: result.markdown,
    text: result.text,
    wordCount: result.wordCount,
    estimatedTokens: result.estimatedTokens,
    parseTime: result.parseTime,
    metadata,
    errors: result.errors,
  };
}

async function parsePptx(filePath: string, options: OmniparseOptions): Promise<ParseResult> {
  const { parsePptxFile } = await import('./parsers/pptx-parser-fast');

  const result = await parsePptxFile(filePath, {
    includeNotes: options.includeNotes ?? true,
  });

  return {
    input: filePath,
    inputType: 'pptx',
    fileName: result.fileName,
    markdown: result.markdown,
    text: result.text,
    wordCount: result.wordCount,
    estimatedTokens: result.estimatedTokens,
    parseTime: result.parseTime,
    metadata: {
      slideCount: result.slideCount,
      slides: result.slides.map(s => ({
        slideNumber: s.slideNumber,
        title: s.title,
        hasNotes: !!s.notes,
      })),
    },
    errors: result.errors,
  };
}

async function parsePython(filePath: string): Promise<ParseResult> {
  const { parsePythonFile } = await import('./parsers/python-parser');

  const result = parsePythonFile(filePath);

  return {
    input: filePath,
    inputType: 'python',
    fileName: result.fileName,
    markdown: result.markdown,
    text: result.text,
    wordCount: result.wordCount,
    estimatedTokens: result.estimatedTokens,
    parseTime: result.parseTime,
    metadata: {
      totalLines: result.totalLines,
      linesOfCode: result.linesOfCode,
      imports: result.imports.length,
      functions: result.functions.map(f => f.name),
      classes: result.classes.map(c => c.name),
      variables: result.variables.map(v => v.name),
    },
    errors: result.errors,
  };
}

async function parsePdf(filePath: string): Promise<ParseResult> {
  // Inline PDF parsing - no external dependency
  const startTime = Date.now();
  const fileName = path.basename(filePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);
  const text = extractPdfText(buffer);

  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;

  return {
    input: filePath,
    inputType: 'pdf',
    fileName,
    markdown: `# ${fileName}\n\n${text || '*No extractable text found. PDF may be image-based.*'}`,
    text,
    wordCount,
    estimatedTokens: Math.ceil(text.length / 4),
    parseTime: Date.now() - startTime,
    metadata: {
      fileSize: buffer.length,
      hasText: text.length > 0,
    },
    errors: text.length === 0 ? ['No extractable text found. PDF may be image-based or encrypted.'] : undefined,
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

/**
 * Parse all supported files in a directory — with parallel processing.
 *
 * Uses p-limit for concurrency control. Default concurrency: 4.
 * Files are parsed in parallel up to the concurrency limit, which is
 * significantly faster than sequential processing for directories with
 * many files (especially mixed Excel + PPTX + Python).
 */
async function parseDirectory(
  dirPath: string,
  options: OmniparseOptions
): Promise<ParseResult[]> {
  const supportedExts = new Set([
    ...EXCEL_EXTENSIONS,
    ...PPTX_EXTENSIONS,
    ...PYTHON_EXTENSIONS,
    ...PDF_EXTENSIONS,
  ]);

  const files = findFiles(dirPath, options.recursive ?? false, supportedExts);

  if (files.length === 0) {
    throw new Error(`No supported files found in: ${dirPath}`);
  }

  const concurrency = options.concurrency ?? 4;
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(concurrency);
  let completed = 0;

  const promises = files.map(file =>
    limit(async (): Promise<ParseResult[]> => {
      try {
        const result = await parse(file, options);
        return Array.isArray(result) ? result : [result];
      } catch (error) {
        return [createErrorResult(
          file,
          detectInputType(file),
          error instanceof Error ? error.message : String(error),
          Date.now()
        )];
      } finally {
        completed++;
        options.onProgress?.(completed, files.length);
      }
    })
  );

  const nestedResults = await Promise.all(promises);
  return nestedResults.flat();
}

// ============================================================================
// Helpers
// ============================================================================

function findFiles(dirPath: string, recursive: boolean, extensions: Set<string>): string[] {
  const files: string[] = [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...findFiles(fullPath, true, extensions));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.has(ext)) files.push(fullPath);
    }
  }

  return files.sort();
}

function createErrorResult(
  input: string,
  inputType: InputType,
  error: string,
  startTime: number
): ParseResult {
  return {
    input,
    inputType,
    fileName: path.basename(input),
    markdown: `# Error\n\n${error}`,
    text: '',
    wordCount: 0,
    estimatedTokens: 0,
    parseTime: Date.now() - startTime,
    metadata: {},
    errors: [error],
  };
}

/**
 * Basic PDF text extraction.
 * Handles both uncompressed and FlateDecode-compressed text streams.
 */
function extractPdfText(buffer: Buffer): string {
  const content = buffer.toString('latin1');
  const textParts: string[] = [];

  // Extract from uncompressed BT/ET blocks
  extractBtEtText(content, textParts);

  // If no text found, try decompressing FlateDecode streams
  if (textParts.length === 0) {
    try {
      const zlib = require('zlib');
      const streamPattern = /stream\r?\n([\s\S]*?)endstream/g;
      let match;

      while ((match = streamPattern.exec(content)) !== null) {
        try {
          const compressed = Buffer.from(match[1], 'latin1');
          const decompressed = zlib.inflateSync(compressed).toString('latin1');
          extractBtEtText(decompressed, textParts);
        } catch { /* skip non-deflate streams */ }
      }
    } catch { /* zlib unavailable */ }
  }

  let result = textParts.join(' ');
  result = result.replace(/\s+/g, ' ').trim();
  result = result.replace(/\.\s+([A-Z])/g, '.\n\n$1');

  return result;
}

function extractBtEtText(content: string, parts: string[]): void {
  const btEtPattern = /BT\s([\s\S]*?)ET/g;
  let btMatch;

  while ((btMatch = btEtPattern.exec(content)) !== null) {
    const block = btMatch[1];

    // Tj operator
    const tjPattern = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjPattern.exec(block)) !== null) {
      const decoded = decodePdfStr(tjMatch[1]);
      if (decoded.trim()) parts.push(decoded);
    }

    // TJ operator (array)
    const tjArrPattern = /\[((?:[^]]*?))\]\s*TJ/g;
    let tjArrMatch;
    while ((tjArrMatch = tjArrPattern.exec(block)) !== null) {
      const strPattern = /\(([^)]*)\)/g;
      let strMatch;
      const strs: string[] = [];
      while ((strMatch = strPattern.exec(tjArrMatch[1])) !== null) {
        strs.push(decodePdfStr(strMatch[1]));
      }
      if (strs.length > 0) parts.push(strs.join(''));
    }
  }
}

function decodePdfStr(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}
