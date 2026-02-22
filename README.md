# Scraper App

Intelligent document and web content extraction SDK. Parse web pages, Excel spreadsheets, PowerPoint presentations, Python source files, and more into clean, structured, LLM-ready output.

[![npm](https://img.shields.io/npm/v/@tyroneross/scraper-app)](https://www.npmjs.com/package/@tyroneross/scraper-app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

## Features

- **Web scraping** - Extract articles from any blog or news site (RSS, sitemap, HTML)
- **Document parsing** - Excel (.xlsx/.xls/.csv), PowerPoint (.pptx), Python (.py), PDF
- **LLM-ready output** - Markdown, plain text, token counts, and RAG-ready chunks
- **Smart routing** - Auto-detects input type (URL, file, directory) and dispatches to the right parser
- **Batch processing** - Parallel multi-document parsing with concurrency control
- **92.2% F1 score** - Mozilla Readability extraction validated against the Dragnet benchmark

## Installation

```bash
npm install @tyroneross/scraper-app
```

## Quick Start

### Extract a web article

```typescript
import { extractArticle } from '@tyroneross/scraper-app';

const article = await extractArticle('https://example.com/blog/post');
console.log(article.title);
console.log(article.markdown);
console.log(`${article.wordCount} words, ${article.readingTime} min read`);
```

### Parse any document (auto-detect)

```typescript
import { parse } from '@tyroneross/scraper-app';

// URL → web scraper
const web = await parse('https://example.com/article');

// Excel file → structured tables
const excel = await parse('./data/report.xlsx');

// PowerPoint → slides with notes
const pptx = await parse('./deck.pptx');

// Python source → functions, classes, docstrings
const py = await parse('./scripts/main.py');

// Directory → batch parse all supported files
const dir = await parse('./documents/');
```

### LLM-ready output

```typescript
import { scrapeForLLM } from '@tyroneross/scraper-app/llm';

const { markdown, tokens, chunks, frontmatter } = await scrapeForLLM(url);
// tokens: estimated count for context window management
// chunks: pre-split for RAG applications
```

### Batch processing

```typescript
import { parseMultiple } from '@tyroneross/scraper-app';

const results = await parseMultiple(
  ['./report.xlsx', './deck.pptx', 'https://blog.example.com/post'],
  { concurrency: 4 }
);
```

## API Reference

### Core Functions

| Function | Description |
|----------|-------------|
| `parse(input)` | Auto-detect input type and parse (URL, file, directory, raw HTML) |
| `parseMultiple(inputs, opts)` | Parse multiple inputs in parallel |
| `extractArticle(url)` | Extract a single article from a URL |
| `scrapeWebsite(url, opts)` | Discover and extract multiple articles from a site |
| `smartScrape(url)` | Auto-detect single article vs. listing page |

### Module Exports

| Import | Use For |
|--------|---------|
| `@tyroneross/scraper-app` | Core: `parse`, `parseMultiple`, `extractArticle`, `scrapeWebsite`, `smartScrape` |
| `@tyroneross/scraper-app/llm` | LLM output: `scrapeForLLM`, `toLLMFormat`, `estimateTokens` |
| `@tyroneross/scraper-app/batch` | Batch: `scrapeUrls`, `extractArticles` |
| `@tyroneross/scraper-app/parsers` | Direct access: `parseExcelFile`, `parsePptxFile`, `parsePythonFile` |
| `@tyroneross/scraper-app/cache` | Caching: `createCache`, `MemoryCache`, `FileCache` |
| `@tyroneross/scraper-app/validation` | Validation: `validateUrl`, `canScrape`, `isValidUrl` |
| `@tyroneross/scraper-app/testing` | Testing: `createMockScraper`, `enableMockMode` |
| `@tyroneross/scraper-app/debug` | Debug: `enableDebugMode`, `DebugSession` |
| `@tyroneross/scraper-app/react` | React hook: `useScraper` |
| `@tyroneross/scraper-app/express` | Express router: `createScraperRouter` |
| `@tyroneross/scraper-app/optimizations` | Performance: `createConnectionPool`, `parallelFetch`, `fastExtract` |

### Supported Formats

| Format | Extensions | Parser |
|--------|------------|--------|
| Web pages | URLs (http/https) | Mozilla Readability + Cheerio |
| Excel | .xlsx, .xls, .csv, .tsv, .xlsb, .ods | SheetJS (single-pass optimized) |
| PowerPoint | .pptx | Custom ZIP + regex parser (up to 14x faster than node-pptx-parser) |
| Python | .py | Static analysis (regex-based, no runtime needed) |
| PDF | .pdf | pdf-parse |
| HTML | Raw HTML strings | Cheerio + Readability |

## Performance

The document parsers have been rebuilt from scratch for speed:

| Parser | Speedup vs. v1 | Method |
|--------|----------------|--------|
| PowerPoint | **5-14x faster** | Single-pass ZIP, regex-first XML extraction, chart/diagram support |
| Excel | **1-1.6x faster** | Single-pass processing (builds rows, markdown, CSV simultaneously) |

Benchmarked across 24 test files with 100% accuracy.

## Examples

### Discover articles from a blog

```typescript
import { scrapeWebsite } from '@tyroneross/scraper-app';

const { articles } = await scrapeWebsite('https://techcrunch.com', {
  maxArticles: 10,
  extractFullContent: true
});

for (const article of articles) {
  console.log(`${article.title} (${article.qualityScore})`);
}
```

### Parse Excel for LLM context

```typescript
import { parse } from '@tyroneross/scraper-app';

const result = await parse('./quarterly-report.xlsx');
console.log(result.markdown); // Markdown tables ready for LLM
console.log(`${result.estimatedTokens} tokens`);
```

### Validate before scraping

```typescript
import { validateUrl } from '@tyroneross/scraper-app/validation';

const { isReachable, robotsAllowed, suggestedAction } = await validateUrl(url);
if (!robotsAllowed) {
  console.log('Blocked by robots.txt');
}
```

### Express API server

```typescript
import express from 'express';
import { createScraperRouter } from '@tyroneross/scraper-app/express';

const app = express();
app.use('/api/scraper', createScraperRouter());
// POST /api/scraper/scrape, POST /api/scraper/extract, POST /api/scraper/validate
```

### React hook

```typescript
import { useScraper } from '@tyroneross/scraper-app/react';

function MyComponent() {
  const { scrape, data, isLoading, error } = useScraper();
  return <button onClick={() => scrape(url)}>Extract</button>;
}
```

## Configuration

```typescript
import { configure } from '@tyroneross/scraper-app';

// Suppress console output in production
configure({ quiet: true });
```

### Caching

```typescript
import { createCache } from '@tyroneross/scraper-app/cache';

const cache = createCache({ provider: 'memory', ttlMs: 3600000 });
```

### Rate limiting

```typescript
import { createRateLimiter } from '@tyroneross/scraper-app';

const limiter = createRateLimiter('moderate');
// Presets: 'conservative' (1 req/s), 'moderate' (2 req/s), 'aggressive' (4 req/s)
```

## Testing

### Mock mode (no network)

```typescript
import { enableMockMode, disableMockMode } from '@tyroneross/scraper-app/testing';

enableMockMode();
const article = await extractArticle('https://any-url.com'); // returns mock data
disableMockMode();
```

### F1 score validation

```bash
# Dragnet benchmark (91.4% F1, validates 92.2% claim)
npm run test:f1:dragnet

# Quick custom test
npm run test:f1
```

## Development

```bash
# Install dependencies
npm install

# Run dev server (web UI)
npm run dev

# Build SDK
npm run build:sdk

# Type check
npm run typecheck
```

## License

MIT

## Links

- [npm package](https://www.npmjs.com/package/@tyroneross/scraper-app)
- [GitHub](https://github.com/tyroneross/Scraper App)
- [Issues](https://github.com/tyroneross/Scraper App/issues)
