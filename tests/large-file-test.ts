/**
 * Large File Test Suite
 *
 * Tests all parsers against larger, more complex files from GitHub repos.
 * Run: npx tsx tests/large-file-test.ts
 */

import { parse, detectInputType } from '../lib/router';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  file: string;
  type: string;
  words: number;
  tokens: number;
  time: number;
  ok: boolean;
  error?: string;
  markdownLength?: number;
}

async function main() {
  const dir = path.join(__dirname, 'sample-files', 'large');

  if (!fs.existsSync(dir)) {
    console.log('No large sample files directory found. Skipping.');
    return;
  }

  const files = fs.readdirSync(dir).sort();

  console.log('=== LARGE FILE TEST SUITE ===');
  console.log(`Files found: ${files.length}`);
  console.log('');

  const results: TestResult[] = [];

  for (const f of files) {
    const filePath = path.join(dir, f);
    const inputType = detectInputType(filePath);

    if (inputType === 'unsupported') {
      console.log(`SKIP: ${f} (unsupported format)`);
      continue;
    }

    try {
      const start = Date.now();
      const result = await parse(filePath, { quiet: true });
      const r = Array.isArray(result) ? result[0] : result;
      const elapsed = Date.now() - start;

      const hasContent = r.wordCount > 0 || r.markdown.length > 50;

      console.log(`${hasContent ? 'OK' : 'WARN'}: ${f}`);
      console.log(`   Type: ${r.inputType} | Words: ${r.wordCount} | Tokens: ${r.estimatedTokens} | MD: ${r.markdown.length} chars | Time: ${elapsed}ms`);
      if (r.errors && r.errors.length > 0) {
        console.log(`   Warnings: ${r.errors.join('; ')}`);
      }

      results.push({
        file: f,
        type: r.inputType,
        words: r.wordCount,
        tokens: r.estimatedTokens,
        time: elapsed,
        ok: hasContent,
        markdownLength: r.markdown.length,
      });
    } catch (err: any) {
      console.log(`FAIL: ${f} - ${(err.message || String(err)).substring(0, 100)}`);
      results.push({
        file: f,
        type: inputType,
        words: 0,
        tokens: 0,
        time: 0,
        ok: false,
        error: (err.message || String(err)).substring(0, 100),
      });
    }
  }

  console.log('');
  console.log('=== SUMMARY ===');
  const passed = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);

  console.log(`Passed: ${passed.length}/${results.length}`);
  console.log(`Total words: ${passed.reduce((s, r) => s + r.words, 0).toLocaleString()}`);
  console.log(`Total tokens: ${passed.reduce((s, r) => s + r.tokens, 0).toLocaleString()}`);

  if (passed.length > 0) {
    console.log(`Avg parse time: ${Math.round(passed.reduce((s, r) => s + r.time, 0) / passed.length)}ms`);
    console.log(`Total markdown output: ${passed.reduce((s, r) => s + (r.markdownLength || 0), 0).toLocaleString()} chars`);
  }

  if (failed.length > 0) {
    console.log('');
    console.log('Failed files:');
    for (const r of failed) {
      console.log(`  - ${r.file}: ${r.error || 'No content extracted'}`);
    }
  }

  // Per-type breakdown
  console.log('');
  console.log('=== BY TYPE ===');
  const byType = new Map<string, TestResult[]>();
  for (const r of results) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type)!.push(r);
  }

  for (const [type, typeResults] of byType) {
    const okCount = typeResults.filter(r => r.ok).length;
    const avgTime = Math.round(typeResults.reduce((s, r) => s + r.time, 0) / typeResults.length);
    const totalWords = typeResults.reduce((s, r) => s + r.words, 0);
    console.log(`  ${type}: ${okCount}/${typeResults.length} passed, ${totalWords} words, avg ${avgTime}ms`);
  }
}

main().catch(console.error);
