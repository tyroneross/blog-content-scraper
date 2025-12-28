"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  CircuitBreaker: () => CircuitBreaker,
  CircuitOpenError: () => CircuitOpenError,
  ContentExtractionError: () => ContentExtractionError,
  ContentExtractor: () => ContentExtractor,
  DEFAULT_DENY_PATHS: () => DEFAULT_DENY_PATHS,
  DEFAULT_QUALITY_CONFIG: () => DEFAULT_QUALITY_CONFIG,
  HTMLScraper: () => HTMLScraper,
  InvalidUrlError: () => InvalidUrlError,
  NoContentFoundError: () => NoContentFoundError,
  RSSDiscovery: () => RSSDiscovery,
  RateLimitError: () => RateLimitError,
  RequestAbortedError: () => RequestAbortedError,
  RequestTimeoutError: () => RequestTimeoutError,
  RobotsBlockedError: () => RobotsBlockedError,
  RobotsChecker: () => RobotsChecker,
  ScraperError: () => ScraperError,
  ScrapingRateLimiter: () => ScrapingRateLimiter,
  SitemapParser: () => SitemapParser,
  SourceOrchestrator: () => SourceOrchestrator,
  VERSION: () => VERSION,
  calculateArticleQualityScore: () => calculateArticleQualityScore,
  circuitBreakers: () => circuitBreakers,
  cleanText: () => cleanText,
  convertToMarkdown: () => convertToMarkdown,
  createScraper: () => createScraper,
  decodeHTMLEntities: () => decodeHTMLEntities,
  detectParagraphs: () => detectParagraphs,
  fetchRSSFeed: () => fetchRSSFeed,
  getQualityBreakdown: () => getQualityBreakdown,
  globalContentExtractor: () => globalContentExtractor,
  globalRSSDiscovery: () => globalRSSDiscovery,
  globalRateLimiter: () => globalRateLimiter,
  globalRobotsChecker: () => globalRobotsChecker,
  globalSitemapParser: () => globalSitemapParser,
  globalSourceOrchestrator: () => globalSourceOrchestrator,
  htmlToMarkdown: () => htmlToMarkdown,
  isAbortError: () => isAbortError,
  isScraperError: () => isScraperError,
  normalizeWhitespace: () => normalizeWhitespace2,
  quickScrape: () => quickScrape,
  removeUrls: () => removeUrls,
  scrape: () => scrape,
  shouldDenyUrl: () => shouldDenyUrl,
  stripHTML: () => stripHTML,
  stripNonArticleContent: () => stripNonArticleContent,
  truncateText: () => truncateText,
  validateContent: () => validateContent
});
module.exports = __toCommonJS(index_exports);

// src/orchestrator/source-orchestrator.ts
var import_zod = require("zod");
var import_crypto2 = __toESM(require("crypto"));

// src/utils/rss-utils.ts
var import_rss_parser = __toESM(require("rss-parser"));
var import_crypto = __toESM(require("crypto"));
var parser = new import_rss_parser.default({
  timeout: 15e3,
  // Increased timeout
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; AtomizeNews/1.0; +https://atomize-news.vercel.app)"
  }
});
async function fetchRSSFeed(url, _sourceId) {
  try {
    console.log(`\u{1F504} [RSS] Fetching feed from ${url}`);
    const feed = await parser.parseURL(url);
    if (!feed.items || feed.items.length === 0) {
      console.warn(`\u26A0\uFE0F [RSS] Feed from ${url} contains no items`);
      return [];
    }
    const items = feed.items.map((item) => ({
      title: item.title || "Untitled",
      link: item.link || "",
      pubDate: item.pubDate || (/* @__PURE__ */ new Date()).toISOString(),
      guid: item.guid || item.link || import_crypto.default.randomUUID(),
      content: item.content || item["content:encoded"] || "",
      contentSnippet: item.contentSnippet || ""
    }));
    console.log(`\u2705 [RSS] Successfully fetched ${items.length} items from ${url}`);
    return items;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`\u274C [RSS] Failed to fetch RSS from ${url}:`, errorMessage);
    if (error instanceof Error) {
      if (error.message.includes("Invalid character")) {
        console.error(`\u{1F50D} [RSS] XML parsing error - feed may be malformed or contain HTML`);
      } else if (error.message.includes("timeout")) {
        console.error(`\u{1F50D} [RSS] Request timeout - server may be slow or unreachable`);
      } else if (error.message.includes("ENOTFOUND")) {
        console.error(`\u{1F50D} [RSS] Domain not found - check URL spelling`);
      } else if (error.message.includes("ECONNREFUSED")) {
        console.error(`\u{1F50D} [RSS] Connection refused - server may be down`);
      }
    }
    return [];
  }
}

// src/extractors/rss-discovery.ts
var cheerio = __toESM(require("cheerio"));

// src/utils/scraping-rate-limiter.ts
var ScrapingRateLimiter = class {
  constructor(options = {}) {
    this.hosts = /* @__PURE__ */ new Map();
    this.activeRequests = /* @__PURE__ */ new Set();
    this.baseDelay = Math.floor(1e3 / (options.requestsPerSecond || 1));
    this.maxBackoff = options.maxBackoff || 3e4;
    this.maxConcurrent = options.maxConcurrent || 10;
  }
  async execute(url, operation, options = {}) {
    const host = this.extractHost(url);
    if (!host) {
      throw new Error(`Invalid URL: ${url}`);
    }
    return new Promise((resolve, reject) => {
      const request = {
        resolve,
        reject,
        operation,
        priority: options.priority || 0,
        retryCount: 0,
        maxRetries: options.maxRetries || 3,
        host
      };
      this.enqueueRequest(host, request);
    });
  }
  extractHost(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  enqueueRequest(host, request) {
    if (!this.hosts.has(host)) {
      this.hosts.set(host, {
        lastRequest: 0,
        backoffUntil: 0,
        backoffMultiplier: 1,
        queue: [],
        processing: false
      });
    }
    const hostState = this.hosts.get(host);
    const insertIndex = hostState.queue.findIndex(
      (req) => req.priority < request.priority
    );
    if (insertIndex === -1) {
      hostState.queue.push(request);
    } else {
      hostState.queue.splice(insertIndex, 0, request);
    }
    if (!hostState.processing) {
      this.processQueue(host).catch((error) => {
        console.error(`[RateLimiter] Error processing queue for ${host}:`, error);
      });
    }
  }
  async processQueue(host) {
    const hostState = this.hosts.get(host);
    if (!hostState || hostState.processing) {
      return;
    }
    hostState.processing = true;
    try {
      while (hostState.queue.length > 0) {
        if (this.activeRequests.size >= this.maxConcurrent) {
          await this.wait(100);
          continue;
        }
        if (Date.now() < hostState.backoffUntil) {
          const waitTime = hostState.backoffUntil - Date.now();
          await this.wait(Math.min(waitTime, 1e3));
          continue;
        }
        const now = Date.now();
        const timeSinceLastRequest = now - hostState.lastRequest;
        if (timeSinceLastRequest < this.baseDelay) {
          const waitTime = this.baseDelay - timeSinceLastRequest;
          await this.wait(waitTime);
          continue;
        }
        const request = hostState.queue.shift();
        const requestId = `${host}-${Date.now()}-${Math.random()}`;
        this.activeRequests.add(requestId);
        try {
          hostState.lastRequest = Date.now();
          const result = await request.operation();
          hostState.backoffMultiplier = 1;
          hostState.backoffUntil = 0;
          request.resolve(result);
        } catch (error) {
          await this.handleRequestError(hostState, request, error);
        } finally {
          this.activeRequests.delete(requestId);
        }
      }
    } finally {
      hostState.processing = false;
    }
  }
  async handleRequestError(hostState, request, error) {
    const shouldRetry = this.shouldRetry(error, request);
    if (shouldRetry && request.retryCount < request.maxRetries) {
      request.retryCount++;
      if (this.shouldBackoff(error)) {
        const backoffTime = Math.min(
          this.baseDelay * hostState.backoffMultiplier * Math.pow(2, request.retryCount),
          this.maxBackoff
        );
        hostState.backoffUntil = Date.now() + backoffTime;
        hostState.backoffMultiplier = Math.min(hostState.backoffMultiplier * 1.5, 10);
        console.warn(
          `[RateLimiter] Backing off ${request.host} for ${backoffTime}ms (attempt ${request.retryCount}/${request.maxRetries}): ${error.message}`
        );
      }
      request.priority = Math.max(request.priority - 1, -10);
      hostState.queue.unshift(request);
    } else {
      console.error(
        `[RateLimiter] Request failed for ${request.host} (${request.retryCount}/${request.maxRetries} retries): ${error.message}`
      );
      request.reject(error);
    }
  }
  shouldRetry(error, request) {
    if (request.retryCount >= request.maxRetries) {
      return false;
    }
    if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      return true;
    }
    if (error.status) {
      const status = error.status;
      return status === 408 || status === 429 || status >= 500;
    }
    if (error.name === "AbortError" || error.message.includes("timeout")) {
      return true;
    }
    return false;
  }
  shouldBackoff(error) {
    if (error.status) {
      const status = error.status;
      return status === 429 || status >= 500;
    }
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      return true;
    }
    return false;
  }
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  // Utility method to get current queue stats
  getStats() {
    const stats = {};
    this.hosts.forEach((state, host) => {
      stats[host] = {
        queueLength: state.queue.length,
        processing: state.processing,
        backoffUntil: state.backoffUntil,
        backoffMultiplier: state.backoffMultiplier,
        lastRequest: state.lastRequest
      };
    });
    return {
      hosts: stats,
      activeRequests: this.activeRequests.size,
      maxConcurrent: this.maxConcurrent
    };
  }
};
var globalRateLimiter = new ScrapingRateLimiter({
  requestsPerSecond: 1,
  maxBackoff: 3e4,
  maxConcurrent: 10
});

// src/extractors/robots-checker.ts
var RobotsChecker = class {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
    this.cacheTimeout = 24 * 60 * 60 * 1e3;
    // 24 hours
    this.userAgent = "AtomizeNews/1.0";
    this.requestTimeout = 5e3;
  }
  // 5 seconds
  /**
   * Check if a URL is allowed to be crawled according to robots.txt
   */
  async isAllowed(url) {
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
      console.log(`\u{1F916} [Robots] Checking ${url} against ${robotsUrl}`);
      const robotsTxt = await this.getRobotsTxt(robotsUrl);
      if (!robotsTxt) {
        return {
          allowed: true,
          sitemaps: [],
          reason: "No robots.txt found - allowing by default"
        };
      }
      const result = this.checkRules(urlObj.pathname, robotsTxt);
      console.log(`\u{1F916} [Robots] ${result.allowed ? "\u2705 Allowed" : "\u274C Blocked"}: ${url} - ${result.reason}`);
      return result;
    } catch (error) {
      console.warn(`\u26A0\uFE0F [Robots] Error checking robots.txt for ${url}:`, error);
      return {
        allowed: true,
        sitemaps: [],
        reason: `Error checking robots.txt: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
  /**
   * Get sitemaps listed in robots.txt for a domain
   */
  async getSitemaps(domain) {
    try {
      const robotsUrl = `https://${domain}/robots.txt`;
      const robotsTxt = await this.getRobotsTxt(robotsUrl);
      return robotsTxt ? robotsTxt.sitemaps : [];
    } catch (error) {
      console.warn(`\u26A0\uFE0F [Robots] Error getting sitemaps for ${domain}:`, error);
      return [];
    }
  }
  /**
   * Get the recommended crawl delay for a domain
   */
  async getCrawlDelay(domain) {
    try {
      const robotsUrl = `https://${domain}/robots.txt`;
      const robotsTxt = await this.getRobotsTxt(robotsUrl);
      if (!robotsTxt) return void 0;
      const rule = this.findBestMatchingRule(robotsTxt.rules);
      return rule?.crawlDelay;
    } catch (error) {
      console.warn(`\u26A0\uFE0F [Robots] Error getting crawl delay for ${domain}:`, error);
      return void 0;
    }
  }
  async getRobotsTxt(robotsUrl) {
    const cached = this.cache.get(robotsUrl);
    if (cached && Date.now() < cached.expiresAt) {
      return cached;
    }
    try {
      console.log(`\u{1F916} [Robots] Fetching ${robotsUrl}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
      const response = await fetch(robotsUrl, {
        headers: {
          "User-Agent": this.userAgent
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`\u{1F916} [Robots] No robots.txt found at ${robotsUrl}`);
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const text = await response.text();
      const robotsTxt = this.parseRobotsTxt(text);
      this.cache.set(robotsUrl, robotsTxt);
      console.log(`\u{1F916} [Robots] Successfully parsed robots.txt for ${new URL(robotsUrl).hostname}`);
      return robotsTxt;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.warn(`\u26A0\uFE0F [Robots] Timeout fetching ${robotsUrl}`);
      } else {
        console.warn(`\u26A0\uFE0F [Robots] Error fetching ${robotsUrl}:`, error);
      }
      return null;
    }
  }
  parseRobotsTxt(text) {
    const lines = text.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
    const rules = [];
    const globalSitemaps = [];
    let currentRule = null;
    for (const line of lines) {
      const [key, ...valueParts] = line.split(":");
      const value = valueParts.join(":").trim();
      const lowerKey = key.toLowerCase().trim();
      switch (lowerKey) {
        case "user-agent":
          if (currentRule) {
            rules.push(this.completeRule(currentRule));
          }
          currentRule = {
            userAgent: value.toLowerCase(),
            disallows: [],
            allows: [],
            sitemaps: []
          };
          break;
        case "disallow":
          if (currentRule) {
            currentRule.disallows = currentRule.disallows || [];
            if (value) {
              currentRule.disallows.push(value);
            }
          }
          break;
        case "allow":
          if (currentRule) {
            currentRule.allows = currentRule.allows || [];
            if (value) {
              currentRule.allows.push(value);
            }
          }
          break;
        case "crawl-delay":
          if (currentRule && value) {
            const delay = parseFloat(value);
            if (!isNaN(delay)) {
              currentRule.crawlDelay = delay * 1e3;
            }
          }
          break;
        case "sitemap":
          if (value) {
            globalSitemaps.push(value);
            if (currentRule) {
              currentRule.sitemaps = currentRule.sitemaps || [];
              currentRule.sitemaps.push(value);
            }
          }
          break;
      }
    }
    if (currentRule) {
      rules.push(this.completeRule(currentRule));
    }
    const now = Date.now();
    return {
      rules,
      sitemaps: globalSitemaps,
      fetchedAt: now,
      expiresAt: now + this.cacheTimeout
    };
  }
  completeRule(partial) {
    return {
      userAgent: partial.userAgent || "*",
      disallows: partial.disallows || [],
      allows: partial.allows || [],
      crawlDelay: partial.crawlDelay,
      sitemaps: partial.sitemaps || []
    };
  }
  checkRules(path, robotsTxt) {
    const rule = this.findBestMatchingRule(robotsTxt.rules);
    if (!rule) {
      return {
        allowed: true,
        sitemaps: robotsTxt.sitemaps,
        reason: "No applicable rules found"
      };
    }
    for (const allowPattern of rule.allows) {
      if (this.matchesPattern(path, allowPattern)) {
        return {
          allowed: true,
          crawlDelay: rule.crawlDelay,
          sitemaps: robotsTxt.sitemaps,
          reason: `Explicitly allowed by pattern: ${allowPattern}`
        };
      }
    }
    for (const disallowPattern of rule.disallows) {
      if (this.matchesPattern(path, disallowPattern)) {
        return {
          allowed: false,
          crawlDelay: rule.crawlDelay,
          sitemaps: robotsTxt.sitemaps,
          reason: `Blocked by pattern: ${disallowPattern}`
        };
      }
    }
    return {
      allowed: true,
      crawlDelay: rule.crawlDelay,
      sitemaps: robotsTxt.sitemaps,
      reason: "No matching disallow rules"
    };
  }
  findBestMatchingRule(rules) {
    const exactMatch = rules.find((rule) => rule.userAgent === this.userAgent.toLowerCase());
    if (exactMatch) return exactMatch;
    const wildcardMatch = rules.find((rule) => rule.userAgent === "*");
    if (wildcardMatch) return wildcardMatch;
    return null;
  }
  matchesPattern(path, pattern) {
    if (pattern === "") {
      return false;
    }
    if (pattern === "/") {
      return true;
    }
    if (pattern.includes("*")) {
      const regexPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
      const regex = new RegExp("^" + regexPattern);
      return regex.test(path);
    }
    return path.startsWith(pattern);
  }
  // Clear cache (useful for testing)
  clearCache() {
    this.cache.clear();
  }
  // Get cache stats
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([url, data]) => ({
        url,
        fetchedAt: new Date(data.fetchedAt).toISOString(),
        expiresAt: new Date(data.expiresAt).toISOString(),
        rulesCount: data.rules.length,
        sitemapsCount: data.sitemaps.length
      }))
    };
  }
};
var globalRobotsChecker = new RobotsChecker();

// src/extractors/rss-discovery.ts
var RSSDiscovery = class {
  constructor() {
    this.userAgent = "Mozilla/5.0 (compatible; AtomizeNews/1.0; +https://atomize-news.vercel.app)";
    this.timeout = 1e4;
  }
  // 10 seconds
  // private readonly maxRedirects = 3; // Currently unused
  /**
   * Discover RSS feeds from a given URL
   */
  async discoverFeeds(url) {
    console.log(`\u{1F50D} [RSSDiscovery] Starting feed discovery for ${url}`);
    const feeds = /* @__PURE__ */ new Map();
    try {
      const directFeed = await this.checkDirectFeed(url);
      if (directFeed) {
        feeds.set(directFeed.url, directFeed);
        console.log(`\u2705 [RSSDiscovery] Direct feed found: ${directFeed.url}`);
        return Array.from(feeds.values());
      }
      const robotsCheck = await globalRobotsChecker.isAllowed(url);
      if (!robotsCheck.allowed) {
        console.warn(`\u{1F916} [RSSDiscovery] URL blocked by robots.txt: ${url} - ${robotsCheck.reason}`);
        return [];
      }
      const html = await this.fetchPage(url);
      if (!html) {
        return [];
      }
      const linkFeeds = this.extractFeedsFromHTML(html, url);
      linkFeeds.forEach((feed) => feeds.set(feed.url, feed));
      if (feeds.size === 0) {
        const commonPathFeeds = await this.checkCommonPaths(url);
        commonPathFeeds.forEach((feed) => feeds.set(feed.url, feed));
      }
      if (feeds.size === 0) {
        const contentFeeds = await this.scanForFeedContent(html, url);
        contentFeeds.forEach((feed) => feeds.set(feed.url, feed));
      }
      const discoveredFeeds = Array.from(feeds.values());
      discoveredFeeds.sort((a, b) => b.confidence - a.confidence);
      console.log(`\u{1F50D} [RSSDiscovery] Discovered ${discoveredFeeds.length} feeds for ${url}`);
      return discoveredFeeds;
    } catch (error) {
      console.error(`\u274C [RSSDiscovery] Error discovering feeds for ${url}:`, error);
      return [];
    }
  }
  /**
   * Check if the URL itself is a direct feed
   */
  async checkDirectFeed(url) {
    try {
      const response = await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
          const res = await fetch(url, {
            method: "HEAD",
            headers: { "User-Agent": this.userAgent },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          return res;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });
      const contentType = response.headers.get("content-type") || "";
      if (this.isFeedContentType(contentType)) {
        const type = this.determineFeedType(contentType);
        return {
          url,
          type,
          source: "link-tag",
          confidence: 1
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }
  /**
   * Fetch HTML page content
   */
  async fetchPage(url) {
    try {
      return await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
          const response = await fetch(url, {
            headers: { "User-Agent": this.userAgent },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("text/html")) {
            throw new Error(`Not HTML content: ${contentType}`);
          }
          return await response.text();
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });
    } catch (error) {
      console.error(`\u274C [RSSDiscovery] Error fetching page ${url}:`, error);
      return null;
    }
  }
  /**
   * Extract feed URLs from HTML link tags
   */
  extractFeedsFromHTML(html, baseUrl) {
    const feeds = [];
    try {
      const $ = cheerio.load(html);
      $('link[rel="alternate"]').each((_, element) => {
        const $link = $(element);
        const type = $link.attr("type");
        const href = $link.attr("href");
        const title = $link.attr("title");
        if (href && this.isFeedContentType(type || "")) {
          const absoluteUrl = this.resolveUrl(href, baseUrl);
          if (absoluteUrl) {
            feeds.push({
              url: absoluteUrl,
              title: title || void 0,
              type: this.determineFeedType(type || ""),
              source: "link-tag",
              confidence: 0.9
            });
          }
        }
      });
      $("a[href]").each((_, element) => {
        const $link = $(element);
        const href = $link.attr("href");
        const text = $link.text().toLowerCase().trim();
        if (href && this.isFeedLikeLink(href, text)) {
          const absoluteUrl = this.resolveUrl(href, baseUrl);
          if (absoluteUrl && !feeds.some((f) => f.url === absoluteUrl)) {
            feeds.push({
              url: absoluteUrl,
              title: $link.text().trim() || void 0,
              type: this.guessFeedType(href),
              source: "content-scan",
              confidence: 0.6
            });
          }
        }
      });
    } catch (error) {
      console.error(`\u274C [RSSDiscovery] Error parsing HTML for feeds:`, error);
    }
    return feeds;
  }
  /**
   * Check common feed paths
   */
  async checkCommonPaths(url) {
    const baseUrl = new URL(url);
    const commonPaths = [
      "/feed/",
      "/feed.xml",
      "/rss/",
      "/rss.xml",
      "/feeds/",
      "/feeds.xml",
      "/atom.xml",
      "/index.xml",
      "/blog/feed/",
      "/blog/rss.xml",
      "/news/feed/",
      "/news/rss.xml"
    ];
    const feeds = [];
    for (const path of commonPaths) {
      try {
        const testUrl = `${baseUrl.protocol}//${baseUrl.host}${path}`;
        const robotsCheck = await globalRobotsChecker.isAllowed(testUrl);
        if (!robotsCheck.allowed) {
          continue;
        }
        const isValid = await this.validateFeedUrl(testUrl);
        if (isValid) {
          feeds.push({
            url: testUrl,
            type: this.guessFeedType(path),
            source: "common-path",
            confidence: 0.7
          });
        }
      } catch (error) {
        continue;
      }
    }
    return feeds;
  }
  /**
   * Scan HTML content for feed-like patterns
   */
  async scanForFeedContent(html, baseUrl) {
    const feeds = [];
    try {
      const $ = cheerio.load(html);
      const text = $.text();
      const urlRegex = /https?:\/\/[^\s]+(?:feed|rss|atom)[^\s]*/gi;
      const matches = text.match(urlRegex);
      if (matches) {
        for (const match of matches) {
          const cleanUrl = match.replace(/[.,;:!?)]$/, "");
          const absoluteUrl = this.resolveUrl(cleanUrl, baseUrl);
          if (absoluteUrl && !feeds.some((f) => f.url === absoluteUrl)) {
            const isValid = await this.validateFeedUrl(absoluteUrl);
            if (isValid) {
              feeds.push({
                url: absoluteUrl,
                type: this.guessFeedType(absoluteUrl),
                source: "content-scan",
                confidence: 0.5
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`\u274C [RSSDiscovery] Error scanning content for feeds:`, error);
    }
    return feeds;
  }
  /**
   * Validate if a URL is actually a feed
   */
  async validateFeedUrl(url) {
    try {
      return await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5e3);
        try {
          const response = await fetch(url, {
            method: "HEAD",
            headers: { "User-Agent": this.userAgent },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            return false;
          }
          const contentType = response.headers.get("content-type") || "";
          return this.isFeedContentType(contentType);
        } catch (error) {
          clearTimeout(timeoutId);
          return false;
        }
      });
    } catch (error) {
      return false;
    }
  }
  /**
   * Resolve relative URLs to absolute URLs
   */
  resolveUrl(url, baseUrl) {
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      return null;
    }
  }
  /**
   * Check if content type indicates a feed
   */
  isFeedContentType(contentType) {
    const lowerType = contentType.toLowerCase();
    return lowerType.includes("application/rss+xml") || lowerType.includes("application/atom+xml") || lowerType.includes("application/rdf+xml") || lowerType.includes("text/xml") || lowerType.includes("application/xml");
  }
  /**
   * Determine feed type from content type
   */
  determineFeedType(contentType) {
    const lowerType = contentType.toLowerCase();
    if (lowerType.includes("atom")) return "atom";
    if (lowerType.includes("rdf")) return "rdf";
    return "rss";
  }
  /**
   * Guess feed type from URL or text
   */
  guessFeedType(urlOrText) {
    const lower = urlOrText.toLowerCase();
    if (lower.includes("atom")) return "atom";
    if (lower.includes("rdf")) return "rdf";
    return "rss";
  }
  /**
   * Check if a link looks like it could be a feed
   */
  isFeedLikeLink(href, text) {
    const lowerHref = href.toLowerCase();
    const lowerText = text.toLowerCase();
    const feedKeywords = ["rss", "feed", "atom", "xml", "syndication"];
    return feedKeywords.some(
      (keyword) => lowerHref.includes(keyword) || lowerText.includes(keyword)
    );
  }
};
var globalRSSDiscovery = new RSSDiscovery();

// src/extractors/sitemap-parser.ts
var cheerio2 = __toESM(require("cheerio"));
var SitemapParser = class {
  constructor() {
    this.userAgent = "Mozilla/5.0 (compatible; AtomizeNews/1.0; +https://atomize-news.vercel.app)";
    this.timeout = 15e3;
    // 15 seconds for sitemaps
    this.maxSitemapSize = 50 * 1024 * 1024;
    // 50MB max
    this.maxEntries = 5e4;
    // Max entries per sitemap
    this.recentTimeframe = 48 * 60 * 60 * 1e3;
  }
  // 48 hours in ms
  /**
   * Parse sitemap from URL and return entries
   */
  async parseSitemap(url, options = {}) {
    console.log(`\u{1F5FA}\uFE0F [Sitemap] Starting to parse ${url}`);
    try {
      const robotsCheck = await globalRobotsChecker.isAllowed(url);
      if (!robotsCheck.allowed) {
        console.warn(`\u{1F916} [Sitemap] URL blocked by robots.txt: ${url} - ${robotsCheck.reason}`);
        return [];
      }
      const xml = await this.fetchSitemap(url);
      if (!xml) {
        return [];
      }
      if (this.isSitemapIndex(xml)) {
        return await this.parseSitemapIndex(xml, options);
      } else {
        return this.parseRegularSitemap(xml, options);
      }
    } catch (error) {
      console.error(`\u274C [Sitemap] Error parsing sitemap ${url}:`, error);
      return [];
    }
  }
  /**
   * Discover sitemaps from domain
   */
  async discoverSitemaps(domain) {
    const sitemaps = [];
    try {
      const robotsSitemaps = await globalRobotsChecker.getSitemaps(domain);
      sitemaps.push(...robotsSitemaps);
      const commonPaths = [
        "/sitemap.xml",
        "/sitemap_index.xml",
        "/sitemaps.xml",
        "/sitemap/",
        "/news-sitemap.xml"
      ];
      for (const path of commonPaths) {
        const sitemapUrl = `https://${domain}${path}`;
        if (sitemaps.includes(sitemapUrl)) {
          continue;
        }
        const exists = await this.checkSitemapExists(sitemapUrl);
        if (exists) {
          sitemaps.push(sitemapUrl);
        }
      }
      console.log(`\u{1F5FA}\uFE0F [Sitemap] Discovered ${sitemaps.length} sitemaps for ${domain}`);
      return Array.from(new Set(sitemaps));
    } catch (error) {
      console.error(`\u274C [Sitemap] Error discovering sitemaps for ${domain}:`, error);
      return [];
    }
  }
  /**
   * Get recent entries from all sitemaps for a domain
   */
  async getRecentEntries(domain, options = {}) {
    const hoursBack = options.hoursBack || 48;
    const maxEntries = options.maxEntries || 1e3;
    const sitemaps = await this.discoverSitemaps(domain);
    const allEntries = [];
    for (const sitemapUrl of sitemaps) {
      try {
        const entries = await this.parseSitemap(sitemapUrl, {
          filterRecent: true,
          maxEntries: Math.floor(maxEntries / sitemaps.length),
          // Distribute quota
          includeNews: true
        });
        allEntries.push(...entries);
      } catch (error) {
        console.warn(`\u26A0\uFE0F [Sitemap] Error parsing ${sitemapUrl}:`, error);
        continue;
      }
    }
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1e3);
    const recentEntries = allEntries.filter((entry) => entry.lastmod && entry.lastmod >= cutoffTime).sort((a, b) => {
      if (!a.lastmod || !b.lastmod) return 0;
      return b.lastmod.getTime() - a.lastmod.getTime();
    }).slice(0, maxEntries);
    console.log(`\u{1F5FA}\uFE0F [Sitemap] Found ${recentEntries.length} recent entries from ${domain}`);
    return recentEntries;
  }
  async fetchSitemap(url) {
    try {
      return await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent": this.userAgent,
              "Accept": "application/xml, text/xml, */*"
            },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const contentLength = response.headers.get("content-length");
          if (contentLength && parseInt(contentLength) > this.maxSitemapSize) {
            throw new Error(`Sitemap too large: ${contentLength} bytes`);
          }
          const xml = await response.text();
          if (xml.length > this.maxSitemapSize) {
            throw new Error(`Sitemap too large: ${xml.length} bytes`);
          }
          return xml;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });
    } catch (error) {
      console.error(`\u274C [Sitemap] Error fetching ${url}:`, error);
      return null;
    }
  }
  async checkSitemapExists(url) {
    try {
      return await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5e3);
        try {
          const response = await fetch(url, {
            method: "HEAD",
            headers: { "User-Agent": this.userAgent },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          return response.ok;
        } catch (error) {
          clearTimeout(timeoutId);
          return false;
        }
      });
    } catch (error) {
      return false;
    }
  }
  isSitemapIndex(xml) {
    return xml.includes("<sitemapindex") || xml.includes("</sitemapindex>");
  }
  async parseSitemapIndex(xml, options) {
    console.log(`\u{1F5FA}\uFE0F [Sitemap] Parsing sitemap index`);
    const $ = cheerio2.load(xml, { xmlMode: true });
    const sitemaps = [];
    const allEntries = [];
    $("sitemap").each((_, element) => {
      const $element = $(element);
      const loc = $element.find("loc").first().text().trim();
      if (loc) {
        sitemaps.push(loc);
      }
    });
    console.log(`\u{1F5FA}\uFE0F [Sitemap] Found ${sitemaps.length} sitemaps in index`);
    const entriesPerSitemap = Math.floor((options.maxEntries || this.maxEntries) / sitemaps.length);
    for (const sitemapUrl of sitemaps.slice(0, 10)) {
      try {
        const sitemapXml = await this.fetchSitemap(sitemapUrl);
        if (sitemapXml) {
          const entries = this.parseRegularSitemap(sitemapXml, {
            ...options,
            maxEntries: entriesPerSitemap
          });
          allEntries.push(...entries);
        }
      } catch (error) {
        console.warn(`\u26A0\uFE0F [Sitemap] Error parsing sitemap ${sitemapUrl}:`, error);
        continue;
      }
    }
    return allEntries;
  }
  parseRegularSitemap(xml, options) {
    console.log(`\u{1F5FA}\uFE0F [Sitemap] Parsing regular sitemap`);
    const $ = cheerio2.load(xml, { xmlMode: true });
    const entries = [];
    const maxEntries = options.maxEntries || this.maxEntries;
    const cutoffTime = options.filterRecent ? new Date(Date.now() - this.recentTimeframe) : null;
    $("url").each((_index, element) => {
      if (entries.length >= maxEntries) {
        return false;
      }
      const $element = $(element);
      const loc = $element.find("loc").first().text().trim();
      if (!loc) return void 0;
      const entry = { url: loc };
      const lastmodText = $element.find("lastmod").first().text().trim();
      if (lastmodText) {
        const lastmod = new Date(lastmodText);
        if (!isNaN(lastmod.getTime())) {
          entry.lastmod = lastmod;
        }
      }
      if (cutoffTime && entry.lastmod && entry.lastmod < cutoffTime) {
        return void 0;
      }
      const changefreq = $element.find("changefreq").first().text().trim();
      if (changefreq) {
        entry.changefreq = changefreq;
      }
      const priorityText = $element.find("priority").first().text().trim();
      if (priorityText) {
        const priority = parseFloat(priorityText);
        if (!isNaN(priority)) {
          entry.priority = priority;
        }
      }
      if (options.includeImages) {
        const images = [];
        $element.find("image\\:image").each((_, imgElement) => {
          const $img = $(imgElement);
          const imgLoc = $img.find("image\\:loc").first().text().trim();
          if (imgLoc) {
            images.push({
              loc: imgLoc,
              caption: $img.find("image\\:caption").first().text().trim() || void 0,
              title: $img.find("image\\:title").first().text().trim() || void 0
            });
          }
        });
        if (images.length > 0) {
          entry.images = images;
        }
      }
      if (options.includeNews) {
        const $news = $element.find("news\\:news");
        if ($news.length > 0) {
          const title = $news.find("news\\:title").first().text().trim();
          if (title) {
            entry.news = { title };
            const pubDateText = $news.find("news\\:publication_date").first().text().trim();
            if (pubDateText) {
              const pubDate = new Date(pubDateText);
              if (!isNaN(pubDate.getTime())) {
                entry.news.publishedDate = pubDate;
              }
            }
            const keywords = $news.find("news\\:keywords").first().text().trim();
            if (keywords) {
              entry.news.keywords = keywords.split(",").map((k) => k.trim());
            }
          }
        }
      }
      entries.push(entry);
      return void 0;
    });
    console.log(`\u{1F5FA}\uFE0F [Sitemap] Parsed ${entries.length} entries from sitemap`);
    return entries;
  }
  /**
   * Validate sitemap format
   */
  validateSitemapFormat(xml) {
    const errors = [];
    try {
      const $ = cheerio2.load(xml, { xmlMode: true });
      const hasUrlset = $("urlset").length > 0;
      const hasSitemapIndex = $("sitemapindex").length > 0;
      if (!hasUrlset && !hasSitemapIndex) {
        errors.push("Missing required root element: <urlset> or <sitemapindex>");
      }
      if (hasUrlset) {
        const urlCount = $("url").length;
        if (urlCount > 5e4) {
          errors.push(`Too many URLs: ${urlCount} (max: 50,000)`);
        }
      }
      $("url").each((index, element) => {
        const $element = $(element);
        const loc = $element.find("loc").first().text().trim();
        if (!loc) {
          errors.push(`URL entry ${index + 1} missing <loc> element`);
        } else {
          try {
            new URL(loc);
          } catch {
            errors.push(`Invalid URL in entry ${index + 1}: ${loc}`);
          }
        }
        const lastmod = $element.find("lastmod").first().text().trim();
        if (lastmod) {
          const date = new Date(lastmod);
          if (isNaN(date.getTime())) {
            errors.push(`Invalid lastmod date in entry ${index + 1}: ${lastmod}`);
          }
        }
        const priority = $element.find("priority").first().text().trim();
        if (priority) {
          const priorityNum = parseFloat(priority);
          if (isNaN(priorityNum) || priorityNum < 0 || priorityNum > 1) {
            errors.push(`Invalid priority in entry ${index + 1}: ${priority} (must be 0-1)`);
          }
        }
      });
    } catch (error) {
      errors.push(`XML parsing error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }
};
var globalSitemapParser = new SitemapParser();

// src/extractors/html-scraper.ts
var cheerio3 = __toESM(require("cheerio"));
var PERPLEXITY_MODELS = {
  SONAR: "llama-3.1-sonar-small-128k-online",
  SONAR_PRO: "llama-3.1-sonar-large-128k-online"
};
var HTMLScraper = class {
  constructor() {
    this.userAgent = "Mozilla/5.0 (compatible; AtomizeNews/1.0; +https://atomize-news.vercel.app)";
    this.timeout = 1e4;
    // 10 seconds
    this.defaultConfig = {
      selectors: {
        articleLinks: [
          "article a[href]",
          ".article a[href]",
          ".post a[href]",
          ".story a[href]",
          ".news-item a[href]",
          ".content-item a[href]",
          "h1 a[href]",
          "h2 a[href]",
          "h3 a[href]",
          ".headline a[href]",
          ".title a[href]"
        ],
        titleSelectors: [
          "h1",
          "h2",
          "h3",
          ".headline",
          ".title",
          ".article-title",
          ".post-title",
          ".story-title"
        ],
        dateSelectors: [
          "time[datetime]",
          ".date",
          ".published",
          ".timestamp",
          ".publish-date",
          ".article-date"
        ],
        excludeSelectors: [
          ".advertisement",
          ".ads",
          ".sidebar",
          ".footer",
          ".navigation",
          ".menu",
          ".comments",
          ".related"
        ]
      },
      filters: {
        minTitleLength: 10,
        maxTitleLength: 200,
        includePatterns: [
          /\/article\//i,
          /\/post\//i,
          /\/story\//i,
          /\/news\//i,
          /\/blog\//i,
          /\/\d{4}\/\d{2}\/\d{2}\//,
          // Date patterns
          /\/\d{4}\/\d{2}\//
        ],
        excludePatterns: [
          /\/(tag|category|author|search|archive)\//i,
          /\/(login|register|contact|about)\//i,
          /\.(pdf|jpg|jpeg|png|gif|mp4|zip|doc)$/i,
          /#/,
          // Skip hash links
          /javascript:/i,
          /mailto:/i
        ]
      },
      limits: {
        maxLinksPerPage: 100,
        maxDepth: 3
      }
    };
  }
  /**
   * Extract article links from a webpage
   */
  async extractArticleLinks(url, config = {}) {
    console.log(`\u{1F4F0} [HTMLScraper] Starting to extract articles from ${url}`);
    try {
      const robotsCheck = await globalRobotsChecker.isAllowed(url);
      if (!robotsCheck.allowed) {
        console.warn(`\u{1F916} [HTMLScraper] URL blocked by robots.txt: ${url} - ${robotsCheck.reason}`);
        if (config.perplexityFallback?.enabled && config.perplexityFallback?.useForRobotsBlocked) {
          console.log(`\u{1F504} [HTMLScraper] Attempting Perplexity fallback for robots-blocked URL`);
          return await this.extractWithPerplexity(url, config);
        }
        return [];
      }
      const html = await this.fetchPage(url);
      if (!html) {
        if (config.perplexityFallback?.enabled && config.perplexityFallback?.useForParseFailed) {
          console.log(`\u{1F504} [HTMLScraper] Attempting Perplexity fallback for failed fetch`);
          return await this.extractWithPerplexity(url, config);
        }
        return [];
      }
      const mergedConfig = this.mergeConfig(this.defaultConfig, config);
      const articles = this.parseArticleLinks(html, url, mergedConfig);
      if (articles.length === 0 && config.perplexityFallback?.enabled && config.perplexityFallback?.useForParseFailed) {
        console.log(`\u{1F504} [HTMLScraper] No articles found, attempting Perplexity fallback`);
        return await this.extractWithPerplexity(url, config);
      }
      console.log(`\u{1F4F0} [HTMLScraper] Extracted ${articles.length} article links from ${url}`);
      return articles;
    } catch (error) {
      console.error(`\u274C [HTMLScraper] Error extracting articles from ${url}:`, error);
      if (config.perplexityFallback?.enabled) {
        console.log(`\u{1F504} [HTMLScraper] Attempting Perplexity fallback after error`);
        return await this.extractWithPerplexity(url, config);
      }
      return [];
    }
  }
  /**
   * Extract articles from multiple pages with pagination support
   */
  async extractFromMultiplePages(startUrl, config = {}, options = {}) {
    const maxPages = options.maxPages || 5;
    const allArticles = [];
    const visitedUrls = /* @__PURE__ */ new Set();
    const urlsToVisit = [startUrl];
    let pageCount = 0;
    while (urlsToVisit.length > 0 && pageCount < maxPages) {
      const currentUrl = urlsToVisit.shift();
      if (visitedUrls.has(currentUrl)) {
        continue;
      }
      visitedUrls.add(currentUrl);
      pageCount++;
      console.log(`\u{1F4F0} [HTMLScraper] Processing page ${pageCount}/${maxPages}: ${currentUrl}`);
      try {
        const articles = await this.extractArticleLinks(currentUrl, config);
        allArticles.push(...articles);
        if (pageCount < maxPages) {
          const nextPageUrls = await this.findNextPageUrls(currentUrl, options);
          for (const nextUrl of nextPageUrls) {
            if (!visitedUrls.has(nextUrl)) {
              urlsToVisit.push(nextUrl);
            }
          }
        }
      } catch (error) {
        console.warn(`\u26A0\uFE0F [HTMLScraper] Error processing page ${currentUrl}:`, error);
        continue;
      }
    }
    const uniqueArticles = this.deduplicateArticles(allArticles);
    uniqueArticles.sort((a, b) => b.confidence - a.confidence);
    console.log(`\u{1F4F0} [HTMLScraper] Total extracted ${uniqueArticles.length} unique articles from ${pageCount} pages`);
    return uniqueArticles;
  }
  async fetchPage(url) {
    try {
      return await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent": this.userAgent,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("text/html")) {
            throw new Error(`Not HTML content: ${contentType}`);
          }
          return await response.text();
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });
    } catch (error) {
      console.error(`\u274C [HTMLScraper] Error fetching page ${url}:`, error);
      return null;
    }
  }
  parseArticleLinks(html, baseUrl, config) {
    const articles = [];
    try {
      const $ = cheerio3.load(html);
      const seenUrls = /* @__PURE__ */ new Set();
      config.selectors?.excludeSelectors?.forEach((selector) => {
        $(selector).remove();
      });
      config.selectors?.articleLinks?.forEach((selector) => {
        $(selector).each((_, element) => {
          const $link = $(element);
          const href = $link.attr("href");
          if (!href) return;
          const absoluteUrl = this.resolveUrl(href, baseUrl);
          if (!absoluteUrl || seenUrls.has(absoluteUrl)) {
            return;
          }
          if (!this.passesFilters(absoluteUrl, config.filters)) {
            return;
          }
          seenUrls.add(absoluteUrl);
          const article = this.extractArticleInfo($link, $, absoluteUrl);
          if (article && articles.length < (config.limits?.maxLinksPerPage || 100)) {
            articles.push(article);
          }
        });
      });
      const structuredArticles = this.extractStructuredData($, baseUrl);
      structuredArticles.forEach((article) => {
        if (!seenUrls.has(article.url)) {
          seenUrls.add(article.url);
          articles.push(article);
        }
      });
    } catch (error) {
      console.error(`\u274C [HTMLScraper] Error parsing HTML:`, error);
    }
    return articles;
  }
  extractArticleInfo($link, _$, url) {
    let title = $link.text().trim();
    let confidence = 0.5;
    let publishedDate;
    let description;
    if (!title || title.length < 5) {
      const $parent2 = $link.closest("article, .article, .post, .story, .news-item");
      if ($parent2.length > 0) {
        const betterTitle = $parent2.find("h1, h2, h3, .headline, .title").first().text().trim();
        if (betterTitle && betterTitle.length > title.length) {
          title = betterTitle;
          confidence += 0.2;
        }
      }
    }
    const $dateElement = $link.closest("article, .article, .post").find("time[datetime], .date, .published").first();
    if ($dateElement.length > 0) {
      const dateText = $dateElement.attr("datetime") || $dateElement.text().trim();
      if (dateText) {
        const date = this.parseDate(dateText);
        if (date) {
          publishedDate = date;
          confidence += 0.1;
        }
      }
    }
    const $parent = $link.closest("article, .article, .post, .story");
    if ($parent.length > 0) {
      description = $parent.find(".excerpt, .summary, p").first().text().trim();
      if (description && description.length > 50) {
        description = description.substring(0, 300) + "...";
        confidence += 0.1;
      }
    }
    if (this.isLikelyArticleUrl(url)) {
      confidence += 0.2;
    }
    if (title && title.length >= 20 && title.length <= 120) {
      confidence += 0.1;
    }
    if (!title || title.length < 10) {
      return null;
    }
    return {
      url,
      title,
      publishedDate,
      description,
      confidence: Math.min(confidence, 1),
      source: "link-text"
    };
  }
  extractStructuredData($, baseUrl) {
    const articles = [];
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const jsonText = $(element).html();
        if (!jsonText) return;
        const data = JSON.parse(jsonText);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item["@type"] === "Article" || item["@type"] === "NewsArticle") {
            const url = item.url || item.mainEntityOfPage?.["@id"];
            if (url) {
              const absoluteUrl = this.resolveUrl(url, baseUrl);
              if (absoluteUrl) {
                articles.push({
                  url: absoluteUrl,
                  title: item.headline || item.name,
                  publishedDate: item.datePublished ? new Date(item.datePublished) : void 0,
                  description: item.description,
                  confidence: 0.9,
                  source: "structured-data"
                });
              }
            }
          }
        }
      } catch (error) {
      }
    });
    return articles;
  }
  async findNextPageUrls(currentUrl, options) {
    try {
      const html = await this.fetchPage(currentUrl);
      if (!html) return [];
      const $ = cheerio3.load(html);
      const nextUrls = [];
      const paginationSelector = options.paginationSelector || 'a[rel="next"], .pagination a, .next a, .pager a, [class*="next"] a';
      $(paginationSelector).each((_, element) => {
        const $link = $(element);
        const href = $link.attr("href");
        const text = $link.text().toLowerCase().trim();
        if (href && (text.includes("next") || text.includes("\u2192") || text === ">")) {
          const absoluteUrl = this.resolveUrl(href, currentUrl);
          if (absoluteUrl) {
            nextUrls.push(absoluteUrl);
          }
        }
      });
      return Array.from(new Set(nextUrls));
    } catch (error) {
      console.warn(`\u26A0\uFE0F [HTMLScraper] Error finding next page URLs:`, error);
      return [];
    }
  }
  deduplicateArticles(articles) {
    const seen = /* @__PURE__ */ new Map();
    for (const article of articles) {
      const existing = seen.get(article.url);
      if (!existing || article.confidence > existing.confidence) {
        seen.set(article.url, article);
      }
    }
    return Array.from(seen.values());
  }
  passesFilters(url, filters) {
    if (!filters) return true;
    if (filters.excludePatterns?.some((pattern) => pattern.test(url))) {
      return false;
    }
    if (filters.includePatterns?.length && !filters.includePatterns.some((pattern) => pattern.test(url))) {
      return false;
    }
    if (filters.allowedDomains?.length) {
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.toLowerCase();
        if (!filters.allowedDomains.some(
          (allowed) => domain === allowed.toLowerCase() || domain.endsWith("." + allowed.toLowerCase())
        )) {
          return false;
        }
      } catch {
        return false;
      }
    }
    return true;
  }
  isLikelyArticleUrl(url) {
    const urlLower = url.toLowerCase();
    const articlePatterns = [
      /\/article[s]?\//,
      /\/post[s]?\//,
      /\/story\//,
      /\/stories\//,
      /\/news\//,
      /\/blog\//,
      /\/\d{4}\/\d{2}\/\d{2}\//,
      // Date-based URLs
      /\/\d{4}\/\d{2}\//
    ];
    return articlePatterns.some((pattern) => pattern.test(urlLower));
  }
  parseDate(dateString) {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        const formats = [
          /(\d{4})-(\d{2})-(\d{2})/,
          // YYYY-MM-DD
          /(\d{2})\/(\d{2})\/(\d{4})/,
          // MM/DD/YYYY
          /(\d{2})\.(\d{2})\.(\d{4})/
          // DD.MM.YYYY
        ];
        for (const format of formats) {
          const match = dateString.match(format);
          if (match) {
            const [, p1, p2, p3] = match;
            const testDate = /* @__PURE__ */ new Date(`${p1}-${p2}-${p3}`);
            if (!isNaN(testDate.getTime())) {
              return testDate;
            }
          }
        }
        return null;
      }
      return date;
    } catch {
      return null;
    }
  }
  resolveUrl(url, baseUrl) {
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      return null;
    }
  }
  mergeConfig(defaultConfig, userConfig) {
    return {
      selectors: {
        ...defaultConfig.selectors,
        ...userConfig.selectors,
        articleLinks: [
          ...defaultConfig.selectors?.articleLinks || [],
          ...userConfig.selectors?.articleLinks || []
        ]
      },
      filters: {
        ...defaultConfig.filters,
        ...userConfig.filters,
        includePatterns: [
          ...defaultConfig.filters?.includePatterns || [],
          ...userConfig.filters?.includePatterns || []
        ],
        excludePatterns: [
          ...defaultConfig.filters?.excludePatterns || [],
          ...userConfig.filters?.excludePatterns || []
        ]
      },
      limits: {
        ...defaultConfig.limits,
        ...userConfig.limits
      },
      perplexityFallback: {
        ...defaultConfig.perplexityFallback,
        ...userConfig.perplexityFallback
      }
    };
  }
  /**
   * Use Perplexity API to extract articles when traditional scraping fails
   * Requires PERPLEXITY_API_KEY environment variable to be set
   */
  async extractWithPerplexity(url, config) {
    try {
      if (!process.env.PERPLEXITY_API_KEY) {
        console.warn(`\u26A0\uFE0F [HTMLScraper] Perplexity API key not configured - set PERPLEXITY_API_KEY env variable`);
        return [];
      }
      const domain = new URL(url).hostname;
      const query = `Find recent news articles and stories from ${domain}. List article titles and URLs.`;
      console.log(`\u{1F50D} [HTMLScraper] Using Perplexity to find articles from ${domain}`);
      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.PERPLEXITY_API_KEY}`
        },
        body: JSON.stringify({
          model: config.perplexityFallback?.model || PERPLEXITY_MODELS.SONAR,
          messages: [{ role: "user", content: query }],
          max_tokens: 1e3,
          return_citations: true,
          search_recency_filter: config.perplexityFallback?.searchRecency || "day"
        })
      });
      if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      const articles = [];
      if (data.citations && Array.isArray(data.citations)) {
        for (const citation of data.citations) {
          try {
            const citationUrl = citation;
            const citationDomain = new URL(citationUrl).hostname;
            if (citationDomain === domain || citationDomain.includes(domain.split(".")[0])) {
              articles.push({
                url: citationUrl,
                title: citationUrl.split("/").pop() || domain,
                confidence: 0.7,
                source: "meta-data"
              });
            }
          } catch {
            continue;
          }
        }
      }
      const maxLinks = config.limits?.maxLinksPerPage || 100;
      const limitedArticles = articles.slice(0, maxLinks);
      console.log(`\u2728 [HTMLScraper] Perplexity found ${limitedArticles.length} articles`);
      return limitedArticles;
    } catch (error) {
      console.error(`\u274C [HTMLScraper] Perplexity fallback failed:`, error);
      return [];
    }
  }
};
var globalHTMLScraper = new HTMLScraper();

// src/extractors/content-extractor.ts
var import_readability = require("@mozilla/readability");
var import_jsdom = require("jsdom");
var cheerio4 = __toESM(require("cheerio"));
var ContentExtractor = class {
  constructor() {
    this.userAgent = "Mozilla/5.0 (compatible; AtomizeNews/1.0; +https://atomize-news.vercel.app)";
    this.timeout = 15e3;
    // 15 seconds
    this.maxContentSize = 10 * 1024 * 1024;
    // 10MB max
    this.minContentLength = 200;
    // Minimum 200 characters
    this.wordsPerMinute = 200;
    this.ssrfProtection = {
      isPrivateIP: (url) => {
        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname;
          const privateRanges = [
            /^127\./,
            // 127.0.0.0/8 (loopback)
            /^10\./,
            // 10.0.0.0/8 (private)
            /^172\.(1[6-9]|2[0-9]|3[01])\./,
            // 172.16.0.0/12 (private)
            /^192\.168\./,
            // 192.168.0.0/16 (private)
            /^169\.254\./,
            // 169.254.0.0/16 (link-local)
            /^::1$/,
            // IPv6 loopback
            /^fe80:/,
            // IPv6 link-local
            /^fc00:/,
            // IPv6 unique local
            /^fd00:/
            // IPv6 unique local
          ];
          return privateRanges.some((range) => range.test(hostname));
        } catch {
          return true;
        }
      },
      isLocalhost: (url) => {
        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname.toLowerCase();
          return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
        } catch {
          return true;
        }
      },
      isAllowedProtocol: (url) => {
        try {
          const urlObj = new URL(url);
          return urlObj.protocol === "http:" || urlObj.protocol === "https:";
        } catch {
          return false;
        }
      }
    };
  }
  /**
   * Extract content from a URL
   */
  async extractContent(url) {
    console.log(`\u{1F4D6} [ContentExtractor] Starting content extraction from ${url}`);
    try {
      if (!this.ssrfProtection.isAllowedProtocol(url)) {
        throw new Error(`Disallowed protocol: ${url}`);
      }
      if (this.ssrfProtection.isPrivateIP(url) || this.ssrfProtection.isLocalhost(url)) {
        throw new Error(`Private/local IP not allowed: ${url}`);
      }
      const robotsCheck = await globalRobotsChecker.isAllowed(url);
      if (!robotsCheck.allowed) {
        console.warn(`\u{1F916} [ContentExtractor] URL blocked by robots.txt: ${url} - ${robotsCheck.reason}`);
        return null;
      }
      const html = await this.fetchContent(url);
      if (!html) {
        return null;
      }
      const extracted = await this.extractFromHTML(html, url);
      if (!extracted) {
        console.warn(`\u26A0\uFE0F [ContentExtractor] No content extracted from ${url}`);
        return null;
      }
      if (extracted.textContent.length < this.minContentLength) {
        console.warn(`\u26A0\uFE0F [ContentExtractor] Content too short (${extracted.textContent.length} chars): ${url}`);
        return null;
      }
      console.log(`\u2705 [ContentExtractor] Successfully extracted ${extracted.wordCount} words from ${url}`);
      return extracted;
    } catch (error) {
      console.error(`\u274C [ContentExtractor] Error extracting content from ${url}:`, error);
      return null;
    }
  }
  /**
   * Extract content from multiple URLs
   */
  async extractBatch(urls) {
    console.log(`\u{1F4D6} [ContentExtractor] Starting batch extraction of ${urls.length} URLs`);
    const results = urls.map(
      (url) => this.extractContent(url).catch((error) => {
        console.error(`\u274C [ContentExtractor] Error in batch extraction for ${url}:`, error);
        return null;
      })
    );
    const extracted = await Promise.all(results);
    const successful = extracted.filter(Boolean).length;
    console.log(`\u{1F4D6} [ContentExtractor] Batch complete: ${successful}/${urls.length} successful`);
    return extracted;
  }
  async fetchContent(url) {
    try {
      return await globalRateLimiter.execute(url, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent": this.userAgent,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9"
            },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const contentLength = response.headers.get("content-length");
          if (contentLength && parseInt(contentLength) > this.maxContentSize) {
            throw new Error(`Content too large: ${contentLength} bytes`);
          }
          const html = await response.text();
          if (html.length > this.maxContentSize) {
            throw new Error(`Content too large: ${html.length} bytes`);
          }
          return html;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });
    } catch (error) {
      console.error(`\u274C [ContentExtractor] Error fetching content from ${url}:`, error);
      return null;
    }
  }
  async extractFromHTML(html, url) {
    const errors = [];
    try {
      const readabilityResult = this.extractWithReadability(html, url);
      if (readabilityResult && readabilityResult.textContent.length >= this.minContentLength) {
        return {
          ...readabilityResult,
          extractionMethod: "readability",
          confidence: 0.9
        };
      } else {
        errors.push("Readability extraction failed or content too short");
      }
    } catch (error) {
      errors.push(`Readability error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    try {
      const fallbackResult = this.extractWithFallback(html, url);
      if (fallbackResult && fallbackResult.textContent.length >= this.minContentLength) {
        return {
          ...fallbackResult,
          extractionMethod: "fallback",
          confidence: 0.6,
          errors
        };
      } else {
        errors.push("Fallback extraction failed or content too short");
      }
    } catch (error) {
      errors.push(`Fallback error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    console.error(`\u274C [ContentExtractor] All extraction methods failed for ${url}:`, errors);
    return null;
  }
  extractWithReadability(html, url) {
    try {
      const dom = new import_jsdom.JSDOM(html, { url });
      const document = dom.window.document;
      const reader = new import_readability.Readability(document);
      const article = reader.parse();
      if (!article) {
        return null;
      }
      const structured = this.extractStructuredData(html, url);
      const wordCount = this.countWords(article.textContent);
      const readingTime = Math.ceil(wordCount / this.wordsPerMinute);
      return {
        url,
        title: article.title || "",
        content: article.content || "",
        textContent: article.textContent || "",
        excerpt: article.excerpt || void 0,
        byline: article.byline || void 0,
        publishedTime: this.extractPublishedTime(html),
        siteName: article.siteName || this.extractSiteName(html),
        lang: this.extractLanguage(html),
        structured,
        wordCount,
        readingTime,
        confidence: 0.9,
        extractionMethod: "readability",
        extractedAt: /* @__PURE__ */ new Date()
      };
    } catch (error) {
      console.error(`\u274C [ContentExtractor] Readability extraction failed:`, error);
      return null;
    }
  }
  extractWithFallback(html, url) {
    try {
      const $ = cheerio4.load(html);
      const unwantedSelectors = [
        "script",
        "style",
        "nav",
        "header",
        "footer",
        ".advertisement",
        ".ads",
        ".social-share",
        ".comments",
        ".sidebar",
        ".navigation",
        ".menu",
        ".popup",
        ".modal"
      ];
      unwantedSelectors.forEach((selector) => $(selector).remove());
      let content = "";
      let title = "";
      title = $("h1").first().text().trim() || $("title").text().trim() || $('meta[property="og:title"]').attr("content") || "";
      const contentSelectors = [
        "article",
        ".article-content",
        ".post-content",
        ".entry-content",
        ".content",
        "main",
        "#content",
        ".story-body"
      ];
      for (const selector of contentSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          content = element.html() || "";
          if (content.length > this.minContentLength) {
            break;
          }
        }
      }
      if (content.length < this.minContentLength) {
        content = $("body").html() || "";
      }
      if (!content || content.length < this.minContentLength) {
        return null;
      }
      const textContent = $(content).text().trim();
      const wordCount = this.countWords(textContent);
      const readingTime = Math.ceil(wordCount / this.wordsPerMinute);
      const structured = this.extractStructuredData(html, url);
      return {
        url,
        title,
        content,
        textContent,
        excerpt: textContent.substring(0, 300) + "...",
        publishedTime: this.extractPublishedTime(html),
        siteName: this.extractSiteName(html),
        lang: this.extractLanguage(html),
        structured,
        wordCount,
        readingTime,
        confidence: 0.6,
        extractionMethod: "fallback",
        extractedAt: /* @__PURE__ */ new Date()
      };
    } catch (error) {
      console.error(`\u274C [ContentExtractor] Fallback extraction failed:`, error);
      return null;
    }
  }
  extractStructuredData(html, _url) {
    const structured = {};
    try {
      const $ = cheerio4.load(html);
      const jsonLdScripts = [];
      $('script[type="application/ld+json"]').each((_, element) => {
        try {
          const jsonText = $(element).html();
          if (jsonText) {
            const data = JSON.parse(jsonText);
            jsonLdScripts.push(data);
          }
        } catch {
        }
      });
      if (jsonLdScripts.length > 0) {
        structured.jsonLd = jsonLdScripts;
      }
      const openGraph = {};
      $('meta[property^="og:"]').each((_, element) => {
        const property = $(element).attr("property");
        const content = $(element).attr("content");
        if (property && content) {
          openGraph[property] = content;
        }
      });
      if (Object.keys(openGraph).length > 0) {
        structured.openGraph = openGraph;
      }
      const twitterCard = {};
      $('meta[name^="twitter:"]').each((_, element) => {
        const name = $(element).attr("name");
        const content = $(element).attr("content");
        if (name && content) {
          twitterCard[name] = content;
        }
      });
      if (Object.keys(twitterCard).length > 0) {
        structured.twitterCard = twitterCard;
      }
      const microdata = [];
      $("[itemscope]").each((_, element) => {
        const $item = $(element);
        const itemType = $item.attr("itemtype");
        if (itemType) {
          const item = { "@type": itemType };
          $item.find("[itemprop]").each((_2, propElement) => {
            const $prop = $(propElement);
            const propName = $prop.attr("itemprop");
            const propValue = $prop.attr("content") || $prop.text().trim();
            if (propName && propValue) {
              item[propName] = propValue;
            }
          });
          microdata.push(item);
        }
      });
      if (microdata.length > 0) {
        structured.microdata = microdata;
      }
    } catch (error) {
      console.warn(`\u26A0\uFE0F [ContentExtractor] Error extracting structured data:`, error);
    }
    return Object.keys(structured).length > 0 ? structured : void 0;
  }
  extractPublishedTime(html) {
    try {
      const $ = cheerio4.load(html);
      const timeSelectors = [
        'meta[property="article:published_time"]',
        'meta[name="datePublished"]',
        'meta[name="publishdate"]',
        "time[datetime]",
        ".published-date",
        ".publish-date",
        ".article-date"
      ];
      for (const selector of timeSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          const timeStr = element.attr("content") || element.attr("datetime") || element.text().trim();
          if (timeStr) {
            const date = new Date(timeStr);
            if (!isNaN(date.getTime())) {
              return date;
            }
          }
        }
      }
      return void 0;
    } catch {
      return void 0;
    }
  }
  extractSiteName(html) {
    try {
      const $ = cheerio4.load(html);
      return $('meta[property="og:site_name"]').attr("content") || $('meta[name="application-name"]').attr("content") || void 0;
    } catch {
      return void 0;
    }
  }
  extractLanguage(html) {
    try {
      const $ = cheerio4.load(html);
      return $("html").attr("lang") || $('meta[name="language"]').attr("content") || $('meta[http-equiv="content-language"]').attr("content") || void 0;
    } catch {
      return void 0;
    }
  }
  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
  }
  /**
   * Validate extracted content quality
   */
  validateContent(content) {
    const issues = [];
    let score = 1;
    if (content.textContent.length < this.minContentLength) {
      issues.push(`Content too short: ${content.textContent.length} characters`);
      score -= 0.5;
    }
    if (!content.title || content.title.length < 10) {
      issues.push("Missing or too short title");
      score -= 0.2;
    } else if (content.title.length > 200) {
      issues.push("Title too long");
      score -= 0.1;
    }
    const htmlLength = content.content.length;
    const textLength = content.textContent.length;
    const ratio = textLength / htmlLength;
    if (ratio < 0.1) {
      issues.push("Low text-to-HTML ratio - may be poorly extracted");
      score -= 0.2;
    }
    const sentences = content.textContent.split(".").filter((s) => s.trim().length > 10);
    const uniqueSentences = new Set(sentences);
    const duplicateRatio = (sentences.length - uniqueSentences.size) / sentences.length;
    if (duplicateRatio > 0.3) {
      issues.push("High duplicate content detected");
      score -= 0.3;
    }
    return {
      isValid: issues.length === 0 && score >= 0.5,
      issues,
      score: Math.max(0, score)
    };
  }
};
var globalContentExtractor = new ContentExtractor();

// src/utils/circuit-breaker.ts
var CircuitBreaker = class {
  constructor(options) {
    this.failures = 0;
    this.lastFailureTime = 0;
    this.state = "CLOSED";
    this.options = options;
  }
  async execute(operation) {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime < this.options.resetTimeout) {
        throw new Error(`[CircuitBreaker:${this.options.name}] Circuit is OPEN - preventing request`);
      } else {
        this.state = "HALF_OPEN";
        console.log(`\u{1F504} [CircuitBreaker:${this.options.name}] Circuit moving to HALF_OPEN state`);
      }
    }
    try {
      const result = await this.executeWithTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  async executeWithTimeout(operation) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`[CircuitBreaker:${this.options.name}] Operation timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);
      operation().then((result) => {
        clearTimeout(timer);
        resolve(result);
      }).catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
  onSuccess() {
    this.failures = 0;
    this.state = "CLOSED";
  }
  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.options.failureThreshold) {
      this.state = "OPEN";
      console.error(`\u274C [CircuitBreaker:${this.options.name}] Circuit opened after ${this.failures} failures`);
    }
  }
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
};
var circuitBreakers = {
  rss: new CircuitBreaker({
    name: "RSS",
    failureThreshold: 3,
    timeout: 15e3,
    // 15 seconds
    resetTimeout: 3e4
    // 30 seconds
  }),
  scraping: new CircuitBreaker({
    name: "Scraping",
    failureThreshold: 5,
    timeout: 1e4,
    // 10 seconds
    resetTimeout: 3e4
    // 30 seconds
  }),
  scrapingTest: new CircuitBreaker({
    name: "ScrapingTest",
    failureThreshold: 3,
    timeout: 3e4,
    // 30 seconds for test endpoints
    resetTimeout: 6e4
    // 1 minute
  })
};

// src/orchestrator/source-orchestrator.ts
var globalHTMLScraper2 = new HTMLScraper();
var globalContentExtractor2 = new ContentExtractor();
var globalRobotsChecker2 = new RobotsChecker();
var CandidateArticleSchema = import_zod.z.object({
  url: import_zod.z.string().url(),
  title: import_zod.z.string().min(1),
  publishedAt: import_zod.z.date(),
  content: import_zod.z.string().optional(),
  excerpt: import_zod.z.string().optional(),
  guid: import_zod.z.string(),
  confidence: import_zod.z.number().min(0).max(1),
  source: import_zod.z.enum(["rss", "sitemap", "html", "discovery"]),
  extractionMethod: import_zod.z.enum(["rss", "sitemap", "html-links", "content-extraction"]),
  metadata: import_zod.z.record(import_zod.z.any()).optional()
});
var SourceConfigSchema = import_zod.z.object({
  sourceType: import_zod.z.enum(["rss", "sitemap", "html", "auto"]),
  allowPaths: import_zod.z.array(import_zod.z.string()).optional(),
  denyPaths: import_zod.z.array(import_zod.z.string()).optional(),
  maxDepth: import_zod.z.number().int().min(1).max(5).optional(),
  detectOnly: import_zod.z.boolean().optional(),
  scrapeConfig: import_zod.z.object({
    selectors: import_zod.z.object({
      articleLinks: import_zod.z.array(import_zod.z.string()).optional(),
      titleSelectors: import_zod.z.array(import_zod.z.string()).optional(),
      dateSelectors: import_zod.z.array(import_zod.z.string()).optional(),
      excludeSelectors: import_zod.z.array(import_zod.z.string()).optional()
    }).optional(),
    filters: import_zod.z.object({
      minTitleLength: import_zod.z.number().optional(),
      maxTitleLength: import_zod.z.number().optional(),
      includePatterns: import_zod.z.array(import_zod.z.string()).optional(),
      excludePatterns: import_zod.z.array(import_zod.z.string()).optional()
    }).optional(),
    limits: import_zod.z.object({
      maxLinksPerPage: import_zod.z.number().optional(),
      maxPages: import_zod.z.number().optional()
    }).optional()
  }).optional()
});
var SourceOrchestrator = class {
  constructor() {
    this.maxArticlesPerSource = 1e3;
  }
  // private readonly recentTimeframe = 48 * 60 * 60 * 1000; // 48 hours (currently unused)
  /**
   * Main orchestration method - determines source type and extracts content
   */
  async processSource(url, config = { sourceType: "auto" }) {
    const startTime = Date.now();
    console.log(`\u{1F3AD} [Orchestrator] Processing source: ${url} (type: ${config.sourceType})`);
    const result = {
      articles: [],
      sourceInfo: {
        detectedType: "html",
        extractionStats: {
          attempted: 0,
          successful: 0,
          failed: 0,
          filtered: 0
        }
      },
      processingTime: 0,
      errors: []
    };
    try {
      const breaker = config.circuitBreaker || circuitBreakers.scraping;
      return await breaker.execute(async () => {
        if (config.sourceType === "auto") {
          return await this.autoDetectAndProcess(url, config, result);
        } else {
          return await this.processKnownType(url, config, result);
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`\u274C [Orchestrator] Failed to process source ${url}:`, errorMessage);
      result.errors.push(errorMessage);
      result.processingTime = Date.now() - startTime;
      return result;
    }
  }
  /**
   * Auto-detect source type and process accordingly
   */
  async autoDetectAndProcess(url, config, result) {
    console.log(`\u{1F50D} [Orchestrator] Auto-detecting source type for ${url}`);
    try {
      const rssArticles = await this.processAsRSS(url);
      if (rssArticles.length > 0) {
        result.sourceInfo.detectedType = "rss";
        result.articles = this.applyPathFilters(rssArticles, config);
        console.log(`\u2705 [Orchestrator] Detected as RSS feed: ${result.articles.length} articles`);
        return this.finalizeResult(result);
      }
    } catch (error) {
      result.errors.push(`RSS detection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    try {
      const discoveredFeeds = await globalRSSDiscovery.discoverFeeds(url);
      if (discoveredFeeds.length > 0) {
        result.sourceInfo.discoveredFeeds = discoveredFeeds;
        const bestFeed = discoveredFeeds[0];
        const rssArticles = await this.processAsRSS(bestFeed.url);
        if (rssArticles.length > 0) {
          result.sourceInfo.detectedType = "rss";
          result.articles = this.applyPathFilters(rssArticles, config);
          console.log(`\u2705 [Orchestrator] Using discovered RSS feed: ${result.articles.length} articles`);
          return this.finalizeResult(result);
        }
      }
    } catch (error) {
      result.errors.push(`RSS discovery failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    try {
      const sitemapArticles = await this.processAsSitemap(url);
      if (sitemapArticles.length > 0) {
        result.sourceInfo.detectedType = "sitemap";
        result.articles = this.applyPathFilters(sitemapArticles, config);
        console.log(`\u2705 [Orchestrator] Detected as sitemap: ${result.articles.length} articles`);
        return this.finalizeResult(result);
      }
    } catch (error) {
      result.errors.push(`Sitemap detection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    try {
      const urlObj = new URL(url);
      const discoveredSitemaps = await globalSitemapParser.discoverSitemaps(urlObj.hostname);
      if (discoveredSitemaps.length > 0) {
        result.sourceInfo.discoveredSitemaps = discoveredSitemaps;
        const sitemapArticles = await this.processAsSitemap(discoveredSitemaps[0]);
        if (sitemapArticles.length > 0) {
          result.sourceInfo.detectedType = "sitemap";
          result.articles = this.applyPathFilters(sitemapArticles, config);
          console.log(`\u2705 [Orchestrator] Using discovered sitemap: ${result.articles.length} articles`);
          return this.finalizeResult(result);
        }
      }
    } catch (error) {
      result.errors.push(`Sitemap discovery failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    try {
      const htmlArticles = await this.processAsHTML(url, config);
      result.sourceInfo.detectedType = "html";
      result.articles = this.applyPathFilters(htmlArticles, config);
      console.log(`\u2705 [Orchestrator] Falling back to HTML scraping: ${result.articles.length} articles`);
      return this.finalizeResult(result);
    } catch (error) {
      result.errors.push(`HTML scraping failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      return this.finalizeResult(result);
    }
  }
  /**
   * Process source with known type
   */
  async processKnownType(url, config, result) {
    console.log(`\u{1F3AF} [Orchestrator] Processing as ${config.sourceType}: ${url}`);
    try {
      let articles = [];
      switch (config.sourceType) {
        case "rss":
          articles = await this.processAsRSS(url);
          result.sourceInfo.detectedType = "rss";
          break;
        case "sitemap":
          articles = await this.processAsSitemap(url);
          result.sourceInfo.detectedType = "sitemap";
          break;
        case "html":
          articles = await this.processAsHTML(url, config);
          result.sourceInfo.detectedType = "html";
          break;
      }
      result.articles = this.applyPathFilters(articles, config);
      console.log(`\u2705 [Orchestrator] Processed ${config.sourceType}: ${result.articles.length} articles`);
      return this.finalizeResult(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`${config.sourceType} processing failed: ${errorMessage}`);
      return this.finalizeResult(result);
    }
  }
  /**
   * Process URL as RSS feed
   */
  async processAsRSS(url) {
    const rssItems = await fetchRSSFeed(url);
    const candidates = [];
    for (const item of rssItems) {
      try {
        const publishedAt = new Date(item.pubDate);
        if (isNaN(publishedAt.getTime())) {
          continue;
        }
        candidates.push({
          url: item.link,
          title: item.title,
          publishedAt,
          content: item.content,
          excerpt: item.contentSnippet,
          guid: item.guid,
          confidence: 0.9,
          source: "rss",
          extractionMethod: "rss",
          metadata: {
            originalGuid: item.guid,
            rssSource: url
          }
        });
      } catch (error) {
        console.warn(`\u26A0\uFE0F [Orchestrator] Error processing RSS item:`, error);
        continue;
      }
    }
    return candidates;
  }
  /**
   * Process URL as sitemap
   */
  async processAsSitemap(url) {
    const sitemapEntries = await globalSitemapParser.parseSitemap(url, {
      filterRecent: true,
      maxEntries: this.maxArticlesPerSource,
      includeNews: true
    });
    const candidates = [];
    for (const entry of sitemapEntries) {
      try {
        const publishedAt = entry.lastmod || /* @__PURE__ */ new Date();
        candidates.push({
          url: entry.url,
          title: entry.news?.title || this.extractTitleFromUrl(entry.url),
          publishedAt,
          guid: this.createGuid(entry.url, publishedAt.toISOString()),
          confidence: entry.news ? 0.8 : 0.6,
          source: "sitemap",
          extractionMethod: "sitemap",
          metadata: {
            changefreq: entry.changefreq,
            priority: entry.priority,
            hasNews: !!entry.news,
            sitemapSource: url
          }
        });
      } catch (error) {
        console.warn(`\u26A0\uFE0F [Orchestrator] Error processing sitemap entry:`, error);
        continue;
      }
    }
    return candidates;
  }
  /**
   * Process URL as HTML page
   */
  async processAsHTML(url, config) {
    const scrapingConfig = this.buildScrapingConfig(config);
    const extractedArticles = await globalHTMLScraper2.extractFromMultiplePages(url, scrapingConfig, {
      maxPages: config.scrapeConfig?.limits?.maxPages || 3
    });
    const candidates = [];
    for (const article of extractedArticles) {
      try {
        const publishedAt = article.publishedDate || /* @__PURE__ */ new Date();
        candidates.push({
          url: article.url,
          title: article.title || this.extractTitleFromUrl(article.url),
          publishedAt,
          excerpt: article.description,
          guid: this.createGuid(article.url, publishedAt.toISOString()),
          confidence: article.confidence,
          source: "html",
          extractionMethod: "html-links",
          metadata: {
            extractionSource: article.source,
            htmlSource: url
          }
        });
      } catch (error) {
        console.warn(`\u26A0\uFE0F [Orchestrator] Error processing HTML article:`, error);
        continue;
      }
    }
    return candidates;
  }
  /**
   * Apply path filtering based on allowPaths and denyPaths
   */
  applyPathFilters(articles, config) {
    if (!config.allowPaths?.length && !config.denyPaths?.length) {
      return articles;
    }
    return articles.filter((article) => {
      try {
        const urlObj = new URL(article.url);
        const path = urlObj.pathname.toLowerCase();
        if (config.denyPaths?.length) {
          for (const pattern of config.denyPaths) {
            if (this.matchesPattern(path, pattern)) {
              console.log(`\u{1F6AB} [Orchestrator] Article blocked by deny pattern "${pattern}": ${article.url}`);
              return false;
            }
          }
        }
        if (config.allowPaths?.length) {
          for (const pattern of config.allowPaths) {
            if (this.matchesPattern(path, pattern)) {
              return true;
            }
          }
          console.log(`\u{1F6AB} [Orchestrator] Article not matching any allow pattern: ${article.url}`);
          return false;
        }
        return true;
      } catch (error) {
        console.warn(`\u26A0\uFE0F [Orchestrator] Error applying path filters to ${article.url}:`, error);
        return true;
      }
    });
  }
  /**
   * Check if a path matches a pattern (supports wildcards)
   */
  matchesPattern(path, pattern) {
    const regexPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*").replace(/\\\?/g, ".");
    const regex = new RegExp("^" + regexPattern + "$", "i");
    return regex.test(path);
  }
  /**
   * Build scraping configuration from source config
   */
  buildScrapingConfig(config) {
    const scrapingConfig = {};
    if (config.scrapeConfig?.selectors) {
      scrapingConfig.selectors = {
        articleLinks: config.scrapeConfig.selectors.articleLinks,
        titleSelectors: config.scrapeConfig.selectors.titleSelectors,
        dateSelectors: config.scrapeConfig.selectors.dateSelectors,
        excludeSelectors: config.scrapeConfig.selectors.excludeSelectors
      };
    }
    if (config.scrapeConfig?.filters) {
      scrapingConfig.filters = {
        minTitleLength: config.scrapeConfig.filters.minTitleLength,
        maxTitleLength: config.scrapeConfig.filters.maxTitleLength,
        includePatterns: config.scrapeConfig.filters.includePatterns?.map((p) => new RegExp(p, "i")),
        excludePatterns: config.scrapeConfig.filters.excludePatterns?.map((p) => new RegExp(p, "i"))
      };
    }
    if (config.scrapeConfig?.limits) {
      scrapingConfig.limits = config.scrapeConfig.limits;
    }
    return scrapingConfig;
  }
  /**
   * Extract title from URL as fallback
   */
  extractTitleFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1] || urlObj.hostname;
      return lastPart.replace(/[-_]/g, " ").replace(/\.(html|htm|php|asp|jsp)$/i, "").split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
    } catch {
      return "Untitled Article";
    }
  }
  /**
   * Create a consistent GUID for an article
   */
  createGuid(url, publishedAt) {
    return import_crypto2.default.createHash("sha256").update(url + publishedAt).digest("hex");
  }
  /**
   * Finalize processing result
   */
  finalizeResult(result) {
    const endTime = Date.now();
    result.processingTime = endTime - (Date.now() - result.processingTime);
    result.sourceInfo.extractionStats = {
      attempted: result.articles.length,
      successful: result.articles.filter((a) => a.confidence >= 0.5).length,
      failed: result.errors.length,
      filtered: 0
      // This would be calculated during filtering
    };
    result.articles.sort((a, b) => {
      const confidenceDiff = b.confidence - a.confidence;
      if (Math.abs(confidenceDiff) > 0.1) return confidenceDiff;
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    });
    result.articles = result.articles.slice(0, this.maxArticlesPerSource);
    console.log(`\u{1F3AD} [Orchestrator] Processing complete: ${result.articles.length} articles in ${result.processingTime}ms`);
    return result;
  }
  /**
   * Extract full content for articles (optional enhancement step)
   */
  async enhanceWithFullContent(articles, maxArticles = 10) {
    console.log(`\u{1F4D6} [Orchestrator] Enhancing ${Math.min(articles.length, maxArticles)} articles with full content`);
    const toEnhance = articles.filter((a) => !a.content || a.content.length < 500).slice(0, maxArticles);
    for (const article of toEnhance) {
      try {
        const extractedContent = await globalContentExtractor2.extractContent(article.url);
        if (extractedContent) {
          article.content = extractedContent.content;
          article.excerpt = extractedContent.excerpt || article.excerpt;
          article.confidence = Math.min(article.confidence + 0.1, 1);
          article.metadata = {
            ...article.metadata,
            fullContentExtracted: true,
            extractionMethod: extractedContent.extractionMethod,
            wordCount: extractedContent.wordCount,
            readingTime: extractedContent.readingTime
          };
        }
      } catch (error) {
        console.warn(`\u26A0\uFE0F [Orchestrator] Failed to enhance article ${article.url}:`, error);
        continue;
      }
    }
    console.log(`\u{1F4D6} [Orchestrator] Content enhancement complete`);
    return articles;
  }
  /**
   * Validate orchestrator configuration
   */
  static validateConfig(config) {
    try {
      return SourceConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof import_zod.z.ZodError) {
        throw new Error(`Invalid source configuration: ${error.errors.map((e) => e.message).join(", ")}`);
      }
      throw error;
    }
  }
  /**
   * Get source statistics
   */
  async getSourceStats(url) {
    const robotsCheck = await globalRobotsChecker2.isAllowed(url);
    const discoveredFeeds = await globalRSSDiscovery.discoverFeeds(url);
    let hasSitemap = false;
    let estimatedArticleCount = 0;
    try {
      const urlObj = new URL(url);
      const sitemaps = await globalSitemapParser.discoverSitemaps(urlObj.hostname);
      hasSitemap = sitemaps.length > 0;
      if (hasSitemap) {
        const recentEntries = await globalSitemapParser.getRecentEntries(urlObj.hostname, { hoursBack: 48, maxEntries: 100 });
        estimatedArticleCount = recentEntries.length;
      }
    } catch (error) {
    }
    return {
      robotsCompliant: robotsCheck.allowed,
      hasRSSFeed: discoveredFeeds.length > 0,
      hasSitemap,
      detectedType: discoveredFeeds.length > 0 ? "rss" : hasSitemap ? "sitemap" : "html",
      estimatedArticleCount
    };
  }
};
var globalSourceOrchestrator = new SourceOrchestrator();

// src/quality/quality-scorer.ts
var DEFAULT_QUALITY_CONFIG = {
  contentWeight: 0.6,
  // Content validation (length, quality, ratio)
  dateWeight: 0.12,
  // Publication date presence
  authorWeight: 0.08,
  // Author/byline presence
  schemaWeight: 0.08,
  // Schema.org metadata
  readingTimeWeight: 0.12,
  // Substantial reading time (2+ min)
  threshold: 0.5
  // Minimum score to pass (50%)
};
var DEFAULT_DENY_PATHS = [
  "/",
  "/index",
  "/index.html",
  "/about",
  "/about/*",
  "/careers",
  "/careers/*",
  "/jobs",
  "/jobs/*",
  "/contact",
  "/contact/*",
  "/team",
  "/team/*",
  "/privacy",
  "/terms",
  "/legal/*",
  "/tag/*",
  "/tags/*",
  "/category/*",
  "/categories/*",
  "/author/*",
  "/authors/*",
  "/archive/*",
  "/search",
  "/search/*"
];
function validateContent(extracted) {
  const reasons = [];
  let score = 1;
  const contentLength = extracted.textContent?.length || 0;
  if (contentLength < 200) {
    reasons.push("Content too short (< 200 characters)");
    score -= 0.5;
  }
  const titleLength = extracted.title?.length || 0;
  if (titleLength < 10 || titleLength > 200) {
    reasons.push("Title length invalid (must be 10-200 characters)");
    score -= 0.2;
  }
  if (extracted.content && extracted.textContent) {
    const htmlLength = extracted.content.length;
    const textLength = extracted.textContent.length;
    const ratio = textLength / htmlLength;
    if (ratio < 0.1) {
      reasons.push("Low text-to-HTML ratio (< 10%)");
      score -= 0.2;
    }
  }
  const isValid = score >= 0.5;
  return {
    isValid,
    score: Math.max(0, Math.min(1, score)),
    // Clamp between 0-1
    reasons
  };
}
function calculateArticleQualityScore(extracted, config = {}) {
  const finalConfig = { ...DEFAULT_QUALITY_CONFIG, ...config };
  let score = 0;
  const validation = validateContent(extracted);
  score += validation.score * finalConfig.contentWeight;
  if (extracted.publishedTime) {
    score += finalConfig.dateWeight;
  }
  if (extracted.byline) {
    score += finalConfig.authorWeight;
  }
  if (extracted.structured?.jsonLd) {
    const schemas = Array.isArray(extracted.structured.jsonLd) ? extracted.structured.jsonLd : [extracted.structured.jsonLd];
    const hasArticleType = schemas.some((s) => {
      const type = s["@type"];
      return type === "Article" || type === "NewsArticle" || type === "BlogPosting" || type === "TechArticle" || type === "ScholarlyArticle";
    });
    if (hasArticleType) {
      score += finalConfig.schemaWeight;
    }
  }
  if (extracted.readingTime && extracted.readingTime >= 2) {
    score += finalConfig.readingTimeWeight;
  }
  return Math.min(score, 1);
}
function shouldDenyUrl(url, denyPaths = DEFAULT_DENY_PATHS) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    return denyPaths.some((pattern) => {
      if (pattern === path) return true;
      if (pattern.endsWith("/*")) {
        const prefix = pattern.slice(0, -2);
        return path.startsWith(prefix);
      }
      return false;
    });
  } catch {
    return false;
  }
}
function getQualityBreakdown(extracted, config = {}) {
  const finalConfig = { ...DEFAULT_QUALITY_CONFIG, ...config };
  const validation = validateContent(extracted);
  const breakdown = {
    contentValidation: validation.score * finalConfig.contentWeight,
    publishedDate: extracted.publishedTime ? finalConfig.dateWeight : 0,
    author: extracted.byline ? finalConfig.authorWeight : 0,
    schema: 0,
    readingTime: extracted.readingTime && extracted.readingTime >= 2 ? finalConfig.readingTimeWeight : 0,
    total: 0,
    passesThreshold: false
  };
  if (extracted.structured?.jsonLd) {
    const schemas = Array.isArray(extracted.structured.jsonLd) ? extracted.structured.jsonLd : [extracted.structured.jsonLd];
    const hasArticleType = schemas.some((s) => {
      const type = s["@type"];
      return type === "Article" || type === "NewsArticle" || type === "BlogPosting" || type === "TechArticle" || type === "ScholarlyArticle";
    });
    if (hasArticleType) {
      breakdown.schema = finalConfig.schemaWeight;
    }
  }
  breakdown.total = breakdown.contentValidation + breakdown.publishedDate + breakdown.author + breakdown.schema + breakdown.readingTime;
  breakdown.passesThreshold = breakdown.total >= finalConfig.threshold;
  return breakdown;
}

// src/formatters/html-to-markdown.ts
var import_turndown = __toESM(require("turndown"));
function htmlToMarkdown(html) {
  if (!html) return "";
  const turndownService = new import_turndown.default({
    headingStyle: "atx",
    // Use # for headings
    codeBlockStyle: "fenced",
    // Use ``` for code blocks
    bulletListMarker: "-",
    // Use - for lists
    emDelimiter: "*",
    // Use * for emphasis
    strongDelimiter: "**"
    // Use ** for strong
  });
  turndownService.remove([
    "script",
    "style",
    "nav",
    "header",
    "footer",
    "aside",
    "form",
    "button",
    "input",
    "select",
    "textarea",
    "iframe",
    "noscript"
  ]);
  turndownService.addRule("cleanAttributes", {
    filter: ["div", "span", "p", "section", "article"],
    replacement: (content) => {
      return content;
    }
  });
  let markdown = turndownService.turndown(html);
  markdown = smartParagraphDetection(markdown);
  markdown = normalizeWhitespace(markdown);
  return markdown;
}
function smartParagraphDetection(markdown) {
  const lines = markdown.split("\n");
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : "";
    const nextLine = i < lines.length - 1 ? lines[i + 1] : "";
    result.push(line);
    if (line.match(/^#{1,6}\s/) && nextLine && !nextLine.match(/^#{1,6}\s/)) {
      result.push("");
    }
    if (nextLine.match(/^#{1,6}\s/) && line && !line.match(/^#{1,6}\s/) && !prevLine.match(/^$/)) {
      result.push("");
    }
    if (line.match(/^[-*+]\s/) && nextLine && !nextLine.match(/^[-*+]\s/) && !nextLine.match(/^$/)) {
      result.push("");
    }
  }
  return result.join("\n");
}
function normalizeWhitespace(markdown) {
  markdown = markdown.replace(/\n{3,}/g, "\n\n");
  markdown = markdown.split("\n").map((line) => line.trim()).join("\n");
  markdown = markdown.trim();
  return markdown;
}
function stripNonArticleContent(html) {
  if (!html) return "";
  const nonArticlePatterns = [
    /<nav\b[^>]*>.*?<\/nav>/gi,
    /<header\b[^>]*>.*?<\/header>/gi,
    /<footer\b[^>]*>.*?<\/footer>/gi,
    /<aside\b[^>]*>.*?<\/aside>/gi,
    /<form\b[^>]*>.*?<\/form>/gi,
    /<div[^>]*class="[^"]*(?:nav|menu|sidebar|advertisement|ads|social|share|comment|popup|modal)[^"]*"[^>]*>.*?<\/div>/gi,
    /<div[^>]*id="[^"]*(?:nav|menu|sidebar|advertisement|ads|social|share|comment|popup|modal)[^"]*"[^>]*>.*?<\/div>/gi
  ];
  let cleaned = html;
  for (const pattern of nonArticlePatterns) {
    cleaned = cleaned.replace(pattern, "");
  }
  cleaned = cleaned.replace(/\s*class="[^"]*"/gi, "");
  cleaned = cleaned.replace(/\s*id="[^"]*"/gi, "");
  cleaned = cleaned.replace(/\s*data-[^=]*="[^"]*"/gi, "");
  return cleaned;
}
function convertToMarkdown(html, options = {}) {
  const {
    cleanNonArticle = true,
    smartParagraphs: _smartParagraphs = true
  } = options;
  let processedHtml = html;
  if (cleanNonArticle) {
    processedHtml = stripNonArticleContent(processedHtml);
  }
  const markdown = htmlToMarkdown(processedHtml);
  return markdown;
}

// src/formatters/text-cleaner.ts
function cleanText(text) {
  if (!text) return "";
  let cleaned = text;
  cleaned = decodeHTMLEntities(cleaned);
  cleaned = normalizeWhitespace2(cleaned);
  cleaned = detectParagraphs(cleaned);
  cleaned = cleaned.trim();
  return cleaned;
}
function decodeHTMLEntities(text) {
  const entities = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#039;": "'",
    "&apos;": "'",
    "&ndash;": "\u2013",
    "&mdash;": "\u2014",
    "&hellip;": "\u2026",
    "&ldquo;": '"',
    "&rdquo;": '"',
    "&lsquo;": "\u2018",
    "&rsquo;": "\u2019"
  };
  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, "g"), char);
  }
  decoded = decoded.replace(
    /&#(\d+);/g,
    (_, code) => String.fromCharCode(parseInt(code, 10))
  );
  decoded = decoded.replace(
    /&#x([0-9a-f]+);/gi,
    (_, code) => String.fromCharCode(parseInt(code, 16))
  );
  return decoded;
}
function normalizeWhitespace2(text) {
  let normalized = text.replace(/\t/g, " ");
  normalized = normalized.replace(/ {2,}/g, " ");
  normalized = normalized.split("\n").map((line) => line.trim()).join("\n");
  normalized = normalized.replace(/\n{3,}/g, "\n\n");
  return normalized;
}
function detectParagraphs(text) {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i < lines.length - 1 ? lines[i + 1] : "";
    result.push(line);
    if (line.match(/[.!?]$/) && nextLine.match(/^[A-Z0-9]/) && line.length > 40 && // Avoid breaking after short lines
    nextLine.length > 20) {
      result.push("");
    }
  }
  return result.join("\n");
}
function removeUrls(text) {
  return text.replace(/https?:\/\/[^\s]+/g, "");
}
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + "\u2026";
  }
  return truncated + "\u2026";
}
function stripHTML(html) {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// src/errors.ts
var ScraperError = class extends Error {
  constructor(message, options) {
    super(message);
    this.name = "ScraperError";
    this.code = options?.code ?? "SCRAPER_ERROR";
    this.cause = options?.cause;
    this.url = options?.url;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
};
var RequestTimeoutError = class extends ScraperError {
  constructor(message, options) {
    super(message, { code: "REQUEST_TIMEOUT", ...options });
    this.name = "RequestTimeoutError";
    this.timeout = options.timeout;
  }
};
var RequestAbortedError = class extends ScraperError {
  constructor(message = "Request was aborted", options) {
    super(message, { code: "REQUEST_ABORTED", ...options });
    this.name = "RequestAbortedError";
  }
};
var RateLimitError = class extends ScraperError {
  constructor(message, options) {
    super(message, { code: "RATE_LIMIT_EXCEEDED", ...options });
    this.name = "RateLimitError";
    this.host = options.host;
    this.retryAfter = options.retryAfter;
  }
};
var RobotsBlockedError = class extends ScraperError {
  constructor(message, options) {
    super(message, { code: "ROBOTS_BLOCKED", ...options });
    this.name = "RobotsBlockedError";
    this.disallowedPath = options.disallowedPath;
  }
};
var ContentExtractionError = class extends ScraperError {
  constructor(message, options) {
    super(message, { code: "CONTENT_EXTRACTION_FAILED", ...options });
    this.name = "ContentExtractionError";
    this.phase = options.phase;
  }
};
var NoContentFoundError = class extends ScraperError {
  constructor(message, options) {
    super(message, { code: "NO_CONTENT_FOUND", ...options });
    this.name = "NoContentFoundError";
    this.triedSources = options.triedSources;
  }
};
var InvalidUrlError = class extends ScraperError {
  constructor(message, options) {
    super(message, { code: "INVALID_URL", ...options });
    this.name = "InvalidUrlError";
    this.statusCode = options.statusCode;
  }
};
var CircuitOpenError = class extends ScraperError {
  constructor(message, options) {
    super(message, { code: "CIRCUIT_OPEN", ...options });
    this.name = "CircuitOpenError";
    this.resetTime = options.resetTime;
  }
};
function isScraperError(error) {
  return error instanceof ScraperError;
}
function isAbortError(error) {
  if (error instanceof RequestAbortedError) return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

// src/scraper.ts
function checkAborted(signal, url) {
  if (signal?.aborted) {
    throw new RequestAbortedError("Scraping was cancelled", { url });
  }
}
function emitProgress(onProgress, progress) {
  if (onProgress) {
    try {
      onProgress(progress);
    } catch {
    }
  }
}
async function scrape(url, options = {}) {
  const startTime = Date.now();
  const {
    sourceType = "auto",
    maxArticles = 50,
    extractFullContent = true,
    denyPaths = DEFAULT_DENY_PATHS,
    qualityThreshold = 0.6,
    onProgress,
    signal,
    debug = false
  } = options;
  const log = debug ? console.log.bind(console) : () => {
  };
  log(`[Scraper] Starting scrape of ${url}`);
  log(`   Source type: ${sourceType}`);
  log(`   Max articles: ${maxArticles}`);
  log(`   Extract full content: ${extractFullContent}`);
  log(`   Quality threshold: ${qualityThreshold}`);
  const errors = [];
  let totalDiscovered = 0;
  let afterDenyFilter = 0;
  let afterContentValidation = 0;
  let afterQualityFilter = 0;
  const elapsed = () => Date.now() - startTime;
  try {
    checkAborted(signal, url);
    emitProgress(onProgress, {
      phase: "initializing",
      message: "Starting scrape...",
      elapsedMs: elapsed()
    });
    emitProgress(onProgress, {
      phase: "detecting",
      message: `Detecting content source type for ${new URL(url).hostname}...`,
      elapsedMs: elapsed()
    });
    checkAborted(signal, url);
    const config = {
      sourceType,
      denyPaths
    };
    emitProgress(onProgress, {
      phase: "discovering",
      message: "Discovering articles...",
      elapsedMs: elapsed()
    });
    const orchestrationResult = await globalSourceOrchestrator.processSource(url, config);
    totalDiscovered = orchestrationResult.articles.length;
    errors.push(...orchestrationResult.errors);
    checkAborted(signal, url);
    emitProgress(onProgress, {
      phase: "discovering",
      message: `Found ${totalDiscovered} candidate articles`,
      articlesFound: totalDiscovered,
      detectedType: orchestrationResult.sourceInfo.detectedType,
      elapsedMs: elapsed()
    });
    log(`[Scraper] Discovered ${totalDiscovered} candidate articles`);
    if (totalDiscovered === 0) {
      throw new NoContentFoundError(
        `No articles found at ${url}`,
        { url, triedSources: [orchestrationResult.sourceInfo.detectedType] }
      );
    }
    emitProgress(onProgress, {
      phase: "filtering",
      message: "Filtering blocked paths...",
      elapsedMs: elapsed()
    });
    let candidateArticles = orchestrationResult.articles.filter((article) => {
      const shouldDeny = shouldDenyUrl(article.url, denyPaths);
      return !shouldDeny;
    });
    afterDenyFilter = candidateArticles.length;
    emitProgress(onProgress, {
      phase: "filtering",
      message: `${afterDenyFilter} articles after filtering`,
      articlesFound: afterDenyFilter,
      elapsedMs: elapsed()
    });
    log(`[Scraper] After deny filter: ${afterDenyFilter} articles`);
    checkAborted(signal, url);
    let scrapedArticles = [];
    if (extractFullContent && candidateArticles.length > 0) {
      const articlesToProcess = candidateArticles.slice(0, maxArticles * 2);
      const totalToExtract = Math.min(articlesToProcess.length, maxArticles * 2);
      emitProgress(onProgress, {
        phase: "extracting",
        message: `Extracting content from ${totalToExtract} articles...`,
        current: 0,
        total: totalToExtract,
        percent: 0,
        elapsedMs: elapsed()
      });
      log(`[Scraper] Extracting full content for ${totalToExtract} articles`);
      for (let i = 0; i < articlesToProcess.length; i++) {
        const candidate = articlesToProcess[i];
        checkAborted(signal, candidate.url);
        emitProgress(onProgress, {
          phase: "extracting",
          message: `Extracting article ${i + 1}/${totalToExtract}...`,
          current: i + 1,
          total: totalToExtract,
          percent: Math.round((i + 1) / totalToExtract * 100),
          currentUrl: candidate.url,
          articlesFound: scrapedArticles.length,
          elapsedMs: elapsed()
        });
        try {
          const extractedContent = await globalContentExtractor.extractContent(candidate.url);
          if (!extractedContent) {
            errors.push(`Failed to extract content from ${candidate.url}`);
            continue;
          }
          const markdown = convertToMarkdown(extractedContent.content || "");
          const cleanedText = cleanText(extractedContent.textContent || "");
          const qualityScore = calculateArticleQualityScore(extractedContent);
          scrapedArticles.push({
            url: candidate.url,
            title: extractedContent.title || candidate.title,
            publishedDate: extractedContent.publishedTime,
            description: extractedContent.excerpt || candidate.excerpt,
            fullContent: extractedContent.content,
            fullContentMarkdown: markdown,
            fullContentText: cleanedText,
            confidence: candidate.confidence,
            source: extractedContent.structured?.jsonLd ? "structured-data" : extractedContent.byline ? "meta-data" : "link-text",
            qualityScore,
            metadata: {
              ...candidate.metadata,
              wordCount: extractedContent.wordCount,
              readingTime: extractedContent.readingTime,
              byline: extractedContent.byline,
              siteName: extractedContent.siteName,
              lang: extractedContent.lang
            }
          });
          if (scrapedArticles.length >= maxArticles) {
            break;
          }
        } catch (error) {
          if (error instanceof RequestAbortedError) {
            throw error;
          }
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          errors.push(`Error processing ${candidate.url}: ${errorMsg}`);
          continue;
        }
      }
    } else {
      scrapedArticles = candidateArticles.slice(0, maxArticles).map((candidate) => ({
        url: candidate.url,
        title: candidate.title,
        publishedDate: candidate.publishedAt,
        description: candidate.excerpt,
        confidence: candidate.confidence,
        source: candidate.source === "rss" ? "structured-data" : candidate.source === "sitemap" ? "meta-data" : "link-text",
        qualityScore: 0.5,
        // Default score when not extracting full content
        metadata: candidate.metadata
      }));
    }
    afterContentValidation = scrapedArticles.length;
    checkAborted(signal, url);
    emitProgress(onProgress, {
      phase: "scoring",
      message: `Scoring ${afterContentValidation} articles...`,
      elapsedMs: elapsed()
    });
    log(`[Scraper] After content extraction: ${afterContentValidation} articles`);
    const filteredArticles = scrapedArticles.filter((article) => {
      const score = article.qualityScore ?? 0;
      return score >= qualityThreshold;
    });
    afterQualityFilter = filteredArticles.length;
    log(`[Scraper] After quality filter: ${afterQualityFilter} articles (threshold: ${qualityThreshold})`);
    const processingTime = Date.now() - startTime;
    const result = {
      url,
      detectedType: orchestrationResult.sourceInfo.detectedType,
      confidence: afterQualityFilter > 0 ? "high" : afterContentValidation > 0 ? "medium" : "low",
      articles: filteredArticles,
      extractionStats: {
        attempted: totalDiscovered,
        successful: afterQualityFilter,
        failed: errors.length,
        filtered: totalDiscovered - afterQualityFilter,
        totalDiscovered,
        afterDenyFilter,
        afterContentValidation,
        afterQualityFilter
      },
      processingTime,
      errors,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    emitProgress(onProgress, {
      phase: "complete",
      message: `Complete! Found ${afterQualityFilter} quality articles`,
      articlesFound: afterQualityFilter,
      percent: 100,
      elapsedMs: processingTime
    });
    log(`[Scraper] Complete! ${afterQualityFilter} articles in ${processingTime}ms`);
    return result;
  } catch (error) {
    if (error instanceof RequestAbortedError) {
      emitProgress(onProgress, {
        phase: "error",
        message: "Scraping was cancelled",
        elapsedMs: elapsed()
      });
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log(`[Scraper] Fatal error: ${errorMessage}`);
    emitProgress(onProgress, {
      phase: "error",
      message: `Error: ${errorMessage}`,
      elapsedMs: elapsed()
    });
    return {
      url,
      detectedType: "unknown",
      confidence: "low",
      articles: [],
      extractionStats: {
        attempted: totalDiscovered,
        successful: 0,
        failed: 1,
        filtered: totalDiscovered,
        totalDiscovered,
        afterDenyFilter,
        afterContentValidation,
        afterQualityFilter
      },
      processingTime: Date.now() - startTime,
      errors: [errorMessage, ...errors],
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
}
async function quickScrape(url, options) {
  const result = await scrape(url, {
    extractFullContent: false,
    maxArticles: 100,
    qualityThreshold: 0,
    signal: options?.signal,
    onProgress: options?.onProgress
  });
  return result.articles.map((a) => a.url);
}
function createScraper(defaultOptions = {}) {
  return {
    scrape: (url, options) => scrape(url, { ...defaultOptions, ...options }),
    quickScrape: (url, options) => quickScrape(url, { ...options })
  };
}

// src/index.ts
var VERSION = "0.2.0";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CircuitBreaker,
  CircuitOpenError,
  ContentExtractionError,
  ContentExtractor,
  DEFAULT_DENY_PATHS,
  DEFAULT_QUALITY_CONFIG,
  HTMLScraper,
  InvalidUrlError,
  NoContentFoundError,
  RSSDiscovery,
  RateLimitError,
  RequestAbortedError,
  RequestTimeoutError,
  RobotsBlockedError,
  RobotsChecker,
  ScraperError,
  ScrapingRateLimiter,
  SitemapParser,
  SourceOrchestrator,
  VERSION,
  calculateArticleQualityScore,
  circuitBreakers,
  cleanText,
  convertToMarkdown,
  createScraper,
  decodeHTMLEntities,
  detectParagraphs,
  fetchRSSFeed,
  getQualityBreakdown,
  globalContentExtractor,
  globalRSSDiscovery,
  globalRateLimiter,
  globalRobotsChecker,
  globalSitemapParser,
  globalSourceOrchestrator,
  htmlToMarkdown,
  isAbortError,
  isScraperError,
  normalizeWhitespace,
  quickScrape,
  removeUrls,
  scrape,
  shouldDenyUrl,
  stripHTML,
  stripNonArticleContent,
  truncateText,
  validateContent
});
