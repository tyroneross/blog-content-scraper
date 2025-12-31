---
description: Extract LLM-ready content with token counts and chunks from a URL
argument-hint: <url>
allowed-tools: Bash(npx tsx:*), Bash(node:*), Read, Write
---

# Scrape for LLM Command

Extract LLM-optimized content from: $ARGUMENTS

## Instructions

Use `scrapeForLLM` to get content formatted for AI/LLM use with token estimation.

```typescript
import { scrapeForLLM } from '@tyroneross/blog-scraper/llm';

async function main() {
  const url = '$ARGUMENTS';
  console.log('Extracting LLM-ready content from:', url);

  try {
    const output = await scrapeForLLM(url);

    console.log('\n📊 Content Stats:');
    console.log('Title:', output.title);
    console.log('Tokens:', output.tokens);
    console.log('Chunks:', output.chunks.length);
    console.log('Reading Level:', output.metadata.readingLevel);

    console.log('\n📝 Frontmatter (for prompts):');
    console.log(output.frontmatter);

    console.log('\n📄 Content Preview (first 1500 chars):');
    console.log(output.markdown.substring(0, 1500) + '...');

    if (output.chunks.length > 1) {
      console.log('\n🧩 Chunks for RAG:');
      output.chunks.forEach((c, i) => {
        console.log(`  Chunk ${i + 1}: ${c.tokens} tokens`);
      });
    }
  } catch (error) {
    console.error('❌ Extraction failed:', error.message);
  }
}

main();
```

Run with: `npx tsx <script-file>`

Report to user:
- Token count (important for context windows)
- Content preview
- Chunk breakdown if content is large
