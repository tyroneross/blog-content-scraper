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
  qualityThreshold: z.number().min(0).max(1).optional().default(0.3),
  stream: z.boolean().optional().default(false),
});

// Progress phases with weights for percentage calculation
const PHASES = {
  init: { weight: 5, status: 'Initializing...' },
  detecting: { weight: 10, status: 'Detecting sources' },
  discovering: { weight: 25, status: 'Finding articles' },
  extracting: { weight: 45, status: 'Extracting content' },
  scoring: { weight: 10, status: 'Scoring quality' },
  complete: { weight: 5, status: 'Complete' },
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const perplexityApiKey = request.headers.get('X-Perplexity-API-Key');
    if (perplexityApiKey) {
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

    const { url, sourceType, maxArticles, extractFullContent, denyPaths, qualityThreshold, stream } = validation.data;
    const finalDenyPaths = denyPaths && denyPaths.length > 0 ? denyPaths : DEFAULT_DENY_PATHS;

    // Streaming response
    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const sendProgress = (phase: string, percent: number, detail?: string) => {
            const data = JSON.stringify({ type: 'progress', phase, percent, detail });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          };

          const sendResult = (result: unknown) => {
            const data = JSON.stringify({ type: 'result', data: result });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            controller.close();
          };

          const sendError = (error: string) => {
            const data = JSON.stringify({ type: 'error', error });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            controller.close();
          };

          try {
            sendProgress('init', 5, 'Starting scraper');

            sendProgress('detecting', 10, 'Checking RSS/sitemap');

            const result = await globalSourceOrchestrator.processSource(url, {
              sourceType,
              denyPaths: finalDenyPaths,
              detectOnly: false,
              circuitBreaker: circuitBreakers.scrapingTest,
            });

            sendProgress('discovering', 35, `Found ${result.articles.length} articles`);

            let enhancedArticles = result.articles.slice(0, maxArticles);

            if (extractFullContent && enhancedArticles.length > 0) {
              const total = enhancedArticles.length;
              let extracted = 0;

              // Extract with progress updates
              const enhanced = [];
              for (const article of enhancedArticles) {
                const [enriched] = await globalSourceOrchestrator.enhanceWithFullContent([article], 1);
                enhanced.push(enriched);
                extracted++;
                const percent = 35 + Math.round((extracted / total) * 45);
                sendProgress('extracting', percent, `Extracting ${extracted}/${total}`);
              }
              enhancedArticles = enhanced;
            } else {
              sendProgress('extracting', 80, 'Skipped extraction');
            }

            sendProgress('scoring', 90, 'Scoring articles');

            const scoredArticles = enhancedArticles.map(article => {
              const extracted = {
                title: article.title,
                excerpt: article.excerpt,
                content: article.content,
                textContent: article.content || '',
                publishedTime: article.publishedAt.toISOString(),
              };

              const qualityScore = calculateArticleQualityScore(extracted);
              const fullContent = extractFullContent ? article.content : null;

              return {
                url: article.url,
                title: article.title,
                publishedDate: article.publishedAt.toISOString(),
                description: article.excerpt,
                fullContent,
                fullContentMarkdown: fullContent ? convertToMarkdown(fullContent) : null,
                fullContentText: fullContent ? cleanText(stripHTML(fullContent)) : null,
                confidence: article.confidence,
                source: article.source,
                qualityScore,
                metadata: article.metadata,
              };
            });

            const filteredArticles = scoredArticles.filter(a => a.qualityScore >= qualityThreshold);

            sendProgress('complete', 100, `${filteredArticles.length} articles ready`);

            sendResult({
              url,
              detectedType: result.sourceInfo.detectedType,
              discoveredFeeds: result.sourceInfo.discoveredFeeds,
              discoveredSitemaps: result.sourceInfo.discoveredSitemaps,
              confidence: 'high',
              articles: filteredArticles,
              extractionStats: {
                totalDiscovered: result.articles.length,
                afterDenyFilter: result.articles.length,
                attempted: enhancedArticles.length,
                successful: result.sourceInfo.extractionStats.successful,
                failed: result.sourceInfo.extractionStats.failed,
                filtered: scoredArticles.length - filteredArticles.length,
                afterContentValidation: scoredArticles.length,
                afterQualityFilter: filteredArticles.length,
              },
              processingTime: Date.now() - startTime,
              errors: result.errors,
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            sendError(error instanceof Error ? error.message : 'Unknown error');
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming response (original behavior)
    console.log(`🧪 [ScraperTest] Testing ${url} (type: ${sourceType})`);

    const result = await globalSourceOrchestrator.processSource(url, {
      sourceType,
      denyPaths: finalDenyPaths,
      detectOnly: false,
      circuitBreaker: circuitBreakers.scrapingTest,
    });

    console.log(`🧪 [ScraperTest] Discovered ${result.articles.length} articles from ${result.sourceInfo.detectedType}`);

    let enhancedArticles = result.articles.slice(0, maxArticles);

    if (extractFullContent) {
      console.log(`📖 [ScraperTest] Extracting full content for ${enhancedArticles.length} articles...`);
      enhancedArticles = await globalSourceOrchestrator.enhanceWithFullContent(
        enhancedArticles,
        maxArticles
      );
    }

    const scoredArticles = enhancedArticles.map(article => {
      const extracted = {
        title: article.title,
        excerpt: article.excerpt,
        content: article.content,
        textContent: article.content || '',
        publishedTime: article.publishedAt.toISOString(),
      };

      const qualityScore = calculateArticleQualityScore(extracted);
      const fullContent = extractFullContent ? article.content : null;
      const fullContentMarkdown = fullContent ? convertToMarkdown(fullContent) : null;
      const fullContentText = fullContent ? cleanText(stripHTML(fullContent)) : null;

      return {
        url: article.url,
        title: article.title,
        publishedDate: article.publishedAt.toISOString(),
        description: article.excerpt,
        fullContent,
        fullContentMarkdown,
        fullContentText,
        confidence: article.confidence,
        source: article.source,
        qualityScore,
        metadata: article.metadata,
      };
    });

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
