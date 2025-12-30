/**
 * SDK Sandbox Test
 * Run with: npx tsx test-sdk.ts
 */

import { scrapeWebsite } from './lib';

async function testSDK() {
  console.log('🧪 Testing Blog Content Scraper SDK\n');

  // Test 1: TechCrunch (RSS-based site)
  console.log('Test 1: Scraping TechCrunch (RSS)...');
  try {
    const result = await scrapeWebsite('https://techcrunch.com', {
      maxArticles: 3,
      extractFullContent: false, // Fast mode for testing
      qualityThreshold: 0.3
    });

    console.log(`✅ Detected type: ${result.detectedType}`);
    console.log(`✅ Articles found: ${result.articles.length}`);
    console.log(`✅ Processing time: ${result.stats.processingTime}ms`);

    if (result.articles.length > 0) {
      console.log('\nFirst article:');
      const article = result.articles[0];
      console.log(`  Title: ${article.title}`);
      console.log(`  URL: ${article.url}`);
      console.log(`  Quality: ${(article.qualityScore * 100).toFixed(0)}%`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error}`);
  }

  console.log('\n---\n');

  // Test 2: Anthropic (sitemap-based)
  console.log('Test 2: Scraping Anthropic News (sitemap)...');
  try {
    const result = await scrapeWebsite('https://www.anthropic.com/news', {
      maxArticles: 3,
      extractFullContent: false,
      qualityThreshold: 0.3
    });

    console.log(`✅ Detected type: ${result.detectedType}`);
    console.log(`✅ Articles found: ${result.articles.length}`);
    console.log(`✅ Processing time: ${result.stats.processingTime}ms`);

    if (result.articles.length > 0) {
      console.log('\nFirst article:');
      const article = result.articles[0];
      console.log(`  Title: ${article.title}`);
      console.log(`  URL: ${article.url}`);
      console.log(`  Quality: ${(article.qualityScore * 100).toFixed(0)}%`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error}`);
  }

  console.log('\n---\n');

  // Test 3: With full content extraction
  console.log('Test 3: Full content extraction (1 article)...');
  try {
    const result = await scrapeWebsite('https://techcrunch.com', {
      maxArticles: 1,
      extractFullContent: true,
      qualityThreshold: 0.3,
      onProgress: (done, total) => {
        console.log(`  Progress: ${done}/${total}`);
      }
    });

    if (result.articles.length > 0) {
      const article = result.articles[0];
      console.log(`✅ Title: ${article.title}`);
      console.log(`✅ Has fullContent: ${!!article.fullContent}`);
      console.log(`✅ Has markdown: ${!!article.fullContentMarkdown}`);
      console.log(`✅ Has plainText: ${!!article.fullContentText}`);
      if (article.fullContentText) {
        console.log(`✅ Text length: ${article.fullContentText.length} chars`);
      }
    }
  } catch (error) {
    console.log(`❌ Error: ${error}`);
  }

  console.log('\n✅ SDK tests complete!');
}

testSDK().catch(console.error);
