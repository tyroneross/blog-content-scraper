# web-scraper — Blog & News Content Extraction

The `web-scraper` plugin extracts article content from any blog or news site and returns LLM-ready markdown with token counts. It handles single articles, listing pages (via RSS/sitemap/HTML discovery), and batch URL sets — auto-detecting the right path for each input.

**Plugin name:** `web-scraper` v0.5.0
**npm package:** `@tyroneross/scraper-app`
**Plugin manifests:** `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`

## How Codex uses it

The skill is host-neutral. Codex writes a short inline TypeScript script and runs it with `npx tsx`. Import from the local `lib/` tree using the plugin root env var — do not import from the npm package name inside the repo itself.

### Core import surface (`lib/index.ts`)

| Function | Signature | Use for |
|----------|-----------|---------|
| `smartScrape` | `(url, opts?) → { mode, article\|articles, stats, detectedAs }` | Auto-detect article vs listing — default entry point |
| `extractArticle` | `(url) → SingleArticleResult \| null` | Known single article URL — fastest path |
| `scrapeWebsite` | `(url, opts?) → ScrapeResult` | Listing/discovery mode — RSS, sitemap, or HTML crawl |

### LLM import (`lib/llm/`)

| Function | Import | Use for |
|----------|--------|---------|
| `scrapeForLLM` | `@tyroneross/scraper-app/llm` | Token counts + RAG chunks in one call |

### Batch import (`lib/batch/`)

| Function | Import | Use for |
|----------|--------|---------|
| `scrapeUrls` | `@tyroneross/scraper-app/batch` | Parallel multi-URL extraction with progress callback |

### Key options for `smartScrape` / `scrapeWebsite`

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `maxArticles` | number | 10 | Cap on articles returned in listing mode |
| `qualityThreshold` | number | 0.3 | Minimum quality score (0–1); articles below this are dropped |
| `forceMode` | `'article'\|'listing'` | auto | Override URL-type detection |
| `sourceType` | `'auto'\|'rss'\|'sitemap'\|'html'` | `'auto'` | Force discovery strategy |

### Inline script pattern

```typescript
// scrape.ts — write this file, run with: npx tsx scrape.ts
import { smartScrape } from '${PLUGIN_ROOT}/lib';

const result = await smartScrape('https://example.com/blog/post', {
  maxArticles: 10,
  qualityThreshold: 0.3,
});

if (result.mode === 'article') {
  console.log(result.article.title, result.article.markdown);
} else if (result.mode === 'listing') {
  result.articles.forEach(a => console.log(a.title, a.url));
} else {
  console.error('Failed:', result.error);
}
```

Replace `${PLUGIN_ROOT}` with the absolute path to this repo's root (e.g. `~/dev/git-folder/blog-content-scraper`).

## Slash commands → direct `npx tsx` equivalents

| Command | Invokes | Direct equivalent |
|---------|---------|-------------------|
| `/web-scraper:scrape <url>` | `smartScrape(url)` | `npx tsx scrape.ts` importing `smartScrape` from `lib/` |
| `/web-scraper:scrape-llm <url>` | `scrapeForLLM(url)` | `npx tsx scrape-llm.ts` importing `scrapeForLLM` from `lib/llm` |
| `/web-scraper:scrape-batch <url1> <url2> ...` | `scrapeUrls(urls, { concurrency: 3 })` | `npx tsx scrape-batch.ts` importing `scrapeUrls` from `lib/batch` |

## Output shape

`extractArticle` returns `SingleArticleResult`:
- `title`, `markdown`, `text`, `html`, `excerpt`
- `wordCount`, `readingTime`, `confidence`, `extractionMethod`
- `author`, `publishedDate`, `siteName`, `lang`
- `structured` — JSON-LD, OpenGraph, Twitter Card if present

`scrapeWebsite` returns `ScrapeResult`:
- `articles[]` — each with `url`, `title`, `fullContentMarkdown`, `qualityScore`, `confidence`
- `stats` — `totalDiscovered`, `afterQualityFilter`, `processingTime`
- `detectedType` — `rss` | `sitemap` | `html` | `single-article`

`scrapeForLLM` returns:
- `markdown`, `title`, `tokens` (estimated), `chunks[]` (RAG-ready), `frontmatter`
