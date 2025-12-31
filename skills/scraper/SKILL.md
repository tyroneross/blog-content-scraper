---
name: web-scraping
description: Extracts content from blog posts and news articles. Use when user asks to scrape a URL, extract article content, get text from a webpage, discover articles from a blog, parse RSS feeds, or needs LLM-ready content with token counts. Supports single articles, batch processing, and site-wide discovery.
allowed-tools: Bash(npx tsx:*), Bash(node:*), Read, Write, Glob
---

# Web Scraping Skill

Extract blog and news content from any website using the @tyroneross/blog-scraper SDK.

## Quick Reference

### Single Article (Most Common)
```typescript
import { extractArticle } from '@tyroneross/blog-scraper';

const article = await extractArticle('https://example.com/blog/post');
// Returns: { title, markdown, text, html, wordCount, readingTime, excerpt, author }
```

### LLM-Ready Output (For AI/RAG)
```typescript
import { scrapeForLLM } from '@tyroneross/blog-scraper/llm';

const { markdown, tokens, chunks, frontmatter } = await scrapeForLLM(url);
// tokens: estimated count for context window management
// chunks: pre-split for RAG applications
```

### Discover Articles from Site
```typescript
import { scrapeWebsite } from '@tyroneross/blog-scraper';

const result = await scrapeWebsite('https://techcrunch.com', {
  maxArticles: 10,
  extractFullContent: true
});
```

### Smart Mode (Auto-Detect)
```typescript
import { smartScrape } from '@tyroneross/blog-scraper';

const result = await smartScrape(url);
if (result.mode === 'article') {
  console.log(result.article.title);
} else {
  console.log(result.articles.length, 'articles found');
}
```

### Batch Processing
```typescript
import { scrapeUrls } from '@tyroneross/blog-scraper/batch';

const result = await scrapeUrls(urls, { concurrency: 3 });
```

### Validate Before Scraping
```typescript
import { validateUrl } from '@tyroneross/blog-scraper/validation';

const { isReachable, robotsAllowed, suggestedAction } = await validateUrl(url);
```

## Output Properties

| Property | Description |
|----------|-------------|
| `title` | Article title |
| `markdown` | Formatted Markdown content |
| `text` | Plain text (no formatting) |
| `html` | Raw HTML content |
| `excerpt` | Short summary |
| `author` | Author name if detected |
| `publishedDate` | Publication date |
| `wordCount` | Total words |
| `readingTime` | Estimated minutes to read |

## Running Code

Create a script file and run with:
```bash
npx tsx script.ts
```

## When to Use Each Function

| User Request | Function |
|--------------|----------|
| "Extract this article" | `extractArticle(url)` |
| "Get content for LLM" | `scrapeForLLM(url)` |
| "Find articles on this site" | `scrapeWebsite(url)` |
| "Not sure if article or blog" | `smartScrape(url)` |
| "Process these 5 URLs" | `scrapeUrls(urls)` |
| "Can I scrape this?" | `validateUrl(url)` |
