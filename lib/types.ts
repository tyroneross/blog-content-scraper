/**
 * @package @tyroneross/scraper-testing
 * Core types for web scraper testing
 */

export interface ScrapedArticle {
  url: string;
  title: string;
  publishedDate?: Date | string;
  description?: string;
  fullContent?: string; // Raw HTML content
  fullContentMarkdown?: string; // Formatted Markdown content
  fullContentText?: string; // Plain text content
  confidence: number;
  source: 'link-text' | 'meta-data' | 'structured-data';
  qualityScore?: number; // 0-1 score indicating article quality (date, author, schema, etc.)
  metadata?: Record<string, any>; // Additional metadata from extraction
}

export interface ScraperTestResult {
  url: string;
  detectedType: 'rss' | 'sitemap' | 'html' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  articles: ScrapedArticle[];
  extractionStats: {
    attempted: number;
    successful: number;
    failed: number;
    filtered: number;
    totalDiscovered?: number; // Total URLs found before any filtering
    afterDenyFilter?: number; // URLs remaining after deny pattern filtering
    afterContentValidation?: number; // URLs with valid content
    afterQualityFilter?: number; // URLs passing quality threshold
  };
  processingTime: number;
  errors: string[];
  timestamp: string;
}

export interface ScraperTestRequest {
  url: string;
  sourceType?: 'auto' | 'rss' | 'sitemap' | 'html';
  maxArticles?: number;
  extractFullContent?: boolean; // Whether to extract full article text
  denyPaths?: string[]; // URL patterns to exclude (e.g., ['/about', '/careers/*'])
  qualityThreshold?: number; // Minimum quality score (0-1) for articles, default 0.6
}

export interface ScraperTestProps {
  onTestComplete?: (result: ScraperTestResult) => void;
  onTestStart?: (url: string) => void;
  onError?: (error: Error) => void;
  className?: string;
  defaultUrl?: string;
  plugins?: ScraperPlugin[]; // Optional plugins for LLM enhancement
}

export interface ScraperResultsProps {
  result: ScraperTestResult | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * Plugin system for extending scraper functionality
 * Allows users to add their own LLM-based enhancements
 */
export interface ScraperPlugin {
  name: string;
  version: string;

  /**
   * Called before scraping starts
   * Useful for validation, rate limiting, or pre-processing
   */
  beforeScrape?: (url: string) => Promise<void>;

  /**
   * Called after all articles are scraped
   * Useful for batch processing or re-ranking
   */
  afterScrape?: (articles: ScrapedArticle[]) => Promise<ScrapedArticle[]>;

  /**
   * Called for each article individually
   * Useful for adding AI-based quality scores or classifications
   */
  enhanceArticle?: (article: ScrapedArticle) => Promise<ScrapedArticle>;

  /**
   * Called to determine if an article should be filtered out
   * Return true to keep the article, false to filter it out
   */
  filterArticle?: (article: ScrapedArticle) => Promise<boolean>;
}

/**
 * Quality scoring configuration
 */
export interface QualityScoreConfig {
  contentWeight?: number; // Default: 0.60
  dateWeight?: number; // Default: 0.12
  authorWeight?: number; // Default: 0.08
  schemaWeight?: number; // Default: 0.08
  readingTimeWeight?: number; // Default: 0.12
  threshold?: number; // Default: 0.50
}

/**
 * Content validation result
 */
export interface ContentValidation {
  isValid: boolean;
  score: number; // 0-1 score
  reasons: string[]; // Validation failure reasons
}

/**
 * Extracted content structure
 */
export interface ExtractedContent {
  title?: string;
  byline?: string;
  content?: string;
  textContent?: string;
  length?: number;
  excerpt?: string;
  siteName?: string;
  publishedTime?: string;
  lang?: string;
  readingTime?: number;
  structured?: {
    jsonLd?: any;
    openGraph?: Record<string, string>;
    twitter?: Record<string, string>;
  };
}
