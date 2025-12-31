---
name: scraper
description: Extract blog/news content from websites. Use when user asks to scrape articles, extract content from URLs, discover RSS feeds, get article text/markdown, or needs LLM-ready content from web pages.
allowed-tools: Bash(npx tsx:*), Read, Write
---

# Web Scraper Skill

Extract blog and news content from any website using the @tyroneross/blog-scraper SDK.

## When to Use This Skill

- User provides a blog/article URL and wants content extracted
- User wants to discover articles from a website
- User needs content formatted for LLM/AI use (with token counts)
- User wants to batch process multiple URLs
- User asks about RSS feeds or sitemaps on a site

## Quick Usage

### Extract Single Article
```typescript
import { extractArticle } from '@tyroneross/blog-scraper';

const article = await extractArticle('https://example.com/blog/post');
console.log(article.title);      // Article title
console.log(article.markdown);   // Full content in Markdown
console.log(article.text);       // Plain text
console.log(article.wordCount);  // Word count
console.log(article.readingTime); // Reading time in minutes
```

### LLM-Ready Output (Best for AI)
```typescript
import { scrapeForLLM } from '@tyroneross/blog-scraper/llm';

const { markdown, tokens, chunks, title } = await scrapeForLLM(url);
// tokens: estimated token count for context window management
// chunks: pre-split content for RAG applications
```

### Discover Articles from Site
```typescript
import { scrapeWebsite } from '@tyroneross/blog-scraper';

const result = await scrapeWebsite('https://techcrunch.com', {
  maxArticles: 10,
  extractFullContent: true
});

for (const article of result.articles) {
  console.log(article.title, article.url);
}
```

### Smart Mode (Auto-Detect Article vs Listing)
```typescript
import { smartScrape } from '@tyroneross/blog-scraper';

const result = await smartScrape(url);
if (result.mode === 'article') {
  // Single article extracted
  console.log(result.article.title);
} else {
  // Multiple articles discovered
  console.log(result.articles.length, 'articles');
}
```

### Batch Processing
```typescript
import { scrapeUrls } from '@tyroneross/blog-scraper/batch';

const urls = ['https://...', 'https://...'];
const result = await scrapeUrls(urls, { concurrency: 3 });
console.log(result.stats.successful, 'succeeded');
```

### Validate URL Before Scraping
```typescript
import { validateUrl } from '@tyroneross/blog-scraper/validation';

const check = await validateUrl(url);
if (check.robotsAllowed && check.isReachable) {
  // Safe to scrape
}
```

## Output Formats

The scraper returns content in multiple formats:

| Property | Description |
|----------|-------------|
| `html` | Raw HTML content |
| `markdown` | Formatted Markdown |
| `text` | Plain text (no formatting) |
| `title` | Article title |
| `excerpt` | Short summary |
| `author` | Author name (if detected) |
| `publishedDate` | Publication date |
| `wordCount` | Total words |
| `readingTime` | Estimated minutes to read |

## Running Scripts

To run scraper code, use:
```bash
npx tsx script.ts
```

Or create a test file and run it:
```bash
echo 'import { extractArticle } from "@tyroneross/blog-scraper"; extractArticle("URL").then(console.log)' > test.ts && npx tsx test.ts
```
