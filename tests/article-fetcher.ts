/**
 * Article Fetcher
 *
 * Helper script to fetch HTML from public URLs for testing.
 * Saves HTML files to tests/data/ for F1 validation.
 */

import * as fs from 'fs';
import * as path from 'path';

interface ArticleSource {
  name: string;
  url: string;
  category: string;
  publisher: string;
  notes?: string;
}

/**
 * Curated list of diverse, publicly accessible articles
 * for F1 score validation testing.
 *
 * Selection criteria:
 * - Diverse content types (news, tech, tutorials, opinion)
 * - Different publishers and HTML structures
 * - Mix of old and modern web pages
 * - Publicly accessible (no paywalls)
 * - Well-structured article content
 */
export const TEST_ARTICLE_SOURCES: ArticleSource[] = [
  // News Articles
  {
    name: "bbc-climate-article",
    url: "https://www.bbc.com/news/science-environment-58982445",
    category: "news",
    publisher: "BBC",
    notes: "Major news outlet, clean article structure"
  },
  {
    name: "guardian-tech-article",
    url: "https://www.theguardian.com/technology/2023/sep/05/ai-chatgpt-artificial-intelligence",
    category: "news",
    publisher: "The Guardian",
    notes: "UK news, good for testing international sites"
  },
  {
    name: "npr-science-article",
    url: "https://www.npr.org/sections/health-shots/2023/09/16/1199941425/chatgpt-ai-health-care-diagnosis",
    category: "news",
    publisher: "NPR",
    notes: "US public radio, multimedia content"
  },

  // Tech Publications
  {
    name: "arstechnica-review",
    url: "https://arstechnica.com/gadgets/2023/06/iphone-15-pro-review/",
    category: "tech-review",
    publisher: "Ars Technica",
    notes: "Detailed tech review with specs"
  },
  {
    name: "techcrunch-startup",
    url: "https://techcrunch.com/2023/09/14/ai-startup-funding/",
    category: "tech-news",
    publisher: "TechCrunch",
    notes: "Startup/business tech news"
  },
  {
    name: "theverge-feature",
    url: "https://www.theverge.com/23882140/ai-chatbot-hallucination-problem-future",
    category: "tech-feature",
    publisher: "The Verge",
    notes: "Long-form tech journalism"
  },

  // Developer Blogs
  {
    name: "css-tricks-tutorial",
    url: "https://css-tricks.com/snippets/css/a-guide-to-flexbox/",
    category: "tutorial",
    publisher: "CSS-Tricks",
    notes: "Technical tutorial with code examples"
  },
  {
    name: "smashing-magazine-article",
    url: "https://www.smashingmagazine.com/2023/08/accessibility-first-approach-web-development/",
    category: "tutorial",
    publisher: "Smashing Magazine",
    notes: "Web development best practices"
  },

  // Medium Articles (various topics)
  {
    name: "medium-programming",
    url: "https://medium.com/@user/article-slug",
    category: "blog",
    publisher: "Medium",
    notes: "User-generated content platform"
  },

  // Wikipedia (reference)
  {
    name: "wikipedia-machine-learning",
    url: "https://en.wikipedia.org/wiki/Machine_learning",
    category: "reference",
    publisher: "Wikipedia",
    notes: "Encyclopedia article, complex structure"
  },

  // Opinion/Commentary
  {
    name: "nytimes-opinion",
    url: "https://www.nytimes.com/2023/09/15/opinion/ai-regulation.html",
    category: "opinion",
    publisher: "New York Times",
    notes: "Opinion piece - different structure"
  },

  // Science/Academic
  {
    name: "scientific-american",
    url: "https://www.scientificamerican.com/article/quantum-computing-breakthrough/",
    category: "science",
    publisher: "Scientific American",
    notes: "Science journalism"
  },

  // Long-form Journalism
  {
    name: "wired-longform",
    url: "https://www.wired.com/story/future-of-work-remote-ai/",
    category: "feature",
    publisher: "Wired",
    notes: "Long-form feature article"
  },

  // Business News
  {
    name: "bloomberg-business",
    url: "https://www.bloomberg.com/news/articles/tech-industry-trends",
    category: "business",
    publisher: "Bloomberg",
    notes: "Business journalism"
  },

  // Technology Documentation
  {
    name: "mdn-web-docs",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction",
    category: "documentation",
    publisher: "MDN",
    notes: "Technical documentation"
  }
];

async function fetchArticle(source: ArticleSource, outputDir: string): Promise<void> {
  try {
    console.log(`Fetching: ${source.name} from ${source.publisher}...`);

    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const filename = `${source.name}.html`;
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, html, 'utf-8');
    console.log(`  ✅ Saved to ${filename} (${Math.round(html.length / 1024)}KB)`);

  } catch (error) {
    console.error(`  ❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function fetchAllArticles() {
  const outputDir = path.join(__dirname, 'data', 'real-articles');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`\n📥 Fetching ${TEST_ARTICLE_SOURCES.length} test articles...\n`);

  for (const source of TEST_ARTICLE_SOURCES) {
    await fetchArticle(source, outputDir);
    // Rate limit: wait 1 second between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n✅ Fetch complete! Articles saved to ${outputDir}\n`);
  console.log(`Next steps:`);
  console.log(`1. Review fetched HTML files`);
  console.log(`2. Extract ground truth content for each article`);
  console.log(`3. Update tests/test-dataset.ts with new articles`);
}

// Run if called directly
if (require.main === module) {
  fetchAllArticles().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
