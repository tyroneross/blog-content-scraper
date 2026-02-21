#!/usr/bin/env npx tsx
/**
 * Local Data Ingestion CLI
 *
 * Process local files (Excel, PowerPoint, Python, PDF, web pages) on Mac/Linux.
 * Outputs clean Markdown, plain text, or JSON suitable for LLM consumption.
 *
 * Usage:
 *   npx tsx cli/ingest.ts <file-or-url> [options]
 *   npx tsx cli/ingest.ts ./data/report.xlsx --format markdown
 *   npx tsx cli/ingest.ts ./deck.pptx --format json
 *   npx tsx cli/ingest.ts ./script.py --format text
 *   npx tsx cli/ingest.ts https://example.com/page --format markdown
 *   npx tsx cli/ingest.ts ./folder/ --recursive
 *
 * Options:
 *   --format, -f     Output format: markdown, text, json (default: markdown)
 *   --output, -o     Output file path (default: stdout)
 *   --recursive, -r  Process all supported files in a directory
 *   --quiet, -q      Suppress progress messages
 *   --sheet          Excel: specific sheet name to extract
 *   --notes          PPTX: include speaker notes (default: true)
 *   --help, -h       Show this help message
 *
 * Supported file types:
 *   .xlsx, .xls, .csv, .tsv, .ods  - Spreadsheets
 *   .pptx                           - PowerPoint presentations
 *   .py                             - Python source files
 *   .pdf                            - PDF documents (text-based)
 *   http://, https://               - Web pages
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Argument Parsing
// ============================================================================

interface CliArgs {
  input: string;
  format: 'markdown' | 'text' | 'json';
  output?: string;
  recursive: boolean;
  quiet: boolean;
  sheet?: string;
  notes: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const result: CliArgs = {
    input: '',
    format: 'markdown',
    output: undefined,
    recursive: false,
    quiet: false,
    notes: true,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--format':
      case '-f':
        result.format = (args[++i] || 'markdown') as CliArgs['format'];
        break;
      case '--output':
      case '-o':
        result.output = args[++i];
        break;
      case '--recursive':
      case '-r':
        result.recursive = true;
        break;
      case '--quiet':
      case '-q':
        result.quiet = true;
        break;
      case '--sheet':
        result.sheet = args[++i];
        break;
      case '--notes':
        result.notes = args[i + 1] !== 'false';
        if (args[i + 1] === 'false' || args[i + 1] === 'true') i++;
        break;
      case '--no-notes':
        result.notes = false;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
      default:
        if (!arg.startsWith('-') && !result.input) {
          result.input = arg;
        }
        break;
    }
  }

  return result;
}

function showHelp() {
  console.log(`
Local Data Ingestion CLI

Usage:
  npx tsx cli/ingest.ts <file-or-url> [options]

Examples:
  npx tsx cli/ingest.ts ./report.xlsx                    # Excel → Markdown
  npx tsx cli/ingest.ts ./deck.pptx -f json              # PPTX → JSON
  npx tsx cli/ingest.ts ./script.py -f text              # Python → Text
  npx tsx cli/ingest.ts https://example.com -f markdown  # Web page → Markdown
  npx tsx cli/ingest.ts ./data/ -r -o output.md          # All files → single MD
  npx tsx cli/ingest.ts ./report.pdf                     # PDF → Markdown

Options:
  -f, --format <type>   Output format: markdown, text, json (default: markdown)
  -o, --output <path>   Write output to file (default: stdout)
  -r, --recursive       Process all supported files in a directory
  -q, --quiet           Suppress progress messages
  --sheet <name>        Excel: specific sheet name to extract
  --no-notes            PPTX: exclude speaker notes
  -h, --help            Show this help message

Supported file types:
  Spreadsheets:  .xlsx, .xls, .csv, .tsv, .ods, .xlsb
  Presentations: .pptx
  Source code:   .py
  Documents:     .pdf (text-based PDFs)
  Web pages:     http:// or https:// URLs
`);
}

// ============================================================================
// File Type Detection
// ============================================================================

const SUPPORTED_EXTENSIONS = new Set([
  '.xlsx', '.xls', '.csv', '.tsv', '.ods', '.xlsb',
  '.pptx',
  '.py',
  '.pdf',
]);

function getFileType(filePath: string): 'excel' | 'pptx' | 'python' | 'pdf' | 'url' | 'unknown' {
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return 'url';
  }

  const ext = path.extname(filePath).toLowerCase();
  if (['.xlsx', '.xls', '.csv', '.tsv', '.ods', '.xlsb'].includes(ext)) return 'excel';
  if (ext === '.pptx') return 'pptx';
  if (ext === '.py') return 'python';
  if (ext === '.pdf') return 'pdf';

  return 'unknown';
}

function findSupportedFiles(dirPath: string, recursive: boolean): string[] {
  const files: string[] = [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory() && recursive) {
      files.push(...findSupportedFiles(fullPath, true));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files.sort();
}

// ============================================================================
// Processing Functions
// ============================================================================

interface ProcessResult {
  fileName: string;
  fileType: string;
  markdown: string;
  text: string;
  data: any;
  wordCount: number;
  estimatedTokens: number;
  parseTime: number;
  errors?: string[];
}

async function processExcel(filePath: string, args: CliArgs): Promise<ProcessResult> {
  const { parseExcelFile } = await import('../lib/parsers/excel-parser');

  const options: any = {};
  if (args.sheet) {
    options.sheets = [args.sheet];
  }

  const result = parseExcelFile(filePath, options);

  return {
    fileName: result.fileName,
    fileType: `Excel (${result.format})`,
    markdown: result.markdown,
    text: result.text,
    data: {
      sheets: result.sheets.map(s => ({
        name: s.name,
        headers: s.headers,
        rows: s.rows,
        rowCount: s.rowCount,
        columnCount: s.columnCount,
      })),
      properties: result.properties,
    },
    wordCount: result.wordCount,
    estimatedTokens: result.estimatedTokens,
    parseTime: result.parseTime,
    errors: result.errors,
  };
}

async function processPptx(filePath: string, args: CliArgs): Promise<ProcessResult> {
  const { parsePptxFile } = await import('../lib/parsers/pptx-parser');

  const result = await parsePptxFile(filePath, {
    includeNotes: args.notes,
  });

  return {
    fileName: result.fileName,
    fileType: 'PowerPoint',
    markdown: result.markdown,
    text: result.text,
    data: {
      slides: result.slides,
      slideCount: result.slideCount,
    },
    wordCount: result.wordCount,
    estimatedTokens: result.estimatedTokens,
    parseTime: result.parseTime,
    errors: result.errors,
  };
}

async function processPython(filePath: string): Promise<ProcessResult> {
  const { parsePythonFile } = await import('../lib/parsers/python-parser');

  const result = parsePythonFile(filePath);

  return {
    fileName: result.fileName,
    fileType: 'Python',
    markdown: result.markdown,
    text: result.text,
    data: {
      imports: result.imports,
      functions: result.functions.map(f => ({
        name: f.name,
        parameters: f.parameters,
        returnType: f.returnType,
        docstring: f.docstring,
        isAsync: f.isAsync,
        line: f.line,
      })),
      classes: result.classes.map(c => ({
        name: c.name,
        bases: c.bases,
        docstring: c.docstring,
        methods: c.methods.map(m => m.name),
        line: c.line,
      })),
      variables: result.variables,
      stats: {
        totalLines: result.totalLines,
        linesOfCode: result.linesOfCode,
        blankLines: result.blankLines,
        commentLines: result.commentLines,
      },
    },
    wordCount: result.wordCount,
    estimatedTokens: result.estimatedTokens,
    parseTime: result.parseTime,
    errors: result.errors,
  };
}

async function processPdf(filePath: string): Promise<ProcessResult> {
  // Built-in PDF text extraction using pdf-parse-like approach
  // For text-based PDFs, we extract text content directly
  const startTime = Date.now();
  const fileName = path.basename(filePath);

  try {
    // Use a simple approach: try to extract text from the PDF binary
    const buffer = fs.readFileSync(filePath);
    const text = extractTextFromPdfBuffer(buffer);

    if (!text || text.trim().length < 10) {
      return {
        fileName,
        fileType: 'PDF',
        markdown: `# ${fileName}\n\n*Unable to extract text from this PDF. It may be image-based or encrypted.*`,
        text: '',
        data: { pages: 0, error: 'No extractable text found' },
        wordCount: 0,
        estimatedTokens: 0,
        parseTime: Date.now() - startTime,
        errors: ['PDF appears to be image-based or has no extractable text. OCR is not supported in this version.'],
      };
    }

    const wordCount = text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
    const markdown = `# ${fileName}\n\n${text}`;

    return {
      fileName,
      fileType: 'PDF',
      markdown,
      text,
      data: { extractedLength: text.length },
      wordCount,
      estimatedTokens: Math.ceil(text.length / 4),
      parseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      fileName,
      fileType: 'PDF',
      markdown: `# ${fileName}\n\n*Error processing PDF: ${error instanceof Error ? error.message : String(error)}*`,
      text: '',
      data: { error: String(error) },
      wordCount: 0,
      estimatedTokens: 0,
      parseTime: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Basic PDF text extraction from buffer.
 *
 * PDF files store text in stream objects. This extracts text from
 * uncompressed text streams and BT/ET text blocks. For compressed
 * PDFs (most modern ones), this will attempt zlib decompression.
 *
 * This is a from-scratch implementation that handles common PDF formats
 * without external dependencies.
 */
function extractTextFromPdfBuffer(buffer: Buffer): string {
  const content = buffer.toString('latin1');
  const textParts: string[] = [];

  // Strategy 1: Find text between BT (Begin Text) and ET (End Text) markers
  const btEtPattern = /BT\s([\s\S]*?)ET/g;
  let btMatch;

  while ((btMatch = btEtPattern.exec(content)) !== null) {
    const textBlock = btMatch[1];

    // Extract text from Tj (show text) and TJ (show text array) operators
    const tjPattern = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjPattern.exec(textBlock)) !== null) {
      const decoded = decodePdfString(tjMatch[1]);
      if (decoded.trim()) textParts.push(decoded);
    }

    // TJ operator: array of strings and positioning
    const tjArrayPattern = /\[((?:[^]]*?))\]\s*TJ/g;
    let tjArrMatch;
    while ((tjArrMatch = tjArrayPattern.exec(textBlock)) !== null) {
      const arrayContent = tjArrMatch[1];
      const stringPattern = /\(([^)]*)\)/g;
      let strMatch;
      const parts: string[] = [];
      while ((strMatch = stringPattern.exec(arrayContent)) !== null) {
        parts.push(decodePdfString(strMatch[1]));
      }
      if (parts.length > 0) textParts.push(parts.join(''));
    }
  }

  // Strategy 2: Try to decompress FlateDecode streams
  if (textParts.length === 0) {
    try {
      const zlib = require('zlib');
      const streamPattern = /stream\r?\n([\s\S]*?)endstream/g;
      let streamMatch;

      while ((streamMatch = streamPattern.exec(content)) !== null) {
        try {
          const compressed = Buffer.from(streamMatch[1], 'latin1');
          const decompressed = zlib.inflateSync(compressed).toString('latin1');

          // Extract text from decompressed stream
          const innerBtEt = /BT\s([\s\S]*?)ET/g;
          let innerMatch;
          while ((innerMatch = innerBtEt.exec(decompressed)) !== null) {
            const block = innerMatch[1];
            const innerTj = /\(([^)]*)\)\s*Tj/g;
            let innerTjMatch;
            while ((innerTjMatch = innerTj.exec(block)) !== null) {
              const decoded = decodePdfString(innerTjMatch[1]);
              if (decoded.trim()) textParts.push(decoded);
            }

            const innerTjArr = /\[((?:[^]]*?))\]\s*TJ/g;
            let innerTjArrMatch;
            while ((innerTjArrMatch = innerTjArr.exec(block)) !== null) {
              const arrContent = innerTjArrMatch[1];
              const innerStrPat = /\(([^)]*)\)/g;
              let innerStrMatch;
              const parts: string[] = [];
              while ((innerStrMatch = innerStrPat.exec(arrContent)) !== null) {
                parts.push(decodePdfString(innerStrMatch[1]));
              }
              if (parts.length > 0) textParts.push(parts.join(''));
            }
          }
        } catch {
          // Skip streams that can't be decompressed
        }
      }
    } catch {
      // zlib not available or decompression failed
    }
  }

  // Clean up and join
  let result = textParts.join(' ');

  // Normalize whitespace
  result = result.replace(/\s+/g, ' ').trim();

  // Try to detect paragraph breaks (double spaces or certain patterns)
  result = result.replace(/\.\s+([A-Z])/g, '.\n\n$1');

  return result;
}

function decodePdfString(encoded: string): string {
  // Handle PDF escape sequences
  return encoded
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

async function processUrl(url: string): Promise<ProcessResult> {
  const { extractPage } = await import('../lib/parsers/page-extractor');

  const startTime = Date.now();
  const result = await extractPage(url);

  if (!result) {
    return {
      fileName: url,
      fileType: 'Web Page',
      markdown: `# ${url}\n\n*Failed to extract content from this URL.*`,
      text: '',
      data: { error: 'Extraction failed' },
      wordCount: 0,
      estimatedTokens: 0,
      parseTime: Date.now() - startTime,
      errors: ['Failed to extract content from URL'],
    };
  }

  return {
    fileName: result.title || url,
    fileType: `Web Page (${result.pageType})`,
    markdown: `# ${result.title}\n\n*Source: ${url}*\n\n${result.markdown}`,
    text: result.text,
    data: {
      title: result.title,
      url: result.url,
      pageType: result.pageType,
      links: result.links.length,
      images: result.images.length,
      headings: result.headings,
      tables: result.tables,
    },
    wordCount: result.wordCount,
    estimatedTokens: Math.ceil(result.text.length / 4),
    parseTime: Date.now() - startTime,
    errors: result.errors,
  };
}

// ============================================================================
// Output Formatting
// ============================================================================

function formatOutput(results: ProcessResult[], format: CliArgs['format']): string {
  switch (format) {
    case 'markdown':
      return results.map(r => r.markdown).join('\n\n---\n\n');

    case 'text':
      return results.map(r => r.text).join('\n\n');

    case 'json':
      return JSON.stringify(
        results.length === 1 ? results[0] : results,
        null,
        2
      );

    default:
      return results.map(r => r.markdown).join('\n\n---\n\n');
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.input) {
    showHelp();
    process.exit(args.help ? 0 : 1);
  }

  const log = args.quiet ? () => {} : (msg: string) => console.error(msg);

  const results: ProcessResult[] = [];
  let filesToProcess: string[] = [];

  // Determine files to process
  if (args.input.startsWith('http://') || args.input.startsWith('https://')) {
    filesToProcess = [args.input];
  } else {
    const resolvedPath = path.resolve(args.input);

    if (!fs.existsSync(resolvedPath)) {
      console.error(`Error: File or directory not found: ${args.input}`);
      process.exit(1);
    }

    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      filesToProcess = findSupportedFiles(resolvedPath, args.recursive);
      if (filesToProcess.length === 0) {
        console.error(`No supported files found in: ${args.input}`);
        process.exit(1);
      }
      log(`Found ${filesToProcess.length} files to process`);
    } else {
      filesToProcess = [resolvedPath];
    }
  }

  // Process each file
  for (const filePath of filesToProcess) {
    const fileType = getFileType(filePath);
    log(`Processing: ${path.basename(filePath)} (${fileType})`);

    try {
      let result: ProcessResult;

      switch (fileType) {
        case 'excel':
          result = await processExcel(filePath, args);
          break;
        case 'pptx':
          result = await processPptx(filePath, args);
          break;
        case 'python':
          result = await processPython(filePath);
          break;
        case 'pdf':
          result = await processPdf(filePath);
          break;
        case 'url':
          result = await processUrl(filePath);
          break;
        default:
          log(`  Skipping unsupported file type: ${filePath}`);
          continue;
      }

      log(`  ${result.wordCount} words, ${result.estimatedTokens} tokens, ${result.parseTime}ms`);
      if (result.errors?.length) {
        log(`  Warnings: ${result.errors.join('; ')}`);
      }

      results.push(result);
    } catch (error) {
      log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (results.length === 0) {
    console.error('No files were successfully processed.');
    process.exit(1);
  }

  // Output results
  const output = formatOutput(results, args.format);

  if (args.output) {
    fs.writeFileSync(args.output, output, 'utf-8');
    log(`\nOutput written to: ${args.output}`);
  } else {
    console.log(output);
  }

  // Summary (only if not piping to file and not quiet)
  if (!args.output && !args.quiet) {
    const totalWords = results.reduce((sum, r) => sum + r.wordCount, 0);
    const totalTokens = results.reduce((sum, r) => sum + r.estimatedTokens, 0);
    console.error(`\n--- Summary ---`);
    console.error(`Files processed: ${results.length}`);
    console.error(`Total words: ${totalWords.toLocaleString()}`);
    console.error(`Estimated tokens: ${totalTokens.toLocaleString()}`);
  }
}

main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
