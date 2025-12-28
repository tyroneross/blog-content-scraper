# @tyroneross/blog-scraper

> Powerful web scraping SDK for extracting blog articles and content. No LLM required.

[![npm version](https://img.shields.io/npm/v/@tyroneross/blog-scraper.svg)](https://www.npmjs.com/package/@tyroneross/blog-scraper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

✨ **No LLM needed** - Uses Mozilla Readability (92.2% F1 score) for content extraction
🎯 **3-tier filtering** - URL patterns → content validation → quality scoring
⚡ **Fast** - Extracts articles in 2-5 seconds
🔧 **Modular** - Use high-level API or individual components
📦 **Zero config** - Works out of the box
🌐 **Multi-source** - RSS feeds, sitemaps, and HTML pages

## Installation

```bash
npm install @tyroneross/blog-scraper
```

## Quick Start

```typescript
import { scrape } from '@tyroneross/blog-scraper';

// Simple usage - scrape a blog
const result = await scrape('https://example.com/blog');

console.log(`Found ${result.articles.length} articles`);
console.log(`Processing time: ${result.processingTime}ms`);

// Access articles
result.articles.forEach(article => {
  console.log(article.title);
  console.log(article.url);
  console.log(article.fullContentMarkdown); // Markdown format
  console.log(article.qualityScore); // 0-1 quality score
});
```

## API Reference

### High-Level API (Recommended)

#### `scrape(url, options?)`

Extract articles from a URL with automatic source detection.

```typescript
import { scrape } from '@tyroneross/blog-scraper';

const result = await scrape('https://example.com', {
  // Optional configuration
  sourceType: 'auto',           // 'auto' | 'rss' | 'sitemap' | 'html'
  maxArticles: 50,              // Maximum articles to return
  extractFullContent: true,     // Extract full article content
  denyPaths: ['/about', '/contact'], // URL patterns to exclude
  qualityThreshold: 0.6         // Minimum quality score (0-1)
});
```

**Returns:**
```typescript
{
  url: string;
  detectedType: 'rss' | 'sitemap' | 'html';
  confidence: 'high' | 'medium' | 'low';
  articles: ScrapedArticle[];
  extractionStats: {
    attempted: number;
    successful: number;
    failed: number;
    filtered: number;
    totalDiscovered: number;
    afterDenyFilter: number;
    afterContentValidation: number;
    afterQualityFilter: number;
  };
  processingTime: number;
  errors: string[];
  timestamp: string;
}
```

#### `quickScrape(url)`

Fast URL-only extraction (no full content).

```typescript
import { quickScrape } from '@tyroneross/blog-scraper';

const urls = await quickScrape('https://example.com/blog');
// Returns: ['url1', 'url2', 'url3', ...]
```

### Modular API (Advanced)

Use individual components for granular control.

#### Content Extraction

```typescript
import { ContentExtractor } from '@tyroneross/blog-scraper';

const extractor = new ContentExtractor();
const content = await extractor.extractContent('https://example.com/article');

console.log(content.title);
console.log(content.textContent);
console.log(content.wordCount);
console.log(content.readingTime);
```

#### Quality Scoring

```typescript
import { calculateArticleQualityScore, getQualityBreakdown } from '@tyroneross/blog-scraper';

const score = calculateArticleQualityScore(extractedContent);
console.log(`Quality score: ${score}`); // 0-1

// Get detailed breakdown
const breakdown = getQualityBreakdown(extractedContent);
console.log(breakdown);
// {
//   contentValidation: 0.6,
//   publishedDate: 0.12,
//   author: 0.08,
//   schema: 0.08,
//   readingTime: 0.12,
//   total: 1.0,
//   passesThreshold: true
// }
```

#### Custom Quality Configuration

```typescript
import { calculateArticleQualityScore } from '@tyroneross/blog-scraper';

const score = calculateArticleQualityScore(content, {
  contentWeight: 0.8,        // Increase content importance
  dateWeight: 0.05,          // Decrease date importance
  authorWeight: 0.05,
  schemaWeight: 0.05,
  readingTimeWeight: 0.05,
  threshold: 0.7             // Stricter threshold
});
```

#### RSS Discovery

```typescript
import { RSSDiscovery } from '@tyroneross/blog-scraper';

const discovery = new RSSDiscovery();
const feeds = await discovery.discoverFeeds('https://example.com');

feeds.forEach(feed => {
  console.log(feed.url);
  console.log(feed.title);
  console.log(feed.confidence); // 0-1
});
```

#### Sitemap Parsing

```typescript
import { SitemapParser } from '@tyroneross/blog-scraper';

const parser = new SitemapParser();
const entries = await parser.parseSitemap('https://example.com/sitemap.xml');

entries.forEach(entry => {
  console.log(entry.url);
  console.log(entry.lastmod);
  console.log(entry.priority);
});
```

#### HTML Scraping

```typescript
import { HTMLScraper } from '@tyroneross/blog-scraper';

const scraper = new HTMLScraper();
const articles = await scraper.extractFromPage('https://example.com/blog', {
  selectors: {
    articleLinks: ['article a', '.post-link'],
    titleSelectors: ['h1', '.post-title'],
    dateSelectors: ['time', '.published-date']
  },
  filters: {
    minTitleLength: 10,
    maxTitleLength: 200
  }
});
```

#### Rate Limiting

```typescript
import { ScrapingRateLimiter } from '@tyroneross/blog-scraper';

// Create custom rate limiter
const limiter = new ScrapingRateLimiter({
  maxConcurrent: 5,
  minTime: 1000  // 1 second between requests
});

// Use in your scraping logic
await limiter.execute('example.com', async () => {
  // Your scraping code here
});
```

#### Circuit Breaker

```typescript
import { CircuitBreaker } from '@tyroneross/blog-scraper';

const breaker = new CircuitBreaker('my-operation', {
  failureThreshold: 5,
  resetTimeout: 60000  // 1 minute
});

const result = await breaker.execute(async () => {
  // Your operation here
});
```

## Examples

### Example 1: Scrape with Custom Deny Patterns

```typescript
import { scrape } from '@tyroneross/blog-scraper';

const result = await scrape('https://techcrunch.com', {
  denyPaths: [
    '/',
    '/about',
    '/contact',
    '/tag/*',      // Exclude all tag pages
    '/author/*'    // Exclude all author pages
  ],
  maxArticles: 20
});
```

### Example 2: Build Custom Pipeline

```typescript
import {
  SourceOrchestrator,
  ContentExtractor,
  calculateArticleQualityScore
} from '@tyroneross/blog-scraper';

// Step 1: Discover articles
const orchestrator = new SourceOrchestrator();
const discovered = await orchestrator.processSource('https://example.com', {
  sourceType: 'auto'
});

// Step 2: Extract content
const extractor = new ContentExtractor();
const extracted = await Promise.all(
  discovered.articles
    .slice(0, 10)
    .map(a => extractor.extractContent(a.url))
);

// Step 3: Score and filter
const scored = extracted
  .filter(Boolean)
  .map(content => ({
    content,
    score: calculateArticleQualityScore(content!)
  }))
  .filter(item => item.score >= 0.7);

console.log(`Found ${scored.length} high-quality articles`);
```

### Example 3: RSS-Only Scraping

```typescript
import { scrape } from '@tyroneross/blog-scraper';

const result = await scrape('https://example.com', {
  sourceType: 'rss',           // Only use RSS feeds
  extractFullContent: false,   // Don't extract full content
  maxArticles: 100
});
```

## How It Works

### 3-Tier Filtering System

**Tier 1: URL Deny Patterns**
- Fast pattern-based filtering
- Excludes non-article pages (/, /about, /tag/*, etc.)
- Customizable patterns

**Tier 2: Content Validation**
- Minimum 200 characters
- Title length 10-200 characters
- Text-to-HTML ratio ≥ 10%

**Tier 3: Quality Scoring**
- Content quality: 60% weight
- Publication date: 12% weight
- Author/byline: 8% weight
- Schema.org metadata: 8% weight
- Reading time: 12% weight
- Default threshold: 50%

### Auto-Detection Flow

1. Try RSS feed (highest confidence)
2. Discover RSS feeds from HTML
3. Try sitemap parsing
4. Discover sitemaps from domain
5. Fall back to HTML link extraction

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  ScrapedArticle,
  ScraperTestResult,
  ScrapeOptions,
  ExtractedContent,
  QualityScoreConfig
} from '@tyroneross/blog-scraper';
```

## Performance

- **Single article extraction:** ~2-5 seconds
- **Bundle size:** ~150 KB (gzipped)
- **Memory usage:** ~100 MB average
- **No external APIs:** Zero API costs

## Requirements

- Node.js ≥ 18.0.0
- No environment variables needed

## License

MIT © Tyrone Ross

## Contributing

Contributions welcome! Please open an issue or PR.

## Support

- [GitHub Issues](https://github.com/tyroneross/blog-content-scraper/issues)
- [Documentation](https://github.com/tyroneross/blog-content-scraper#readme)

---

**Built with ❤️ using Mozilla Readability**
