import { NextRequest, NextResponse } from 'next/server';
import { globalSourceOrchestrator } from '@/lib/source-orchestrator';
import { calculateArticleQualityScore, DEFAULT_DENY_PATHS } from '@/lib/quality-scorer';
import { circuitBreakers } from '@/lib/circuit-breaker';
import { convertToMarkdown } from '@/lib/formatters/html-to-markdown';
import { cleanText, stripHTML } from '@/lib/formatters/text-cleaner';
import { z } from 'zod';

const ScraperTestRequestSchema = z.object({
  url: z.string().url('Invalid URL format'),
  sourceType: z.enum(['auto', 'rss', 'sitemap', 'html']).optional().default('auto'),
  maxArticles: z.number().int().min(1).max(50).optional().default(10),
  extractFullContent: z.boolean().optional().default(true),
  denyPaths: z.array(z.string()).optional(),
  qualityThreshold: z.number().min(0).max(1).optional().default(0.3),  // Lowered to allow sitemap-only results
});

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get Perplexity API key from header (optional)
    const perplexityApiKey = request.headers.get('X-Perplexity-API-Key');
    if (perplexityApiKey) {
      // Temporarily set environment variable for this request
      process.env.PERPLEXITY_API_KEY = perplexityApiKey;
    }

    const body = await request.json();
    const validation = ScraperTestRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { url, sourceType, maxArticles, extractFullContent, denyPaths, qualityThreshold } = validation.data;
    const finalDenyPaths = denyPaths && denyPaths.length > 0 ? denyPaths : DEFAULT_DENY_PATHS;

    console.log(`🧪 [ScraperTest] Testing ${url} (type: ${sourceType})`);

    // Use Source Orchestrator to discover and extract articles
    // Note: Don't pass allowPaths - let orchestrator infer from URL
    const result = await globalSourceOrchestrator.processSource(url, {
      sourceType,
      // allowPaths intentionally omitted - orchestrator will infer from URL path
      denyPaths: finalDenyPaths,
      detectOnly: false,
      circuitBreaker: circuitBreakers.scrapingTest,
    });

    console.log(`🧪 [ScraperTest] Discovered ${result.articles.length} articles from ${result.sourceInfo.detectedType}`);

    // Optionally extract full content for articles
    let enhancedArticles = result.articles.slice(0, maxArticles);

    if (extractFullContent) {
      console.log(`📖 [ScraperTest] Extracting full content for ${enhancedArticles.length} articles...`);
      enhancedArticles = await globalSourceOrchestrator.enhanceWithFullContent(
        enhancedArticles,
        maxArticles
      );
    }

    // Calculate quality scores and filter
    const scoredArticles = enhancedArticles.map(article => {
      const extracted = {
        title: article.title,
        excerpt: article.excerpt,
        content: article.content,
        textContent: article.content || '',
        publishedTime: article.publishedAt.toISOString(),
      };

      const qualityScore = calculateArticleQualityScore(extracted);

      // Prepare multiple content formats
      const fullContent = extractFullContent ? article.content : null;
      const fullContentMarkdown = fullContent ? convertToMarkdown(fullContent) : null;
      const fullContentText = fullContent ? cleanText(stripHTML(fullContent)) : null;

      return {
        url: article.url,
        title: article.title,
        publishedDate: article.publishedAt.toISOString(),
        description: article.excerpt,
        fullContent, // Raw HTML
        fullContentMarkdown, // Formatted Markdown
        fullContentText, // Plain text
        confidence: article.confidence,
        source: article.source,
        qualityScore,
        metadata: article.metadata,
      };
    });

    // Apply quality threshold
    const filteredArticles = scoredArticles.filter(a => a.qualityScore >= qualityThreshold);

    const stats = {
      totalDiscovered: result.articles.length,
      afterDenyFilter: result.articles.length,
      attempted: enhancedArticles.length,
      successful: result.sourceInfo.extractionStats.successful,
      failed: result.sourceInfo.extractionStats.failed,
      filtered: scoredArticles.length - filteredArticles.length,
      afterContentValidation: scoredArticles.length,
      afterQualityFilter: filteredArticles.length,
    };

    return NextResponse.json({
      url,
      detectedType: result.sourceInfo.detectedType,
      discoveredFeeds: result.sourceInfo.discoveredFeeds,
      discoveredSitemaps: result.sourceInfo.discoveredSitemaps,
      confidence: 'high',
      articles: filteredArticles,
      extractionStats: stats,
      processingTime: Date.now() - startTime,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ScraperTest] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
