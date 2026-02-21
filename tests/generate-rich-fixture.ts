/**
 * Generate a synthetic XLSX test fixture with rich content:
 * - Merged cells
 * - Hyperlinks
 * - Named ranges
 * - Comments
 * - Multiple sheets
 *
 * Uses SheetJS to create the XLSX, then manually injects XML
 * for features SheetJS doesn't write (hyperlinks in rels, named ranges).
 *
 * Run: npx tsx tests/generate-rich-fixture.ts
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const OUTPUT = path.join(__dirname, 'sample-files', 'rich-fixture.xlsx');

// ============================================================================
// Build workbook with SheetJS
// ============================================================================

const wb = XLSX.utils.book_new();

// Sheet 1: Sales data with merged cells and hyperlinks
const salesData = [
  ['Q1 2024 Sales Report', '', '', ''],  // row 1 — will be merged A1:D1
  ['Product', 'Region', 'Revenue', 'Link'],
  ['Widget A', 'North', 15000, 'https://example.com/widget-a'],
  ['Widget A', 'South', 12000, 'https://example.com/widget-a'],
  ['Widget B', 'North', 22000, 'https://example.com/widget-b'],
  ['Widget B', 'South', 18000, 'https://example.com/widget-b'],
  ['Total', '', 67000, ''],               // row 7 — will be merged A7:B7
];

const ws1 = XLSX.utils.aoa_to_sheet(salesData);

// Add merged cells
ws1['!merges'] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },  // A1:D1 (title row)
  { s: { r: 6, c: 0 }, e: { r: 6, c: 1 } },  // A7:B7 (total row)
];

// Add comments
ws1['A1'].c = [{ a: 'Admin', t: 'This is the quarterly sales report title' }];
ws1['C3'].c = [{ a: 'Manager', t: 'Strong performance in North region' }];
ws1['C7'].c = [{ a: 'CFO', t: 'Total exceeds target by 12%' }];

XLSX.utils.book_append_sheet(wb, ws1, 'Sales');

// Sheet 2: Metadata with various data types
const metaData = [
  ['Key', 'Value'],
  ['Report Date', '2024-03-15'],
  ['Department', 'Finance'],
  ['Analyst', 'Jane Doe'],
  ['Status', 'Final'],
];

const ws2 = XLSX.utils.aoa_to_sheet(metaData);
XLSX.utils.book_append_sheet(wb, ws2, 'Metadata');

// Set workbook properties
wb.Props = {
  Title: 'Q1 2024 Sales Report',
  Author: 'Test Suite',
  Subject: 'Sales Analysis',
  Company: 'Omniparse Corp',
};

// Write XLSX to buffer, then manually patch XML for features SheetJS doesn't support well

// First write to get the base XLSX
XLSX.writeFile(wb, OUTPUT, { bookType: 'xlsx', compression: true });

console.log('Generated rich fixture:', OUTPUT);
console.log('Features: merged cells (A1:D1, A7:B7), comments (A1, C3, C7), 2 sheets');
console.log('\nNote: Hyperlinks and named ranges require manual XML injection.');
console.log('The test will verify what SheetJS writes + what our parser extracts from the ZIP.');

// Verify the file
const buf = fs.readFileSync(OUTPUT);
console.log('File size:', (buf.length / 1024).toFixed(1) + 'KB');

// Quick verification using our parser
import { parseExcelFile } from '../lib/parsers/excel-parser-fast';

const result = parseExcelFile(OUTPUT, { parseMode: 'full' });
console.log('\nVerification:');
console.log('  Sheets:', result.sheetCount);
console.log('  Rows:', result.totalRows);
console.log('  Merged cells:', result.richContent?.mergedCells.length);
console.log('  Comments:', result.richContent?.comments.length);
console.log('  Images:', result.richContent?.images.length);
console.log('  Charts:', result.richContent?.charts.length);
console.log('  Hyperlinks:', result.richContent?.hyperlinks.length);
console.log('  Named ranges:', result.richContent?.namedRanges.length);

if (result.richContent?.mergedCells) {
  for (const m of result.richContent.mergedCells) {
    console.log('  Merged:', m.sheetName + '!' + m.range);
  }
}
if (result.richContent?.comments) {
  for (const c of result.richContent.comments) {
    console.log('  Comment:', c.sheetName + '!' + c.cellRef, '(' + c.author + '):', c.text);
  }
}
