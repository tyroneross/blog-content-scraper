# Feature Implementation Plan

## Priority Matrix

| Feature | Complexity | Effort | Priority | Phase |
|---------|------------|--------|----------|-------|
| **Quick Wins** |||||
| Expose retry config | 1 | 2-3h | P0 | 1 |
| Expose timeout config | 1 | 1-2h | P0 | 1 |
| Format transformers | 2 | 3-4h | P1 | 1 |
| Mock/test mode | 2 | 4-6h | P1 | 1 |
| **LLM Core** |||||
| LLM-ready output | 3 | 6-10h | P0 | 2 |
| Structured metadata | 3 | 8-12h | P1 | 2 |
| Debug mode | 2 | 4-6h | P2 | 2 |
| **Reliability** |||||
| Caching layer | 4 | 12-16h | P0 | 3 |
| Proxy support | 2 | 4-6h | P1 | 3 |
| URL validation | 2 | 4-6h | P1 | 3 |
| **Developer Experience** |||||
| React hook | 3 | 8-12h | P0 | 4 |
| Express router | 2 | 4-6h | P1 | 4 |
| Batch operations | 2 | 4-6h | P2 | 4 |

## Phase 1: Quick Wins (v0.4.0)

### Already Implemented
- ✅ Retry with backoff (exists in rate limiter)
- ✅ Timeout (exists in circuit breaker)
- ✅ Format transformers (markdown, text, HTML exist)

### To Implement
1. **Expose config in ScrapeOptions**
   ```typescript
   interface ScrapeOptions {
     retry?: { maxRetries?: number; baseDelayMs?: number };
     timeout?: { requestMs?: number; totalMs?: number };
   }
   ```

2. **Mock/test mode**
   ```typescript
   // lib/testing/mock.ts
   export function createMockScraper(fixtures?: MockArticle[]);
   export function enableMockMode();
   ```

---

## Phase 2: LLM Core (v0.5.0) - HIGHEST VALUE

### 1. LLM-Ready Output
```typescript
// lib/formatters/llm.ts
export interface LLMOutput {
  content: string;           // Clean text
  tokenCount: number;        // Estimated tokens
  frontmatter: string;       // YAML metadata
  document: string;          // frontmatter + content
  chunks: LLMChunk[];        // For RAG/context windows
}

export function toLLMFormat(article: SingleArticleResult): LLMOutput;

// Dream API
export async function scrapeForLLM(url: string): Promise<{
  markdown: string;
  tokens: number;
  title: string;
  excerpt: string;
}>;
```

### 2. Structured Metadata
```typescript
interface StructuredMetadata {
  author?: { name: string; url?: string };
  tags?: string[];
  categories?: string[];
  readingLevel?: 'elementary' | 'intermediate' | 'advanced';
  readingGrade?: number;     // Flesch-Kincaid
  language?: { code: string; confidence: number };
  estimatedTokens?: number;
}
```

### 3. Debug Mode
```typescript
interface DebugMetrics {
  totalTime: number;
  phases: { discovery: number; extraction: number; formatting: number };
  network: { requests: number; bytes: number; avgLatency: number };
  cache: { hits: number; misses: number };
}
```

---

## Phase 3: Reliability (v0.6.0)

### 1. Caching Layer
```typescript
interface CacheConfig {
  provider: 'memory' | 'file' | 'redis';
  ttlMs?: number;            // default: 1 hour
  maxSize?: number;          // memory limit
}

const scraper = createScraper({ cache: { provider: 'memory', ttlMs: 3600000 } });
```

### 2. Proxy Support
```typescript
interface ProxyConfig {
  url: string;
  auth?: { username: string; password: string };
  rotation?: 'round-robin' | 'random';
}
```

### 3. URL Validation
```typescript
interface ValidationResult {
  isReachable: boolean;
  robotsAllowed: boolean;
  hasPaywall: boolean;
  suggestedAction: 'scrape' | 'skip' | 'use-proxy';
}

export async function validateUrl(url: string): Promise<ValidationResult>;
```

---

## Phase 4: Developer Experience (v0.7.0)

### 1. React Hook
```typescript
// @tyroneross/omniparse/react
export function useScraper() {
  return { scrape, data, isLoading, error, progress, cancel };
}
```

### 2. Express Router
```typescript
// @tyroneross/omniparse/express
export function createScraperRouter(): Router;
// Adds: POST /scrape, POST /extract, GET /validate
```

### 3. Batch Operations
```typescript
export async function scrapeUrls(urls: string[], options?: BatchOptions): Promise<Map<string, Result>>;
```

---

## Dependency Graph

```
Phase 1 (Foundation)
    │
    ├── #7 Retry config (expose existing)
    ├── #8 Timeout config (expose existing)
    ├── #4 Format API (unify existing)
    └── #2 Mock mode (new)
           │
           v
Phase 2 (LLM Core) ← HIGHEST VALUE
    │
    ├── #5 LLM output (depends on #4)
    ├── #6 Metadata extraction
    └── #12 Debug mode
           │
           v
Phase 3 (Reliability)
    │
    ├── #10 Caching (foundational)
    ├── #9 Proxy support
    └── #13 URL validation (uses #9)
           │
           v
Phase 4 (DX)
    │
    ├── #1 React hook
    ├── #3 Express router
    └── #11 Batch (uses #10)
```

---

## Package Exports Structure

```
@tyroneross/omniparse
├── index          # Core: scrapeWebsite, extractArticle, smartScrape
├── /llm           # toLLMFormat, scrapeForLLM
├── /react         # useScraper hook
├── /express       # createScraperRouter
├── /testing       # createMockScraper, enableMockMode
└── /cache         # createCache, MemoryCache, FileCache
```

---

## Test Plan

### Unit Tests
- [ ] LLM format output matches spec
- [ ] Token count estimation accuracy (±10%)
- [ ] Frontmatter YAML is valid
- [ ] Chunk overlap is correct
- [ ] Reading level calculation

### Integration Tests
- [ ] scrapeForLLM returns all fields
- [ ] Cache hit returns same result
- [ ] Proxy rotation works
- [ ] React hook state transitions
- [ ] Express router error handling

### E2E Tests (Sandbox)
- [ ] Real URL → LLM output → Token count valid
- [ ] Batch 10 URLs with concurrency 2
- [ ] Cache persists across invocations
- [ ] Mock mode returns deterministic data

---

## Estimated Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1 | 1 week | v0.4.0 - Config exposure |
| Phase 2 | 1.5 weeks | v0.5.0 - LLM core |
| Phase 3 | 1.5 weeks | v0.6.0 - Reliability |
| Phase 4 | 1 week | v0.7.0 - DX integrations |

**Total: ~5 weeks to v0.7.0**

---

## Quick Start Implementation

Start with the highest-value feature for prompt testing:

```typescript
// lib/llm.ts - THE DREAM API
export async function scrapeForLLM(url: string): Promise<{
  markdown: string;
  tokens: number;
  title: string;
  excerpt: string;
  metadata: StructuredMetadata;
}> {
  const article = await extractArticle(url);
  if (!article) throw new Error(`Failed to extract: ${url}`);

  return {
    markdown: article.markdown,
    tokens: estimateTokens(article.text),
    title: article.title,
    excerpt: article.excerpt,
    metadata: extractStructuredMetadata(article)
  };
}
```

This single function addresses the core use case immediately.
