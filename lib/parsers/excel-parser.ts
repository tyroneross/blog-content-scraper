/**
 * Excel File Parser
 *
 * Parses Excel files (.xlsx, .xls, .csv) into structured data.
 * Uses SheetJS (xlsx) for deterministic, high-fidelity extraction.
 *
 * Supports:
 * - .xlsx (Office Open XML)
 * - .xls (Legacy Binary Format)
 * - .csv / .tsv (Delimited text)
 * - .xlsb (Binary Spreadsheet)
 * - .ods (OpenDocument Spreadsheet)
 *
 * @see https://docs.sheetjs.com
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export interface ExcelParseResult {
  /** Original file path or name */
  fileName: string;
  /** File format detected */
  format: 'xlsx' | 'xls' | 'csv' | 'tsv' | 'xlsb' | 'ods' | 'unknown';
  /** All sheets in the workbook */
  sheets: ExcelSheet[];
  /** Total number of sheets */
  sheetCount: number;
  /** Total rows across all sheets */
  totalRows: number;
  /** Total cells with data across all sheets */
  totalCells: number;
  /** Workbook properties/metadata */
  properties?: ExcelProperties;
  /** Markdown representation of all sheets */
  markdown: string;
  /** Plain text representation */
  text: string;
  /** Word count of text content */
  wordCount: number;
  /** Estimated token count for LLM consumption */
  estimatedTokens: number;
  /** Parse time in milliseconds */
  parseTime: number;
  /** Errors encountered */
  errors?: string[];
}

export interface ExcelSheet {
  /** Sheet name */
  name: string;
  /** Sheet index (0-based) */
  index: number;
  /** Column headers (first row) */
  headers: string[];
  /** Data rows (excluding header) */
  rows: Record<string, any>[];
  /** Raw 2D array of all data */
  rawData: any[][];
  /** Number of rows (including header) */
  rowCount: number;
  /** Number of columns */
  columnCount: number;
  /** Cell range (e.g., "A1:F100") */
  range: string;
  /** Markdown table representation */
  markdown: string;
  /** CSV representation */
  csv: string;
}

export interface ExcelProperties {
  title?: string;
  subject?: string;
  author?: string;
  creator?: string;
  lastModifiedBy?: string;
  created?: Date;
  modified?: Date;
  company?: string;
  application?: string;
}

export interface ExcelParseOptions {
  /** Specific sheet names to parse (default: all) */
  sheets?: string[];
  /** Specific sheet indices to parse (default: all) */
  sheetIndices?: number[];
  /** Treat first row as header (default: true) */
  headerRow?: boolean;
  /** Maximum rows to parse per sheet (default: unlimited) */
  maxRows?: number;
  /** Maximum columns to parse per sheet (default: unlimited) */
  maxColumns?: number;
  /** Include empty cells in output (default: false) */
  includeEmpty?: boolean;
  /** Date format string for date cells (default: 'yyyy-mm-dd') */
  dateFormat?: string;
  /** Raw cell values without formatting (default: false) */
  rawValues?: boolean;
  /** Password for protected workbooks */
  password?: string;
}

/**
 * Parse an Excel file from a file path.
 *
 * @param filePath - Path to the Excel file
 * @param options - Parse options
 * @returns Parsed Excel data
 *
 * @example
 * ```typescript
 * import { parseExcelFile } from '@tyroneross/blog-scraper/parsers';
 *
 * const result = await parseExcelFile('./data/report.xlsx');
 * console.log(result.sheets[0].headers);
 * console.log(result.sheets[0].rows.length, 'data rows');
 * console.log(result.markdown); // Markdown table
 * ```
 */
export function parseExcelFile(
  filePath: string,
  options: ExcelParseOptions = {}
): ExcelParseResult {
  const startTime = Date.now();

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath, {
    type: 'file',
    cellDates: true,
    cellNF: true,
    cellStyles: false,
    password: options.password,
  });

  const fileName = path.basename(filePath);
  const format = detectFormat(filePath);

  return processWorkbook(workbook, fileName, format, options, startTime);
}

/**
 * Parse an Excel file from a Buffer.
 *
 * Useful for handling uploaded files or HTTP responses.
 *
 * @param buffer - File contents as Buffer
 * @param fileName - Original file name (for format detection)
 * @param options - Parse options
 * @returns Parsed Excel data
 *
 * @example
 * ```typescript
 * const response = await fetch('https://example.com/data.xlsx');
 * const buffer = Buffer.from(await response.arrayBuffer());
 * const result = parseExcelBuffer(buffer, 'data.xlsx');
 * ```
 */
export function parseExcelBuffer(
  buffer: Buffer,
  fileName: string = 'unknown.xlsx',
  options: ExcelParseOptions = {}
): ExcelParseResult {
  const startTime = Date.now();

  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    cellNF: true,
    cellStyles: false,
    password: options.password,
  });

  const format = detectFormat(fileName);

  return processWorkbook(workbook, fileName, format, options, startTime);
}

/**
 * Parse a CSV/TSV string directly.
 *
 * @param content - CSV or TSV string content
 * @param options - Parse options
 * @returns Parsed data
 */
export function parseCSV(
  content: string,
  options: ExcelParseOptions & { delimiter?: string } = {}
): ExcelParseResult {
  const startTime = Date.now();

  const workbook = XLSX.read(content, {
    type: 'string',
    FS: options.delimiter,
  });

  return processWorkbook(workbook, 'input.csv', 'csv', options, startTime);
}

// --- Internal helpers ---

function processWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
  format: ExcelParseResult['format'],
  options: ExcelParseOptions,
  startTime: number
): ExcelParseResult {
  const {
    sheets: sheetNames,
    sheetIndices,
    headerRow = true,
    maxRows,
    maxColumns,
    includeEmpty = false,
    rawValues = false,
  } = options;

  const errors: string[] = [];
  const parsedSheets: ExcelSheet[] = [];
  let totalRows = 0;
  let totalCells = 0;

  // Determine which sheets to process
  let targetSheets = workbook.SheetNames;
  if (sheetNames && sheetNames.length > 0) {
    targetSheets = targetSheets.filter(name => sheetNames.includes(name));
  }
  if (sheetIndices && sheetIndices.length > 0) {
    targetSheets = targetSheets.filter((_, i) => sheetIndices.includes(i));
  }

  for (let i = 0; i < targetSheets.length; i++) {
    const sheetName = targetSheets[i];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      errors.push(`Sheet "${sheetName}" not found in workbook`);
      continue;
    }

    try {
      const sheet = processSheet(worksheet, sheetName, i, {
        headerRow,
        maxRows,
        maxColumns,
        includeEmpty,
        rawValues,
      });

      parsedSheets.push(sheet);
      totalRows += sheet.rowCount;
      totalCells += sheet.rowCount * sheet.columnCount;
    } catch (error) {
      errors.push(`Error parsing sheet "${sheetName}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Generate combined markdown and text
  const markdown = parsedSheets.map(s => `## ${s.name}\n\n${s.markdown}`).join('\n\n');
  const text = parsedSheets.map(s => `${s.name}:\n${s.csv}`).join('\n\n');
  const wordCount = countWords(text);
  const estimatedTokens = Math.ceil(text.length / 4);

  // Extract workbook properties
  const properties = extractProperties(workbook);

  return {
    fileName,
    format,
    sheets: parsedSheets,
    sheetCount: parsedSheets.length,
    totalRows,
    totalCells,
    properties,
    markdown,
    text,
    wordCount,
    estimatedTokens,
    parseTime: Date.now() - startTime,
    errors: errors.length > 0 ? errors : undefined,
  };
}

function processSheet(
  worksheet: XLSX.WorkSheet,
  name: string,
  index: number,
  opts: {
    headerRow: boolean;
    maxRows?: number;
    maxColumns?: number;
    includeEmpty: boolean;
    rawValues: boolean;
  }
): ExcelSheet {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

  // Apply column limit
  if (opts.maxColumns) {
    range.e.c = Math.min(range.e.c, range.s.c + opts.maxColumns - 1);
  }

  // Apply row limit
  if (opts.maxRows) {
    range.e.r = Math.min(range.e.r, range.s.r + opts.maxRows - 1);
  }

  // Parse sheet data once as a 2D array
  const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: opts.rawValues,
    range,
  }) as any[][];

  // Extract headers and build row objects from the single parse result
  let headers: string[] = [];
  let dataRows: Record<string, any>[] = [];

  if (opts.headerRow && rawData.length > 0) {
    headers = (rawData[0] || []).map((h: any) => String(h ?? ''));
    // Build row objects from rawData[1..n] using extracted headers
    for (let r = 1; r < rawData.length; r++) {
      const row = rawData[r];
      const obj: Record<string, any> = {};
      for (let c = 0; c < headers.length; c++) {
        const val = row[c];
        if (val !== undefined || opts.includeEmpty) {
          obj[headers[c]] = val ?? (opts.includeEmpty ? '' : undefined);
        }
      }
      dataRows.push(obj);
    }
  } else {
    headers = rawData.length > 0
      ? rawData[0].map((_: any, i: number) => `Column${i + 1}`)
      : [];
    dataRows = rawData.map(row => {
      const obj: Record<string, any> = {};
      row.forEach((val: any, i: number) => {
        obj[headers[i] || `Column${i + 1}`] = val;
      });
      return obj;
    });
  }

  // Generate markdown table
  const markdown = generateMarkdownTable(headers, rawData.slice(opts.headerRow ? 1 : 0));

  // Generate CSV
  const csv = XLSX.utils.sheet_to_csv(worksheet, { RS: '\n', FS: ',' });

  const rangeStr = worksheet['!ref'] || 'A1';

  return {
    name,
    index,
    headers,
    rows: dataRows,
    rawData,
    rowCount: rawData.length,
    columnCount: headers.length,
    range: rangeStr,
    markdown,
    csv,
  };
}

function generateMarkdownTable(headers: string[], rows: any[][]): string {
  if (headers.length === 0) return '*Empty sheet*';

  const lines: string[] = [];

  // Header row
  lines.push('| ' + headers.map(h => escapeMarkdown(String(h))).join(' | ') + ' |');

  // Separator
  lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');

  // Data rows
  for (const row of rows) {
    const cells = headers.map((_, i) => {
      const val = row[i];
      return escapeMarkdown(val != null ? String(val) : '');
    });
    lines.push('| ' + cells.join(' | ') + ' |');
  }

  return lines.join('\n');
}

function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function extractProperties(workbook: XLSX.WorkBook): ExcelProperties | undefined {
  const props = workbook.Props;
  if (!props) return undefined;

  return {
    title: props.Title || undefined,
    subject: props.Subject || undefined,
    author: props.Author || undefined,
    creator: (props as any).Creator || undefined,
    lastModifiedBy: props.LastAuthor || undefined,
    created: props.CreatedDate ? new Date(props.CreatedDate) : undefined,
    modified: props.ModifiedDate ? new Date(props.ModifiedDate) : undefined,
    company: props.Company || undefined,
    application: props.Application || undefined,
  };
}

function detectFormat(filePath: string): ExcelParseResult['format'] {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.xlsx': return 'xlsx';
    case '.xls': return 'xls';
    case '.csv': return 'csv';
    case '.tsv': return 'tsv';
    case '.xlsb': return 'xlsb';
    case '.ods': return 'ods';
    default: return 'unknown';
  }
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
