/**
 * @package @tyroneross/blog-scraper
 * Typed error classes for better error handling
 *
 * Based on Azure SDK TypeScript guidelines:
 * https://azure.github.io/azure-sdk/typescript_design.html
 */

/**
 * Base error class for all scraper errors
 */
export class ScraperError extends Error {
  /** Error code for programmatic handling */
  readonly code: string;
  /** Original error that caused this error */
  readonly cause?: Error;
  /** URL being scraped when error occurred */
  readonly url?: string;

  constructor(message: string, options?: { code?: string; cause?: Error; url?: string }) {
    super(message);
    this.name = 'ScraperError';
    this.code = options?.code ?? 'SCRAPER_ERROR';
    this.cause = options?.cause;
    this.url = options?.url;

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when a request times out
 */
export class RequestTimeoutError extends ScraperError {
  /** Timeout duration in milliseconds */
  readonly timeout: number;

  constructor(message: string, options: { timeout: number; url?: string; cause?: Error }) {
    super(message, { code: 'REQUEST_TIMEOUT', ...options });
    this.name = 'RequestTimeoutError';
    this.timeout = options.timeout;
  }
}

/**
 * Thrown when a request is aborted via AbortSignal
 */
export class RequestAbortedError extends ScraperError {
  constructor(message = 'Request was aborted', options?: { url?: string }) {
    super(message, { code: 'REQUEST_ABORTED', ...options });
    this.name = 'RequestAbortedError';
  }
}

/**
 * Thrown when rate limit is exceeded
 */
export class RateLimitError extends ScraperError {
  /** Time to wait before retrying (ms) */
  readonly retryAfter?: number;
  /** Host that rate limited the request */
  readonly host: string;

  constructor(message: string, options: { host: string; retryAfter?: number; url?: string }) {
    super(message, { code: 'RATE_LIMIT_EXCEEDED', ...options });
    this.name = 'RateLimitError';
    this.host = options.host;
    this.retryAfter = options.retryAfter;
  }
}

/**
 * Thrown when robots.txt disallows crawling
 */
export class RobotsBlockedError extends ScraperError {
  /** The disallowed path */
  readonly disallowedPath: string;

  constructor(message: string, options: { url: string; disallowedPath: string }) {
    super(message, { code: 'ROBOTS_BLOCKED', ...options });
    this.name = 'RobotsBlockedError';
    this.disallowedPath = options.disallowedPath;
  }
}

/**
 * Thrown when content extraction fails
 */
export class ContentExtractionError extends ScraperError {
  /** The extraction phase that failed */
  readonly phase: 'fetch' | 'parse' | 'extract' | 'convert';

  constructor(message: string, options: { url: string; phase: 'fetch' | 'parse' | 'extract' | 'convert'; cause?: Error }) {
    super(message, { code: 'CONTENT_EXTRACTION_FAILED', ...options });
    this.name = 'ContentExtractionError';
    this.phase = options.phase;
  }
}

/**
 * Thrown when no content sources are found
 */
export class NoContentFoundError extends ScraperError {
  /** Sources that were tried */
  readonly triedSources: ('rss' | 'sitemap' | 'html')[];

  constructor(message: string, options: { url: string; triedSources: ('rss' | 'sitemap' | 'html')[] }) {
    super(message, { code: 'NO_CONTENT_FOUND', ...options });
    this.name = 'NoContentFoundError';
    this.triedSources = options.triedSources;
  }
}

/**
 * Thrown when URL is invalid or inaccessible
 */
export class InvalidUrlError extends ScraperError {
  /** HTTP status code if applicable */
  readonly statusCode?: number;

  constructor(message: string, options: { url: string; statusCode?: number; cause?: Error }) {
    super(message, { code: 'INVALID_URL', ...options });
    this.name = 'InvalidUrlError';
    this.statusCode = options.statusCode;
  }
}

/**
 * Thrown when circuit breaker is open (too many failures)
 */
export class CircuitOpenError extends ScraperError {
  /** When the circuit breaker will reset */
  readonly resetTime: number;

  constructor(message: string, options: { url?: string; resetTime: number }) {
    super(message, { code: 'CIRCUIT_OPEN', ...options });
    this.name = 'CircuitOpenError';
    this.resetTime = options.resetTime;
  }
}

/**
 * Type guard to check if an error is a ScraperError
 */
export function isScraperError(error: unknown): error is ScraperError {
  return error instanceof ScraperError;
}

/**
 * Type guard to check if error was caused by abort
 */
export function isAbortError(error: unknown): error is RequestAbortedError {
  if (error instanceof RequestAbortedError) return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return false;
}
