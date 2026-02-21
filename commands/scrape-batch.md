---
description: Batch scrape multiple URLs with progress tracking
argument-hint: <url1> <url2> [url3...]
allowed-tools: Bash(npx tsx:*), Bash(node:*), Read, Write
---

# Batch Scrape Command

Process multiple URLs: $ARGUMENTS

## Instructions

Parse the URLs from the arguments (comma or space separated) and use batch processing.

```typescript
import { scrapeUrls } from '@tyroneross/omniscraper/batch';

async function main() {
  // Parse URLs from arguments
  const input = '$ARGUMENTS';
  const urls = input.split(/[,\s]+/).filter(u => u.startsWith('http'));

  if (urls.length === 0) {
    console.log('No valid URLs found. Provide URLs separated by spaces or commas.');
    return;
  }

  console.log(`\n🔄 Processing ${urls.length} URLs...\n`);

  const result = await scrapeUrls(urls, {
    concurrency: 3,
    mode: 'smart',
    onProgress: (p) => {
      console.log(`Progress: ${p.completed}/${p.total} (${p.percentage}%)`);
    }
  });

  console.log('\n📊 Results:');
  console.log(`✅ Successful: ${result.stats.successful}`);
  console.log(`❌ Failed: ${result.stats.failed}`);
  console.log(`⏱️ Duration: ${result.stats.totalDurationMs}ms`);

  console.log('\n📄 Extracted Articles:');
  for (const article of result.articles.slice(0, 10)) {
    console.log(`\n- ${article.title}`);
    console.log(`  Source: ${article.sourceUrl}`);
  }

  if (result.failed.length > 0) {
    console.log('\n❌ Failed URLs:');
    for (const f of result.failed) {
      console.log(`- ${f.url}: ${f.error}`);
    }
  }
}

main().catch(console.error);
```

Run with: `npx tsx <script-file>`
