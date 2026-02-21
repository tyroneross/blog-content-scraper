/**
 * Mock/Test Mode Module
 *
 * Provides mock implementations for testing without hitting real URLs.
 * Useful for:
 * - Unit tests with deterministic data
 * - Development without network access
 * - CI/CD pipelines
 * - Demo/sandbox environments
 */

import type { ScrapeResult, SingleArticleResult } from '../index';

// ============================================================================
// Types
// ============================================================================

export interface MockArticle {
  url: string;
  title: string;
  content: string;
  markdown?: string;
  text?: string;
  excerpt?: string;
  author?: string;
  publishedDate?: string;
  wordCount?: number;
  readingTime?: number;
}

export interface MockScraperOptions {
  /** Simulated delay in ms (default: 0) */
  delay?: number;
  /** Error rate 0-1 for testing error handling (default: 0) */
  errorRate?: number;
  /** Custom error to throw */
  errorMessage?: string;
  /** Whether to log mock operations */
  verbose?: boolean;
}

export interface MockScraper {
  scrapeWebsite: (url: string, options?: any) => Promise<ScrapeResult>;
  extractArticle: (url: string) => Promise<SingleArticleResult | null>;
  smartScrape: (url: string, options?: any) => Promise<any>;
  addFixture: (url: string, article: MockArticle) => void;
  clearFixtures: () => void;
  getCallHistory: () => Array<{ method: string; url: string; timestamp: Date }>;
  resetCallHistory: () => void;
}

// ============================================================================
// Sample Data Generators
// ============================================================================

const SAMPLE_TITLES = [
  'How to Build Scalable Web Applications in 2024',
  'The Future of Artificial Intelligence: Trends and Predictions',
  'Understanding Modern JavaScript: A Complete Guide',
  'Best Practices for API Design and Development',
  'Machine Learning for Beginners: Getting Started',
  'Cloud Architecture Patterns You Should Know',
  'The Ultimate Guide to TypeScript',
  'Building Real-Time Applications with WebSockets',
  'Security Best Practices for Web Developers',
  'Performance Optimization Techniques for Node.js'
];

const SAMPLE_EXCERPTS = [
  'Discover the latest techniques and best practices for building robust applications.',
  'An in-depth look at emerging technologies and their impact on the industry.',
  'Learn the fundamentals and advanced concepts with practical examples.',
  'Expert insights and recommendations for modern development workflows.',
  'A comprehensive overview of tools, techniques, and methodologies.'
];

const SAMPLE_AUTHORS = [
  'Jane Smith',
  'John Doe',
  'Alex Johnson',
  'Sarah Williams',
  'Michael Brown'
];

const SAMPLE_CONTENT = `
<article>
  <h1>Sample Article Title</h1>
  <p>This is a sample article for testing purposes. It contains multiple paragraphs
  to simulate real content structure.</p>

  <h2>Introduction</h2>
  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
  incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
  exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>

  <h2>Main Content</h2>
  <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore
  eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt
  in culpa qui officia deserunt mollit anim id est laborum.</p>

  <ul>
    <li>First important point</li>
    <li>Second important point</li>
    <li>Third important point</li>
  </ul>

  <h2>Conclusion</h2>
  <p>In conclusion, this sample article demonstrates the structure and formatting
  that you might expect from a real article. The mock system can be customized
  with your own fixtures for more realistic testing scenarios.</p>
</article>
`;

const SAMPLE_MARKDOWN = `
# Sample Article Title

This is a sample article for testing purposes. It contains multiple paragraphs
to simulate real content structure.

## Introduction

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

## Main Content

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore
eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt
in culpa qui officia deserunt mollit anim id est laborum.

- First important point
- Second important point
- Third important point

## Conclusion

In conclusion, this sample article demonstrates the structure and formatting
that you might expect from a real article. The mock system can be customized
with your own fixtures for more realistic testing scenarios.
`;

/**
 * Generate a random mock article
 */
export function generateMockArticle(url?: string): MockArticle {
  const title = SAMPLE_TITLES[Math.floor(Math.random() * SAMPLE_TITLES.length)];
  const excerpt = SAMPLE_EXCERPTS[Math.floor(Math.random() * SAMPLE_EXCERPTS.length)];
  const author = SAMPLE_AUTHORS[Math.floor(Math.random() * SAMPLE_AUTHORS.length)];

  // Generate a date within the last 30 days
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * 30));

  const wordCount = 500 + Math.floor(Math.random() * 1500);
  const readingTime = Math.ceil(wordCount / 200);

  return {
    url: url || `https://example.com/article/${Date.now()}`,
    title,
    content: SAMPLE_CONTENT.replace('Sample Article Title', title),
    markdown: SAMPLE_MARKDOWN.replace('Sample Article Title', title),
    text: SAMPLE_MARKDOWN.replace(/[#*\-\[\]]/g, '').replace('Sample Article Title', title),
    excerpt,
    author,
    publishedDate: date.toISOString(),
    wordCount,
    readingTime
  };
}

/**
 * Generate multiple mock articles
 */
export function generateMockArticles(count: number = 5): MockArticle[] {
  return Array.from({ length: count }, (_, i) =>
    generateMockArticle(`https://example.com/article/${i + 1}`)
  );
}

// ============================================================================
// Mock Scraper Implementation
// ============================================================================

/**
 * Create a mock scraper instance
 *
 * @example
 * ```typescript
 * const mock = createMockScraper();
 *
 * // Use like the real scraper
 * const result = await mock.scrapeWebsite('https://example.com');
 *
 * // Add custom fixtures
 * mock.addFixture('https://myblog.com/post', {
 *   title: 'My Custom Article',
 *   content: '<p>Custom content</p>'
 * });
 *
 * // Check what was called
 * console.log(mock.getCallHistory());
 * ```
 */
export function createMockScraper(
  fixtures?: MockArticle[],
  options: MockScraperOptions = {}
): MockScraper {
  const {
    delay = 0,
    errorRate = 0,
    errorMessage = 'Mock error for testing',
    verbose = false
  } = options;

  // Fixture storage
  const fixtureMap = new Map<string, MockArticle>();
  if (fixtures) {
    fixtures.forEach(f => fixtureMap.set(f.url, f));
  }

  // Call history for assertions
  const callHistory: Array<{ method: string; url: string; timestamp: Date }> = [];

  const log = (msg: string) => {
    if (verbose) console.log(`[MockScraper] ${msg}`);
  };

  const maybeDelay = async () => {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  };

  const maybeError = () => {
    if (errorRate > 0 && Math.random() < errorRate) {
      throw new Error(errorMessage);
    }
  };

  const recordCall = (method: string, url: string) => {
    callHistory.push({ method, url, timestamp: new Date() });
    log(`${method}(${url})`);
  };

  const getArticleForUrl = (url: string): MockArticle => {
    return fixtureMap.get(url) || generateMockArticle(url);
  };

  const toSingleArticleResult = (article: MockArticle): SingleArticleResult => ({
    url: article.url,
    title: article.title,
    html: article.content,
    markdown: article.markdown || '',
    text: article.text || '',
    excerpt: article.excerpt || '',
    author: article.author,
    publishedDate: article.publishedDate,
    wordCount: article.wordCount || 500,
    readingTime: article.readingTime || 3,
    confidence: 0.9,
    extractionMethod: 'readability'
  });

  return {
    async scrapeWebsite(url: string, _options?: any): Promise<ScrapeResult> {
      recordCall('scrapeWebsite', url);
      await maybeDelay();
      maybeError();

      const articles = fixtureMap.size > 0
        ? Array.from(fixtureMap.values())
        : generateMockArticles(5);

      return {
        url,
        detectedType: 'mock',
        articles: articles.map(a => ({
          url: a.url,
          title: a.title,
          publishedDate: a.publishedDate,
          description: a.excerpt,
          fullContent: a.content,
          fullContentMarkdown: a.markdown,
          fullContentText: a.text,
          confidence: 0.9,
          source: 'mock',
          qualityScore: 0.8,
          metadata: {
            wordCount: a.wordCount,
            readingTime: a.readingTime,
            byline: a.author
          }
        })),
        stats: {
          totalDiscovered: articles.length,
          afterQualityFilter: articles.length,
          processingTime: delay
        },
        errors: []
      };
    },

    async extractArticle(url: string): Promise<SingleArticleResult | null> {
      recordCall('extractArticle', url);
      await maybeDelay();
      maybeError();

      const article = getArticleForUrl(url);
      return toSingleArticleResult(article);
    },

    async smartScrape(url: string, options?: any) {
      recordCall('smartScrape', url);
      await maybeDelay();
      maybeError();

      const forceMode = options?.forceMode;

      if (forceMode === 'article' || url.includes('/article/') || url.includes('/post/')) {
        const article = getArticleForUrl(url);
        return {
          mode: 'article' as const,
          article: toSingleArticleResult(article),
          detectedAs: 'article' as const
        };
      }

      const articles = fixtureMap.size > 0
        ? Array.from(fixtureMap.values())
        : generateMockArticles(5);

      return {
        mode: 'listing' as const,
        articles: articles.map(a => ({
          url: a.url,
          title: a.title,
          publishedDate: a.publishedDate,
          description: a.excerpt,
          fullContent: a.content,
          fullContentMarkdown: a.markdown,
          qualityScore: 0.8
        })),
        stats: { totalDiscovered: articles.length, processingTime: delay },
        detectedAs: 'listing' as const
      };
    },

    addFixture(url: string, article: MockArticle) {
      fixtureMap.set(url, { ...article, url });
      log(`Added fixture for ${url}`);
    },

    clearFixtures() {
      fixtureMap.clear();
      log('Cleared all fixtures');
    },

    getCallHistory() {
      return [...callHistory];
    },

    resetCallHistory() {
      callHistory.length = 0;
      log('Reset call history');
    }
  };
}

// ============================================================================
// Global Mock Mode
// ============================================================================

let globalMockScraper: MockScraper | null = null;

/**
 * Enable mock mode globally
 *
 * When enabled, all scraper functions will use mock data instead of
 * making real network requests.
 *
 * @example
 * ```typescript
 * // In test setup
 * import { enableMockMode } from '@tyroneross/omniparse/testing';
 *
 * beforeAll(() => {
 *   enableMockMode();
 * });
 *
 * afterAll(() => {
 *   disableMockMode();
 * });
 * ```
 */
export function enableMockMode(
  fixtures?: MockArticle[],
  options?: MockScraperOptions
): MockScraper {
  globalMockScraper = createMockScraper(fixtures, options);
  (global as any).__SCRAPER_MOCK__ = globalMockScraper;
  return globalMockScraper;
}

/**
 * Disable mock mode and restore real network requests
 */
export function disableMockMode(): void {
  globalMockScraper = null;
  delete (global as any).__SCRAPER_MOCK__;
}

/**
 * Check if mock mode is currently enabled
 */
export function isMockModeEnabled(): boolean {
  return globalMockScraper !== null || (global as any).__SCRAPER_MOCK__ !== undefined;
}

/**
 * Get the current mock scraper instance (if enabled)
 */
export function getMockScraper(): MockScraper | null {
  return globalMockScraper || (global as any).__SCRAPER_MOCK__ || null;
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a deterministic mock article for snapshot testing
 */
export function createDeterministicArticle(seed: number): MockArticle {
  const titleIndex = seed % SAMPLE_TITLES.length;
  const excerptIndex = seed % SAMPLE_EXCERPTS.length;
  const authorIndex = seed % SAMPLE_AUTHORS.length;

  return {
    url: `https://example.com/article/${seed}`,
    title: SAMPLE_TITLES[titleIndex],
    content: SAMPLE_CONTENT.replace('Sample Article Title', SAMPLE_TITLES[titleIndex]),
    markdown: SAMPLE_MARKDOWN.replace('Sample Article Title', SAMPLE_TITLES[titleIndex]),
    text: SAMPLE_MARKDOWN.replace(/[#*\-\[\]]/g, '').replace('Sample Article Title', SAMPLE_TITLES[titleIndex]),
    excerpt: SAMPLE_EXCERPTS[excerptIndex],
    author: SAMPLE_AUTHORS[authorIndex],
    publishedDate: '2024-01-15T00:00:00.000Z',
    wordCount: 500 + (seed * 100) % 1000,
    readingTime: Math.ceil((500 + (seed * 100) % 1000) / 200)
  };
}

/**
 * Wait for all mock operations to complete
 * Useful for testing async behavior
 */
export async function flushMockOperations(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}
