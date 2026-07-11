import assert from 'node:assert/strict';
import test from 'node:test';
import {
  preferExtractedTitle,
  summarizeContentExtraction,
  toArticleQualityInput,
} from '../lib/article-processing';
import { calculateArticleQualityScore } from '../lib/quality-scorer';
import type { CandidateArticle } from '../lib/source-orchestrator';

function article(overrides: Partial<CandidateArticle> = {}): CandidateArticle {
  return {
    url: 'https://www.anthropic.com/news/ust-claude',
    title: 'Ust Claude',
    publishedAt: new Date('2026-07-01T00:00:00.000Z'),
    content: '<article><p>' + 'Useful article content. '.repeat(30) + '</p></article>',
    excerpt: 'Useful article content.',
    guid: 'test-guid',
    confidence: 0.7,
    source: 'sitemap',
    extractionMethod: 'sitemap',
    metadata: {},
    ...overrides,
  };
}

test('prefers the page title over a title synthesized from the URL', () => {
  assert.equal(
    preferExtractedTitle(
      'Ust Claude',
      'UST is bringing Claude to physical AI',
      'https://www.anthropic.com/news/ust-claude'
    ),
    'UST is bringing Claude to physical AI'
  );
});

test('preserves a substantive discovery title', () => {
  assert.equal(
    preferExtractedTitle(
      'A carefully curated RSS headline',
      'Page title with site suffix',
      'https://example.com/news/a-different-slug'
    ),
    'A carefully curated RSS headline'
  );
});

test('builds quality input from extracted text and metadata', () => {
  const source = article({
    metadata: {
      textContent: 'Clean body text '.repeat(50),
      byline: 'Tyrone Ross',
      readingTime: 4,
      structured: { jsonLd: { '@type': 'NewsArticle' } },
    },
  });

  const input = toArticleQualityInput(source);
  assert.equal(input.byline, 'Tyrone Ross');
  assert.equal(input.readingTime, 4);
  assert.equal(input.structured?.jsonLd?.['@type'], 'NewsArticle');
  assert.ok(input.textContent?.startsWith('Clean body text'));
  assert.ok(calculateArticleQualityScore(input) > 0.99);
});

test('reports only actual full-content extraction attempts', () => {
  const stats = summarizeContentExtraction([
    article({ metadata: { fullContentExtractionAttempted: true, fullContentExtracted: true } }),
    article({ url: 'https://example.com/failed', metadata: { fullContentExtractionAttempted: true, fullContentExtractionFailed: true } }),
    article({ url: 'https://example.com/already-complete', metadata: {} }),
  ]);

  assert.deepEqual(stats, { attempted: 2, successful: 1, failed: 1 });
});

test('does not count a stale success flag when the latest extraction failed', () => {
  const stats = summarizeContentExtraction([
    article({
      metadata: {
        fullContentExtractionAttempted: true,
        fullContentExtracted: false,
        fullContentExtractionFailed: true,
      },
    }),
  ]);

  assert.deepEqual(stats, { attempted: 1, successful: 0, failed: 1 });
});

test('does not award publication-date credit for a discovery fallback timestamp', () => {
  const source = article({
    metadata: {
      publishedAtIsFallback: true,
      textContent: 'Useful body text. '.repeat(50),
    },
  });

  const input = toArticleQualityInput(source);
  assert.equal(input.publishedTime, undefined);
  assert.ok(calculateArticleQualityScore(input) < 0.72);
});
