---
name: web-scraper
description: Scrape blog/news content from websites. Use when user asks to extract articles, discover RSS feeds, parse sitemaps, scrape news sites, or get content from blogs. Triggers on keywords like "scrape", "extract articles", "get blog posts", "fetch news", "RSS feed", "sitemap".
allowed-tools: Bash(npx tsx:*), Bash(open:*), Read, Write, Glob
---

# Web Scraper Skill

Extract blog and news content from any website. Results are auto-saved to `./scraper-output/` as JSON, Markdown, and HTML preview.

## How to Scrape

When user provides a URL to scrape, create this script and run it:

```typescript
import { scrapeWebsite } from '${CLAUDE_PLUGIN_ROOT}/lib';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

async function main() {
  const url = 'USER_PROVIDED_URL'; // Replace with actual URL

  console.log(`Scraping: ${url}`);

  const result = await scrapeWebsite(url, {
    maxArticles: 10,
    extractFullContent: true,
    qualityThreshold: 0.3
  });

  // Create output directory
  const outputDir = './scraper-output';
  fs.mkdirSync(outputDir, { recursive: true });

  // Generate filename from URL and timestamp
  const hostname = new URL(url).hostname.replace(/\./g, '-');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseName = `${hostname}_${timestamp}`;

  // Save JSON
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  // Save Markdown
  let markdown = `# Scraped Content: ${url}\n\n`;
  markdown += `**Source:** ${result.detectedType} | **Articles:** ${result.articles.length}\n\n---\n\n`;
  for (const article of result.articles) {
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

  // Generate HTML preview with styling
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scraped: ${hostname}</title>
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
  <h1>Scraped: ${url}</h1>
  <div class="stats">
    <strong>Source:</strong> ${result.detectedType} &bull;
    <strong>Articles:</strong> ${result.articles.length} &bull;
    <strong>Time:</strong> ${result.stats.processingTime}ms
  </div>
  ${result.articles.map(a => {
    const q = a.qualityScore >= 0.7 ? 'high' : a.qualityScore >= 0.4 ? 'medium' : 'low';
    return `<article class="article">
      <h2><a href="${a.url}" target="_blank">${a.title}</a></h2>
      <div class="meta"><span class="quality ${q}">${Math.round(a.qualityScore * 100)}%</span> &bull; ${a.publishedDate || 'Unknown'}</div>
      <div class="content">${a.fullContent || a.description || ''}</div>
    </article>`;
  }).join('')}
</body>
</html>`;
  const htmlPath = path.join(outputDir, `${baseName}.html`);
  fs.writeFileSync(htmlPath, html);

  // Summary
  console.log('\n=== RESULTS ===');
  console.log(`Source: ${result.detectedType}`);
  console.log(`Articles: ${result.articles.length}`);
  console.log(`\nFiles saved:`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${mdPath}`);
  console.log(`  ${htmlPath}`);

  // Open in browser
  exec(`open "${htmlPath}"`);
  console.log('\n✓ Opened preview in browser');
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
1. Source type detected (RSS/sitemap/HTML)
2. Number of articles found
3. File paths where results are saved
4. Top 5 article titles with quality scores
5. Confirm browser preview opened

## SDK Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| maxArticles | number | 10 | Maximum articles to return |
| extractFullContent | boolean | true | Get full article text |
| qualityThreshold | number | 0.5 | Minimum quality score (0-1) |
| sourceType | string | 'auto' | Force: 'rss', 'sitemap', 'html' |
| allowPaths | string[] | [] | Only scrape these paths |
| denyPaths | string[] | [...] | Skip these paths |
