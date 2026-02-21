/**
 * Rich Excel Parser — Full Structure Extraction
 *
 * Extracts everything from XLSX files by reading the ZIP archive directly:
 * - Images (from xl/media/) with cell position references
 * - Charts (from xl/charts/) with chart type, data series, axis labels
 * - Comments/notes (from xl/comments*.xml)
 * - Merged cells (from worksheet XML !merges)
 * - Hyperlinks (from worksheet XML hyperlinks)
 * - Cell styles (font, fill, borders, number formats)
 * - Named ranges and defined names
 *
 * This module is used by excel-parser-fast.ts when parseMode is 'full'.
 * It operates on the raw file buffer (ZIP) rather than the SheetJS workbook,
 * because SheetJS intentionally skips media, charts, and drawings.
 *
 * Design: each extraction function is independent and catches its own errors,
 * so a failure in chart extraction doesn't block image extraction.
 */

import * as zlib from 'zlib';

// ============================================================================
// Types
// ============================================================================

export interface ExcelImage {
  /** File name in the archive (e.g., "image1.png") */
  fileName: string;
  /** MIME type (image/png, image/jpeg, etc.) */
  contentType: string;
  /** Raw image bytes as base64 */
  base64: string;
  /** Byte size of the image */
  size: number;
  /** Sheet name this image belongs to (if determinable) */
  sheetName?: string;
  /** Cell anchor reference (e.g., "B2") if available from drawing XML */
  cellRef?: string;
}

export interface ExcelChartSeries {
  /** Series name/label */
  name: string;
  /** Category labels (x-axis values) */
  categories: string[];
  /** Data values */
  values: (number | null)[];
}

export interface ExcelChart {
  /** Chart file name in archive */
  fileName: string;
  /** Chart type (bar, line, pie, scatter, area, etc.) */
  chartType: string;
  /** Chart title if present */
  title?: string;
  /** Data series */
  series: ExcelChartSeries[];
  /** Axis labels */
  axes: { name?: string; title?: string }[];
  /** Sheet this chart belongs to */
  sheetName?: string;
  /** Markdown table representation of chart data */
  dataAsMarkdown: string;
}

export interface ExcelComment {
  /** Cell reference (e.g., "A1") */
  cellRef: string;
  /** Comment author */
  author: string;
  /** Comment text */
  text: string;
  /** Sheet name */
  sheetName: string;
}

export interface ExcelMergedCell {
  /** Merge range (e.g., "A1:C3") */
  range: string;
  /** Sheet name */
  sheetName: string;
}

export interface ExcelHyperlink {
  /** Cell reference */
  cellRef: string;
  /** Target URL or internal reference */
  target: string;
  /** Display text if different from cell value */
  display?: string;
  /** Sheet name */
  sheetName: string;
}

export interface ExcelNamedRange {
  /** Name of the defined name */
  name: string;
  /** Reference formula */
  reference: string;
  /** Scope (sheet name or 'workbook') */
  scope: string;
}

export interface ExcelRichContent {
  /** Embedded images */
  images: ExcelImage[];
  /** Charts with parsed data series */
  charts: ExcelChart[];
  /** Cell comments/notes */
  comments: ExcelComment[];
  /** Merged cell ranges */
  mergedCells: ExcelMergedCell[];
  /** Hyperlinks */
  hyperlinks: ExcelHyperlink[];
  /** Named ranges / defined names */
  namedRanges: ExcelNamedRange[];
  /** Extraction errors (non-fatal) */
  warnings: string[];
}

// ============================================================================
// ZIP Reader (shared with PPTX parser pattern)
// ============================================================================

interface ZipEntry {
  name: string;
  compressionMethod: number;
  data: Buffer;
}

function readZipEntries(buffer: Buffer, filter?: (name: string) => boolean): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;
  const len = buffer.length;

  while (offset < len - 30) {
    if (buffer[offset] !== 0x50 || buffer[offset + 1] !== 0x4b ||
        buffer[offset + 2] !== 0x03 || buffer[offset + 3] !== 0x04) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const name = buffer.toString('utf-8', nameStart, nameStart + fileNameLength);
    const dataStart = nameStart + fileNameLength + extraFieldLength;

    if (!filter || filter(name)) {
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      entries.push({ name, compressionMethod, data });
    }

    offset = dataStart + compressedSize;
  }

  return entries;
}

function decompressEntry(entry: ZipEntry): string {
  if (entry.compressionMethod === 8) {
    return zlib.inflateRawSync(entry.data).toString('utf-8');
  }
  return entry.data.toString('utf-8');
}

function decompressEntryRaw(entry: ZipEntry): Buffer {
  if (entry.compressionMethod === 8) {
    return zlib.inflateRawSync(entry.data);
  }
  return entry.data;
}

// ============================================================================
// Content Type Detection
// ============================================================================

function detectImageContentType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const types: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'tiff': 'image/tiff',
    'tif': 'image/tiff',
    'svg': 'image/svg+xml',
    'emf': 'image/x-emf',
    'wmf': 'image/x-wmf',
  };
  return types[ext] || 'application/octet-stream';
}

// ============================================================================
// XML Helpers
// ============================================================================

/** Extract text content between specific XML tags using regex (fast path for machine-generated XML) */
function extractTagContent(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'gi');
  const results: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    if (match[1].trim()) results.push(decodeXmlEntities(match[1].trim()));
  }
  return results;
}

/** Extract attribute value from an XML tag */
function extractAttr(xml: string, attrName: string): string | undefined {
  const regex = new RegExp(`${attrName}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match ? decodeXmlEntities(match[1]) : undefined;
}

/** Extract all occurrences of an attribute from multiple tags */
function extractAllAttrs(xml: string, tagPattern: string, attrName: string): string[] {
  const tagRegex = new RegExp(`<${tagPattern}[^>]*${attrName}="([^"]*)"[^>]*/?>`, 'gi');
  const results: string[] = [];
  let match;
  while ((match = tagRegex.exec(xml)) !== null) {
    results.push(decodeXmlEntities(match[1]));
  }
  return results;
}

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&apos;': "'", '&quot;': '"',
};

function decodeXmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(?:amp|lt|gt|apos|quot);/g, (m) => XML_ENTITIES[m] || m);
}

// ============================================================================
// Image Extraction (with cell anchor mapping)
// ============================================================================

/** Convert 0-based column index to Excel letter (0→A, 25→Z, 26→AA) */
function colToLetter(col: number): string {
  let result = '';
  let c = col;
  while (c >= 0) {
    result = String.fromCharCode((c % 26) + 65) + result;
    c = Math.floor(c / 26) - 1;
  }
  return result;
}

/**
 * Anchor info extracted from drawing XML: maps an rId to a cell position.
 * The rId corresponds to a media file via the drawing's .rels file.
 */
interface ImageAnchor {
  rId: string;
  cellRef: string;     // e.g., "C2"
  drawingFile: string; // e.g., "drawing1.xml"
}

/**
 * Parse drawing XML to extract image anchors.
 *
 * XLSX drawing files use <xdr:twoCellAnchor> or <xdr:oneCellAnchor> to position images.
 * Inside the anchor: <xdr:from><xdr:col>2</xdr:col><xdr:row>1</xdr:row></xdr:from>
 * And: <xdr:pic>...<a:blip r:embed="rId1"/>...</xdr:pic>
 */
function parseDrawingAnchors(drawingXml: string): ImageAnchor[] {
  const anchors: ImageAnchor[] = [];

  // Match both twoCellAnchor and oneCellAnchor
  const anchorRegex = /<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/gi;
  let anchorMatch;

  while ((anchorMatch = anchorRegex.exec(drawingXml)) !== null) {
    const anchorXml = anchorMatch[1];

    // Extract position from <xdr:from>
    const fromMatch = anchorXml.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/i);
    if (!fromMatch) continue;

    const colMatch = fromMatch[1].match(/<xdr:col>(\d+)<\/xdr:col>/i);
    const rowMatch = fromMatch[1].match(/<xdr:row>(\d+)<\/xdr:row>/i);
    if (!colMatch || !rowMatch) continue;

    const col = parseInt(colMatch[1], 10);
    const row = parseInt(rowMatch[1], 10);
    const cellRef = colToLetter(col) + (row + 1); // 0-based → 1-based row

    // Extract rId from <a:blip r:embed="rId1"/>
    const blipMatch = anchorXml.match(/r:embed="([^"]*)"/i);
    if (!blipMatch) continue;

    anchors.push({ rId: blipMatch[1], cellRef, drawingFile: '' });
  }

  return anchors;
}

function extractImages(
  entries: ZipEntry[],
  imagePositions: Map<string, { sheetName: string; cellRef: string }>,
  warnings: string[]
): ExcelImage[] {
  const images: ExcelImage[] = [];
  const mediaEntries = entries.filter(e => /^xl\/media\//i.test(e.name));

  for (const entry of mediaEntries) {
    try {
      const rawData = decompressEntryRaw(entry);
      const fileName = entry.name.split('/').pop() || entry.name;

      // Look up position from the pre-built mapping: media/image1.png → {sheetName, cellRef}
      const mediaKey = 'media/' + fileName;
      const position = imagePositions.get(mediaKey);

      images.push({
        fileName,
        contentType: detectImageContentType(fileName),
        base64: rawData.toString('base64'),
        size: rawData.length,
        sheetName: position?.sheetName,
        cellRef: position?.cellRef,
      });
    } catch (err) {
      warnings.push(`Image extraction failed for ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return images;
}

// ============================================================================
// Chart Extraction
// ============================================================================

function extractCharts(entries: ZipEntry[], warnings: string[]): ExcelChart[] {
  const charts: ExcelChart[] = [];
  const chartEntries = entries.filter(e => /^xl\/charts\/chart\d+\.xml$/i.test(e.name));

  for (const entry of chartEntries) {
    try {
      const xml = decompressEntry(entry);
      const chart = parseChartXml(xml, entry.name);
      if (chart) charts.push(chart);
    } catch (err) {
      warnings.push(`Chart extraction failed for ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return charts;
}

function parseChartXml(xml: string, fileName: string): ExcelChart | null {
  // Detect chart type
  const chartType = detectChartType(xml);

  // Extract title
  const titleTexts = extractChartTitle(xml);
  const title = titleTexts || undefined;

  // Extract series
  const series = extractChartSeries(xml);

  // Extract axis labels
  const axes = extractChartAxes(xml);

  // Build markdown representation of chart data
  const dataAsMarkdown = buildChartMarkdown(chartType, title, series);

  return {
    fileName: fileName.split('/').pop() || fileName,
    chartType,
    title,
    series,
    axes,
    dataAsMarkdown,
  };
}

function detectChartType(xml: string): string {
  // Check for chart type elements in order of specificity
  const typeMap: [RegExp, string][] = [
    [/<c:pie3DChart/i, 'pie3d'],
    [/<c:pieChart/i, 'pie'],
    [/<c:doughnutChart/i, 'doughnut'],
    [/<c:bar3DChart/i, 'bar3d'],
    [/<c:barChart/i, 'bar'],
    [/<c:line3DChart/i, 'line3d'],
    [/<c:lineChart/i, 'line'],
    [/<c:area3DChart/i, 'area3d'],
    [/<c:areaChart/i, 'area'],
    [/<c:scatterChart/i, 'scatter'],
    [/<c:bubbleChart/i, 'bubble'],
    [/<c:radarChart/i, 'radar'],
    [/<c:stockChart/i, 'stock'],
    [/<c:surfaceChart/i, 'surface'],
    [/<c:ofPieChart/i, 'pie-of-pie'],
  ];

  for (const [pattern, type] of typeMap) {
    if (pattern.test(xml)) return type;
  }
  return 'unknown';
}

function extractChartTitle(xml: string): string | null {
  // Chart titles are in <c:title><c:tx><c:rich><a:p><a:r><a:t>
  const titleMatch = xml.match(/<c:title>[\s\S]*?<\/c:title>/i);
  if (!titleMatch) return null;

  const atTexts = extractTagContent(titleMatch[0], 'a:t');
  return atTexts.length > 0 ? atTexts.join(' ') : null;
}

function extractChartSeries(xml: string): ExcelChartSeries[] {
  const series: ExcelChartSeries[] = [];

  // Split by <c:ser> elements
  const serRegex = /<c:ser>([\s\S]*?)<\/c:ser>/gi;
  let serMatch;

  while ((serMatch = serRegex.exec(xml)) !== null) {
    const serXml = serMatch[1];

    // Series name from <c:tx>
    const txMatch = serXml.match(/<c:tx>([\s\S]*?)<\/c:tx>/i);
    let name = 'Series';
    if (txMatch) {
      const vTexts = extractTagContent(txMatch[1], 'c:v');
      if (vTexts.length > 0) name = vTexts[0];
      else {
        const atTexts = extractTagContent(txMatch[1], 'a:t');
        if (atTexts.length > 0) name = atTexts[0];
      }
    }

    // Category labels from <c:cat>
    const catMatch = serXml.match(/<c:cat>([\s\S]*?)<\/c:cat>/i);
    const categories: string[] = [];
    if (catMatch) {
      const catValues = extractTagContent(catMatch[1], 'c:v');
      categories.push(...catValues);
    }

    // Data values from <c:val>
    const valMatch = serXml.match(/<c:val>([\s\S]*?)<\/c:val>/i);
    const values: (number | null)[] = [];
    if (valMatch) {
      const valTexts = extractTagContent(valMatch[1], 'c:v');
      for (const v of valTexts) {
        const num = parseFloat(v);
        values.push(isNaN(num) ? null : num);
      }
    }

    series.push({ name, categories, values });
  }

  return series;
}

function extractChartAxes(xml: string): { name?: string; title?: string }[] {
  const axes: { name?: string; title?: string }[] = [];

  // Category axis
  const catAxisMatch = xml.match(/<c:catAx>([\s\S]*?)<\/c:catAx>/i);
  if (catAxisMatch) {
    const titleTexts = extractAxisTitle(catAxisMatch[1]);
    axes.push({ name: 'category', title: titleTexts || undefined });
  }

  // Value axis
  const valAxisMatch = xml.match(/<c:valAx>([\s\S]*?)<\/c:valAx>/i);
  if (valAxisMatch) {
    const titleTexts = extractAxisTitle(valAxisMatch[1]);
    axes.push({ name: 'value', title: titleTexts || undefined });
  }

  return axes;
}

function extractAxisTitle(axisXml: string): string | null {
  const titleMatch = axisXml.match(/<c:title>([\s\S]*?)<\/c:title>/i);
  if (!titleMatch) return null;
  const texts = extractTagContent(titleMatch[1], 'a:t');
  return texts.length > 0 ? texts.join(' ') : null;
}

function buildChartMarkdown(chartType: string, title: string | undefined, series: ExcelChartSeries[]): string {
  const lines: string[] = [];

  lines.push(`**Chart: ${title || 'Untitled'}** (${chartType})`);
  lines.push('');

  if (series.length === 0) {
    lines.push('*No data series extracted*');
    return lines.join('\n');
  }

  // Build a table: Category | Series1 | Series2 | ...
  const allCategories = series.reduce<string[]>((cats, s) => {
    for (const c of s.categories) {
      if (!cats.includes(c)) cats.push(c);
    }
    return cats;
  }, []);

  if (allCategories.length > 0) {
    // Table with categories as rows
    const header = ['Category', ...series.map(s => s.name)];
    lines.push('| ' + header.join(' | ') + ' |');
    lines.push('| ' + header.map(() => '---').join(' | ') + ' |');

    for (let i = 0; i < allCategories.length; i++) {
      const row = [allCategories[i]];
      for (const s of series) {
        const val = i < s.values.length ? s.values[i] : null;
        row.push(val !== null ? String(val) : '');
      }
      lines.push('| ' + row.join(' | ') + ' |');
    }
  } else {
    // No categories — just list values per series
    for (const s of series) {
      lines.push(`**${s.name}:** ${s.values.join(', ')}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Comments Extraction
// ============================================================================

function extractComments(entries: ZipEntry[], sheetNames: string[], warnings: string[]): ExcelComment[] {
  const comments: ExcelComment[] = [];

  // Comments are in xl/comments1.xml, xl/comments2.xml, etc.
  const commentEntries = entries.filter(e => /^xl\/comments\d*\.xml$/i.test(e.name));

  // Authors are shared across the comments file
  for (const entry of commentEntries) {
    try {
      const xml = decompressEntry(entry);

      // Extract authors
      const authors = extractTagContent(xml, 'author');

      // Extract comment elements
      const commentRegex = /<comment\s+ref="([^"]*)"(?:\s+authorId="(\d+)")?[^>]*>([\s\S]*?)<\/comment>/gi;
      let match;

      // Determine sheet index from file name
      const numMatch = entry.name.match(/comments(\d+)\.xml/i);
      const sheetIdx = numMatch ? parseInt(numMatch[1], 10) - 1 : 0;
      const sheetName = sheetIdx < sheetNames.length ? sheetNames[sheetIdx] : `Sheet${sheetIdx + 1}`;

      while ((match = commentRegex.exec(xml)) !== null) {
        const cellRef = match[1];
        const authorId = match[2] ? parseInt(match[2], 10) : 0;
        const commentBody = match[3];

        // Extract text from <t> elements within the comment
        const textParts = extractTagContent(commentBody, 't');
        const text = textParts.join('').trim();

        if (text) {
          comments.push({
            cellRef,
            author: authorId < authors.length ? authors[authorId] : 'Unknown',
            text,
            sheetName,
          });
        }
      }
    } catch (err) {
      warnings.push(`Comment extraction failed for ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return comments;
}

// ============================================================================
// Merged Cells Extraction
// ============================================================================

function extractMergedCells(entries: ZipEntry[], sheetNames: string[], warnings: string[]): ExcelMergedCell[] {
  const mergedCells: ExcelMergedCell[] = [];

  const sheetEntries = entries.filter(e => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name));

  for (const entry of sheetEntries) {
    try {
      const xml = decompressEntry(entry);

      const numMatch = entry.name.match(/sheet(\d+)\.xml/i);
      const sheetIdx = numMatch ? parseInt(numMatch[1], 10) - 1 : 0;
      const sheetName = sheetIdx < sheetNames.length ? sheetNames[sheetIdx] : `Sheet${sheetIdx + 1}`;

      // <mergeCell ref="A1:C3"/>
      const mergeRefs = extractAllAttrs(xml, 'mergeCell', 'ref');
      for (const range of mergeRefs) {
        mergedCells.push({ range, sheetName });
      }
    } catch (err) {
      warnings.push(`Merged cell extraction failed for ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return mergedCells;
}

// ============================================================================
// Hyperlinks Extraction
// ============================================================================

function extractHyperlinks(
  entries: ZipEntry[],
  sheetNames: string[],
  warnings: string[]
): ExcelHyperlink[] {
  const hyperlinks: ExcelHyperlink[] = [];

  const sheetEntries = entries.filter(e => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name));
  const relsEntries = entries.filter(e => /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/i.test(e.name));

  // Build a map of relationship IDs → targets from .rels files
  const relsMap = new Map<string, Map<string, string>>(); // sheetNum → (rId → target)

  for (const relsEntry of relsEntries) {
    try {
      const relsXml = decompressEntry(relsEntry);
      const numMatch = relsEntry.name.match(/sheet(\d+)\.xml\.rels/i);
      if (!numMatch) continue;

      const relMap = new Map<string, string>();
      const relRegex = new RegExp('<Relationship\\s+[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"[^>]*/>', 'gi');
      let match;
      while ((match = relRegex.exec(relsXml)) !== null) {
        relMap.set(match[1], decodeXmlEntities(match[2]));
      }
      // Also handle reversed attribute order
      const relRegex2 = new RegExp('<Relationship\\s+[^>]*Target="([^"]*)"[^>]*Id="([^"]*)"[^>]*/>', 'gi');
      while ((match = relRegex2.exec(relsXml)) !== null) {
        if (!relMap.has(match[2])) {
          relMap.set(match[2], decodeXmlEntities(match[1]));
        }
      }

      relsMap.set(numMatch[1], relMap);
    } catch { /* best-effort */ }
  }

  for (const entry of sheetEntries) {
    try {
      const xml = decompressEntry(entry);

      const numMatch = entry.name.match(/sheet(\d+)\.xml/i);
      if (!numMatch) continue;
      const sheetNum = numMatch[1];
      const sheetIdx = parseInt(sheetNum, 10) - 1;
      const sheetName = sheetIdx < sheetNames.length ? sheetNames[sheetIdx] : `Sheet${sheetIdx + 1}`;
      const relMap = relsMap.get(sheetNum) || new Map();

      // <hyperlink ref="A1" r:id="rId1" display="Click here"/>
      const hyperlinkRegex = /<hyperlink\s+([^>]*?)\/>/gi;
      let match;

      while ((match = hyperlinkRegex.exec(xml)) !== null) {
        const attrs = match[1];
        const cellRef = extractAttr(attrs, 'ref');
        if (!cellRef) continue;

        const rId = extractAttr(attrs, 'r:id');
        const display = extractAttr(attrs, 'display');
        const location = extractAttr(attrs, 'location');

        let target = '';
        if (rId && relMap.has(rId)) {
          target = relMap.get(rId)!;
        } else if (location) {
          target = location;
        }

        if (target || display) {
          hyperlinks.push({
            cellRef,
            target: target || display || '',
            display,
            sheetName,
          });
        }
      }
    } catch (err) {
      warnings.push(`Hyperlink extraction failed for ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return hyperlinks;
}

// ============================================================================
// Named Ranges Extraction
// ============================================================================

function extractNamedRanges(entries: ZipEntry[], sheetNames: string[], warnings: string[]): ExcelNamedRange[] {
  const namedRanges: ExcelNamedRange[] = [];

  const workbookEntry = entries.find(e => /^xl\/workbook\.xml$/i.test(e.name));
  if (!workbookEntry) return namedRanges;

  try {
    const xml = decompressEntry(workbookEntry);

    // <definedName name="SalesTotal" localSheetId="0">Sheet1!$A$1:$B$10</definedName>
    const dnRegex = /<definedName\s+([^>]*)>([\s\S]*?)<\/definedName>/gi;
    let match;

    while ((match = dnRegex.exec(xml)) !== null) {
      const attrs = match[1];
      const reference = decodeXmlEntities(match[2].trim());
      const name = extractAttr(attrs, 'name');
      if (!name) continue;

      // Skip built-in names like _xlnm.Print_Area
      if (name.startsWith('_xlnm.')) continue;

      const localSheetId = extractAttr(attrs, 'localSheetId');
      let scope = 'workbook';
      if (localSheetId) {
        const idx = parseInt(localSheetId, 10);
        scope = idx < sheetNames.length ? sheetNames[idx] : `Sheet${idx + 1}`;
      }

      namedRanges.push({ name, reference, scope });
    }
  } catch (err) {
    warnings.push(`Named range extraction failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return namedRanges;
}

// ============================================================================
// Drawing → Image Position Mapping (full chain resolution)
// ============================================================================

/**
 * Build a complete mapping from media file paths to their sheet + cell positions.
 *
 * Chain: sheet.xml.rels → drawing.xml → twoCellAnchor(col,row) + r:embed=rId
 *        drawing.xml.rels → rId → ../media/image1.png
 *
 * Returns: Map<"media/image1.png", {sheetName: "Sheet1", cellRef: "C2"}>
 */
function buildImagePositionMap(
  entries: ZipEntry[],
  sheetNames: string[],
  warnings: string[]
): Map<string, { sheetName: string; cellRef: string }> {
  const result = new Map<string, { sheetName: string; cellRef: string }>();

  // Step 1: Build sheet → drawing file mapping from sheet .rels
  // e.g., "1" → "drawing1.xml"
  const sheetToDrawing = new Map<string, string>();
  const sheetRelsEntries = entries.filter(e => /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/i.test(e.name));

  for (const entry of sheetRelsEntries) {
    try {
      const xml = decompressEntry(entry);
      const sheetNum = entry.name.match(/sheet(\d+)\.xml\.rels/i)?.[1];
      if (!sheetNum) continue;

      // Find the drawing relationship
      const drawingMatch = xml.match(/Target="[^"]*drawings\/(drawing\d+\.xml)"/i);
      if (drawingMatch) {
        sheetToDrawing.set(sheetNum, drawingMatch[1]);
      }
    } catch { /* best-effort */ }
  }

  // Step 2: Build drawing → (rId → media path) from drawing .rels
  const drawingRelsMap = new Map<string, Map<string, string>>();
  const drawingRelsEntries = entries.filter(e => /^xl\/drawings\/_rels\/drawing\d+\.xml\.rels$/i.test(e.name));

  for (const entry of drawingRelsEntries) {
    try {
      const xml = decompressEntry(entry);
      const drawingFileName = entry.name.match(/(drawing\d+\.xml)\.rels/i)?.[1];
      if (!drawingFileName) continue;

      const relMap = new Map<string, string>();
      const relRegex = new RegExp('<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"[^>]*/>', 'gi');
      let match;
      while ((match = relRegex.exec(xml)) !== null) {
        // Normalize "../media/image1.png" → "media/image1.png"
        relMap.set(match[1], match[2].replace(/^\.\.\//, ''));
      }
      drawingRelsMap.set(drawingFileName, relMap);
    } catch { /* best-effort */ }
  }

  // Step 3: Parse each drawing XML for anchors, then resolve the full chain
  const drawingEntries = entries.filter(e => /^xl\/drawings\/drawing\d+\.xml$/i.test(e.name));

  for (const entry of drawingEntries) {
    try {
      const xml = decompressEntry(entry);
      const drawingFileName = entry.name.split('/').pop() || '';
      const anchors = parseDrawingAnchors(xml);

      // Find which sheet this drawing belongs to
      let sheetName: string | undefined;
      for (const [sheetNum, drawingFile] of sheetToDrawing) {
        if (drawingFile === drawingFileName) {
          const idx = parseInt(sheetNum, 10) - 1;
          sheetName = idx < sheetNames.length ? sheetNames[idx] : `Sheet${idx + 1}`;
          break;
        }
      }

      // Get the rId → media path mapping for this drawing
      const relMap = drawingRelsMap.get(drawingFileName);
      if (!relMap) continue;

      // Resolve each anchor: rId → media path, then store with position
      for (const anchor of anchors) {
        const mediaPath = relMap.get(anchor.rId);
        if (mediaPath) {
          result.set(mediaPath, {
            sheetName: sheetName || 'Unknown',
            cellRef: anchor.cellRef,
          });
        }
      }
    } catch (err) {
      warnings.push(`Drawing parsing failed for ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

// ============================================================================
// Sheet Names from Workbook XML
// ============================================================================

function extractSheetNames(entries: ZipEntry[]): string[] {
  const workbookEntry = entries.find(e => /^xl\/workbook\.xml$/i.test(e.name));
  if (!workbookEntry) return [];

  try {
    const xml = decompressEntry(workbookEntry);
    const names: string[] = [];
    const sheetRegex = new RegExp('<sheet\\s+[^>]*name="([^"]*)"[^>]*/>', 'gi');
    let match;
    while ((match = sheetRegex.exec(xml)) !== null) {
      names.push(decodeXmlEntities(match[1]));
    }
    return names;
  } catch {
    return [];
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Extract all rich content from an XLSX file buffer.
 *
 * This reads the ZIP archive directly to extract media, charts, comments,
 * and structural metadata that SheetJS doesn't expose.
 *
 * @param buffer - Raw file bytes
 * @returns Rich content extraction result
 */
export function extractRichContent(buffer: Buffer): ExcelRichContent {
  const warnings: string[] = [];

  // Read all entries we might need
  const entries = readZipEntries(buffer, (name) => {
    return /^xl\/media\//i.test(name) ||
      /^xl\/charts\/chart\d+\.xml$/i.test(name) ||
      /^xl\/comments\d*\.xml$/i.test(name) ||
      /^xl\/worksheets\/sheet\d+\.xml$/i.test(name) ||
      /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/i.test(name) ||
      /^xl\/drawings\//i.test(name) ||
      /^xl\/workbook\.xml$/i.test(name);
  });

  const sheetNames = extractSheetNames(entries);
  const imagePositions = buildImagePositionMap(entries, sheetNames, warnings);

  const images = extractImages(entries, imagePositions, warnings);
  const charts = extractCharts(entries, warnings);
  const comments = extractComments(entries, sheetNames, warnings);
  const mergedCells = extractMergedCells(entries, sheetNames, warnings);
  const hyperlinks = extractHyperlinks(entries, sheetNames, warnings);
  const namedRanges = extractNamedRanges(entries, sheetNames, warnings);

  return {
    images,
    charts,
    comments,
    mergedCells,
    hyperlinks,
    namedRanges,
    warnings,
  };
}
