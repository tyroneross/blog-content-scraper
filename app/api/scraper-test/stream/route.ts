import { NextRequest } from 'next/server';
import { globalSourceOrchestrator } from '@/lib/source-orchestrator';
import { calculateArticleQualityScore, DEFAULT_DENY_PATHS } from '@/lib/quality-scorer';
import { circuitBreakers } from '@/lib/circuit-breaker';
import { convertToMarkdown } from '@/lib/formatters/html-to-markdown';
import { cleanText, stripHTML } from '@/lib/formatters/text-cleaner';
import { z } from 'zod';

const ScraperTestRequestSchema = z.object({
  url: z.string().url('Invalid URL format'),
  sourceType: z.enum(['auto', 'rss', 'sitemap', 'html']).optional().default('auto'),
  maxArticles: z.number().int().min(1).max(50).optional().default(5),
  extractFullContent: z.boolean().optional().default(true),
  allowPaths: z.array(z.string()).optional(),
  denyPaths: z.array(z.string()).optional(),
  qualityThreshold: z.number().min(0).max(1).optional().default(0.5),
});

// Progress stages for the UI
type ProgressStage =
  | 'rss_check'
  | 'sitemap_discovery'
  | 'subdomain_check'
  | 'content_extraction'
  | 'quality_filtering'
  | 'complete';

interface ProgressEvent {
  type: 'progress';
  stage: ProgressStage;
  message: string;
  percent: number;
  details?: string;
}

interface ResultEvent {
  type: 'result';
  data: any;
}

interface ErrorEvent {
  type: 'error';
  message: string;
}

type StreamEvent = ProgressEvent | ResultEvent | ErrorEvent;

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Create a TransformStream for SSE
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: StreamEvent) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    await writer.write(encoder.encode(data));
  };

  // Process in background
  (async () => {
    try {
      const body = await request.json();
      const validation = ScraperTestRequestSchema.safeParse(body);

      if (!validation.success) {
        await sendEvent({
          type: 'error',
          message: `Invalid request: ${validation.error.errors.map(e => e.message).join(', ')}`
        });
        await writer.close();
        return;
      }

      const { url, sourceType, maxArticles, extractFullContent, allowPaths, denyPaths, qualityThreshold } = validation.data;
      const finalAllowPaths = allowPaths && allowPaths.length > 0 ? allowPaths : [];
      const finalDenyPaths = denyPaths && denyPaths.length > 0 ? denyPaths : DEFAULT_DENY_PATHS;

      // Stage 1: RSS Check (0-20%)
      await sendEvent({
        type: 'progress',
        stage: 'rss_check',
        message: 'Checking RSS feeds...',
        percent: 5,
        details: `Checking ${url} for RSS feeds`
      });

      // Stage 2: Sitemap Discovery (20-40%)
      await sendEvent({
        type: 'progress',
        stage: 'sitemap_discovery',
        message: 'Discovering sitemaps...',
        percent: 20,
        details: 'Looking for sitemap.xml and robots.txt'
      });

      // Use Source Orchestrator to discover and extract articles
      const result = await globalSourceOrchestrator.processSource(url, {
        sourceType,
        allowPaths: finalAllowPaths,
        denyPaths: finalDenyPaths,
        detectOnly: false,
        circuitBreaker: circuitBreakers.scrapingTest,
      });

      // Stage 3: Subdomain Check (40-50%)
      await sendEvent({
        type: 'progress',
        stage: 'subdomain_check',
        message: 'Checking blog subdomains...',
        percent: 45,
        details: `Found ${result.articles.length} candidate articles`
      });

      // Stage 4: Content Extraction (50-80%)
      let enhancedArticles = result.articles.slice(0, maxArticles);

      if (extractFullContent && enhancedArticles.length > 0) {
        await sendEvent({
          type: 'progress',
          stage: 'content_extraction',
          message: 'Extracting article content...',
          percent: 55,
          details: `Processing ${enhancedArticles.length} articles`
        });

        // Enhanced version with progress callback
        let extractionProgress = 0;
        enhancedArticles = await globalSourceOrchestrator.enhanceWithFullContent(
          enhancedArticles,
          maxArticles,
          {
            onProgress: async (completed, total) => {
              extractionProgress = Math.round((completed / total) * 25) + 55; // 55-80%
              await sendEvent({
                type: 'progress',
                stage: 'content_extraction',
                message: 'Extracting article content...',
                percent: extractionProgress,
                details: `Extracted ${completed}/${total} articles`
              });
            }
          }
        );
      }

      // Stage 5: Quality Filtering (80-95%)
      await sendEvent({
        type: 'progress',
        stage: 'quality_filtering',
        message: 'Applying quality filters...',
        percent: 85,
        details: 'Scoring and filtering articles'
      });

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

      // Stage 6: Complete (100%)
      await sendEvent({
        type: 'progress',
        stage: 'complete',
        message: 'Scraping complete!',
        percent: 100,
        details: `Found ${filteredArticles.length} high-quality articles`
      });

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

      // Send final result
      await sendEvent({
        type: 'result',
        data: {
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
        }
      });

    } catch (error) {
      await sendEvent({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
