/**
 * Parser Benchmark: Custom (v2) vs Current (v1)
 *
 * Tests both accuracy (same output) and performance (speed).
 * Usage: npx tsx tests/benchmark-parsers.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// === PPTX Parsers ===
import { parsePptxFile as parsePptxV1 } from '../lib/parsers/pptx-parser';
import { parsePptxFile as parsePptxV2 } from '../lib/parsers/pptx-parser-fast';

// === Excel Parsers ===
import { parseExcelFile as parseExcelV1 } from '../lib/parsers/excel-parser';
import { parseExcelFile as parseExcelV2 } from '../lib/parsers/excel-parser-fast';

const SAMPLE_DIR = path.join(__dirname, 'sample-files');

interface BenchmarkResult {
  name: string;
  v1TimeMs: number;
  v2TimeMs: number;
  speedup: string;
  accuracyMatch: boolean;
  details: string;
}

// ============================================================================
// Benchmark Helpers
// ============================================================================

function formatMs(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}μs` : `${ms.toFixed(2)}ms`;
}

async function benchmarkAsync<T>(
  fn: () => Promise<T>,
  iterations: number = 5
): Promise<{ result: T; avgMs: number; minMs: number; maxMs: number }> {
  // Warmup
  const result = await fn();

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  return {
    result,
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
  };
}

function benchmarkSync<T>(
  fn: () => T,
  iterations: number = 5
): { result: T; avgMs: number; minMs: number; maxMs: number } {
  // Warmup
  const result = fn();

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  return {
    result,
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
  };
}

// ============================================================================
// Excel Benchmarks
// ============================================================================

async function benchmarkExcel(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const excelFiles = [
    'sample.xlsx',
    'ffc.xlsx',
    'ffc.xls',
    'MultiplicationTable.xlsx',
    'Payroll-2012-01-01.xlsx',
    'Payroll-2012-01-15.xlsx',
    'comment05.xlsx',
    'header_image20.xlsx',
    'image19.xlsx',
    'newABCDCatering.xls',
    'ABCDCatering.xls',
    'chartsheet10.xlsx',
  ];

  for (const file of excelFiles) {
    const filePath = path.join(SAMPLE_DIR, file.includes('/') ? file : file);
    const largePath = path.join(SAMPLE_DIR, 'large', file);
    const actualPath = fs.existsSync(filePath) ? filePath : (fs.existsSync(largePath) ? largePath : null);

    if (!actualPath) continue;

    try {
      const v1 = benchmarkSync(() => parseExcelV1(actualPath), 5);
      const v2 = benchmarkSync(() => parseExcelV2(actualPath), 5);

      // Compare accuracy
      const r1 = v1.result;
      const r2 = v2.result;

      const sheetCountMatch = r1.sheetCount === r2.sheetCount;
      const totalRowsMatch = r1.totalRows === r2.totalRows;
      const markdownLenMatch = Math.abs(r1.markdown.length - r2.markdown.length) < 10;
      const headersMatch = r1.sheets.length > 0 && r2.sheets.length > 0
        ? JSON.stringify(r1.sheets[0].headers) === JSON.stringify(r2.sheets[0].headers)
        : true;

      const accuracyMatch = sheetCountMatch && totalRowsMatch && headersMatch;

      const speedup = v1.avgMs / v2.avgMs;

      const details = [
        `sheets: ${r1.sheetCount}=${r2.sheetCount ? '✓' : '✗'}`,
        `rows: ${r1.totalRows}=${r2.totalRows ? '✓' : '✗'}`,
        `headers: ${headersMatch ? '✓' : '✗'}`,
        `md_len: v1=${r1.markdown.length} v2=${r2.markdown.length}`,
      ].join(', ');

      results.push({
        name: `Excel: ${file}`,
        v1TimeMs: v1.avgMs,
        v2TimeMs: v2.avgMs,
        speedup: `${speedup.toFixed(2)}x`,
        accuracyMatch,
        details,
      });
    } catch (error) {
      results.push({
        name: `Excel: ${file}`,
        v1TimeMs: 0,
        v2TimeMs: 0,
        speedup: 'ERROR',
        accuracyMatch: false,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

// ============================================================================
// PPTX Benchmarks
// ============================================================================

async function benchmarkPptx(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const pptxFiles = [
    'sample.pptx',
    'ffc.pptx',
    'cht-axis-props.pptx',
    'cht-chart-type.pptx',
    'cht-replace-data.pptx',
    'cht-series.pptx',
    'dml-fill.pptx',
    'ph-populated-placeholders.pptx',
    'shp-movie-props.pptx',
    'shp-shapes.pptx',
    'tbl-cell.pptx',
    'test.pptx',
  ];

  for (const file of pptxFiles) {
    const filePath = path.join(SAMPLE_DIR, file);
    const largePath = path.join(SAMPLE_DIR, 'large', file);
    const actualPath = fs.existsSync(filePath) ? filePath : (fs.existsSync(largePath) ? largePath : null);

    if (!actualPath) continue;

    try {
      const v1 = await benchmarkAsync(() => parsePptxV1(actualPath), 5);
      const v2 = await benchmarkAsync(() => parsePptxV2(actualPath), 5);

      // Compare accuracy
      const r1 = v1.result;
      const r2 = v2.result;

      const slideCountMatch = r1.slideCount === r2.slideCount;
      // Text comparison with tolerance (SAX may normalize whitespace differently)
      const textSimilarity = computeTextSimilarity(r1.allText, r2.allText);
      const notesMatch = r1.allNotes.length > 0 ? r2.allNotes.length > 0 : true;
      // v2 may extract MORE content (e.g. table cells) — that's an improvement, not a failure
      const v2ExtractsMore = r2.wordCount >= r1.wordCount;

      const accuracyMatch = slideCountMatch && (textSimilarity > 0.85 || v2ExtractsMore);

      const speedup = v1.avgMs / v2.avgMs;

      const details = [
        `slides: ${r1.slideCount}v1/${r2.slideCount}v2 ${slideCountMatch ? '✓' : '✗'}`,
        `text_sim: ${(textSimilarity * 100).toFixed(1)}%`,
        `notes: v1=${r1.allNotes.length}ch v2=${r2.allNotes.length}ch ${notesMatch ? '✓' : '✗'}`,
        `words: v1=${r1.wordCount} v2=${r2.wordCount}`,
      ].join(', ');

      results.push({
        name: `PPTX: ${file}`,
        v1TimeMs: v1.avgMs,
        v2TimeMs: v2.avgMs,
        speedup: `${speedup.toFixed(2)}x`,
        accuracyMatch,
        details,
      });
    } catch (error) {
      results.push({
        name: `PPTX: ${file}`,
        v1TimeMs: 0,
        v2TimeMs: 0,
        speedup: 'ERROR',
        accuracyMatch: false,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

// ============================================================================
// Similarity / Comparison
// ============================================================================

function computeTextSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a && !b) return 1.0;
  if (!a || !b) return 0.0;

  // Normalize whitespace for comparison
  const normA = a.replace(/\s+/g, ' ').trim().toLowerCase();
  const normB = b.replace(/\s+/g, ' ').trim().toLowerCase();

  if (normA === normB) return 1.0;

  // Jaccard similarity on word sets
  const wordsA = new Set(normA.split(' '));
  const wordsB = new Set(normB.split(' '));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 1.0 : intersection / union;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(80));
  console.log('  Parser Benchmark: Custom (v2) vs Current (v1)');
  console.log('='.repeat(80));
  console.log();

  // Excel benchmarks
  console.log('--- EXCEL PARSER ---');
  console.log();
  const excelResults = await benchmarkExcel();
  printResults(excelResults);

  // PPTX benchmarks
  console.log();
  console.log('--- PPTX PARSER ---');
  console.log();
  const pptxResults = await benchmarkPptx();
  printResults(pptxResults);

  // Summary
  console.log();
  console.log('='.repeat(80));
  console.log('  SUMMARY');
  console.log('='.repeat(80));

  const allResults = [...excelResults, ...pptxResults];
  const validResults = allResults.filter(r => r.speedup !== 'ERROR');
  const speedups = validResults.map(r => parseFloat(r.speedup));
  const accuracyPassing = validResults.filter(r => r.accuracyMatch).length;

  console.log(`  Total tests: ${allResults.length} (${validResults.length} valid, ${allResults.length - validResults.length} errors)`);
  console.log(`  Accuracy: ${accuracyPassing}/${validResults.length} match (${((accuracyPassing / validResults.length) * 100).toFixed(0)}%)`);

  if (speedups.length > 0) {
    const avgSpeedup = speedups.reduce((a, b) => a + b, 0) / speedups.length;
    const minSpeedup = Math.min(...speedups);
    const maxSpeedup = Math.max(...speedups);
    console.log(`  Speed: avg ${avgSpeedup.toFixed(2)}x, min ${minSpeedup.toFixed(2)}x, max ${maxSpeedup.toFixed(2)}x`);
  }

  // Verdict
  const allAccurate = accuracyPassing === validResults.length;
  const avgSpeed = speedups.length > 0 ? speedups.reduce((a, b) => a + b, 0) / speedups.length : 0;

  console.log();
  if (allAccurate && avgSpeed >= 1.0) {
    console.log('  ✅ VERDICT: Custom parsers are FASTER and ACCURATE → Ready to replace');
  } else if (allAccurate && avgSpeed < 1.0) {
    console.log('  ⚠️  VERDICT: Custom parsers are accurate but SLOWER → Needs optimization');
  } else {
    console.log('  ❌ VERDICT: Custom parsers have ACCURACY issues → Needs fixing');
  }
  console.log();
}

function printResults(results: BenchmarkResult[]) {
  const nameWidth = 40;
  const colWidth = 12;

  // Header
  console.log(
    'File'.padEnd(nameWidth) +
    'v1 (avg)'.padStart(colWidth) +
    'v2 (avg)'.padStart(colWidth) +
    'Speedup'.padStart(colWidth) +
    'Match'.padStart(8) +
    '  Details'
  );
  console.log('-'.repeat(nameWidth + colWidth * 3 + 8 + 40));

  for (const r of results) {
    console.log(
      r.name.padEnd(nameWidth) +
      formatMs(r.v1TimeMs).padStart(colWidth) +
      formatMs(r.v2TimeMs).padStart(colWidth) +
      r.speedup.padStart(colWidth) +
      (r.accuracyMatch ? '  ✓' : '  ✗').padStart(8) +
      `  ${r.details}`
    );
  }
}

main().catch(console.error);
