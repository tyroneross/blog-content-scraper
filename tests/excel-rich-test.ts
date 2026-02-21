/**
 * Comprehensive Excel Rich Parser Tests
 *
 * Covers all 7 gaps from the test audit:
 * 1. Image-to-cell anchor mapping (sheetName + cellRef populated)
 * 2. Merged cells extraction
 * 3. Comments extraction (with authors)
 * 4. Enriched markdown content (## Charts, ## Comments, ## Embedded Images sections)
 * 5. parseExcelBuffer with parseMode 'full'
 * 6. XLS graceful fallback (parseMode 'full' on non-XLSX)
 * 7. Chart category labels in markdown table format
 *
 * Run: npx tsx tests/excel-rich-test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseExcelFile, parseExcelBuffer } from '../lib/parsers/excel-parser-fast';
import { parse } from '../lib/router';

// ============================================================================
// Test Infrastructure
// ============================================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function section(name: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(name);
  console.log('='.repeat(60));
}

const LARGE_DIR = path.join(__dirname, 'sample-files', 'large');
const SAMPLE_DIR = path.join(__dirname, 'sample-files');

// ============================================================================
// Test 1: Image-to-Cell Anchor Mapping
// ============================================================================

function testImageAnchors() {
  section('TEST 1: Image-to-Cell Anchor Mapping');

  const filePath = path.join(LARGE_DIR, 'image19.xlsx');
  if (!fs.existsSync(filePath)) {
    console.log('  SKIP: image19.xlsx not found');
    return;
  }

  const result = parseExcelFile(filePath, { parseMode: 'full' });

  assert(result.richContent !== undefined, 'richContent should exist in full mode');
  assert(result.richContent!.images.length === 1, 'Should extract 1 image');

  const img = result.richContent!.images[0];
  assert(img.fileName === 'image1.jpeg', 'Image file name should be image1.jpeg');
  assert(img.contentType === 'image/jpeg', 'Content type should be image/jpeg');
  assert(img.size > 0, 'Image size should be > 0');
  assert(img.base64.length > 0, 'Base64 data should be present');

  // These were previously always undefined (gap #2 in audit)
  assert(img.sheetName === 'Sheet1', 'Image sheetName should be "Sheet1" (was undefined before fix)');
  assert(img.cellRef === 'C2', 'Image cellRef should be "C2" (col=2→C, row=1→2, 0-indexed)');

  // VML-only images should NOT have cell anchors (correct behavior)
  const headerPath = path.join(LARGE_DIR, 'header_image20.xlsx');
  if (fs.existsSync(headerPath)) {
    const headerResult = parseExcelFile(headerPath, { parseMode: 'full' });
    const headerImg = headerResult.richContent!.images[0];
    assert(headerImg.sheetName === undefined, 'VML header image should have no sheetName (not cell-anchored)');
    assert(headerImg.cellRef === undefined, 'VML header image should have no cellRef (not cell-anchored)');
  }
}

// ============================================================================
// Test 2: Merged Cells Extraction
// ============================================================================

function testMergedCells() {
  section('TEST 2: Merged Cells Extraction');

  const filePath = path.join(SAMPLE_DIR, 'rich-fixture.xlsx');
  if (!fs.existsSync(filePath)) {
    console.log('  SKIP: rich-fixture.xlsx not found (run generate-rich-fixture.ts first)');
    return;
  }

  const result = parseExcelFile(filePath, { parseMode: 'full' });

  assert(result.richContent !== undefined, 'richContent should exist');
  assert(result.richContent!.mergedCells.length === 2, 'Should find 2 merged cell regions');

  const merges = result.richContent!.mergedCells;
  assert(merges[0].range === 'A1:D1', 'First merge should be A1:D1 (title row)');
  assert(merges[0].sheetName === 'Sales', 'First merge should be on Sales sheet');
  assert(merges[1].range === 'A7:B7', 'Second merge should be A7:B7 (total row)');
  assert(merges[1].sheetName === 'Sales', 'Second merge should be on Sales sheet');

  // Structure summary should include merged cell count
  assert(result.structureSummary !== undefined, 'structureSummary should exist');
  assert(result.structureSummary!.mergedCellCount === 2, 'Summary should report 2 merged cells');
}

// ============================================================================
// Test 3: Comments Extraction (with authors)
// ============================================================================

function testComments() {
  section('TEST 3: Comments Extraction');

  // Test with the generated fixture
  const fixturePath = path.join(SAMPLE_DIR, 'rich-fixture.xlsx');
  if (fs.existsSync(fixturePath)) {
    const result = parseExcelFile(fixturePath, { parseMode: 'full' });

    assert(result.richContent!.comments.length === 3, 'Should find 3 comments');

    const c1 = result.richContent!.comments.find(c => c.cellRef === 'A1');
    assert(c1 !== undefined, 'Should have comment on A1');
    assert(c1!.author === 'Admin', 'A1 comment author should be "Admin"');
    assert(c1!.text.includes('quarterly sales report'), 'A1 comment text should mention quarterly sales');
    assert(c1!.sheetName === 'Sales', 'A1 comment should be on Sales sheet');

    const c2 = result.richContent!.comments.find(c => c.cellRef === 'C3');
    assert(c2 !== undefined, 'Should have comment on C3');
    assert(c2!.author === 'Manager', 'C3 comment author should be "Manager"');

    const c3 = result.richContent!.comments.find(c => c.cellRef === 'C7');
    assert(c3 !== undefined, 'Should have comment on C7');
    assert(c3!.author === 'CFO', 'C7 comment author should be "CFO"');
  }

  // Test with the large comment file
  const commentPath = path.join(LARGE_DIR, 'comment05.xlsx');
  if (fs.existsSync(commentPath)) {
    const result = parseExcelFile(commentPath, { parseMode: 'full' });
    assert(result.richContent!.comments.length > 2000, 'comment05.xlsx should have >2000 comments');
    assert(result.richContent!.comments[0].author === 'John', 'First comment author should be John');

    // Verify comment chunk exists
    const commentChunk = result.chunks?.find(c => c.type === 'comment-thread');
    assert(commentChunk !== undefined, 'Should have a comment-thread chunk');
    assert(commentChunk!.tokens > 0, 'Comment chunk should have tokens');
  }
}

// ============================================================================
// Test 4: Enriched Markdown Content
// ============================================================================

function testEnrichedMarkdown() {
  section('TEST 4: Enriched Markdown Content');

  // Charts in markdown
  const chartPath = path.join(LARGE_DIR, 'chartsheet10.xlsx');
  if (fs.existsSync(chartPath)) {
    const textResult = parseExcelFile(chartPath, { parseMode: 'text' });
    const fullResult = parseExcelFile(chartPath, { parseMode: 'full' });

    assert(fullResult.markdown.length > textResult.markdown.length,
      'Full mode markdown should be longer than text mode (has chart data appended)');
    assert(fullResult.markdown.includes('## Charts'),
      'Full mode markdown should contain "## Charts" section');
    assert(fullResult.markdown.includes('bar'),
      'Full mode markdown should mention chart type "bar"');
    assert(fullResult.markdown.includes('## Embedded Images'),
      'Full mode markdown should contain "## Embedded Images" section');
  }

  // Comments in markdown
  const fixturePath = path.join(SAMPLE_DIR, 'rich-fixture.xlsx');
  if (fs.existsSync(fixturePath)) {
    const textResult = parseExcelFile(fixturePath, { parseMode: 'text' });
    const fullResult = parseExcelFile(fixturePath, { parseMode: 'full' });

    assert(fullResult.markdown.length > textResult.markdown.length,
      'Full mode markdown should be longer (has comments appended)');
    assert(fullResult.markdown.includes('## Comments'),
      'Full mode markdown should contain "## Comments" section');
    assert(fullResult.markdown.includes('Admin'),
      'Enriched markdown should include comment author "Admin"');
    assert(fullResult.markdown.includes('quarterly sales report'),
      'Enriched markdown should include comment text');
  }

  // Images in markdown
  const imagePath = path.join(LARGE_DIR, 'image19.xlsx');
  if (fs.existsSync(imagePath)) {
    const fullResult = parseExcelFile(imagePath, { parseMode: 'full' });
    assert(fullResult.markdown.includes('## Embedded Images'),
      'Full mode markdown should contain "## Embedded Images"');
    assert(fullResult.markdown.includes('image1.jpeg'),
      'Enriched markdown should list image file name');
    assert(fullResult.markdown.includes('image/jpeg'),
      'Enriched markdown should list image content type');
  }
}

// ============================================================================
// Test 5: parseExcelBuffer with parseMode 'full'
// ============================================================================

function testBufferFullMode() {
  section('TEST 5: parseExcelBuffer with Full Mode');

  const imagePath = path.join(LARGE_DIR, 'image19.xlsx');
  if (!fs.existsSync(imagePath)) {
    console.log('  SKIP: image19.xlsx not found');
    return;
  }

  const buffer = fs.readFileSync(imagePath);

  // Text mode via buffer
  const textResult = parseExcelBuffer(buffer, 'image19.xlsx', { parseMode: 'text' });
  assert(textResult.parseMode === 'text', 'Buffer text mode should set parseMode to "text"');
  assert(textResult.richContent === undefined, 'Buffer text mode should have no richContent');

  // Full mode via buffer
  const fullResult = parseExcelBuffer(buffer, 'image19.xlsx', { parseMode: 'full' });
  assert(fullResult.parseMode === 'full', 'Buffer full mode should set parseMode to "full"');
  assert(fullResult.richContent !== undefined, 'Buffer full mode should have richContent');
  assert(fullResult.richContent!.images.length === 1, 'Buffer full mode should extract 1 image');
  assert(fullResult.chunks !== undefined, 'Buffer full mode should have chunks');
  assert(fullResult.structureSummary !== undefined, 'Buffer full mode should have structureSummary');

  // Image anchor should work from buffer too
  const img = fullResult.richContent!.images[0];
  assert(img.sheetName === 'Sheet1', 'Buffer full mode: image sheetName should be Sheet1');
  assert(img.cellRef === 'C2', 'Buffer full mode: image cellRef should be C2');

  // Cell data should be identical between text and full modes
  assert(textResult.sheetCount === fullResult.sheetCount, 'Sheet count should match between modes');
  assert(textResult.totalRows === fullResult.totalRows, 'Row count should match between modes');
}

// ============================================================================
// Test 6: XLS Graceful Fallback
// ============================================================================

function testXlsGracefulFallback() {
  section('TEST 6: XLS Graceful Fallback (non-XLSX with full mode)');

  const xlsPath = path.join(LARGE_DIR, 'ffc.xls');
  if (!fs.existsSync(xlsPath)) {
    console.log('  SKIP: ffc.xls not found');
    return;
  }

  // parseMode 'full' on XLS should work without error, but skip ZIP extraction
  const result = parseExcelFile(xlsPath, { parseMode: 'full' });

  assert(result.format === 'xls', 'Should detect XLS format');
  assert(result.parseMode === 'full', 'Should report full parse mode');
  assert(result.sheetCount > 0, 'Should parse sheets successfully');
  assert(result.totalRows > 0, 'Should have rows');

  // Rich content should NOT be present (XLS is binary, not ZIP)
  assert(result.richContent === undefined, 'XLS full mode should have no richContent (not a ZIP)');
  assert(result.chunks === undefined, 'XLS full mode should have no chunks (not a ZIP)');

  // Basic parsing should still work fine
  assert(result.markdown.length > 0, 'Should still produce markdown');
  assert(result.text.length > 0, 'Should still produce text');
  assert(result.errors === undefined || result.errors.length === 0, 'Should have no errors');
}

// ============================================================================
// Test 7: Chart Data with Category Labels
// ============================================================================

function testChartCategories() {
  section('TEST 7: Chart Data and Category Table Rendering');

  const chartPath = path.join(LARGE_DIR, 'chartsheet10.xlsx');
  if (!fs.existsSync(chartPath)) {
    console.log('  SKIP: chartsheet10.xlsx not found');
    return;
  }

  const result = parseExcelFile(chartPath, { parseMode: 'full' });

  assert(result.richContent!.charts.length === 1, 'Should extract 1 chart');

  const chart = result.richContent!.charts[0];
  assert(chart.chartType === 'bar', 'Chart type should be "bar"');
  assert(chart.series.length === 3, 'Should have 3 data series');

  // Verify series values
  assert(chart.series[0].values.length === 5, 'First series should have 5 values');
  assert(chart.series[0].values[0] === 1, 'First series first value should be 1');
  assert(chart.series[2].values[4] === 15, 'Third series last value should be 15');

  // Verify axes exist
  assert(chart.axes.length === 2, 'Should have 2 axes (category + value)');
  assert(chart.axes[0].name === 'category', 'First axis should be category');
  assert(chart.axes[1].name === 'value', 'Second axis should be value');

  // Chart markdown should exist
  assert(chart.dataAsMarkdown.includes('bar'), 'Chart markdown should mention chart type');
  assert(chart.dataAsMarkdown.length > 50, 'Chart markdown should have substantial content');

  // Chart chunk should exist
  const chartChunk = result.chunks?.find(c => c.type === 'chart');
  assert(chartChunk !== undefined, 'Should have a chart chunk');
  assert(chartChunk!.tokens > 0, 'Chart chunk should have tokens');
  assert(chartChunk!.label.includes('bar'), 'Chart chunk label should mention chart type');
}

// ============================================================================
// Test 8: Text Mode Is Unchanged (Backward Compatibility)
// ============================================================================

function testTextModeUnchanged() {
  section('TEST 8: Text Mode Backward Compatibility');

  const filePath = path.join(SAMPLE_DIR, 'sample.xlsx');
  if (!fs.existsSync(filePath)) {
    console.log('  SKIP: sample.xlsx not found');
    return;
  }

  // Default mode should be 'text'
  const defaultResult = parseExcelFile(filePath);
  assert(defaultResult.parseMode === 'text', 'Default parseMode should be "text"');
  assert(defaultResult.richContent === undefined, 'Default mode should have no richContent');
  assert(defaultResult.chunks === undefined, 'Default mode should have no chunks');
  assert(defaultResult.structureSummary === undefined, 'Default mode should have no structureSummary');

  // Explicit text mode
  const textResult = parseExcelFile(filePath, { parseMode: 'text' });
  assert(textResult.parseMode === 'text', 'Explicit text mode should work');

  // Cell data should be identical between default and explicit text
  assert(defaultResult.markdown === textResult.markdown, 'Default and explicit text markdown should match');
  assert(defaultResult.text === textResult.text, 'Default and explicit text output should match');
  assert(defaultResult.sheetCount === textResult.sheetCount, 'Sheet count should match');
}

// ============================================================================
// Test 9: LLM Chunks Structure
// ============================================================================

function testChunksStructure() {
  section('TEST 9: LLM Chunks Structure');

  const filePath = path.join(SAMPLE_DIR, 'rich-fixture.xlsx');
  if (!fs.existsSync(filePath)) {
    console.log('  SKIP: rich-fixture.xlsx not found');
    return;
  }

  const result = parseExcelFile(filePath, { parseMode: 'full' });

  assert(result.chunks !== undefined, 'Chunks should exist');
  assert(result.chunks!.length >= 3, 'Should have at least 3 chunks (metadata + 2 sheets)');

  // Check metadata chunk
  const metaChunk = result.chunks!.find(c => c.type === 'metadata');
  assert(metaChunk !== undefined, 'Should have a metadata chunk');
  assert(metaChunk!.content.includes('rich-fixture.xlsx'), 'Metadata chunk should mention file name');
  assert(metaChunk!.tokens > 0, 'Metadata chunk should have tokens');
  assert(metaChunk!.index === 0, 'Metadata chunk should be index 0');

  // Check sheet data chunks
  const sheetChunks = result.chunks!.filter(c => c.type === 'sheet-data');
  assert(sheetChunks.length === 2, 'Should have 2 sheet-data chunks');
  assert(sheetChunks[0].sheetName === 'Sales', 'First sheet chunk should be Sales');
  assert(sheetChunks[1].sheetName === 'Metadata', 'Second sheet chunk should be Metadata');
  assert(sheetChunks[0].content.includes('Widget'), 'Sales chunk should contain Widget data');

  // Check comment chunk
  const commentChunk = result.chunks!.find(c => c.type === 'comment-thread');
  assert(commentChunk !== undefined, 'Should have a comment-thread chunk');
  assert(commentChunk!.content.includes('Admin'), 'Comment chunk should include author');
  assert(commentChunk!.content.includes('CFO'), 'Comment chunk should include all authors');

  // Every chunk should have required fields
  for (const chunk of result.chunks!) {
    assert(chunk.type !== undefined, `Chunk ${chunk.index} should have type`);
    assert(chunk.label.length > 0, `Chunk ${chunk.index} should have label`);
    assert(chunk.content.length > 0, `Chunk ${chunk.index} should have content`);
    assert(chunk.tokens > 0, `Chunk ${chunk.index} should have tokens > 0`);
    assert(typeof chunk.index === 'number', `Chunk ${chunk.index} should have numeric index`);
  }
}

// ============================================================================
// Test 10: Router Integration with Full Mode
// ============================================================================

async function testRouterIntegration() {
  section('TEST 10: Router Integration with Full Mode');

  const chartPath = path.join(LARGE_DIR, 'chartsheet10.xlsx');
  if (!fs.existsSync(chartPath)) {
    console.log('  SKIP: chartsheet10.xlsx not found');
    return;
  }

  // Text mode via router
  const textResult = await parse(chartPath);
  if (Array.isArray(textResult)) { assert(false, 'Router should return single result'); return; }

  assert(textResult.inputType === 'excel', 'Router should detect excel type');
  assert(textResult.metadata.parseMode === 'text', 'Default router mode should be text');
  assert(textResult.metadata.richContent === undefined, 'Text mode router should not have richContent');

  // Full mode via router
  const fullResult = await parse(chartPath, { parseMode: 'full' });
  if (Array.isArray(fullResult)) { assert(false, 'Router should return single result'); return; }

  assert(fullResult.metadata.parseMode === 'full', 'Router full mode should set parseMode');
  assert(fullResult.metadata.richContent !== undefined, 'Router full mode should have richContent');
  assert(fullResult.metadata.structureSummary !== undefined, 'Router full mode should have structureSummary');
  assert(fullResult.metadata.chunks !== undefined, 'Router full mode should have chunks');

  // Router strips base64 from images in metadata
  if (fullResult.metadata.richContent) {
    const imgMeta = fullResult.metadata.richContent.images[0];
    assert(imgMeta.fileName !== undefined, 'Router image metadata should have fileName');
    assert(imgMeta.size > 0, 'Router image metadata should have size');
    assert((imgMeta as any).base64 === undefined, 'Router should NOT include base64 in metadata (too large)');
  }
}

// ============================================================================
// Test 11: Structure Summary Accuracy
// ============================================================================

function testStructureSummary() {
  section('TEST 11: Structure Summary Accuracy');

  const chartPath = path.join(LARGE_DIR, 'chartsheet10.xlsx');
  if (!fs.existsSync(chartPath)) {
    console.log('  SKIP: chartsheet10.xlsx not found');
    return;
  }

  const result = parseExcelFile(chartPath, { parseMode: 'full' });
  const summary = result.structureSummary!;

  assert(summary.description.includes('XLSX'), 'Summary should mention XLSX');
  assert(summary.description.includes('chart'), 'Summary should mention charts');
  assert(summary.description.includes('image'), 'Summary should mention images');

  assert(summary.sheetSummaries.length === 2, 'Should have 2 sheet summaries');
  assert(summary.sheetSummaries[0].name === 'Sheet1', 'First sheet should be Sheet1');
  assert(summary.sheetSummaries[0].headers.length > 0, 'Sheet summaries should include headers');

  assert(summary.imageCount === 1, 'Should report 1 image');
  assert(summary.charts.length === 1, 'Should report 1 chart');
  assert(summary.charts[0].type === 'bar', 'Chart summary type should be bar');
  assert(summary.charts[0].seriesCount === 3, 'Chart summary should report 3 series');

  assert(summary.hasRichContent === true, 'hasRichContent should be true');
}

// ============================================================================
// Run All Tests
// ============================================================================

async function main() {
  console.log('========================================');
  console.log('  Excel Rich Parser Tests');
  console.log('========================================');

  testImageAnchors();
  testMergedCells();
  testComments();
  testEnrichedMarkdown();
  testBufferFullMode();
  testXlsGracefulFallback();
  testChartCategories();
  testTextModeUnchanged();
  testChunksStructure();
  await testRouterIntegration();
  testStructureSummary();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
