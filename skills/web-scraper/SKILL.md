---
name: web-scraper
description: Scrape blog/news content from websites. Use when user asks to extract articles, discover RSS feeds, parse sitemaps, scrape news sites, or get content from blogs. Triggers on keywords like "scrape", "extract articles", "get blog posts", "fetch news", "RSS feed", "sitemap".
allowed-tools: Bash(npx tsx:*), Bash(open:*), Read, Write, Glob
---

# Web Scraper Skill

Extract blog and news content from any website. Results are auto-saved to `./scraper-output/` as JSON, Markdown, and HTML preview.

## Smart URL Detection

The scraper automatically detects whether a URL is:
- **Single article** → Extracts content directly (fast)
- **Listing page** → Discovers articles via RSS/sitemap/HTML

## How to Scrape

When user provides a URL to scrape, create this script and run it:

```typescript
import { smartScrape, extractArticle } from '${CLAUDE_PLUGIN_ROOT}/lib';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

async function main() {
  const url = 'USER_PROVIDED_URL'; // Replace with actual URL

  console.log(`Scraping: ${url}`);

  // Smart scrape auto-detects article vs listing
  const result = await smartScrape(url, {
    maxArticles: 10,
    qualityThreshold: 0.3
  });

  // Create output directory
  const outputDir = './scraper-output';
  fs.mkdirSync(outputDir, { recursive: true });

  // Generate filename from URL and timestamp
  const hostname = new URL(url).hostname.replace(/\./g, '-');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseName = `${hostname}_${timestamp}`;

  if (result.mode === 'article') {
    // Single article extracted
    const article = result.article;

    // Save JSON
    const jsonPath = path.join(outputDir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(article, null, 2));

    // Save Markdown
    const mdPath = path.join(outputDir, `${baseName}.md`);
    fs.writeFileSync(mdPath, `# ${article.title}\n\n${article.markdown}`);

    // Save HTML preview
    const html = generateHtmlPreview([{
      url: article.url,
      title: article.title,
      publishedDate: article.publishedDate,
      qualityScore: article.confidence,
      fullContent: article.html
    }], url, 'single-article');
    const htmlPath = path.join(outputDir, `${baseName}.html`);
    fs.writeFileSync(htmlPath, html);

    console.log('\n=== SINGLE ARTICLE EXTRACTED ===');
    console.log(`Title: ${article.title}`);
    console.log(`Words: ${article.wordCount}`);
    console.log(`Reading time: ${article.readingTime} min`);
    console.log(`\nSaved to:`);
    console.log(`  ${jsonPath}`);
    console.log(`  ${mdPath}`);
    console.log(`  ${htmlPath}`);

    exec(`open "${htmlPath}"`);
    console.log('\n✓ Opened preview in browser');

  } else if (result.mode === 'listing') {
    // Multiple articles discovered
    const articles = result.articles;

    // Save JSON
    const jsonPath = path.join(outputDir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify({ url, articles, stats: result.stats }, null, 2));

    // Save Markdown
    let markdown = `# Scraped Content: ${url}\n\n`;
    markdown += `**Articles:** ${articles.length}\n\n---\n\n`;
    for (const article of articles) {
      markdown += `## ${article.title}\n\n`;
      markdown += `- **URL:** ${article.url}\n`;
      markdown += `- **Date:** ${article.publishedDate || 'Unknown'}\n`;
      markdown += `- **Quality:** ${Math.round(article.qualityScore * 100)}%\n\n`;
      if (article.fullContentMarkdown) {
        markdown += article.fullContentMarkdown + '\n\n---\n\n';
      }
    }
    const mdPath = path.join(outputDir, `${baseName}.md`);
    fs.writeFileSync(mdPath, markdown);

    // Save HTML preview
    const html = generateHtmlPreview(articles, url, result.stats?.detectedType || 'auto');
    const htmlPath = path.join(outputDir, `${baseName}.html`);
    fs.writeFileSync(htmlPath, html);

    console.log('\n=== RESULTS ===');
    console.log(`Articles: ${articles.length}`);
    console.log(`\nSaved to:`);
    console.log(`  ${jsonPath}`);
    console.log(`  ${mdPath}`);
    console.log(`  ${htmlPath}`);
    console.log('\nTop articles:');
    articles.slice(0, 5).forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.title} (${Math.round(a.qualityScore * 100)}%)`);
    });

    exec(`open "${htmlPath}"`);
    console.log('\n✓ Opened preview in browser');

  } else {
    console.error('Failed to extract content:', result.error);
  }
}

function generateHtmlPreview(articles: any[], sourceUrl: string, sourceType: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scraped: ${new URL(sourceUrl).hostname}</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; background: #f9fafb; color: #111827; line-height: 1.6; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
    .stats { background: #fff; padding: 1rem; border-radius: 8px; margin-bottom: 2rem; border: 1px solid #e5e7eb; }
    .article { background: #fff; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid #e5e7eb; }
    .article h2 { margin-top: 0; font-size: 1.2rem; }
    .article h2 a { color: #2563eb; text-decoration: none; }
    .meta { font-size: 0.875rem; color: #6b7280; margin-bottom: 1rem; }
    .quality { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .quality.high { background: #d1fae5; color: #065f46; }
    .quality.medium { background: #fef3c7; color: #92400e; }
    .quality.low { background: #fee2e2; color: #991b1b; }
    .content { font-size: 0.95rem; }
  </style>
</head>
<body>
  <h1>Scraped: ${sourceUrl}</h1>
  <div class="stats">
    <strong>Source:</strong> ${sourceType} &bull;
    <strong>Articles:</strong> ${articles.length}
  </div>
  ${articles.map(a => {
    const q = (a.qualityScore || a.confidence || 0) >= 0.7 ? 'high' : (a.qualityScore || a.confidence || 0) >= 0.4 ? 'medium' : 'low';
    return `<article class="article">
      <h2><a href="${a.url}" target="_blank">${a.title}</a></h2>
      <div class="meta"><span class="quality ${q}">${Math.round((a.qualityScore || a.confidence || 0) * 100)}%</span> &bull; ${a.publishedDate || 'Unknown'}</div>
      <div class="content">${a.fullContent || a.html || a.description || ''}</div>
    </article>`;
  }).join('')}
</body>
</html>`;
}

main().catch(e => console.error('Error:', e.message));
```

Run with: `npx tsx scrape-site.ts`

## Output Files

Results are saved to `./scraper-output/`:

| File | Format | Contains |
|------|--------|----------|
| `{hostname}_{timestamp}.json` | JSON | Full structured data |
| `{hostname}_{timestamp}.md` | Markdown | Human-readable content |
| `{hostname}_{timestamp}.html` | HTML | Styled preview (auto-opens in browser) |

## Response to User

After scraping, report:
1. **Mode detected** (single article vs listing)
2. Article count or single article details
3. File paths where results are saved
4. Top article titles with quality scores
5. Confirm browser preview opened

## SDK Functions

| Function | Purpose |
|----------|---------|
| `smartScrape(url)` | Auto-detect article vs listing, extract appropriately |
| `extractArticle(url)` | Extract single article directly (fastest) |
| `scrapeWebsite(url)` | Discover multiple articles from listing page |
| `isArticleUrl(url)` | Check if URL looks like an article |
| `isListingUrl(url)` | Check if URL looks like a listing |

## SDK Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| maxArticles | number | 10 | Maximum articles to return |
| qualityThreshold | number | 0.3 | Minimum quality score (0-1) |
| sourceType | string | 'auto' | Force: 'rss', 'sitemap', 'html' |
| forceMode | string | - | Force: 'article' or 'listing' |
| allowPaths | string[] | [] | Only scrape these paths |
| denyPaths | string[] | [...] | Skip these paths |

## Output Formats

Each article includes multiple formats:

| Format | Field | Description |
|--------|-------|-------------|
| HTML | `html` / `fullContent` | Raw HTML content |
| Markdown | `markdown` / `fullContentMarkdown` | Formatted markdown |
| Text | `text` / `fullContentText` | Plain text, cleaned |
| Excerpt | `excerpt` / `description` | Short summary |
