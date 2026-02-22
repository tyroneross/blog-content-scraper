# Claude Code Instructions for @tyroneross/scraper-app

This SDK provides intelligent web scraping for blog/news content. Use it when users need to extract articles, discover RSS feeds, or get LLM-ready content from websites.

## When to Use This Tool

**USE the scraper when the user wants to:**
- Extract content from a blog post or news article URL
- Discover articles from a website (RSS, sitemap, or HTML scraping)
- Get content formatted for LLM consumption (with token counts)
- Batch process multiple URLs
- Validate if a URL is scrapeable

**DON'T use the scraper for:**
- General web browsing or fetching arbitrary HTML
- APIs that return JSON (use fetch directly)
- Sites that require authentication (scraper doesn't handle login)
- Real-time data (scraper is for static content)

## Quick Reference

### Single Article Extraction (Most Common)
```typescript
import { extractArticle } from '@tyroneross/scraper-app';

const article = await extractArticle('https://example.com/blog/post');
// Returns: { title, markdown, text, html, wordCount, readingTime, ... }
```

### LLM-Ready Output (For AI/RAG Use Cases)
```typescript
import { scrapeForLLM } from '@tyroneross/scraper-app/llm';

const { markdown, tokens, chunks, frontmatter } = await scrapeForLLM(url);
// Use chunks for RAG, tokens for context window management
```

### Discover Multiple Articles
```typescript
import { scrapeWebsite } from '@tyroneross/scraper-app';

const result = await scrapeWebsite('https://techcrunch.com', {
  maxArticles: 10,
  extractFullContent: true
});
// Returns: { articles: [...], stats, detectedType }
```

### Smart Mode (Auto-Detect)
```typescript
import { smartScrape } from '@tyroneross/scraper-app';

const result = await smartScrape(url);
if (result.mode === 'article') {
  console.log(result.article.title);
} else if (result.mode === 'listing') {
  console.log(result.articles.length, 'articles found');
}
```

### Batch Processing
```typescript
import { scrapeUrls } from '@tyroneross/scraper-app/batch';

const result = await scrapeUrls(urls, {
  concurrency: 3,
  mode: 'article',
  onProgress: (p) => console.log(`${p.percentage}% complete`)
});
```

### URL Validation
```typescript
import { validateUrl, canScrape } from '@tyroneross/scraper-app/validation';

const validation = await validateUrl(url);
// Returns: { isReachable, robotsAllowed, hasPaywall, suggestedAction }

const ok = await canScrape(url); // Quick boolean check
```

## Module Reference

| Import | Use For |
|--------|---------|
| `@tyroneross/scraper-app` | Core: `extractArticle`, `scrapeWebsite`, `smartScrape` |
| `@tyroneross/scraper-app/llm` | LLM output: `scrapeForLLM`, `toLLMFormat`, `estimateTokens` |
| `@tyroneross/scraper-app/batch` | Batch: `scrapeUrls`, `extractArticles` |
| `@tyroneross/scraper-app/cache` | Caching: `createCache`, `MemoryCache`, `FileCache` |
| `@tyroneross/scraper-app/validation` | Validation: `validateUrl`, `canScrape`, `isValidUrl` |
| `@tyroneross/scraper-app/testing` | Testing: `createMockScraper`, `enableMockMode` |
| `@tyroneross/scraper-app/debug` | Debug: `enableDebugMode`, `DebugSession` |

## Best Practices

### 1. Use `extractArticle` for known article URLs
If the user provides a direct article link, use `extractArticle()` - it's faster than discovery mode.

### 2. Use `scrapeForLLM` when building AI features
Returns token counts and chunks optimized for RAG/context windows.

### 3. Check robots.txt compliance
```typescript
const { robotsAllowed, suggestedAction } = await validateUrl(url);
if (!robotsAllowed) {
  // Warn user or skip
}
```

### 4. Use batch mode for multiple URLs
More efficient than looping with `extractArticle`:
```typescript
const results = await scrapeUrls(urls, { concurrency: 3 });
```

### 5. Enable caching for repeated scrapes
```typescript
import { createCache } from '@tyroneross/scraper-app/cache';
const cache = createCache({ provider: 'memory', ttlMs: 3600000 });
```

### 6. Suppress logs in production
```typescript
import { configure } from '@tyroneross/scraper-app';
configure({ quiet: true });
```

## Error Handling

The scraper may fail for various reasons. Always handle errors:

```typescript
try {
  const article = await extractArticle(url);
  if (!article) {
    // Extraction failed but no error thrown
    console.log('Could not extract content');
  }
} catch (error) {
  // Network error, invalid URL, etc.
  console.error('Scrape failed:', error.message);
}
```

## Common Patterns

### Extract and summarize for user
```typescript
const article = await extractArticle(url);
if (article) {
  return `**${article.title}**\n\n${article.excerpt}\n\n[Read more](${url}) • ${article.readingTime} min read`;
}
```

### Build context for LLM prompt
```typescript
const { markdown, tokens, title } = await scrapeForLLM(url);
const prompt = `Article: ${title} (${tokens} tokens)\n\n${markdown}\n\nQuestion: ${userQuestion}`;
```

### Discover recent articles from a blog
```typescript
const { articles } = await scrapeWebsite(blogUrl, {
  maxArticles: 5,
  extractFullContent: false  // Just metadata, faster
});
return articles.map(a => `- [${a.title}](${a.url})`).join('\n');
```

## Limitations

- **JavaScript-rendered sites**: Uses Playwright fallback but may not work on all SPA sites
- **Paywalled content**: Cannot bypass paywalls
- **Rate limiting**: Built-in rate limiter, but aggressive scraping may still be blocked
- **Authentication**: No support for login-protected content
- **Large sites**: Discovery mode may be slow on sites with thousands of articles

## Testing Without Network

Use mock mode for testing:
```typescript
import { enableMockMode, disableMockMode } from '@tyroneross/scraper-app/testing';

enableMockMode();
// All scraper calls now return mock data
const article = await extractArticle('https://any-url.com');
disableMockMode();
```


## Debugging Memory

This project uses @tyroneross/claude-code-debugger for debugging memory.

**Automatic behavior:**
- Past debugging sessions are stored and indexed
- Similar incidents surface automatically when investigating bugs
- Patterns are extracted from repeated issues

**Commands:**
- `/debugger "symptom"` - Search past bugs for similar issues
- `/debugger` - Show recent bugs, pick one to debug
- `/debugger-status` - Show memory statistics
- `/debugger-scan` - Scan recent sessions for debugging work

The system learns from your debugging sessions automatically.
