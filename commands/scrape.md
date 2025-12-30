---
description: Scrape blog/news content from a website URL
---

# Scrape Command

Scrape the website at "$ARGUMENTS" for blog/news content.

## Instructions

1. Create a temporary script to scrape the URL using the SDK:

```typescript
import { scrapeWebsite } from '${CLAUDE_PLUGIN_ROOT}/lib';

const result = await scrapeWebsite('$ARGUMENTS', {
  maxArticles: 5,
  extractFullContent: false,
  qualityThreshold: 0.3
});

console.log(JSON.stringify(result, null, 2));
```

2. Run the script with `npx tsx`

3. Report the results:
   - Source type detected (RSS/sitemap/HTML)
   - Number of articles found
   - Top articles with titles and quality scores
   - Any errors encountered

If no URL is provided, ask the user for a website URL to scrape.
