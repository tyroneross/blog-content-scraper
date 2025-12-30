---
name: web-scraper
description: Scrape blog/news content from websites. Use when user asks to extract articles, discover RSS feeds, parse sitemaps, scrape news sites, or get content from blogs. Triggers on keywords like "scrape", "extract articles", "get blog posts", "fetch news", "RSS feed", "sitemap".
allowed-tools: Bash(npx tsx:*), Read, Write, Glob
---

# Web Scraper Skill

Extract blog and news content from any website using the blog-content-scraper SDK.

## Quick Usage

Create a script file and run it:

```typescript
// scrape-site.ts
import { scrapeWebsite } from '${CLAUDE_PLUGIN_ROOT}/lib';

async function main() {
  const result = await scrapeWebsite('https://example.com', {
    maxArticles: 5,
    extractFullContent: true,
    qualityThreshold: 0.3
  });

  console.log(`Source type: ${result.detectedType}`);
  console.log(`Articles found: ${result.articles.length}`);

  for (const article of result.articles) {
    console.log(`- ${article.title} (${Math.round(article.qualityScore * 100)}%)`);
  }
}

main().catch(console.error);
```

Run with: `npx tsx scrape-site.ts`

## Capabilities

- **Auto-detection**: Automatically detects RSS feeds, sitemaps, or falls back to HTML scraping
- **Quality scoring**: Scores articles 0-1 based on content quality, metadata, and structure
- **Full content extraction**: Gets HTML, Markdown, and plain text versions
- **Rate limiting**: Built-in polite scraping with configurable rate limits
- **Path filtering**: Allow/deny URL patterns to focus on specific sections

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| maxArticles | number | 10 | Maximum articles to return |
| extractFullContent | boolean | true | Get full article text |
| qualityThreshold | number | 0.5 | Minimum quality score (0-1) |
| sourceType | string | 'auto' | Force: 'rss', 'sitemap', 'html' |
| allowPaths | string[] | [] | Only scrape these paths |
| denyPaths | string[] | [...] | Skip these paths |

## Response Format

```typescript
{
  url: string;
  detectedType: 'rss' | 'sitemap' | 'html';
  articles: Array<{
    url: string;
    title: string;
    publishedDate: string;
    description?: string;
    fullContent?: string;
    fullContentMarkdown?: string;
    fullContentText?: string;
    qualityScore: number;
  }>;
  stats: {
    totalDiscovered: number;
    afterQualityFilter: number;
    processingTime: number;
  };
}
```
