/**
 * Document Parsers Module
 *
 * Provides parsing capabilities beyond web scraping:
 * - Single web page extraction (any URL, not just articles)
 * - Excel/CSV file parsing (SheetJS-based)
 * - PowerPoint (PPTX) file parsing with speaker notes
 * - Python source file parsing (static analysis)
 *
 * @example
 * ```typescript
 * import {
 *   extractPage,
 *   parseExcelFile,
 *   parsePptxFile,
 *   parsePythonFile
 * } from '@tyroneross/omniparse/parsers';
 *
 * // Extract any web page
 * const page = await extractPage('https://example.com/about');
 *
 * // Parse Excel spreadsheet
 * const excel = parseExcelFile('./data/report.xlsx');
 *
 * // Parse PowerPoint presentation
 * const pptx = await parsePptxFile('./deck.pptx');
 *
 * // Parse Python source
 * const py = parsePythonFile('./scripts/main.py');
 * ```
 */

// Page extraction
export {
  extractPage,
  type PageContent,
  type PageLink,
  type PageImage,
  type PageHeading,
  type PageTable,
  type PageExtractOptions,
} from './page-extractor';

// Excel parsing (v2 fast parser — single-pass, no duplicate sheet_to_csv)
// Supports parseMode: 'text' (fast, cell data only) or 'full' (images, charts, comments, etc.)
export {
  parseExcelFile,
  parseExcelBuffer,
  parseCSV,
  type ExcelParseResult,
  type ExcelSheet,
  type ExcelProperties,
  type ExcelParseOptions,
  type ExcelChunk,
  type ExcelStructureSummary,
  // Rich content types (populated in 'full' mode)
  type ExcelImage,
  type ExcelChart,
  type ExcelChartSeries,
  type ExcelComment,
  type ExcelMergedCell,
  type ExcelHyperlink,
  type ExcelNamedRange,
  type ExcelRichContent,
} from './excel-parser-fast';

// Rich content extraction (direct access for advanced use cases)
export { extractRichContent } from './excel-parser-rich';

// PowerPoint parsing (v2 fast parser — single-pass ZIP+SAX, parallel slides)
export {
  parsePptxFile,
  parsePptxBuffer,
  type PptxParseResult,
  type PptxSlide,
  type PptxParseOptions,
} from './pptx-parser-fast';

// Python parsing
export {
  parsePythonFile,
  parsePythonSource,
  type PythonParseResult,
  type PythonImport,
  type PythonFunction,
  type PythonClass,
  type PythonParameter,
  type PythonVariable,
  type PythonParseOptions,
} from './python-parser';
