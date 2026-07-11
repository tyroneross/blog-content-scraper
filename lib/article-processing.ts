import { cleanText, stripHTML } from './formatters/text-cleaner';
import type { CandidateArticle } from './source-orchestrator';
import type { ExtractedContent } from './types';

const GENERIC_TITLES = new Set(['', 'untitled', 'untitled article', 'article', 'blog', 'news']);

export function titleFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || urlObj.hostname;

    return lastPart
      .replace(/[-_]/g, ' ')
      .replace(/\.(html|htm|php|asp|jsp)$/i, '')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  } catch {
    return 'Untitled Article';
  }
}

function normalizeTitle(title: string | undefined): string {
  return (title || '').replace(/\s+/g, ' ').trim();
}

export function preferExtractedTitle(
  currentTitle: string | undefined,
  extractedTitle: string | undefined,
  url: string
): string {
  const current = normalizeTitle(currentTitle);
  const extracted = normalizeTitle(extractedTitle);

  if (GENERIC_TITLES.has(extracted.toLowerCase())) return current || titleFromUrl(url);
  if (!current || GENERIC_TITLES.has(current.toLowerCase())) return extracted;

  const fallback = normalizeTitle(titleFromUrl(url));
  if (current.toLowerCase() === fallback.toLowerCase() || current.length < 5) {
    return extracted;
  }

  return current;
}

export function toArticleQualityInput(article: CandidateArticle): ExtractedContent {
  const metadata = article.metadata || {};
  const content = article.content || '';
  const storedText = typeof metadata.textContent === 'string' ? metadata.textContent : '';
  const textContent = storedText || cleanText(stripHTML(content));
  const structured = metadata.structured && typeof metadata.structured === 'object'
    ? metadata.structured as ExtractedContent['structured']
    : undefined;

  return {
    title: article.title,
    excerpt: article.excerpt,
    content,
    textContent,
    publishedTime: metadata.publishedAtIsFallback === true
      ? undefined
      : article.publishedAt.toISOString(),
    byline: typeof metadata.byline === 'string' ? metadata.byline : undefined,
    siteName: typeof metadata.siteName === 'string' ? metadata.siteName : undefined,
    lang: typeof metadata.lang === 'string' ? metadata.lang : undefined,
    readingTime: typeof metadata.readingTime === 'number' ? metadata.readingTime : undefined,
    structured,
  };
}

export interface ContentExtractionStats {
  attempted: number;
  successful: number;
  failed: number;
}

export function summarizeContentExtraction(articles: CandidateArticle[]): ContentExtractionStats {
  const attempted = articles.filter(article => article.metadata?.fullContentExtractionAttempted === true).length;
  const successful = articles.filter(article => article.metadata?.fullContentExtracted === true).length;

  return {
    attempted,
    successful,
    failed: Math.max(0, attempted - successful),
  };
}
