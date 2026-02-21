---
description: Extract article content from a blog or news URL
argument-hint: <url>
allowed-tools: Bash(npx tsx:*), Bash(node:*), Read, Write
---

# Scrape Command

Extract content from the URL: $ARGUMENTS

## Instructions

1. First, determine if the URL looks like a single article or a listing page
2. Use the appropriate scraper function:
   - For single articles: `extractArticle(url)`
   - For listing pages: `scrapeWebsite(url, { maxArticles: 5 })`
   - If unsure: `smartScrape(url)`

3. Create a temporary script to run the scraper:

```typescript
import { smartScrape } from '@tyroneross/omniscraper';

async function main() {
  const url = '$ARGUMENTS';
  console.log('Scraping:', url);

  const result = await smartScrape(url);

  if (result.mode === 'article') {
    console.log('\n📄 Article Extracted:\n');
    console.log('Title:', result.article.title);
    console.log('Words:', result.article.wordCount);
    console.log('Reading time:', result.article.readingTime, 'min');
    console.log('\n--- Excerpt ---');
    console.log(result.article.excerpt);
    console.log('\n--- Full Markdown ---');
    console.log(result.article.markdown.substring(0, 2000) + '...');
  } else if (result.mode === 'listing') {
    console.log('\n📚 Articles Discovered:', result.articles.length);
    for (const a of result.articles.slice(0, 5)) {
      console.log(`\n- ${a.title}`);
      console.log(`  ${a.url}`);
      if (a.publishedDate) console.log(`  Published: ${a.publishedDate}`);
    }
  } else {
    console.log('❌ Failed:', result.error);
  }
}

main().catch(console.error);
```

4. Run with: `npx tsx <script-file>`

5. Report results to the user including:
   - Title and source
   - Word count and reading time
   - A preview of the content
   - Any errors encountered
