/**
 * Parser Integration Test
 *
 * Tests all new parsers (Excel, PPTX, Python, Page) with real sample files.
 * Run with: npx tsx tests/parser-test.ts
 */

import { parseExcelFile } from '../lib/parsers/excel-parser';
import { parsePythonFile } from '../lib/parsers/python-parser';
import { parsePptxFile } from '../lib/parsers/pptx-parser';
import { fastExtract } from '../lib/optimizations/index';
import * as path from 'path';
import * as fs from 'fs';

const SAMPLE_DIR = path.join(__dirname, 'sample-files');

async function testExcelParser() {
  console.log('\n' + '='.repeat(60));
  console.log('EXCEL PARSER TEST');
  console.log('='.repeat(60));

  const filePath = path.join(SAMPLE_DIR, 'sample.xlsx');
  if (!fs.existsSync(filePath)) {
    console.log('SKIP: sample.xlsx not found');
    return;
  }

  try {
    const result = parseExcelFile(filePath);

    console.log(`File: ${result.fileName}`);
    console.log(`Format: ${result.format}`);
    console.log(`Sheets: ${result.sheetCount}`);
    console.log(`Total rows: ${result.totalRows}`);
    console.log(`Total cells: ${result.totalCells}`);
    console.log(`Word count: ${result.wordCount}`);
    console.log(`Estimated tokens: ${result.estimatedTokens}`);
    console.log(`Parse time: ${result.parseTime}ms`);

    if (result.properties) {
      console.log(`\nProperties:`);
      if (result.properties.title) console.log(`  Title: ${result.properties.title}`);
      if (result.properties.author) console.log(`  Author: ${result.properties.author}`);
    }

    for (const sheet of result.sheets) {
      console.log(`\nSheet "${sheet.name}" (${sheet.rowCount} rows, ${sheet.columnCount} cols):`);
      console.log(`  Headers: ${sheet.headers.join(', ')}`);
      console.log(`  Range: ${sheet.range}`);
      if (sheet.rows.length > 0) {
        console.log(`  First row: ${JSON.stringify(sheet.rows[0])}`);
      }
    }

    // Show markdown preview
    console.log(`\nMarkdown preview (first 500 chars):`);
    console.log(result.markdown.substring(0, 500));

    if (result.errors) {
      console.log(`\nErrors: ${result.errors.join(', ')}`);
    }

    console.log('\nEXCEL TEST: PASSED');
  } catch (error) {
    console.error('EXCEL TEST: FAILED', error);
  }
}

async function testPythonParser() {
  console.log('\n' + '='.repeat(60));
  console.log('PYTHON PARSER TEST');
  console.log('='.repeat(60));

  const filePath = path.join(SAMPLE_DIR, 'sample.py');
  if (!fs.existsSync(filePath)) {
    console.log('SKIP: sample.py not found');
    return;
  }

  try {
    const result = parsePythonFile(filePath);

    console.log(`File: ${result.fileName}`);
    console.log(`Total lines: ${result.totalLines}`);
    console.log(`Lines of code: ${result.linesOfCode}`);
    console.log(`Blank lines: ${result.blankLines}`);
    console.log(`Comment lines: ${result.commentLines}`);
    console.log(`Word count: ${result.wordCount}`);
    console.log(`Estimated tokens: ${result.estimatedTokens}`);
    console.log(`Parse time: ${result.parseTime}ms`);

    if (result.moduleDocstring) {
      console.log(`\nModule docstring: "${result.moduleDocstring.substring(0, 100)}..."`);
    }

    console.log(`\nImports (${result.imports.length}):`);
    for (const imp of result.imports) {
      if (imp.type === 'from') {
        console.log(`  from ${imp.module} import ${imp.names?.join(', ')}`);
      } else {
        console.log(`  import ${imp.module}${imp.alias ? ` as ${imp.alias}` : ''}`);
      }
    }

    console.log(`\nConstants (${result.variables.length}):`);
    for (const v of result.variables) {
      console.log(`  ${v.name}${v.type ? ': ' + v.type : ''} = ${v.value}`);
    }

    console.log(`\nFunctions (${result.functions.length}):`);
    for (const func of result.functions) {
      const params = func.parameters.map(p => p.name).join(', ');
      console.log(`  ${func.isAsync ? 'async ' : ''}${func.name}(${params})${func.returnType ? ' -> ' + func.returnType : ''}`);
      if (func.docstring) console.log(`    "${func.docstring.split('\n')[0]}"`);
    }

    console.log(`\nClasses (${result.classes.length}):`);
    for (const cls of result.classes) {
      console.log(`  class ${cls.name}(${cls.bases.join(', ')})`);
      if (cls.docstring) console.log(`    "${cls.docstring.split('\n')[0]}"`);
      console.log(`    Methods: ${cls.methods.map(m => m.name).join(', ')}`);
      console.log(`    Attributes: ${cls.attributes.map(a => a.name).join(', ')}`);
    }

    // Show markdown preview
    console.log(`\nMarkdown preview (first 500 chars):`);
    console.log(result.markdown.substring(0, 500));

    console.log('\nPYTHON TEST: PASSED');
  } catch (error) {
    console.error('PYTHON TEST: FAILED', error);
  }
}

async function testPptxParser() {
  console.log('\n' + '='.repeat(60));
  console.log('PPTX PARSER TEST');
  console.log('='.repeat(60));

  const filePath = path.join(SAMPLE_DIR, 'sample.pptx');
  if (!fs.existsSync(filePath)) {
    console.log('SKIP: sample.pptx not found');
    return;
  }

  try {
    const result = await parsePptxFile(filePath);

    console.log(`File: ${result.fileName}`);
    console.log(`Slides: ${result.slideCount}`);
    console.log(`Word count: ${result.wordCount}`);
    console.log(`Estimated tokens: ${result.estimatedTokens}`);
    console.log(`Parse time: ${result.parseTime}ms`);

    for (const slide of result.slides.slice(0, 5)) {
      console.log(`\nSlide ${slide.slideNumber}: ${slide.title || '(no title)'}`);
      console.log(`  Text blocks: ${slide.textBlocks.length}`);
      if (slide.text) console.log(`  Content: "${slide.text.substring(0, 100)}${slide.text.length > 100 ? '...' : ''}"`);
      if (slide.notes) console.log(`  Notes: "${slide.notes.substring(0, 100)}"`);
    }

    if (result.slides.length > 5) {
      console.log(`\n... and ${result.slides.length - 5} more slides`);
    }

    // Show markdown preview
    console.log(`\nMarkdown preview (first 500 chars):`);
    console.log(result.markdown.substring(0, 500));

    if (result.errors) {
      console.log(`\nErrors: ${result.errors.join(', ')}`);
    }

    console.log('\nPPTX TEST: PASSED');
  } catch (error) {
    console.error('PPTX TEST: FAILED', error);
  }
}

async function testFastExtract() {
  console.log('\n' + '='.repeat(60));
  console.log('FAST EXTRACT TEST');
  console.log('='.repeat(60));

  const sampleHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>Test Page - Example Corp</title>
      <meta property="og:title" content="Test Page">
      <meta name="description" content="A test page for the fast extractor">
    </head>
    <body>
      <nav><a href="/">Home</a> | <a href="/about">About</a></nav>
      <main>
        <article>
          <h1>Understanding Web Scraping</h1>
          <p>Web scraping is the process of extracting data from websites.
          It involves fetching web pages and parsing their content to extract
          useful information. This technique is widely used in data science,
          market research, and content aggregation.</p>
          <h2>Common Approaches</h2>
          <p>There are several approaches to web scraping, including using
          HTTP libraries to fetch pages, DOM parsers to navigate the HTML
          structure, and headless browsers for JavaScript-rendered content.</p>
          <table>
            <thead><tr><th>Tool</th><th>Language</th><th>Speed</th></tr></thead>
            <tbody>
              <tr><td>Beautiful Soup</td><td>Python</td><td>Moderate</td></tr>
              <tr><td>Cheerio</td><td>JavaScript</td><td>Fast</td></tr>
              <tr><td>Puppeteer</td><td>JavaScript</td><td>Slow</td></tr>
            </tbody>
          </table>
        </article>
      </main>
      <footer>Copyright 2024 Example Corp</footer>
    </body>
    </html>
  `;

  try {
    const result = fastExtract(sampleHtml);

    if (result) {
      console.log(`Title: ${result.title}`);
      console.log(`Word count: ${result.wordCount}`);
      console.log(`Reading time: ${result.readingTime} min`);
      console.log(`Text preview: "${result.text.substring(0, 200)}..."`);
      console.log(`Markdown preview: "${result.markdown.substring(0, 200)}..."`);
      console.log('\nFAST EXTRACT TEST: PASSED');
    } else {
      console.log('FAST EXTRACT TEST: FAILED (null result)');
    }
  } catch (error) {
    console.error('FAST EXTRACT TEST: FAILED', error);
  }
}

async function testCSVParser() {
  console.log('\n' + '='.repeat(60));
  console.log('CSV PARSER TEST');
  console.log('='.repeat(60));

  const { parseCSV } = await import('../lib/parsers/excel-parser');

  const csvContent = `Name,Age,City,Score
Alice,30,New York,95
Bob,25,San Francisco,87
Charlie,35,Chicago,92
Diana,28,Los Angeles,88
Eve,32,Seattle,91`;

  try {
    const result = parseCSV(csvContent);

    console.log(`Format: ${result.format}`);
    console.log(`Sheets: ${result.sheetCount}`);
    console.log(`Total rows: ${result.totalRows}`);
    console.log(`Word count: ${result.wordCount}`);
    console.log(`Parse time: ${result.parseTime}ms`);

    if (result.sheets.length > 0) {
      const sheet = result.sheets[0];
      console.log(`Headers: ${sheet.headers.join(', ')}`);
      console.log(`Rows: ${sheet.rows.length}`);
      if (sheet.rows.length > 0) {
        console.log(`First row: ${JSON.stringify(sheet.rows[0])}`);
      }
    }

    console.log(`\nMarkdown:\n${result.markdown}`);
    console.log('\nCSV TEST: PASSED');
  } catch (error) {
    console.error('CSV TEST: FAILED', error);
  }
}

async function main() {
  console.log('========================================');
  console.log('  Parser Integration Tests');
  console.log('========================================');

  await testExcelParser();
  await testCSVParser();
  await testPythonParser();
  await testPptxParser();
  await testFastExtract();

  console.log('\n' + '='.repeat(60));
  console.log('ALL TESTS COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
