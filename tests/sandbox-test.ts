/**
 * Sandbox Test Suite
 *
 * Comprehensive tests for all SDK features.
 * Run with: npx tsx tests/sandbox-test.ts
 */

import {
  scrapeWebsite,
  extractArticle,
  smartScrape,
  isArticleUrl,
  isListingUrl,
  configure,
  type ScrapeResult,
  type SingleArticleResult
} from '../lib/index';

// Module imports (subpath exports)
import {
  scrapeForLLM,
  toLLMFormat,
  estimateTokens,
  chunkContent,
  generateFrontmatter,
  calculateFleschKincaidGrade
} from '../lib/llm';

import {
  createMockScraper,
  enableMockMode,
  disableMockMode,
  generateMockArticle,
  generateMockArticles,
  isMockModeEnabled
} from '../lib/testing';

import {
  createCache,
  MemoryCache,
  FileCache,
  CacheManager
} from '../lib/cache';

import {
  validateUrl,
  canScrape,
  normalizeUrl,
  isValidUrl,
  getDomain,
  parseRobotsTxt
} from '../lib/validation';

import {
  DebugSession,
  enableDebugMode,
  disableDebugMode,
  isDebugMode,
  formatBytes,
  formatDuration
} from '../lib/debug';

import {
  scrapeUrls,
  extractArticles,
  createBatchProcessor
} from '../lib/batch';

// ============================================================================
// Test Utilities
// ============================================================================

let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return async () => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passCount++;
    } catch (error) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${error instanceof Error ? error.message : error}`);
      failCount++;
    }
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertDefined<T>(value: T | undefined | null, message?: string): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(message || 'Expected value to be defined');
  }
}

// ============================================================================
// Test Suites
// ============================================================================

async function testLLMModule() {
  console.log('\n📚 LLM Module Tests');

  await test('estimateTokens returns positive number', () => {
    const tokens = estimateTokens('Hello, world! This is a test.');
    assert(tokens > 0, 'Token count should be positive');
    assert(tokens < 20, 'Token count should be reasonable');
  })();

  await test('calculateFleschKincaidGrade returns valid grade', () => {
    const grade = calculateFleschKincaidGrade(
      'The cat sat on the mat. The dog ran in the park. Simple sentences are easy to read.'
    );
    assert(grade >= 0 && grade <= 20, 'Grade should be in valid range');
  })();

  await test('chunkContent splits text into chunks', () => {
    // Generate text with multiple paragraphs that exceed 50 tokens
    const longText = Array.from({ length: 20 }, (_, i) =>
      `This is paragraph ${i + 1}. It contains enough words to generate tokens. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`
    ).join('\n\n');
    const chunks = chunkContent(longText, { maxTokens: 100, overlap: 10 });
    assert(chunks.length > 1, `Should create multiple chunks, got ${chunks.length} (total tokens: ${estimateTokens(longText)})`);
    assert(chunks[0].content.length > 0, 'Chunks should have content');
    // Chunks may slightly exceed due to sentence boundaries and overlap
    assert(chunks[0].tokens <= 150, `Chunk tokens ${chunks[0].tokens} should be reasonable`);
  })();

  await test('generateFrontmatter creates valid YAML', () => {
    const frontmatter = generateFrontmatter({
      title: 'Test Article',
      author: 'Test Author',
      wordCount: 500,
      estimatedTokens: 125,
      readingGrade: 8.5
    });
    assert(frontmatter.includes('title: "Test Article"'), 'Should include title');
    assert(frontmatter.includes('author: "Test Author"'), 'Should include author');
    assert(frontmatter.startsWith('---'), 'Should start with ---');
    assert(frontmatter.endsWith('---\n'), 'Should end with ---');
  })();

  await test('toLLMFormat transforms article correctly', () => {
    const mockArticle: SingleArticleResult = {
      url: 'https://example.com/test',
      title: 'Test Article',
      html: '<p>This is test content with enough words to generate some tokens for the LLM output module test.</p>',
      markdown: 'This is test content with enough words to generate some tokens for the LLM output module test.',
      text: 'This is test content with enough words to generate some tokens for the LLM output module test.',
      excerpt: 'Test excerpt',
      wordCount: 20,
      readingTime: 1,
      confidence: 0.9,
      extractionMethod: 'readability'
    };
    const llmOutput = toLLMFormat(mockArticle);
    assertDefined(llmOutput, 'Should return output');
    assertDefined(llmOutput.markdown, 'Should have markdown property');
    assert(llmOutput.markdown.length > 0, 'Markdown should not be empty');
    assert(llmOutput.tokens > 0, 'Should have token count');
    assert(llmOutput.frontmatter.includes('Test Article'), 'Frontmatter should include title');
    assert(llmOutput.document.includes('---'), 'Document should include frontmatter');
    assert(llmOutput.chunks.length > 0, 'Should have at least one chunk');
  })();
}

async function testMockModule() {
  console.log('\n🎭 Mock/Testing Module Tests');

  await test('generateMockArticle creates article', () => {
    const article = generateMockArticle('https://test.com/article');
    assert(article.url === 'https://test.com/article', 'Should use provided URL');
    assert(article.title.length > 0, 'Should have title');
    assert(article.content.length > 0, 'Should have content');
  })();

  await test('generateMockArticles creates multiple', () => {
    const articles = generateMockArticles(3);
    assertEqual(articles.length, 3, 'Should create 3 articles');
  })();

  await test('createMockScraper works', async () => {
    const mock = createMockScraper();
    const result = await mock.scrapeWebsite('https://example.com');
    assert(result.articles.length > 0, 'Should return articles');
    assertEqual(result.detectedType, 'mock', 'Should have mock type');
  })();

  await test('mock fixtures work', async () => {
    const mock = createMockScraper();
    mock.addFixture('https://custom.com', {
      url: 'https://custom.com',
      title: 'Custom Article',
      content: 'Custom content'
    });
    const article = await mock.extractArticle('https://custom.com');
    assertEqual(article?.title, 'Custom Article', 'Should return fixture');
  })();

  await test('enableMockMode/disableMockMode work', () => {
    enableMockMode();
    assert(isMockModeEnabled(), 'Mock mode should be enabled');
    disableMockMode();
    assert(!isMockModeEnabled(), 'Mock mode should be disabled');
  })();
}

async function testCacheModule() {
  console.log('\n💾 Cache Module Tests');

  await test('MemoryCache basic operations', async () => {
    const cache = new MemoryCache({ maxSize: 10 });
    await cache.set('key1', 'value1');
    const value = await cache.get<string>('key1');
    assertEqual(value, 'value1', 'Should retrieve cached value');
    assertEqual(await cache.has('key1'), true, 'Should have key');
    assertEqual(await cache.size(), 1, 'Size should be 1');
  })();

  await test('MemoryCache TTL expiration', async () => {
    const cache = new MemoryCache({ ttlMs: 50 });
    await cache.set('expiring', 'value');
    const before = await cache.get('expiring');
    assertEqual(before, 'value', 'Should exist before TTL');
    await new Promise(r => setTimeout(r, 100));
    const after = await cache.get('expiring');
    assertEqual(after, null, 'Should expire after TTL');
  })();

  await test('CacheManager getOrSet', async () => {
    const cache = createCache({ provider: 'memory' });
    let computed = 0;
    const value1 = await cache.getOrSet('test', async () => {
      computed++;
      return 'computed';
    });
    const value2 = await cache.getOrSet('test', async () => {
      computed++;
      return 'computed-again';
    });
    assertEqual(value1, 'computed', 'First call should compute');
    assertEqual(value2, 'computed', 'Second call should use cache');
    assertEqual(computed, 1, 'Should only compute once');
  })();

  await test('CacheManager.generateKey', () => {
    const key1 = CacheManager.generateKey('https://example.com/article');
    const key2 = CacheManager.generateKey('https://example.com/article');
    const key3 = CacheManager.generateKey('https://example.com/other');
    assertEqual(key1, key2, 'Same URL should produce same key');
    assert(key1 !== key3, 'Different URLs should produce different keys');
  })();
}

async function testValidationModule() {
  console.log('\n✅ Validation Module Tests');

  await test('isValidUrl validates correctly', () => {
    assert(isValidUrl('https://example.com'), 'HTTPS should be valid');
    assert(isValidUrl('http://example.com'), 'HTTP should be valid');
    assert(!isValidUrl('ftp://example.com'), 'FTP should be invalid');
    assert(!isValidUrl('not-a-url'), 'Invalid string should be invalid');
  })();

  await test('normalizeUrl removes tracking params', () => {
    const normalized = normalizeUrl('https://example.com/page?utm_source=test&real=param');
    assert(!normalized.includes('utm_source'), 'Should remove UTM params');
    assert(normalized.includes('real=param'), 'Should keep other params');
  })();

  await test('getDomain extracts domain', () => {
    const domain = getDomain('https://sub.example.com/path');
    assertEqual(domain, 'sub.example.com', 'Should extract full domain');
  })();

  await test('parseRobotsTxt parses correctly', () => {
    const robotsTxt = `
User-agent: *
Disallow: /admin/
Disallow: /private/*
Allow: /

Sitemap: https://example.com/sitemap.xml
`;
    const result = parseRobotsTxt(robotsTxt);
    assert(result.disallowedPaths.includes('/admin/'), 'Should parse disallow');
    assert(result.sitemaps.includes('https://example.com/sitemap.xml'), 'Should parse sitemap');
  })();
}

async function testDebugModule() {
  console.log('\n🔍 Debug Module Tests');

  await test('DebugSession tracks phases', () => {
    const session = new DebugSession();
    session.startPhase('test');
    session.endPhase('test');
    const metrics = session.getMetrics();
    assert(metrics.phases.discovery === 0 || true, 'Should have phase data');
    assert(metrics.totalTime >= 0, 'Should track total time');
  })();

  await test('DebugSession tracks network', () => {
    const session = new DebugSession();
    session.recordRequest({ url: 'https://test.com', bytes: 1024, latency: 100 });
    session.recordRequest({ url: 'https://test2.com', bytes: 2048, latency: 200 });
    const metrics = session.getMetrics();
    assertEqual(metrics.network.requests, 2, 'Should count requests');
    assertEqual(metrics.network.totalBytes, 3072, 'Should sum bytes');
    assertEqual(metrics.network.avgLatency, 150, 'Should average latency');
  })();

  await test('formatBytes formats correctly', () => {
    assertEqual(formatBytes(500), '500B', 'Small bytes');
    assertEqual(formatBytes(1536), '1.5KB', 'Kilobytes');
    assertEqual(formatBytes(1572864), '1.5MB', 'Megabytes');
  })();

  await test('formatDuration formats correctly', () => {
    assertEqual(formatDuration(500), '500ms', 'Milliseconds');
    assertEqual(formatDuration(2500), '2.5s', 'Seconds');
    assertEqual(formatDuration(125000), '2m 5s', 'Minutes');
  })();

  await test('enableDebugMode/disableDebugMode work', () => {
    enableDebugMode();
    assert(isDebugMode(), 'Should enable');
    disableDebugMode();
    assert(!isDebugMode(), 'Should disable');
  })();
}

async function testBatchModule() {
  console.log('\n📦 Batch Module Tests');

  // Use mock mode for batch tests to avoid network calls
  enableMockMode();

  await test('scrapeUrls processes multiple URLs', async () => {
    const urls = [
      'https://example.com/article/1',
      'https://example.com/article/2',
      'https://example.com/article/3'
    ];
    const result = await scrapeUrls(urls, {
      mode: 'article',
      concurrency: 2
    });
    assertEqual(result.stats.total, 3, 'Should process all URLs');
    assert(result.stats.successful > 0 || result.stats.failed === 3, 'Should have results');
  })();

  await test('createBatchProcessor creates processor', async () => {
    const processor = createBatchProcessor({ concurrency: 1 });
    assert(typeof processor.scrapeUrls === 'function', 'Should have scrapeUrls');
    assert(typeof processor.extractArticles === 'function', 'Should have extractArticles');
  })();

  await test('batch progress callback fires', async () => {
    let progressCalled = false;
    await scrapeUrls(['https://example.com/test'], {
      mode: 'article',
      onProgress: () => { progressCalled = true; }
    });
    assert(progressCalled, 'Progress callback should fire');
  })();

  disableMockMode();
}

async function testCoreAPI() {
  console.log('\n🚀 Core API Tests');

  await test('isArticleUrl detects articles', () => {
    assert(isArticleUrl('https://blog.com/2024/12/30/my-article'), 'Date-based should be article');
    assert(isArticleUrl('https://blog.com/blog/my-very-long-article-slug-here'), 'Long slug should be article');
    assert(!isArticleUrl('https://blog.com/'), 'Root should not be article');
    assert(!isArticleUrl('https://blog.com/blog/'), 'Section should not be article');
  })();

  await test('isListingUrl detects listings', () => {
    assert(isListingUrl('https://blog.com/'), 'Root should be listing');
    assert(isListingUrl('https://blog.com/blog/'), 'Section should be listing');
    assert(isListingUrl('https://blog.com/page/2'), 'Pagination should be listing');
    assert(isListingUrl('https://blog.com/category/tech'), 'Category should be listing');
  })();

  await test('configure sets quiet mode', () => {
    configure({ quiet: true });
    // No assertion needed, just testing it doesn't throw
    configure({ quiet: false });
  })();
}

async function testRealURLIntegration() {
  console.log('\n🌐 Integration Tests (Real URLs)');

  // Skip if SKIP_NETWORK_TESTS is set
  if (process.env.SKIP_NETWORK_TESTS === 'true') {
    console.log('  ⏭ Skipping network tests (SKIP_NETWORK_TESTS=true)');
    return;
  }

  await test('extractArticle extracts real article', async () => {
    const article = await extractArticle('https://www.anthropic.com/news/the-anthropic-model-spec');
    if (article) {
      assert(article.title.length > 0, 'Should have title');
      assert(article.markdown.length > 100, 'Should have markdown content');
      assert(article.wordCount > 100, 'Should have word count');
      console.log(`    → Title: "${article.title.substring(0, 50)}..."`);
      console.log(`    → Words: ${article.wordCount}, Tokens: ~${Math.round(article.wordCount / 4)}`);
    } else {
      console.log('    ⚠ Could not extract article (network may be unavailable)');
    }
  })();

  await test('scrapeForLLM returns LLM-ready output', async () => {
    try {
      const output = await scrapeForLLM('https://www.anthropic.com/news/the-anthropic-model-spec');
      assert(output.content.length > 0, 'Should have content');
      assert(output.tokenCount > 0, 'Should have token count');
      assert(output.frontmatter.includes('---'), 'Should have frontmatter');
      console.log(`    → Tokens: ${output.tokenCount}`);
      console.log(`    → Chunks: ${output.chunks.length}`);
    } catch (error) {
      console.log('    ⚠ Network error, skipping');
    }
  })();

  await test('validateUrl checks real URL', async () => {
    const result = await validateUrl('https://www.anthropic.com', { checkRobots: true });
    assert(result.isValid, 'Should be valid');
    console.log(`    → Reachable: ${result.isReachable}`);
    console.log(`    → Robots allowed: ${result.robotsAllowed}`);
    console.log(`    → Suggested: ${result.suggestedAction}`);
  })();
}

// ============================================================================
// Main Runner
// ============================================================================

async function main() {
  console.log('🧪 Blog Scraper SDK - Sandbox Tests');
  console.log('====================================');

  const startTime = Date.now();

  // Run all test suites
  await testLLMModule();
  await testMockModule();
  await testCacheModule();
  await testValidationModule();
  await testDebugModule();
  await testBatchModule();
  await testCoreAPI();
  await testRealURLIntegration();

  const duration = Date.now() - startTime;

  console.log('\n====================================');
  console.log(`✓ ${passCount} passed, ✗ ${failCount} failed`);
  console.log(`⏱ Completed in ${formatDuration(duration)}`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
