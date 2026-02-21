/**
 * Express Router Module
 *
 * Pre-built Express.js router for exposing scraper functionality as REST API.
 * Provides endpoints for scraping, extraction, and validation.
 *
 * NOTE: Express is not bundled - it must be installed separately.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createScraperRouter } from '@tyroneross/omniparse/express';
 *
 * const app = express();
 * app.use('/api/scraper', createScraperRouter());
 *
 * // Now available:
 * // POST /api/scraper/scrape
 * // POST /api/scraper/extract
 * // POST /api/scraper/validate
 * // POST /api/scraper/batch
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export interface RouterOptions {
  /** Enable request validation (default: true) */
  validateRequests?: boolean;
  /** Enable response caching (default: false) */
  enableCache?: boolean;
  /** Cache TTL in ms (default: 1 hour) */
  cacheTtlMs?: number;
  /** Max URLs in batch requests (default: 10) */
  maxBatchSize?: number;
  /** Rate limit per minute (default: 60) */
  rateLimit?: number;
  /** Custom error handler */
  errorHandler?: (error: Error, req: any, res: any) => void;
  /** CORS origins (default: '*') */
  corsOrigins?: string | string[];
}

export interface ScrapeRequest {
  url: string;
  maxArticles?: number;
  extractFullContent?: boolean;
  qualityThreshold?: number;
  sourceType?: 'auto' | 'rss' | 'sitemap' | 'html';
  singleArticle?: boolean;
}

export interface ExtractRequest {
  url: string;
}

export interface ValidateRequest {
  url: string;
  checkRobots?: boolean;
}

export interface BatchRequest {
  urls: string[];
  mode?: 'article' | 'listing' | 'smart';
  concurrency?: number;
  maxArticles?: number;
}

// Simple in-memory rate limiter
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(maxRequests: number, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    const recentRequests = requests.filter(t => now - t < this.windowMs);

    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    return true;
  }
}

// ============================================================================
// Router Factory
// ============================================================================

/**
 * Create Express router with scraper endpoints
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createScraperRouter } from '@tyroneross/omniparse/express';
 *
 * const app = express();
 * app.use(express.json());
 *
 * app.use('/api/scraper', createScraperRouter({
 *   enableCache: true,
 *   rateLimit: 30,
 *   maxBatchSize: 5
 * }));
 *
 * app.listen(3000);
 * ```
 */
export function createScraperRouter(options: RouterOptions = {}) {
  const {
    validateRequests = true,
    enableCache = false,
    cacheTtlMs = 60 * 60 * 1000,
    maxBatchSize = 10,
    rateLimit = 60,
    errorHandler,
    corsOrigins = '*'
  } = options;

  // Dynamic import Express
  const express = require('express');
  const router = express.Router();

  // Simple cache
  const cache = new Map<string, { data: any; expires: number }>();

  // Rate limiter
  const limiter = new RateLimiter(rateLimit);

  // Middleware: CORS
  router.use((req: any, res: any, next: any) => {
    const origin = Array.isArray(corsOrigins) ? corsOrigins.join(', ') : corsOrigins;
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Middleware: Rate limiting
  router.use((req: any, res: any, next: any) => {
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!limiter.isAllowed(clientIp)) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: 60
      });
    }
    next();
  });

  // Helper: Get from cache
  const getCached = (key: string): any | null => {
    if (!enableCache) return null;
    const entry = cache.get(key);
    if (entry && Date.now() < entry.expires) {
      return entry.data;
    }
    cache.delete(key);
    return null;
  };

  // Helper: Set cache
  const setCache = (key: string, data: any): void => {
    if (!enableCache) return;
    cache.set(key, { data, expires: Date.now() + cacheTtlMs });
  };

  // Helper: Validate URL
  const isValidUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  // Helper: Error response
  const handleError = (error: unknown, req: any, res: any) => {
    const err = error instanceof Error ? error : new Error('Unknown error');
    if (errorHandler) {
      return errorHandler(err, req, res);
    }
    console.error('[ScraperRouter] Error:', err.message);
    res.status(500).json({
      error: err.message,
      timestamp: new Date().toISOString()
    });
  };

  // ============================================================================
  // Routes
  // ============================================================================

  /**
   * POST /scrape
   * Scrape a website for articles
   */
  router.post('/scrape', async (req: any, res: any) => {
    try {
      const body: ScrapeRequest = req.body;

      // Validation
      if (validateRequests) {
        if (!body.url) {
          return res.status(400).json({ error: 'url is required' });
        }
        if (!isValidUrl(body.url)) {
          return res.status(400).json({ error: 'Invalid URL format' });
        }
      }

      // Check cache
      const cacheKey = `scrape:${JSON.stringify(body)}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return res.json({ ...cached, cached: true });
      }

      // Scrape
      const { scrapeWebsite } = await import('../index');
      const result = await scrapeWebsite(body.url, {
        maxArticles: body.maxArticles,
        extractFullContent: body.extractFullContent ?? true,
        qualityThreshold: body.qualityThreshold,
        sourceType: body.sourceType,
        singleArticle: body.singleArticle
      });

      setCache(cacheKey, result);
      res.json(result);
    } catch (error) {
      handleError(error, req, res);
    }
  });

  /**
   * POST /extract
   * Extract content from a single article URL
   */
  router.post('/extract', async (req: any, res: any) => {
    try {
      const body: ExtractRequest = req.body;

      if (validateRequests) {
        if (!body.url) {
          return res.status(400).json({ error: 'url is required' });
        }
        if (!isValidUrl(body.url)) {
          return res.status(400).json({ error: 'Invalid URL format' });
        }
      }

      const cacheKey = `extract:${body.url}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return res.json({ ...cached, cached: true });
      }

      const { extractArticle } = await import('../index');
      const result = await extractArticle(body.url);

      if (!result) {
        return res.status(404).json({
          error: 'Could not extract content from URL'
        });
      }

      setCache(cacheKey, result);
      res.json(result);
    } catch (error) {
      handleError(error, req, res);
    }
  });

  /**
   * POST /validate
   * Validate a URL before scraping
   */
  router.post('/validate', async (req: any, res: any) => {
    try {
      const body: ValidateRequest = req.body;

      if (validateRequests) {
        if (!body.url) {
          return res.status(400).json({ error: 'url is required' });
        }
        if (!isValidUrl(body.url)) {
          return res.status(400).json({ error: 'Invalid URL format' });
        }
      }

      const { validateUrl } = await import('../validation');
      const result = await validateUrl(body.url, {
        checkRobots: body.checkRobots ?? true
      });

      res.json(result);
    } catch (error) {
      handleError(error, req, res);
    }
  });

  /**
   * POST /batch
   * Process multiple URLs in batch
   */
  router.post('/batch', async (req: any, res: any) => {
    try {
      const body: BatchRequest = req.body;

      if (validateRequests) {
        if (!body.urls || !Array.isArray(body.urls)) {
          return res.status(400).json({ error: 'urls array is required' });
        }
        if (body.urls.length === 0) {
          return res.status(400).json({ error: 'urls array cannot be empty' });
        }
        if (body.urls.length > maxBatchSize) {
          return res.status(400).json({
            error: `Maximum ${maxBatchSize} URLs allowed per batch request`
          });
        }
        for (const url of body.urls) {
          if (!isValidUrl(url)) {
            return res.status(400).json({ error: `Invalid URL: ${url}` });
          }
        }
      }

      const { scrapeUrls } = await import('../batch');
      const result = await scrapeUrls(body.urls, {
        mode: body.mode || 'smart',
        concurrency: Math.min(body.concurrency || 3, 5),
        scraperOptions: {
          maxArticles: body.maxArticles
        }
      });

      // Convert Map to object for JSON serialization
      const resultsObject: Record<string, any> = {};
      result.results.forEach((value, key) => {
        resultsObject[key] = value;
      });

      res.json({
        ...result,
        results: resultsObject
      });
    } catch (error) {
      handleError(error, req, res);
    }
  });

  /**
   * POST /llm
   * Get LLM-ready output from a URL
   */
  router.post('/llm', async (req: any, res: any) => {
    try {
      const { url, options } = req.body;

      if (validateRequests) {
        if (!url) {
          return res.status(400).json({ error: 'url is required' });
        }
        if (!isValidUrl(url)) {
          return res.status(400).json({ error: 'Invalid URL format' });
        }
      }

      const cacheKey = `llm:${url}:${JSON.stringify(options || {})}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return res.json({ ...cached, cached: true });
      }

      const { scrapeForLLM } = await import('../llm');
      const result = await scrapeForLLM(url, options);

      setCache(cacheKey, result);
      res.json(result);
    } catch (error) {
      handleError(error, req, res);
    }
  });

  /**
   * GET /health
   * Health check endpoint
   */
  router.get('/health', (_req: any, res: any) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || 'unknown'
    });
  });

  return router;
}

/**
 * Middleware to add scraper functions to request object
 */
export function scraperMiddleware() {
  return async (req: any, _res: any, next: any) => {
    const { scrapeWebsite, extractArticle, smartScrape } = await import('../index');

    req.scraper = {
      scrapeWebsite,
      extractArticle,
      smartScrape
    };

    next();
  };
}
