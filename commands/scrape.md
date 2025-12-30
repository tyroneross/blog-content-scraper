---
description: Scrape blog/news content from a website URL and save results
---

# Scrape Command

Scrape the website at "$ARGUMENTS" for blog/news content.

## Instructions

1. Parse the URL from arguments. If no URL provided, ask the user.

2. Create and run a scraper script:

```typescript
import { scrapeWebsite } from '${CLAUDE_PLUGIN_ROOT}/lib';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

async function main() {
  const url = '$ARGUMENTS'.trim();
  if (!url) {
    console.log('ERROR: No URL provided');
    process.exit(1);
  }

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

  // Save JSON (full data)
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  // Save Markdown
  let markdown = `# Scraped Content: ${url}\n\n`;
  markdown += `**Source:** ${result.detectedType} | **Articles:** ${result.articles.length} | **Time:** ${result.stats.processingTime}ms\n\n---\n\n`;

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

  // Generate HTML preview
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scraped: ${hostname}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; background: #f9fafb; color: #111827; line-height: 1.6; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
    .stats { background: #fff; padding: 1rem; border-radius: 8px; margin-bottom: 2rem; border: 1px solid #e5e7eb; }
    .stats span { margin-right: 1.5rem; }
    .article { background: #fff; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid #e5e7eb; }
    .article h2 { margin-top: 0; font-size: 1.2rem; }
    .article h2 a { color: #2563eb; text-decoration: none; }
    .article h2 a:hover { text-decoration: underline; }
    .meta { font-size: 0.875rem; color: #6b7280; margin-bottom: 1rem; }
    .quality { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .quality.high { background: #d1fae5; color: #065f46; }
    .quality.medium { background: #fef3c7; color: #92400e; }
    .quality.low { background: #fee2e2; color: #991b1b; }
    .content { font-size: 0.95rem; }
    .content p { margin: 0.75rem 0; }
    .content h3, .content h4 { margin-top: 1.5rem; }
    .content ul, .content ol { padding-left: 1.5rem; }
    .content a { color: #2563eb; }
    .content img { max-width: 100%; height: auto; border-radius: 4px; }
    .content blockquote { border-left: 3px solid #e5e7eb; margin: 1rem 0; padding-left: 1rem; color: #6b7280; }
    .content code { background: #f3f4f6; padding: 0.125rem 0.25rem; border-radius: 3px; font-size: 0.875em; }
    .content pre { background: #1f2937; color: #f9fafb; padding: 1rem; border-radius: 6px; overflow-x: auto; }
    .content pre code { background: none; padding: 0; }
  </style>
</head>
<body>
  <h1>Scraped Content: ${url}</h1>
  <div class="stats">
    <span><strong>Source:</strong> ${result.detectedType}</span>
    <span><strong>Articles:</strong> ${result.articles.length}</span>
    <span><strong>Time:</strong> ${result.stats.processingTime}ms</span>
  </div>
  ${result.articles.map(article => {
    const qualityClass = article.qualityScore >= 0.7 ? 'high' : article.qualityScore >= 0.4 ? 'medium' : 'low';
    return \`
  <article class="article">
    <h2><a href="\${article.url}" target="_blank">\${article.title}</a></h2>
    <div class="meta">
      <span class="quality \${qualityClass}">\${Math.round(article.qualityScore * 100)}% quality</span>
      &bull; \${article.publishedDate || 'Unknown date'}
    </div>
    <div class="content">\${article.fullContent || article.description || ''}</div>
  </article>\`;
  }).join('')}
</body>
</html>`;

  const htmlPath = path.join(outputDir, `${baseName}.html`);
  fs.writeFileSync(htmlPath, html);

  // Output summary
  console.log('\\n=== RESULTS ===');
  console.log(\`Source type: \${result.detectedType}\`);
  console.log(\`Articles found: \${result.articles.length}\`);
  console.log(\`Processing time: \${result.stats.processingTime}ms\`);
  console.log(\`\\nSaved to:\`);
  console.log(\`  JSON: \${jsonPath}\`);
  console.log(\`  Markdown: \${mdPath}\`);
  console.log(\`  HTML Preview: \${htmlPath}\`);
  console.log('\\nTop articles:');
  result.articles.slice(0, 5).forEach((a, i) => {
    console.log(\`  \${i + 1}. \${a.title} (\${Math.round(a.qualityScore * 100)}%)\`);
  });

  // Open HTML in browser
  const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(\`\${openCmd} "\${htmlPath}"\`);
  console.log('\\n✓ Opened preview in browser');
}

main().catch(e => console.error('Error:', e.message));
```

3. Run with `npx tsx <script>`

4. Report to user:
   - Source type and article count
   - File paths where results were saved
   - Top 5 article titles with quality scores
   - Confirm browser preview opened
