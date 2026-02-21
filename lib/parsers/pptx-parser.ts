/**
 * PowerPoint (PPTX) File Parser
 *
 * Extracts text content, speaker notes, and slide structure from
 * PowerPoint presentations (.pptx format).
 *
 * Uses node-pptx-parser for slide text extraction and JSZip-based
 * parsing for speaker notes extraction.
 *
 * Supports:
 * - Slide text extraction with formatting
 * - Speaker notes extraction
 * - Slide ordering and numbering
 * - Markdown output for LLM consumption
 * - Word count and token estimation
 */

import * as fs from 'fs';
import * as path from 'path';

export interface PptxParseResult {
  /** Original file name */
  fileName: string;
  /** Number of slides */
  slideCount: number;
  /** Extracted slides with text and notes */
  slides: PptxSlide[];
  /** Combined text from all slides */
  allText: string;
  /** Combined speaker notes from all slides */
  allNotes: string;
  /** Markdown representation */
  markdown: string;
  /** Plain text representation */
  text: string;
  /** Word count */
  wordCount: number;
  /** Estimated token count */
  estimatedTokens: number;
  /** Parse time in milliseconds */
  parseTime: number;
  /** Errors encountered */
  errors?: string[];
}

export interface PptxSlide {
  /** Slide number (1-based) */
  slideNumber: number;
  /** Text blocks from the slide */
  textBlocks: string[];
  /** Combined slide text */
  text: string;
  /** Speaker notes for this slide */
  notes?: string;
  /** Slide title (first text block, if present) */
  title?: string;
}

export interface PptxParseOptions {
  /** Extract speaker notes (default: true) */
  includeNotes?: boolean;
  /** Maximum slides to parse (default: unlimited) */
  maxSlides?: number;
}

/**
 * Parse a PowerPoint (.pptx) file and extract its content.
 *
 * @param filePath - Path to the .pptx file
 * @param options - Parse options
 * @returns Parsed presentation data
 *
 * @example
 * ```typescript
 * import { parsePptxFile } from '@tyroneross/omniparse/parsers';
 *
 * const result = await parsePptxFile('./presentation.pptx');
 * for (const slide of result.slides) {
 *   console.log(`Slide ${slide.slideNumber}: ${slide.title}`);
 *   console.log(slide.text);
 *   if (slide.notes) console.log('Notes:', slide.notes);
 * }
 * console.log(result.markdown);
 * ```
 */
export async function parsePptxFile(
  filePath: string,
  options: PptxParseOptions = {}
): Promise<PptxParseResult> {
  const startTime = Date.now();
  const {
    includeNotes = true,
    maxSlides,
  } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileName = path.basename(filePath);
  const errors: string[] = [];

  // Use node-pptx-parser for text extraction
  let slides: PptxSlide[] = [];

  try {
    const PptxParser = (await import('node-pptx-parser')).default;
    const parser = new PptxParser(filePath);
    const slideTexts = await parser.extractText();

    const limit = maxSlides ? Math.min(slideTexts.length, maxSlides) : slideTexts.length;

    for (let i = 0; i < limit; i++) {
      const slideData = slideTexts[i];
      const textBlocks = slideData.text.filter((t: string) => t.trim().length > 0);
      const slideText = textBlocks.join('\n');

      // Try to detect slide title (usually first significant text block)
      const title = textBlocks.length > 0 ? textBlocks[0].trim() : undefined;

      slides.push({
        slideNumber: i + 1,
        textBlocks,
        text: slideText,
        title,
      });
    }
  } catch (error) {
    errors.push(`Text extraction error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Extract speaker notes if requested
  if (includeNotes && slides.length > 0) {
    try {
      const notes = await extractNotesFromPptx(filePath);
      for (const [slideIndex, noteText] of notes.entries()) {
        if (slideIndex < slides.length && noteText) {
          slides[slideIndex].notes = noteText;
        }
      }
    } catch (error) {
      errors.push(`Notes extraction error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Generate outputs
  const allText = slides.map(s => s.text).join('\n\n');
  const allNotes = slides
    .filter(s => s.notes)
    .map(s => `Slide ${s.slideNumber}: ${s.notes}`)
    .join('\n\n');
  const markdown = generatePptxMarkdown(fileName, slides);
  const text = generatePptxPlainText(fileName, slides);
  const wordCount = countWords(text);
  const estimatedTokens = Math.ceil(text.length / 4);

  return {
    fileName,
    slideCount: slides.length,
    slides,
    allText,
    allNotes,
    markdown,
    text,
    wordCount,
    estimatedTokens,
    parseTime: Date.now() - startTime,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Parse a PowerPoint file from a Buffer.
 *
 * Writes to a temporary file, parses it, then cleans up.
 *
 * @param buffer - PPTX file contents
 * @param fileName - Original file name
 * @param options - Parse options
 * @returns Parsed presentation data
 */
export async function parsePptxBuffer(
  buffer: Buffer,
  fileName: string = 'presentation.pptx',
  options: PptxParseOptions = {}
): Promise<PptxParseResult> {
  const crypto = require('crypto');
  const tmpPath = path.join(require('os').tmpdir(), `pptx-parse-${crypto.randomUUID()}.pptx`);

  try {
    fs.writeFileSync(tmpPath, buffer);
    const result = await parsePptxFile(tmpPath, options);
    result.fileName = fileName;
    return result;
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch { /* ignore cleanup errors */ }
  }
}

// --- Internal helpers ---

/**
 * Extract speaker notes from PPTX by reading the ZIP archive directly.
 *
 * PPTX files contain notes in ppt/notesSlides/notesSlide{N}.xml
 * Each notes file references a slide and contains text in a:t elements.
 *
 * Uses pure JS ZIP parsing (no shell commands) for security and portability.
 */
async function extractNotesFromPptx(filePath: string): Promise<Map<number, string>> {
  const notes = new Map<number, string>();

  try {
    const zlib = require('zlib');
    const fileBuffer = fs.readFileSync(filePath);
    const entries = readZipEntries(fileBuffer);

    // Find notesSlide entries
    const noteEntries = entries
      .filter(e => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(e.name))
      .sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+/)?.[0] || '0');
        const numB = parseInt(b.name.match(/\d+/)?.[0] || '0');
        return numA - numB;
      });

    for (const entry of noteEntries) {
      const slideNum = parseInt(entry.name.match(/\d+/)?.[0] || '0') - 1;

      let xml: string;
      if (entry.compressionMethod === 8) {
        // Deflate compressed
        xml = zlib.inflateRawSync(entry.data).toString('utf-8');
      } else {
        // Stored (no compression)
        xml = entry.data.toString('utf-8');
      }

      // Extract text from a:t elements
      const textMatches = xml.match(/<a:t>([^<]*)<\/a:t>/g);
      if (textMatches) {
        const noteText = textMatches
          .map(m => m.replace(/<\/?a:t>/g, ''))
          .join(' ')
          .trim();

        // Filter out placeholder text
        if (noteText && noteText.length > 0 && !noteText.match(/^slide \d+$/i)) {
          notes.set(slideNum, noteText);
        }
      }
    }
  } catch {
    // Notes extraction is best-effort
  }

  return notes;
}

/**
 * Minimal ZIP reader - reads local file headers and extracts entry data.
 * Only what we need: file name and raw/deflated data for each entry.
 */
interface ZipEntry {
  name: string;
  compressionMethod: number;
  data: Buffer;
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset < buffer.length - 4) {
    // Look for local file header signature: PK\x03\x04
    if (buffer[offset] !== 0x50 || buffer[offset + 1] !== 0x4b ||
        buffer[offset + 2] !== 0x03 || buffer[offset + 3] !== 0x04) {
      break; // No more local file headers
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const name = buffer.toString('utf-8', nameStart, nameStart + fileNameLength);

    const dataStart = nameStart + fileNameLength + extraFieldLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    entries.push({ name, compressionMethod, data });

    offset = dataStart + compressedSize;
  }

  return entries;
}

function generatePptxMarkdown(fileName: string, slides: PptxSlide[]): string {
  const sections: string[] = [];

  sections.push(`# ${fileName.replace(/\.pptx$/i, '')}`);
  sections.push(`\n*${slides.length} slides*\n`);

  for (const slide of slides) {
    const slideTitle = slide.title || `Slide ${slide.slideNumber}`;
    sections.push(`## Slide ${slide.slideNumber}: ${slideTitle}`);

    if (slide.textBlocks.length > 1) {
      // First block is title, rest is content
      for (let i = 1; i < slide.textBlocks.length; i++) {
        const block = slide.textBlocks[i].trim();
        if (block) sections.push(block);
      }
    }

    if (slide.notes) {
      sections.push(`\n> **Speaker Notes:** ${slide.notes}`);
    }

    sections.push('');
  }

  return sections.join('\n');
}

function generatePptxPlainText(fileName: string, slides: PptxSlide[]): string {
  const parts: string[] = [];

  parts.push(`Presentation: ${fileName}`);
  parts.push(`Slides: ${slides.length}\n`);

  for (const slide of slides) {
    parts.push(`--- Slide ${slide.slideNumber} ---`);
    parts.push(slide.text);
    if (slide.notes) {
      parts.push(`[Notes: ${slide.notes}]`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
