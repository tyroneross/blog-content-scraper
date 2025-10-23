interface RobotsRule {
  userAgent: string;
  disallows: string[];
  allows: string[];
  crawlDelay?: number;
  sitemaps: string[];
}

interface RobotsTxt {
  rules: RobotsRule[];
  sitemaps: string[];
  fetchedAt: number;
  expiresAt: number;
}

export class RobotsChecker {
  private cache = new Map<string, RobotsTxt>();
  private readonly cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours
  private readonly userAgent = 'AtomizeNews/1.0';
  private readonly requestTimeout = 5000; // 5 seconds

  /**
   * Check if a URL is allowed to be crawled according to robots.txt
   */
  async isAllowed(url: string): Promise<{
    allowed: boolean;
    crawlDelay?: number;
    sitemaps: string[];
    reason?: string;
  }> {
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
      
      console.log(`🤖 [Robots] Checking ${url} against ${robotsUrl}`);
      
      const robotsTxt = await this.getRobotsTxt(robotsUrl);
      if (!robotsTxt) {
        // If robots.txt doesn't exist or can't be fetched, allow by default
        return { 
          allowed: true, 
          sitemaps: [],
          reason: 'No robots.txt found - allowing by default'
        };
      }

      const result = this.checkRules(urlObj.pathname, robotsTxt);
      
      console.log(`🤖 [Robots] ${result.allowed ? '✅ Allowed' : '❌ Blocked'}: ${url} - ${result.reason}`);
      
      return result;
      
    } catch (error) {
      console.warn(`⚠️ [Robots] Error checking robots.txt for ${url}:`, error);
      // On error, default to allowing the request
      return { 
        allowed: true, 
        sitemaps: [],
        reason: `Error checking robots.txt: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get sitemaps listed in robots.txt for a domain
   */
  async getSitemaps(domain: string): Promise<string[]> {
    try {
      const robotsUrl = `https://${domain}/robots.txt`;
      const robotsTxt = await this.getRobotsTxt(robotsUrl);
      return robotsTxt ? robotsTxt.sitemaps : [];
    } catch (error) {
      console.warn(`⚠️ [Robots] Error getting sitemaps for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Get the recommended crawl delay for a domain
   */
  async getCrawlDelay(domain: string): Promise<number | undefined> {
    try {
      const robotsUrl = `https://${domain}/robots.txt`;
      const robotsTxt = await this.getRobotsTxt(robotsUrl);
      
      if (!robotsTxt) return undefined;

      // Find the most specific rule for our user agent
      const rule = this.findBestMatchingRule(robotsTxt.rules);
      return rule?.crawlDelay;
      
    } catch (error) {
      console.warn(`⚠️ [Robots] Error getting crawl delay for ${domain}:`, error);
      return undefined;
    }
  }

  private async getRobotsTxt(robotsUrl: string): Promise<RobotsTxt | null> {
    // Check cache first
    const cached = this.cache.get(robotsUrl);
    if (cached && Date.now() < cached.expiresAt) {
      return cached;
    }

    try {
      console.log(`🤖 [Robots] Fetching ${robotsUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
      
      const response = await fetch(robotsUrl, {
        headers: {
          'User-Agent': this.userAgent,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`🤖 [Robots] No robots.txt found at ${robotsUrl}`);
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      const robotsTxt = this.parseRobotsTxt(text);
      
      // Cache the result
      this.cache.set(robotsUrl, robotsTxt);
      
      console.log(`🤖 [Robots] Successfully parsed robots.txt for ${new URL(robotsUrl).hostname}`);
      return robotsTxt;
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`⚠️ [Robots] Timeout fetching ${robotsUrl}`);
      } else {
        console.warn(`⚠️ [Robots] Error fetching ${robotsUrl}:`, error);
      }
      return null;
    }
  }

  private parseRobotsTxt(text: string): RobotsTxt {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    const rules: RobotsRule[] = [];
    const globalSitemaps: string[] = [];
    
    let currentRule: Partial<RobotsRule> | null = null;

    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      const lowerKey = key.toLowerCase().trim();

      switch (lowerKey) {
        case 'user-agent':
          // Start a new rule
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

        case 'disallow':
          if (currentRule) {
            currentRule.disallows = currentRule.disallows || [];
            if (value) {
              currentRule.disallows.push(value);
            }
          }
          break;

        case 'allow':
          if (currentRule) {
            currentRule.allows = currentRule.allows || [];
            if (value) {
              currentRule.allows.push(value);
            }
          }
          break;

        case 'crawl-delay':
          if (currentRule && value) {
            const delay = parseFloat(value);
            if (!isNaN(delay)) {
              currentRule.crawlDelay = delay * 1000; // Convert to milliseconds
            }
          }
          break;

        case 'sitemap':
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

    // Don't forget the last rule
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

  private completeRule(partial: Partial<RobotsRule>): RobotsRule {
    return {
      userAgent: partial.userAgent || '*',
      disallows: partial.disallows || [],
      allows: partial.allows || [],
      crawlDelay: partial.crawlDelay,
      sitemaps: partial.sitemaps || []
    };
  }

  private checkRules(path: string, robotsTxt: RobotsTxt): {
    allowed: boolean;
    crawlDelay?: number;
    sitemaps: string[];
    reason: string;
  } {
    // Find the best matching rule for our user agent
    const rule = this.findBestMatchingRule(robotsTxt.rules);
    
    if (!rule) {
      return {
        allowed: true,
        sitemaps: robotsTxt.sitemaps,
        reason: 'No applicable rules found'
      };
    }

    // Check Allow rules first (they have priority over Disallow)
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

    // Check Disallow rules
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

    // If no rules match, allow by default
    return {
      allowed: true,
      crawlDelay: rule.crawlDelay,
      sitemaps: robotsTxt.sitemaps,
      reason: 'No matching disallow rules'
    };
  }

  private findBestMatchingRule(rules: RobotsRule[]): RobotsRule | null {
    // Priority order: exact match for our user agent, then wildcard
    const exactMatch = rules.find(rule => rule.userAgent === this.userAgent.toLowerCase());
    if (exactMatch) return exactMatch;

    const wildcardMatch = rules.find(rule => rule.userAgent === '*');
    if (wildcardMatch) return wildcardMatch;

    return null;
  }

  private matchesPattern(path: string, pattern: string): boolean {
    if (pattern === '') {
      // Empty disallow means allow everything
      return false;
    }
    
    if (pattern === '/') {
      // Root disallow means disallow everything
      return true;
    }

    // Handle wildcards - simplified pattern matching
    if (pattern.includes('*')) {
      // Convert robots.txt wildcard pattern to regex
      const regexPattern = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
        .replace(/\\\*/g, '.*'); // Convert * to .*
      
      const regex = new RegExp('^' + regexPattern);
      return regex.test(path);
    }

    // Simple prefix matching for patterns without wildcards
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
}

// Default global instance
export const globalRobotsChecker = new RobotsChecker();