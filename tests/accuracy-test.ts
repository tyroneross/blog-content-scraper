/**
 * Accuracy Test Suite
 *
 * Tests parsers against verified expected outputs.
 * Each test specifies exact values the parser must produce.
 * This catches regressions in extraction accuracy.
 *
 * Run: npx tsx tests/accuracy-test.ts
 */

import { parsePythonFile } from '../lib/parsers/python-parser';
import { parseExcelFile, parseCSV } from '../lib/parsers/excel-parser';
import { parsePptxFile } from '../lib/parsers/pptx-parser';
import { parse, detectInputType } from '../lib/router';
import { fastExtract } from '../lib/optimizations/index';
import * as path from 'path';

// ============================================================================
// Test infrastructure
// ============================================================================

interface TestCase {
  name: string;
  run: () => Promise<void>;
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected string to include "${needle}" but it didn't.\nActual (first 200 chars): "${haystack.substring(0, 200)}"`);
  }
}

function assertArrayIncludes<T>(arr: T[], item: T, label: string): void {
  if (!arr.includes(item)) {
    throw new Error(`${label}: expected array to include ${JSON.stringify(item)}, got ${JSON.stringify(arr)}`);
  }
}

function assertGreaterThan(actual: number, min: number, label: string): void {
  if (actual <= min) {
    throw new Error(`${label}: expected > ${min}, got ${actual}`);
  }
}

async function runTest(test: TestCase): Promise<void> {
  try {
    await test.run();
    passed++;
    console.log(`  PASS: ${test.name}`);
  } catch (err: any) {
    failed++;
    const msg = `${test.name}: ${err.message}`;
    failures.push(msg);
    console.log(`  FAIL: ${msg}`);
  }
}

// ============================================================================
// Test Data Paths
// ============================================================================

const SAMPLES = path.join(__dirname, 'sample-files');

// ============================================================================
// Python Parser Accuracy Tests
// ============================================================================

const pythonTests: TestCase[] = [
  {
    name: 'Python: detects module docstring',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      assert(!!r.moduleDocstring, 'moduleDocstring should exist');
      assertIncludes(r.moduleDocstring!, 'Sample Python Module', 'moduleDocstring content');
    },
  },
  {
    name: 'Python: extracts all 5 imports',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      assertEquals(r.imports.length, 5, 'import count');
      const modules = r.imports.map(i => i.module);
      assertArrayIncludes(modules, 'os', 'imports');
      assertArrayIncludes(modules, 'sys', 'imports');
      assertArrayIncludes(modules, 'typing', 'imports');
      assertArrayIncludes(modules, 'dataclasses', 'imports');
      assertArrayIncludes(modules, 'pathlib', 'imports');
    },
  },
  {
    name: 'Python: extracts from-import names correctly',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      const typingImport = r.imports.find(i => i.module === 'typing');
      assert(!!typingImport, 'typing import should exist');
      assertEquals(typingImport!.type, 'from', 'typing import type');
      assert(!!typingImport!.names, 'typing import should have names');
      assertArrayIncludes(typingImport!.names!, 'List', 'typing names');
      assertArrayIncludes(typingImport!.names!, 'Optional', 'typing names');
      assertArrayIncludes(typingImport!.names!, 'Dict', 'typing names');
      assertArrayIncludes(typingImport!.names!, 'Any', 'typing names');
    },
  },
  {
    name: 'Python: extracts 4 top-level constants',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      assertEquals(r.variables.length, 4, 'variable count');
      const names = r.variables.map(v => v.name);
      assertArrayIncludes(names, 'MAX_RETRIES', 'variables');
      assertArrayIncludes(names, 'DEFAULT_TIMEOUT', 'variables');
      assertArrayIncludes(names, 'BASE_URL', 'variables');
      assertArrayIncludes(names, 'DEBUG_MODE', 'variables');
    },
  },
  {
    name: 'Python: extracts constant types correctly',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      const maxRetries = r.variables.find(v => v.name === 'MAX_RETRIES');
      assert(!!maxRetries, 'MAX_RETRIES should exist');
      assertEquals(maxRetries!.type, 'int', 'MAX_RETRIES type');
      assertEquals(maxRetries!.value, '3', 'MAX_RETRIES value');
    },
  },
  {
    name: 'Python: extracts 3 top-level functions',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      assertEquals(r.functions.length, 3, 'function count');
      const names = r.functions.map(f => f.name);
      assertArrayIncludes(names, 'load_data', 'functions');
      assertArrayIncludes(names, 'fetch_remote', 'functions');
      assertArrayIncludes(names, '_internal_helper', 'functions');
    },
  },
  {
    name: 'Python: detects async functions',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      const fetchRemote = r.functions.find(f => f.name === 'fetch_remote');
      assert(!!fetchRemote, 'fetch_remote should exist');
      assertEquals(fetchRemote!.isAsync, true, 'fetch_remote isAsync');

      const loadData = r.functions.find(f => f.name === 'load_data');
      assertEquals(loadData!.isAsync, false, 'load_data isAsync');
    },
  },
  {
    name: 'Python: parses multi-line function signatures',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      const loadData = r.functions.find(f => f.name === 'load_data');
      assert(!!loadData, 'load_data should exist');

      // Should have 4 parameters: source, format, limit, **kwargs
      assertEquals(loadData!.parameters.length, 4, 'load_data param count');

      const kwargs = loadData!.parameters.find(p => p.name === 'kwargs');
      assert(!!kwargs, 'kwargs param should exist');
      assertEquals(kwargs!.isKwargs, true, 'kwargs isKwargs');
    },
  },
  {
    name: 'Python: extracts function return types',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      const loadData = r.functions.find(f => f.name === 'load_data');
      assert(!!loadData, 'load_data should exist');
      assertIncludes(loadData!.returnType || '', 'List', 'load_data return type');
    },
  },
  {
    name: 'Python: extracts function docstrings',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      const loadData = r.functions.find(f => f.name === 'load_data');
      assert(!!loadData!.docstring, 'load_data docstring should exist');
      assertIncludes(loadData!.docstring!, 'Load data from the specified source', 'load_data docstring');
    },
  },
  {
    name: 'Python: extracts 2 classes',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      assertEquals(r.classes.length, 2, 'class count');
      const names = r.classes.map(c => c.name);
      assertArrayIncludes(names, 'Config', 'classes');
      assertArrayIncludes(names, 'DataProcessor', 'classes');
    },
  },
  {
    name: 'Python: extracts class decorators',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      const config = r.classes.find(c => c.name === 'Config');
      assert(!!config, 'Config class should exist');
      assertEquals(config!.decorators.length, 1, 'Config decorators count');
      assertEquals(config!.decorators[0], '@dataclass', 'Config decorator');
    },
  },
  {
    name: 'Python: extracts DataProcessor methods',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      const dp = r.classes.find(c => c.name === 'DataProcessor');
      assert(!!dp, 'DataProcessor class should exist');
      assertGreaterThan(dp!.methods.length, 4, 'DataProcessor method count');

      const methodNames = dp!.methods.map(m => m.name);
      assertArrayIncludes(methodNames, '__init__', 'methods');
      assertArrayIncludes(methodNames, 'add_transform', 'methods');
      assertArrayIncludes(methodNames, 'process', 'methods');
      assertArrayIncludes(methodNames, 'validate', 'methods');
      assertArrayIncludes(methodNames, 'from_file', 'methods');
      assertArrayIncludes(methodNames, 'create_default', 'methods');
    },
  },
  {
    name: 'Python: detects static and classmethod decorators',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      const dp = r.classes.find(c => c.name === 'DataProcessor');
      assert(!!dp, 'DataProcessor should exist');

      const fromFile = dp!.methods.find(m => m.name === 'from_file');
      assert(!!fromFile, 'from_file should exist');
      assertArrayIncludes(fromFile!.decorators, '@staticmethod', 'from_file decorators');

      const createDefault = dp!.methods.find(m => m.name === 'create_default');
      assert(!!createDefault, 'create_default should exist');
      assertArrayIncludes(createDefault!.decorators, '@classmethod', 'create_default decorators');
    },
  },
  {
    name: 'Python: line count statistics',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      assertEquals(r.totalLines, 143, 'totalLines');
      assertGreaterThan(r.linesOfCode, 90, 'linesOfCode > 90');
      assertGreaterThan(r.blankLines, 20, 'blankLines > 20');
      assertGreaterThan(r.commentLines, 2, 'commentLines > 2');
    },
  },
  {
    name: 'Python: markdown output includes all sections',
    run: async () => {
      const r = parsePythonFile(path.join(SAMPLES, 'sample.py'));
      assertIncludes(r.markdown, '## Imports', 'markdown has imports');
      assertIncludes(r.markdown, '## Constants', 'markdown has constants');
      assertIncludes(r.markdown, '## Functions', 'markdown has functions');
      assertIncludes(r.markdown, '## Classes', 'markdown has classes');
      assertIncludes(r.markdown, 'DataProcessor', 'markdown has DataProcessor');
    },
  },
];

// ============================================================================
// Python: if __name__ block test (A1 regression test)
// ============================================================================

const pythonMainBlockTest: TestCase = {
  name: 'Python: detects functions inside if __name__ blocks',
  run: async () => {
    const { parsePythonSource } = await import('../lib/parsers/python-parser');
    const source = `
"""Module with __main__ guard."""

import sys

def top_level_func():
    """A normal top-level function."""
    pass

if __name__ == "__main__":
    def main():
        """Main entry point."""
        top_level_func()

    def setup_logging():
        """Configure logging."""
        pass

    main()
`;

    const r = parsePythonSource(source, 'main_test.py');
    const names = r.functions.map(f => f.name);
    assertArrayIncludes(names, 'top_level_func', 'should find top-level func');
    assertArrayIncludes(names, 'main', 'should find main in __name__ block');
    assertArrayIncludes(names, 'setup_logging', 'should find setup_logging in __name__ block');
  },
};

// ============================================================================
// Python: expanded variable detection (A4 regression test)
// ============================================================================

const pythonVariableTest: TestCase = {
  name: 'Python: detects snake_case and PascalCase variables',
  run: async () => {
    const { parsePythonSource } = await import('../lib/parsers/python-parser');
    const source = `
MAX_RETRIES = 3
default_timeout = 30
AppConfig = {"debug": True}
base_url = "https://example.com"
`;
    const r = parsePythonSource(source, 'vars_test.py');
    const names = r.variables.map(v => v.name);
    assertArrayIncludes(names, 'MAX_RETRIES', 'SCREAMING_CASE');
    assertArrayIncludes(names, 'default_timeout', 'snake_case');
    assertArrayIncludes(names, 'AppConfig', 'PascalCase');
    assertArrayIncludes(names, 'base_url', 'snake_case 2');
  },
};

// ============================================================================
// Python: multi-line class method test (A3 regression test)
// ============================================================================

const pythonMultilineMethodTest: TestCase = {
  name: 'Python: parses multi-line class method signatures',
  run: async () => {
    const { parsePythonSource } = await import('../lib/parsers/python-parser');
    const source = `
class MyClass:
    """Test class."""

    def complex_method(
        self,
        name: str,
        value: int,
        options: dict = None
    ) -> bool:
        """A method with multi-line signature."""
        return True

    def simple_method(self) -> None:
        pass
`;
    const r = parsePythonSource(source, 'multiline_test.py');
    const cls = r.classes.find(c => c.name === 'MyClass');
    assert(!!cls, 'MyClass should exist');

    const complex = cls!.methods.find(m => m.name === 'complex_method');
    assert(!!complex, 'complex_method should exist');
    assertGreaterThan(complex!.parameters.length, 2, 'complex_method params');

    const simple = cls!.methods.find(m => m.name === 'simple_method');
    assert(!!simple, 'simple_method should exist');
  },
};

// ============================================================================
// Excel Parser Accuracy Tests
// ============================================================================

const excelTests: TestCase[] = [
  {
    name: 'Excel: parses sample.xlsx with 2 sheets',
    run: async () => {
      const r = parseExcelFile(path.join(SAMPLES, 'sample.xlsx'));
      assertEquals(r.sheetCount, 2, 'sheet count');
      assertEquals(r.format, 'xlsx', 'format');
    },
  },
  {
    name: 'Excel: Sales sheet has correct headers',
    run: async () => {
      const r = parseExcelFile(path.join(SAMPLES, 'sample.xlsx'));
      const sales = r.sheets.find(s => s.name === 'Sales');
      assert(!!sales, 'Sales sheet should exist');
      assertEquals(sales!.headers.length, 7, 'Sales header count');
      assertArrayIncludes(sales!.headers, 'Product', 'Sales headers');
      assertArrayIncludes(sales!.headers, 'Region', 'Sales headers');
      assertArrayIncludes(sales!.headers, 'Q1', 'Sales headers');
      assertArrayIncludes(sales!.headers, 'Total', 'Sales headers');
    },
  },
  {
    name: 'Excel: Sales sheet has 6 data rows',
    run: async () => {
      const r = parseExcelFile(path.join(SAMPLES, 'sample.xlsx'));
      const sales = r.sheets.find(s => s.name === 'Sales');
      assert(!!sales, 'Sales sheet should exist');
      // rawData includes header row, so 7 total
      assertEquals(sales!.rowCount, 7, 'Sales total rows including header');
      assertEquals(sales!.rows.length, 6, 'Sales data rows');
    },
  },
  {
    name: 'Excel: Employees sheet has correct structure',
    run: async () => {
      const r = parseExcelFile(path.join(SAMPLES, 'sample.xlsx'));
      const emp = r.sheets.find(s => s.name === 'Employees');
      assert(!!emp, 'Employees sheet should exist');
      assertArrayIncludes(emp!.headers, 'Name', 'Employees headers');
      assertArrayIncludes(emp!.headers, 'Department', 'Employees headers');
      assertArrayIncludes(emp!.headers, 'Salary', 'Employees headers');
    },
  },
  {
    name: 'Excel: markdown output contains table formatting',
    run: async () => {
      const r = parseExcelFile(path.join(SAMPLES, 'sample.xlsx'));
      assertIncludes(r.markdown, '| Product |', 'markdown table header');
      assertIncludes(r.markdown, '| --- |', 'markdown table separator');
      assertIncludes(r.markdown, 'Widget A', 'markdown contains data');
    },
  },
  {
    name: 'Excel: CSV parsing works correctly',
    run: async () => {
      const csv = 'Name,Age,City\nAlice,30,NYC\nBob,25,SF\n';
      const r = parseCSV(csv);
      assertEquals(r.sheets.length, 1, 'CSV sheet count');
      assertEquals(r.sheets[0].rows.length, 2, 'CSV data rows');

      const first = r.sheets[0].rows[0];
      assertEquals(first['Name'], 'Alice', 'first row Name');
      assertEquals(first['Age'], '30', 'first row Age');
    },
  },
  {
    name: 'Excel: sheet filtering works',
    run: async () => {
      const r = parseExcelFile(path.join(SAMPLES, 'sample.xlsx'), {
        sheets: ['Sales'],
      });
      assertEquals(r.sheetCount, 1, 'filtered sheet count');
      assertEquals(r.sheets[0].name, 'Sales', 'filtered sheet name');
    },
  },
  {
    name: 'Excel: row limiting works',
    run: async () => {
      const r = parseExcelFile(path.join(SAMPLES, 'sample.xlsx'), {
        maxRows: 3,
      });
      const sales = r.sheets.find(s => s.name === 'Sales');
      assert(!!sales, 'Sales sheet should exist');
      assert(sales!.rowCount <= 3, 'row count should be limited');
    },
  },
];

// ============================================================================
// PPTX Parser Accuracy Tests
// ============================================================================

const pptxTests: TestCase[] = [
  {
    name: 'PPTX: detects correct slide count',
    run: async () => {
      const r = await parsePptxFile(path.join(SAMPLES, 'sample.pptx'));
      assertEquals(r.slideCount, 10, 'slide count');
    },
  },
  {
    name: 'PPTX: extracts slide titles',
    run: async () => {
      const r = await parsePptxFile(path.join(SAMPLES, 'sample.pptx'));
      // First slide should have "Version Control Systems"
      assert(!!r.slides[0].title, 'slide 1 should have a title');
      assertIncludes(r.slides[0].title!, 'Version Control', 'slide 1 title');
    },
  },
  {
    name: 'PPTX: extracts speaker notes',
    run: async () => {
      const r = await parsePptxFile(path.join(SAMPLES, 'sample.pptx'));
      const slidesWithNotes = r.slides.filter(s => !!s.notes);
      assertGreaterThan(slidesWithNotes.length, 0, 'slides with notes');
    },
  },
  {
    name: 'PPTX: word count is reasonable',
    run: async () => {
      const r = await parsePptxFile(path.join(SAMPLES, 'sample.pptx'));
      assertGreaterThan(r.wordCount, 100, 'PPTX word count');
    },
  },
  {
    name: 'PPTX: markdown output is structured',
    run: async () => {
      const r = await parsePptxFile(path.join(SAMPLES, 'sample.pptx'));
      assertIncludes(r.markdown, '## Slide 1', 'markdown has slide headers');
      assertIncludes(r.markdown, '*10 slides*', 'markdown has slide count');
    },
  },
  {
    name: 'PPTX: can disable notes extraction',
    run: async () => {
      const r = await parsePptxFile(path.join(SAMPLES, 'sample.pptx'), { includeNotes: false });
      const slidesWithNotes = r.slides.filter(s => !!s.notes);
      assertEquals(slidesWithNotes.length, 0, 'no notes when disabled');
    },
  },
];

// ============================================================================
// Router Accuracy Tests
// ============================================================================

const routerTests: TestCase[] = [
  {
    name: 'Router: detects URL input type',
    run: async () => {
      assertEquals(detectInputType('https://example.com'), 'url', 'https URL');
      assertEquals(detectInputType('http://example.com/page'), 'url', 'http URL');
    },
  },
  {
    name: 'Router: detects HTML string input',
    run: async () => {
      assertEquals(detectInputType('<html><body>Hello</body></html>'), 'html-string', 'HTML string');
      assertEquals(detectInputType('<div>content</div>'), 'html-string', 'HTML fragment');
    },
  },
  {
    name: 'Router: detects Excel file types',
    run: async () => {
      assertEquals(detectInputType(path.join(SAMPLES, 'sample.xlsx')), 'excel', '.xlsx');
    },
  },
  {
    name: 'Router: detects Python file types',
    run: async () => {
      assertEquals(detectInputType(path.join(SAMPLES, 'sample.py')), 'python', '.py');
    },
  },
  {
    name: 'Router: detects PPTX file types',
    run: async () => {
      assertEquals(detectInputType(path.join(SAMPLES, 'sample.pptx')), 'pptx', '.pptx');
    },
  },
  {
    name: 'Router: detects directory input',
    run: async () => {
      assertEquals(detectInputType(path.join(SAMPLES, 'large')), 'directory', 'directory');
    },
  },
  {
    name: 'Router: unsupported files detected correctly',
    run: async () => {
      assertEquals(detectInputType('not-a-real-file.txt'), 'unsupported', 'unknown extension');
    },
  },
  {
    name: 'Router: parse() routes Excel correctly',
    run: async () => {
      const result = await parse(path.join(SAMPLES, 'sample.xlsx'), { quiet: true });
      assert(!Array.isArray(result), 'single file should return single result');
      assertEquals((result as any).inputType, 'excel', 'input type');
      assertGreaterThan((result as any).wordCount, 0, 'word count');
    },
  },
  {
    name: 'Router: parse() routes Python correctly',
    run: async () => {
      const result = await parse(path.join(SAMPLES, 'sample.py'), { quiet: true });
      assert(!Array.isArray(result), 'single file should return single result');
      assertEquals((result as any).inputType, 'python', 'input type');
      assertIncludes((result as any).markdown, 'sample.py', 'markdown has filename');
    },
  },
  {
    name: 'Router: parse() routes PPTX correctly',
    run: async () => {
      const result = await parse(path.join(SAMPLES, 'sample.pptx'), { quiet: true });
      assert(!Array.isArray(result), 'single file should return single result');
      assertEquals((result as any).inputType, 'pptx', 'input type');
    },
  },
  {
    name: 'Router: parse() routes directory correctly',
    run: async () => {
      const results = await parse(path.join(SAMPLES, 'large'), { quiet: true });
      assert(Array.isArray(results), 'directory should return array');
      assertGreaterThan((results as any[]).length, 10, 'directory results count');
    },
  },
];

// ============================================================================
// Fast Extract Accuracy Tests
// ============================================================================

const fastExtractTests: TestCase[] = [
  {
    name: 'FastExtract: extracts title from HTML',
    run: async () => {
      const html = `<html><head><title>Test Page</title></head><body>
        <article>
          <h1>Hello World</h1>
          <p>This is a sufficiently long paragraph of content that should meet the minimum content threshold for the fast extractor to successfully process the HTML page.</p>
          <p>Additional paragraph with more text to ensure we pass the word count minimum requirements for extraction.</p>
        </article>
      </body></html>`;
      const r = fastExtract(html);
      assert(r !== null, 'result should not be null');
      // fastExtract prefers h1 over <title> tag, which is correct behavior
      assertEquals(r!.title, 'Hello World', 'title from h1');
    },
  },
  {
    name: 'FastExtract: extracts article content',
    run: async () => {
      const html = `<html><body>
        <nav>Skip this nav</nav>
        <article>
          <h1>Article Title</h1>
          <p>This is the main content of the article with enough text to be meaningful for extraction purposes.</p>
          <p>Second paragraph with additional details about the topic being discussed.</p>
        </article>
        <footer>Skip this footer</footer>
      </body></html>`;
      const r = fastExtract(html);
      assert(r !== null, 'result should not be null');
      assertIncludes(r!.text, 'main content', 'text includes article content');
      assertGreaterThan(r!.wordCount, 10, 'word count');
    },
  },
  {
    name: 'FastExtract: strips scripts and styles',
    run: async () => {
      const html = `<html><body>
        <script>var x = "should not appear";</script>
        <style>.hidden { display: none; }</style>
        <p>Visible content only.</p>
      </body></html>`;
      const r = fastExtract(html);
      assert(r !== null, 'result should not be null');
      assert(!r!.text.includes('should not appear'), 'script content should be removed');
      assert(!r!.text.includes('display: none'), 'style content should be removed');
      assertIncludes(r!.text, 'Visible content', 'visible content preserved');
    },
  },
];

// ============================================================================
// SSRF Protection Tests
// ============================================================================

const ssrfTests: TestCase[] = [
  {
    name: 'SSRF: blocks localhost',
    run: async () => {
      const { extractPage } = await import('../lib/parsers/page-extractor');
      try {
        await extractPage('http://localhost/secret');
        throw new Error('Should have thrown');
      } catch (err: any) {
        assertIncludes(err.message, 'Private/local', 'localhost blocked');
      }
    },
  },
  {
    name: 'SSRF: blocks 127.0.0.1',
    run: async () => {
      const { extractPage } = await import('../lib/parsers/page-extractor');
      try {
        await extractPage('http://127.0.0.1/secret');
        throw new Error('Should have thrown');
      } catch (err: any) {
        assertIncludes(err.message, 'Private/local', '127.0.0.1 blocked');
      }
    },
  },
  {
    name: 'SSRF: blocks 0.0.0.0',
    run: async () => {
      const { extractPage } = await import('../lib/parsers/page-extractor');
      try {
        await extractPage('http://0.0.0.0/secret');
        throw new Error('Should have thrown');
      } catch (err: any) {
        assertIncludes(err.message, 'Private/local', '0.0.0.0 blocked');
      }
    },
  },
  {
    name: 'SSRF: blocks 10.x.x.x range',
    run: async () => {
      const { extractPage } = await import('../lib/parsers/page-extractor');
      try {
        await extractPage('http://10.0.0.1/admin');
        throw new Error('Should have thrown');
      } catch (err: any) {
        assertIncludes(err.message, 'Private/local', '10.x blocked');
      }
    },
  },
  {
    name: 'SSRF: blocks 192.168.x.x range',
    run: async () => {
      const { extractPage } = await import('../lib/parsers/page-extractor');
      try {
        await extractPage('http://192.168.1.1/admin');
        throw new Error('Should have thrown');
      } catch (err: any) {
        assertIncludes(err.message, 'Private/local', '192.168 blocked');
      }
    },
  },
  {
    name: 'SSRF: blocks IPv6 loopback',
    run: async () => {
      const { extractPage } = await import('../lib/parsers/page-extractor');
      try {
        await extractPage('http://[::1]/secret');
        throw new Error('Should have thrown');
      } catch (err: any) {
        assertIncludes(err.message, 'Private/local', '::1 blocked');
      }
    },
  },
];

// ============================================================================
// Main runner
// ============================================================================

async function main() {
  console.log('=== OMNIPARSE ACCURACY TEST SUITE ===\n');

  console.log('--- Python Parser ---');
  for (const t of pythonTests) await runTest(t);
  await runTest(pythonMainBlockTest);
  await runTest(pythonVariableTest);
  await runTest(pythonMultilineMethodTest);

  console.log('\n--- Excel Parser ---');
  for (const t of excelTests) await runTest(t);

  console.log('\n--- PPTX Parser ---');
  for (const t of pptxTests) await runTest(t);

  console.log('\n--- Router ---');
  for (const t of routerTests) await runTest(t);

  console.log('\n--- Fast Extract ---');
  for (const t of fastExtractTests) await runTest(t);

  console.log('\n--- SSRF Protection ---');
  for (const t of ssrfTests) await runTest(t);

  console.log('\n=== RESULTS ===');
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
    process.exit(1);
  }
}

main().catch(console.error);
