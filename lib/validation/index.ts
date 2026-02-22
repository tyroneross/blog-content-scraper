/**
 * URL Validation Module
 *
 * Pre-scraping validation to check URL accessibility, robots.txt,
 * and detect potential issues before attempting extraction.
 */

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  /** Is the URL syntactically valid */
  isValid: boolean;
  /** Can the URL be reached (responds to HEAD/GET) */
  isReachable: boolean;
  /** HTTP status code from probe */
  statusCode?: number;
  /** Is scraping allowed by robots.txt */
  robotsAllowed: boolean;
  /** Detected if site requires authentication */
  requiresAuth: boolean;
  /** Detected if site has a paywall */
  hasPaywall: boolean;
  /** Detected content type */
  contentType?: string;
  /** Redirect chain if any */
  redirects?: string[];
  /** Final URL after redirects */
  finalUrl?: string;
  /** Suggested action based on analysis */
  suggestedAction: 'scrape' | 'skip' | 'use-proxy' | 'requires-auth';
  /** Detailed warnings */
  warnings: string[];
  /** Time to first byte in ms */
  responseTimeMs?: number;
}

export interface RobotsResult {
  allowed: boolean;
  crawlDelay?: number;
  sitemaps: string[];
  disallowedPaths: string[];
}

export interface ValidationOptions {
  /** User agent to use for requests */
  userAgent?: string;
  /** Timeout for validation requests in ms */
  timeoutMs?: number;
  /** Whether to follow redirects */
  followRedirects?: boolean;
  /** Maximum redirects to follow */
  maxRedirects?: number;
  /** Check robots.txt */
  checkRobots?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_USER_AGENT = 'OmniParseBot/1.0 (+https://github.com/tyroneross/scraper-app)';

/** Patterns that indicate paywall/subscription content */
const PAYWALL_INDICATORS = [
  /paywall/i,
  /subscribe.*to.*continue/i,
  /subscription.*required/i,
  /members.*only/i,
  /premium.*content/i,
  /unlock.*article/i,
  /sign.*up.*to.*read/i,
  /register.*to.*continue/i,
];

/** Headers that indicate authentication requirement */
const AUTH_HEADERS = ['www-authenticate', 'x-requires-login'];

/** Status codes that indicate auth issues */
const AUTH_STATUS_CODES = [401, 403];

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Normalize URL for consistent handling
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash from path (unless root)
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    // Sort query parameters
    parsed.searchParams.sort();
    // Remove common tracking parameters
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source'];
    trackingParams.forEach(param => parsed.searchParams.delete(param));
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Extract domain from URL
 */
export function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Check if two URLs are from the same domain
 */
export function isSameDomain(url1: string, url2: string): boolean {
  const domain1 = getDomain(url1);
  const domain2 = getDomain(url2);
  return domain1 !== null && domain1 === domain2;
}

// ============================================================================
// Robots.txt Parsing
// ============================================================================

/**
 * Parse robots.txt content
 */
export function parseRobotsTxt(content: string, userAgent: string = '*'): RobotsResult {
  const lines = content.split('\n').map(l => l.trim());
  const result: RobotsResult = {
    allowed: true,
    sitemaps: [],
    disallowedPaths: []
  };

  let currentAgent = '';
  let matchedAgent = false;

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || !line) continue;

    const [directive, ...valueParts] = line.split(':');
    const directiveLower = directive.toLowerCase().trim();
    const value = valueParts.join(':').trim();

    if (directiveLower === 'user-agent') {
      currentAgent = value.toLowerCase();
      matchedAgent = currentAgent === '*' || currentAgent === userAgent.toLowerCase();
    } else if (matchedAgent) {
      if (directiveLower === 'disallow' && value) {
        result.disallowedPaths.push(value);
      } else if (directiveLower === 'allow' && value === '/') {
        // Explicit allow overrides disallow
        result.allowed = true;
      } else if (directiveLower === 'crawl-delay') {
        result.crawlDelay = parseInt(value, 10) || undefined;
      }
    }

    // Sitemaps apply globally
    if (directiveLower === 'sitemap') {
      result.sitemaps.push(value);
    }
  }

  return result;
}

/**
 * Check if a path is allowed by robots.txt rules
 */
export function isPathAllowed(path: string, disallowedPaths: string[]): boolean {
  for (const disallowed of disallowedPaths) {
    // Handle wildcards
    if (disallowed.includes('*')) {
      const pattern = disallowed.replace(/\*/g, '.*');
      if (new RegExp(`^${pattern}`).test(path)) {
        return false;
      }
    } else if (path.startsWith(disallowed)) {
      return false;
    }
  }
  return true;
}

/**
 * Fetch and parse robots.txt for a domain
 */
export async function fetchRobotsTxt(
  url: string,
  options: ValidationOptions = {}
): Promise<RobotsResult | null> {
  const { userAgent = DEFAULT_USER_AGENT, timeoutMs = 5000 } = options;

  try {
    const parsed = new URL(url);
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': userAgent },
      signal: controller.signal,
      redirect: 'follow'
    });

    clearTimeout(timeout);

    if (!response.ok) {
      // No robots.txt means everything is allowed
      return { allowed: true, sitemaps: [], disallowedPaths: [] };
    }

    const content = await response.text();
    return parseRobotsTxt(content, userAgent);
  } catch {
    // On error, assume allowed
    return { allowed: true, sitemaps: [], disallowedPaths: [] };
  }
}

// ============================================================================
// Full Validation
// ============================================================================

/**
 * Perform full URL validation including reachability and robots.txt
 *
 * @example
 * ```typescript
 * const validation = await validateUrl('https://example.com/article');
 *
 * if (validation.suggestedAction === 'scrape') {
 *   // Safe to scrape
 *   const result = await scrapeWebsite(url);
 * } else if (validation.suggestedAction === 'use-proxy') {
 *   // May need proxy due to blocking
 *   console.log('Consider using a proxy');
 * }
 * ```
 */
export async function validateUrl(
  url: string,
  options: ValidationOptions = {}
): Promise<ValidationResult> {
  const {
    userAgent = DEFAULT_USER_AGENT,
    timeoutMs = 10000,
    followRedirects = true,
    maxRedirects = 5,
    checkRobots = true
  } = options;

  const result: ValidationResult = {
    isValid: false,
    isReachable: false,
    robotsAllowed: true,
    requiresAuth: false,
    hasPaywall: false,
    suggestedAction: 'skip',
    warnings: []
  };

  // Check URL validity
  if (!isValidUrl(url)) {
    result.warnings.push('Invalid URL format');
    return result;
  }
  result.isValid = true;

  // Check robots.txt
  if (checkRobots) {
    const robots = await fetchRobotsTxt(url, { userAgent, timeoutMs: 5000 });
    if (robots) {
      const parsed = new URL(url);
      result.robotsAllowed = isPathAllowed(parsed.pathname, robots.disallowedPaths);
      if (!result.robotsAllowed) {
        result.warnings.push('Path disallowed by robots.txt');
      }
    }
  }

  // Probe URL
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startTime = Date.now();
    const redirects: string[] = [];
    let currentUrl = url;

    // Use HEAD first, fallback to GET
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': userAgent },
        signal: controller.signal,
        redirect: followRedirects ? 'follow' : 'manual'
      });
    } catch {
      // Some servers don't support HEAD
      response = await fetch(currentUrl, {
        method: 'GET',
        headers: { 'User-Agent': userAgent },
        signal: controller.signal,
        redirect: followRedirects ? 'follow' : 'manual'
      });
    }

    clearTimeout(timeout);
    result.responseTimeMs = Date.now() - startTime;

    // Track redirects
    if (response.redirected) {
      result.finalUrl = response.url;
      if (response.url !== url) {
        redirects.push(response.url);
      }
    }
    result.redirects = redirects.length > 0 ? redirects : undefined;

    result.statusCode = response.status;
    result.contentType = response.headers.get('content-type') || undefined;
    result.isReachable = response.ok;

    // Check for auth requirements
    if (AUTH_STATUS_CODES.includes(response.status)) {
      result.requiresAuth = true;
      result.warnings.push('Authentication required');
    }
    for (const header of AUTH_HEADERS) {
      if (response.headers.has(header)) {
        result.requiresAuth = true;
      }
    }

    // Check for paywall indicators (requires GET with body)
    if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
      try {
        const body = await response.text();
        for (const pattern of PAYWALL_INDICATORS) {
          if (pattern.test(body)) {
            result.hasPaywall = true;
            result.warnings.push('Possible paywall detected');
            break;
          }
        }
      } catch {
        // Ignore body read errors
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.warnings.push(`Request failed: ${message}`);
    result.isReachable = false;
  }

  // Determine suggested action
  if (!result.isReachable) {
    result.suggestedAction = 'skip';
  } else if (result.requiresAuth) {
    result.suggestedAction = 'requires-auth';
  } else if (!result.robotsAllowed) {
    result.suggestedAction = 'skip';
  } else if (result.hasPaywall) {
    result.suggestedAction = 'use-proxy';
  } else if (result.statusCode === 429 || result.responseTimeMs && result.responseTimeMs > 5000) {
    result.suggestedAction = 'use-proxy';
    result.warnings.push('Rate limiting or slow response detected');
  } else {
    result.suggestedAction = 'scrape';
  }

  return result;
}

/**
 * Quick check if URL is likely scrapeable
 */
export async function canScrape(url: string): Promise<boolean> {
  const result = await validateUrl(url, { checkRobots: true });
  return result.suggestedAction === 'scrape';
}

/**
 * Batch validate multiple URLs
 */
export async function validateUrls(
  urls: string[],
  options: ValidationOptions & { concurrency?: number } = {}
): Promise<Map<string, ValidationResult>> {
  const { concurrency = 5, ...validationOptions } = options;
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(concurrency);

  const results = new Map<string, ValidationResult>();
  const tasks = urls.map(url =>
    limit(async () => {
      const result = await validateUrl(url, validationOptions);
      results.set(url, result);
    })
  );

  await Promise.all(tasks);
  return results;
}
