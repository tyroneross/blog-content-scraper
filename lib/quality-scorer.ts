/**
 * @package @tyroneross/scraper-testing
 * Article quality scoring system
 *
 * No LLM required - uses metadata and content signals to determine article quality
 */

import { ExtractedContent, QualityScoreConfig, ContentValidation } from './types';

/**
 * Default quality score configuration
 * These weights were optimized through testing with 1,788 real articles
 */
export const DEFAULT_QUALITY_CONFIG: Required<QualityScoreConfig> = {
  contentWeight: 0.60,      // Content validation (length, quality, ratio)
  dateWeight: 0.12,          // Publication date presence
  authorWeight: 0.08,        // Author/byline presence
  schemaWeight: 0.08,        // Schema.org metadata
  readingTimeWeight: 0.12,   // Substantial reading time (2+ min)
  threshold: 0.50,           // Minimum score to pass (50%)
};

/**
 * Default patterns to block non-article pages
 * These cover common non-article paths across websites
 */
export const DEFAULT_DENY_PATHS = [
  '/',
  '/index',
  '/index.html',
  '/about',
  '/about/*',
  '/careers',
  '/careers/*',
  '/jobs',
  '/jobs/*',
  '/contact',
  '/contact/*',
  '/team',
  '/team/*',
  '/privacy',
  '/terms',
  '/legal/*',
  '/tag/*',
  '/tags/*',
  '/category/*',
  '/categories/*',
  '/author/*',
  '/authors/*',
  '/archive/*',
  '/search',
  '/search/*',
  // Non-English language paths (filter to English only)
  '/cs-cz/*',  // Czech
  '/de-de/*',  // German
  '/de-at/*',  // German (Austria)
  '/de-ch/*',  // German (Swiss)
  '/fr-fr/*',  // French
  '/fr-ca/*',  // French (Canada)
  '/es-es/*',  // Spanish
  '/es-mx/*',  // Spanish (Mexico)
  '/es-la/*',  // Spanish (Latin America)
  '/it-it/*',  // Italian
  '/ja-jp/*',  // Japanese
  '/ko-kr/*',  // Korean
  '/zh-cn/*',  // Chinese (Simplified)
  '/zh-tw/*',  // Chinese (Traditional)
  '/zh-hk/*',  // Chinese (Hong Kong)
  '/pt-br/*',  // Portuguese (Brazil)
  '/pt-pt/*',  // Portuguese
  '/ru-ru/*',  // Russian
  '/pl-pl/*',  // Polish
  '/nl-nl/*',  // Dutch
  '/sv-se/*',  // Swedish
  '/nb-no/*',  // Norwegian
  '/da-dk/*',  // Danish
  '/fi-fi/*',  // Finnish
  '/tr-tr/*',  // Turkish
  '/ar-ae/*',  // Arabic
  '/he-il/*',  // Hebrew
  '/th-th/*',  // Thai
  '/vi-vn/*',  // Vietnamese
  '/id-id/*',  // Indonesian
  // Short language codes
  '/de/*',
  '/fr/*',
  '/es/*',
  '/it/*',
  '/ja/*',
  '/ko/*',
  '/zh/*',
  '/pt/*',
  '/ru/*',
  '/pl/*',
  '/nl/*',
];

/**
 * Validate content quality (Tier 2 filtering)
 * Checks length, title quality, and text-to-HTML ratio
 *
 * @param extracted - Extracted content from article
 * @returns Validation result with score and reasons
 */
export function validateContent(extracted: ExtractedContent): ContentValidation {
  const reasons: string[] = [];
  let score = 1.0; // Start with perfect score, deduct for issues

  // Check content length (minimum 200 characters)
  const contentLength = extracted.textContent?.length || 0;
  if (contentLength < 200) {
    reasons.push('Content too short (< 200 characters)');
    score -= 0.5; // Heavy penalty for short content
  }

  // Check title quality (10-200 characters)
  const titleLength = extracted.title?.length || 0;
  if (titleLength < 10 || titleLength > 200) {
    reasons.push('Title length invalid (must be 10-200 characters)');
    score -= 0.2;
  }

  // Check text-to-HTML ratio (should be at least 10% text)
  if (extracted.content && extracted.textContent) {
    const htmlLength = extracted.content.length;
    const textLength = extracted.textContent.length;
    const ratio = textLength / htmlLength;

    if (ratio < 0.1) {
      reasons.push('Low text-to-HTML ratio (< 10%)');
      score -= 0.2;
    }
  }

  // Content must score at least 0.5 to be considered valid
  const isValid = score >= 0.5;

  return {
    isValid,
    score: Math.max(0, Math.min(1.0, score)), // Clamp between 0-1
    reasons,
  };
}

/**
 * Calculate article quality score (Tier 3 filtering)
 *
 * Score breakdown:
 * - Content validation (60%): Length, title quality, text-to-HTML ratio
 * - Publication date (12%): Articles should have timestamps
 * - Author/byline (8%): Professional articles cite authors
 * - Schema.org metadata (8%): Structured data indicates article pages
 * - Reading time (12%): Substantial content (2+ min read)
 *
 * @param extracted - Extracted content from article
 * @param config - Optional quality score configuration
 * @returns Quality score between 0-1
 */
export function calculateArticleQualityScore(
  extracted: ExtractedContent,
  config: QualityScoreConfig = {}
): number {
  const finalConfig = { ...DEFAULT_QUALITY_CONFIG, ...config };
  let score = 0;

  // Tier 2: Content validation (60% weight by default)
  const validation = validateContent(extracted);
  score += validation.score * finalConfig.contentWeight;

  // Tier 3: Article metadata signals

  // Has publication date (12% weight by default)
  if (extracted.publishedTime) {
    score += finalConfig.dateWeight;
  }

  // Has author/byline (8% weight by default)
  if (extracted.byline) {
    score += finalConfig.authorWeight;
  }

  // Has article schema.org metadata (8% weight by default)
  if (extracted.structured?.jsonLd) {
    const schemas = Array.isArray(extracted.structured.jsonLd)
      ? extracted.structured.jsonLd
      : [extracted.structured.jsonLd];

    const hasArticleType = schemas.some((s: any) => {
      const type = s['@type'];
      return (
        type === 'Article' ||
        type === 'NewsArticle' ||
        type === 'BlogPosting' ||
        type === 'TechArticle' ||
        type === 'ScholarlyArticle'
      );
    });

    if (hasArticleType) {
      score += finalConfig.schemaWeight;
    }
  }

  // Substantial reading time (12% weight by default)
  // Articles should be at least 2 minutes to read
  if (extracted.readingTime && extracted.readingTime >= 2) {
    score += finalConfig.readingTimeWeight;
  }

  return Math.min(score, 1.0); // Cap at 1.0
}

/**
 * Check if a URL should be denied based on path patterns
 *
 * @param url - URL to check
 * @param denyPaths - Patterns to deny (supports wildcards with *)
 * @returns True if URL should be denied
 */
export function shouldDenyUrl(url: string, denyPaths: string[] = DEFAULT_DENY_PATHS): boolean {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    return denyPaths.some((pattern) => {
      // Exact match
      if (pattern === path) return true;

      // Wildcard match (e.g., /about/*)
      if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -2); // Remove /*
        return path.startsWith(prefix);
      }

      return false;
    });
  } catch {
    return false; // Invalid URL, don't deny
  }
}

/**
 * Get quality score breakdown for debugging
 * Useful for understanding why an article scored a certain way
 *
 * @param extracted - Extracted content from article
 * @param config - Optional quality score configuration
 * @returns Breakdown of quality score components
 */
export function getQualityBreakdown(
  extracted: ExtractedContent,
  config: QualityScoreConfig = {}
): {
  contentValidation: number;
  publishedDate: number;
  author: number;
  schema: number;
  readingTime: number;
  total: number;
  passesThreshold: boolean;
} {
  const finalConfig = { ...DEFAULT_QUALITY_CONFIG, ...config };
  const validation = validateContent(extracted);

  const breakdown = {
    contentValidation: validation.score * finalConfig.contentWeight,
    publishedDate: extracted.publishedTime ? finalConfig.dateWeight : 0,
    author: extracted.byline ? finalConfig.authorWeight : 0,
    schema: 0,
    readingTime: extracted.readingTime && extracted.readingTime >= 2 ? finalConfig.readingTimeWeight : 0,
    total: 0,
    passesThreshold: false,
  };

  // Check schema
  if (extracted.structured?.jsonLd) {
    const schemas = Array.isArray(extracted.structured.jsonLd)
      ? extracted.structured.jsonLd
      : [extracted.structured.jsonLd];

    const hasArticleType = schemas.some((s: any) => {
      const type = s['@type'];
      return (
        type === 'Article' ||
        type === 'NewsArticle' ||
        type === 'BlogPosting' ||
        type === 'TechArticle' ||
        type === 'ScholarlyArticle'
      );
    });

    if (hasArticleType) {
      breakdown.schema = finalConfig.schemaWeight;
    }
  }

  breakdown.total =
    breakdown.contentValidation +
    breakdown.publishedDate +
    breakdown.author +
    breakdown.schema +
    breakdown.readingTime;

  breakdown.passesThreshold = breakdown.total >= finalConfig.threshold;

  return breakdown;
}
