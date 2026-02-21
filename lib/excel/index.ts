/**
 * Excel Parsing Module
 *
 * Parses Excel files (.xlsx, .xls, .csv) and extracts structured data
 * suitable for LLM consumption.
 *
 * Uses SheetJS (xlsx) for deterministic, reliable parsing without GPU or AI.
 * Handles both local files and remote URLs.
 *
 * Key features:
 * - Parse .xlsx, .xls, .xlsb, .csv, .ods, and Numbers files
 * - Extract individual sheets or all sheets
 * - Convert to JSON, CSV, Markdown tables, or plain text
 * - Stream large files with row-by-row processing
 * - Column type detection (number, date, string, boolean)
 * - LLM-ready output with token estimation
 */

import { estimateTokens } from '../llm/index';

// ============================================================================
// Types
// ============================================================================

export interface ExcelSheet {
  /** Sheet name */
  name: string;
  /** Sheet index (0-based) */
  index: number;
  /** Row data as array of objects (header-keyed) */
  rows: Record<string, any>[];
  /** Raw row data as 2D array */
  rawRows: any[][];
  /** Column headers (first row) */
  headers: string[];
  /** Detected column types */
  columnTypes: Record<string, ColumnType>;
  /** Number of data rows (excluding header) */
  rowCount: number;
  /** Number of columns */
  columnCount: number;
}

export type ColumnType = 'string' | 'number' | 'date' | 'boolean' | 'empty' | 'mixed';

export interface ExcelParseResult {
  /** Original file path or URL */
  source: string;
  /** All parsed sheets */
  sheets: ExcelSheet[];
  /** Total number of sheets */
  sheetCount: number;
  /** Sheet names */
  sheetNames: string[];
  /** Total rows across all sheets */
  totalRows: number;
  /** File metadata */
  metadata: ExcelMetadata;
}

export interface ExcelMetadata {
  /** File format detected */
  format: string;
  /** Creator (if available in file properties) */
  creator?: string;
  /** Last modified by */
  lastModifiedBy?: string;
  /** Created date */
  created?: string;
  /** Modified date */
  modified?: string;
}

export interface ExcelFormatted {
  /** Markdown table representation */
  markdown: string;
  /** CSV representation */
  csv: string;
  /** Plain text representation */
  text: string;
  /** JSON representation */
  json: string;
  /** Estimated token count for the markdown representation */
  tokens: number;
  /** Source sheet name */
  sheetName: string;
}

export interface ParseExcelOptions {
  /** Specific sheet names to parse (default: all) */
  sheets?: string[];
  /** Specific sheet indices to parse (default: all) */
  sheetIndices?: number[];
  /** Max rows to parse per sheet (default: unlimited) */
  maxRows?: number;
  /** Whether first row contains headers (default: true) */
  hasHeaders?: boolean;
  /** Skip empty rows (default: true) */
  skipEmptyRows?: boolean;
  /** Date format for date columns (default: 'ISO') */
  dateFormat?: 'ISO' | 'US' | 'EU' | 'raw';
  /** Password for protected workbooks */
  password?: string;
}

// ============================================================================
// Core Implementation
// ============================================================================

// Lazy-load xlsx to avoid requiring it at import time
let XLSX: any = null;

async function getXLSX(): Promise<any> {
  if (!XLSX) {
    try {
      XLSX = await import('xlsx');
    } catch {
      throw new Error(
        'xlsx package is required for Excel parsing. Install it with: npm install xlsx'
      );
    }
  }
  return XLSX;
}

/**
 * Parse an Excel file from a local file path.
 *
 * @param filePath - Path to the Excel file
 * @param options - Parsing options
 * @returns Parsed Excel data
 *
 * @example
 * ```typescript
 * import { parseExcelFile } from '@tyroneross/omniparse/excel';
 *
 * const result = await parseExcelFile('./data/report.xlsx');
 *
 * for (const sheet of result.sheets) {
 *   console.log(`Sheet: ${sheet.name}, Rows: ${sheet.rowCount}`);
 *   console.log(sheet.headers);
 *   console.log(sheet.rows[0]); // First data row
 * }
 * ```
 */
export async function parseExcelFile(
  filePath: string,
  options: ParseExcelOptions = {}
): Promise<ExcelParseResult> {
  const xlsx = await getXLSX();
  const fs = await import('fs');

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const readOptions: any = {
    type: 'file' as const,
    cellDates: true,
    cellNF: true,
    cellStyles: false,
    dense: false,
  };

  if (options.password) {
    readOptions.password = options.password;
  }

  const workbook = xlsx.readFile(filePath, readOptions);
  return processWorkbook(workbook, filePath, options, xlsx);
}

/**
 * Parse an Excel file from a Buffer (e.g., from HTTP response or file read).
 *
 * @param buffer - Buffer containing Excel file data
 * @param sourceName - Name for the source (e.g., filename or URL)
 * @param options - Parsing options
 * @returns Parsed Excel data
 *
 * @example
 * ```typescript
 * import { parseExcelBuffer } from '@tyroneross/omniparse/excel';
 *
 * const response = await fetch('https://example.com/data.xlsx');
 * const buffer = Buffer.from(await response.arrayBuffer());
 * const result = await parseExcelBuffer(buffer, 'data.xlsx');
 * ```
 */
export async function parseExcelBuffer(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  sourceName: string = 'buffer',
  options: ParseExcelOptions = {}
): Promise<ExcelParseResult> {
  const xlsx = await getXLSX();

  const readOptions: any = {
    type: 'buffer' as const,
    cellDates: true,
    cellNF: true,
    cellStyles: false,
    dense: false,
  };

  if (options.password) {
    readOptions.password = options.password;
  }

  const workbook = xlsx.read(buffer, readOptions);
  return processWorkbook(workbook, sourceName, options, xlsx);
}

/**
 * Parse an Excel file from a URL (downloads and parses).
 *
 * @param url - URL to the Excel file
 * @param options - Parsing options
 * @returns Parsed Excel data
 *
 * @example
 * ```typescript
 * import { parseExcelUrl } from '@tyroneross/omniparse/excel';
 *
 * const result = await parseExcelUrl('https://example.com/data.xlsx');
 * console.log(result.sheets[0].rows);
 * ```
 */
export async function parseExcelUrl(
  url: string,
  options: ParseExcelOptions = {}
): Promise<ExcelParseResult> {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,*/*',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Excel file: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return parseExcelBuffer(buffer, url, options);
}

/**
 * Format a parsed Excel sheet for LLM consumption.
 *
 * Converts sheet data into multiple formats suitable for AI/LLM pipelines:
 * - Markdown tables for context
 * - CSV for structured data
 * - Plain text for simple extraction
 * - JSON for programmatic use
 *
 * @param sheet - Parsed sheet to format
 * @param maxRows - Maximum rows to include (default: all)
 * @returns Formatted output in multiple formats with token count
 *
 * @example
 * ```typescript
 * import { parseExcelFile, formatSheetForLLM } from '@tyroneross/omniparse/excel';
 *
 * const result = await parseExcelFile('./data.xlsx');
 * const formatted = formatSheetForLLM(result.sheets[0]);
 *
 * console.log(formatted.markdown);  // Markdown table
 * console.log(formatted.tokens);    // Token estimate
 * ```
 */
export function formatSheetForLLM(
  sheet: ExcelSheet,
  maxRows?: number
): ExcelFormatted {
  const rows = maxRows ? sheet.rows.slice(0, maxRows) : sheet.rows;
  const headers = sheet.headers;

  // Markdown table
  const markdown = buildMarkdownTable(headers, rows);

  // CSV
  const csv = buildCSV(headers, rows);

  // Plain text
  const text = buildPlainText(headers, rows, sheet.name);

  // JSON
  const json = JSON.stringify(rows, null, 2);

  // Token estimation on the markdown (most common LLM format)
  const tokens = estimateTokens(markdown);

  return {
    markdown,
    csv,
    text,
    json,
    tokens,
    sheetName: sheet.name,
  };
}

/**
 * Format all sheets from a parse result for LLM consumption.
 */
export function formatAllSheetsForLLM(
  result: ExcelParseResult,
  maxRowsPerSheet?: number
): ExcelFormatted[] {
  return result.sheets.map(sheet => formatSheetForLLM(sheet, maxRowsPerSheet));
}

// ============================================================================
// Internal Helpers
// ============================================================================

function processWorkbook(
  workbook: any,
  source: string,
  options: ParseExcelOptions,
  xlsx: any
): ExcelParseResult {
  const {
    sheets: sheetFilter,
    sheetIndices,
    maxRows,
    hasHeaders = true,
    skipEmptyRows = true,
    dateFormat = 'ISO',
  } = options;

  const sheetNames = workbook.SheetNames as string[];
  const sheetsToProcess: { name: string; index: number }[] = [];

  // Determine which sheets to process
  for (let i = 0; i < sheetNames.length; i++) {
    const name = sheetNames[i];
    if (sheetFilter && !sheetFilter.includes(name)) continue;
    if (sheetIndices && !sheetIndices.includes(i)) continue;
    sheetsToProcess.push({ name, index: i });
  }

  // If no filters specified, process all
  if (!sheetFilter && !sheetIndices) {
    for (let i = 0; i < sheetNames.length; i++) {
      sheetsToProcess.push({ name: sheetNames[i], index: i });
    }
  }

  const parsedSheets: ExcelSheet[] = [];
  let totalRows = 0;

  for (const { name, index } of sheetsToProcess) {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) continue;

    // Convert to JSON array of arrays
    const rawData: any[][] = xlsx.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      dateNF: dateFormat === 'ISO' ? 'yyyy-mm-dd' : undefined,
      defval: '',
    });

    if (rawData.length === 0) continue;

    // Filter empty rows
    let rows = skipEmptyRows
      ? rawData.filter(row => row.some((cell: any) => cell !== '' && cell !== null && cell !== undefined))
      : rawData;

    // Extract headers
    const headers = hasHeaders && rows.length > 0
      ? rows[0].map((h: any, i: number) => String(h || `Column_${i + 1}`))
      : rows[0]?.map((_: any, i: number) => `Column_${i + 1}`) || [];

    // Data rows (skip header if present)
    let dataRows = hasHeaders ? rows.slice(1) : rows;

    // Apply maxRows limit
    if (maxRows && dataRows.length > maxRows) {
      dataRows = dataRows.slice(0, maxRows);
    }

    // Convert to keyed objects
    const keyedRows = dataRows.map(row => {
      const obj: Record<string, any> = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = i < row.length ? row[i] : '';
      }
      return obj;
    });

    // Detect column types
    const columnTypes = detectColumnTypes(headers, dataRows);

    totalRows += keyedRows.length;

    parsedSheets.push({
      name,
      index,
      rows: keyedRows,
      rawRows: dataRows,
      headers,
      columnTypes,
      rowCount: keyedRows.length,
      columnCount: headers.length,
    });
  }

  // Extract metadata
  const metadata: ExcelMetadata = {
    format: detectFormat(source),
  };

  if (workbook.Props) {
    metadata.creator = workbook.Props.Creator;
    metadata.lastModifiedBy = workbook.Props.LastAuthor;
    metadata.created = workbook.Props.CreatedDate?.toISOString();
    metadata.modified = workbook.Props.ModifiedDate?.toISOString();
  }

  return {
    source,
    sheets: parsedSheets,
    sheetCount: parsedSheets.length,
    sheetNames: parsedSheets.map(s => s.name),
    totalRows,
    metadata,
  };
}

function detectColumnTypes(
  headers: string[],
  rows: any[][]
): Record<string, ColumnType> {
  const types: Record<string, ColumnType> = {};

  for (let colIdx = 0; colIdx < headers.length; colIdx++) {
    const header = headers[colIdx];
    const values = rows.map(row => row[colIdx]).filter(v => v !== '' && v !== null && v !== undefined);

    if (values.length === 0) {
      types[header] = 'empty';
      continue;
    }

    const typeSet = new Set<string>();
    for (const val of values) {
      if (typeof val === 'number' || (!isNaN(Number(val)) && String(val).trim() !== '')) {
        typeSet.add('number');
      } else if (typeof val === 'boolean' || val === 'true' || val === 'false') {
        typeSet.add('boolean');
      } else if (isDateString(String(val))) {
        typeSet.add('date');
      } else {
        typeSet.add('string');
      }
    }

    if (typeSet.size === 1) {
      types[header] = typeSet.values().next().value as ColumnType;
    } else {
      types[header] = 'mixed';
    }
  }

  return types;
}

function isDateString(val: string): boolean {
  if (!val || val.length < 6) return false;
  // Common date patterns
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/,           // ISO: 2024-01-15
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/,   // US: 1/15/2024
    /^\d{1,2}-\d{1,2}-\d{2,4}/,     // EU: 15-01-2024
  ];
  return datePatterns.some(p => p.test(val));
}

function detectFormat(source: string): string {
  const lower = source.toLowerCase();
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.xls')) return 'xls';
  if (lower.endsWith('.xlsb')) return 'xlsb';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.ods')) return 'ods';
  if (lower.endsWith('.numbers')) return 'numbers';
  return 'unknown';
}

function buildMarkdownTable(headers: string[], rows: Record<string, any>[]): string {
  if (headers.length === 0) return '';

  const lines: string[] = [];

  // Header row
  lines.push('| ' + headers.join(' | ') + ' |');

  // Separator
  lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');

  // Data rows
  for (const row of rows) {
    const cells = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      return String(val).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    });
    lines.push('| ' + cells.join(' | ') + ' |');
  }

  return lines.join('\n');
}

function buildCSV(headers: string[], rows: Record<string, any>[]): string {
  const lines: string[] = [];

  // Header
  lines.push(headers.map(h => csvEscape(h)).join(','));

  // Rows
  for (const row of rows) {
    const cells = headers.map(h => csvEscape(String(row[h] ?? '')));
    lines.push(cells.join(','));
  }

  return lines.join('\n');
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function buildPlainText(
  headers: string[],
  rows: Record<string, any>[],
  sheetName: string
): string {
  const lines: string[] = [];
  lines.push(`Sheet: ${sheetName}`);
  lines.push(`Rows: ${rows.length}`);
  lines.push(`Columns: ${headers.join(', ')}`);
  lines.push('');

  for (let i = 0; i < rows.length; i++) {
    lines.push(`--- Row ${i + 1} ---`);
    for (const header of headers) {
      const val = rows[i][header];
      if (val !== '' && val !== null && val !== undefined) {
        lines.push(`  ${header}: ${val}`);
      }
    }
  }

  return lines.join('\n');
}
