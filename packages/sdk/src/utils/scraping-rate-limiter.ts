interface QueuedRequest {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  operation: () => Promise<any>;
  priority: number;
  retryCount: number;
  maxRetries: number;
  host: string;
}

interface HostState {
  lastRequest: number;
  backoffUntil: number;
  backoffMultiplier: number;
  queue: QueuedRequest[];
  processing: boolean;
}

export class ScrapingRateLimiter {
  private hosts = new Map<string, HostState>();
  private readonly baseDelay: number;
  private readonly maxBackoff: number;
  private readonly maxConcurrent: number;
  private activeRequests = new Set<string>();

  constructor(options: {
    requestsPerSecond?: number;
    maxBackoff?: number;
    maxConcurrent?: number;
  } = {}) {
    this.baseDelay = Math.floor(1000 / (options.requestsPerSecond || 1));
    this.maxBackoff = options.maxBackoff || 30000; // 30 seconds max backoff
    this.maxConcurrent = options.maxConcurrent || 10;
  }

  async execute<T>(
    url: string,
    operation: () => Promise<T>,
    options: {
      priority?: number;
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    const host = this.extractHost(url);
    if (!host) {
      throw new Error(`Invalid URL: ${url}`);
    }

    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest = {
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

  private extractHost(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private enqueueRequest(host: string, request: QueuedRequest) {
    if (!this.hosts.has(host)) {
      this.hosts.set(host, {
        lastRequest: 0,
        backoffUntil: 0,
        backoffMultiplier: 1,
        queue: [],
        processing: false
      });
    }

    const hostState = this.hosts.get(host)!;

    // Insert request in priority order (higher priority first)
    const insertIndex = hostState.queue.findIndex(
      req => req.priority < request.priority
    );

    if (insertIndex === -1) {
      hostState.queue.push(request);
    } else {
      hostState.queue.splice(insertIndex, 0, request);
    }

    // Start processing if not already running
    if (!hostState.processing) {
      this.processQueue(host).catch(error => {
        console.error(`[RateLimiter] Error processing queue for ${host}:`, error);
      });
    }
  }

  private async processQueue(host: string) {
    const hostState = this.hosts.get(host);
    if (!hostState || hostState.processing) {
      return;
    }

    hostState.processing = true;

    try {
      while (hostState.queue.length > 0) {
        // Check if we're within concurrent limits
        if (this.activeRequests.size >= this.maxConcurrent) {
          await this.wait(100); // Brief wait before checking again
          continue;
        }

        // Check if we're still in backoff period
        if (Date.now() < hostState.backoffUntil) {
          const waitTime = hostState.backoffUntil - Date.now();
          await this.wait(Math.min(waitTime, 1000));
          continue;
        }

        // Check rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - hostState.lastRequest;
        if (timeSinceLastRequest < this.baseDelay) {
          const waitTime = this.baseDelay - timeSinceLastRequest;
          await this.wait(waitTime);
          continue;
        }

        const request = hostState.queue.shift()!;
        const requestId = `${host}-${Date.now()}-${Math.random()}`;
        this.activeRequests.add(requestId);

        try {
          hostState.lastRequest = Date.now();
          const result = await request.operation();

          // Reset backoff on success
          hostState.backoffMultiplier = 1;
          hostState.backoffUntil = 0;

          request.resolve(result);

        } catch (error: any) {
          await this.handleRequestError(hostState, request, error);
        } finally {
          this.activeRequests.delete(requestId);
        }
      }
    } finally {
      hostState.processing = false;
    }
  }

  private async handleRequestError(
    hostState: HostState,
    request: QueuedRequest,
    error: any
  ) {
    const shouldRetry = this.shouldRetry(error, request);

    if (shouldRetry && request.retryCount < request.maxRetries) {
      request.retryCount++;

      // Apply exponential backoff for certain errors
      if (this.shouldBackoff(error)) {
        const backoffTime = Math.min(
          this.baseDelay * hostState.backoffMultiplier * Math.pow(2, request.retryCount),
          this.maxBackoff
        );

        hostState.backoffUntil = Date.now() + backoffTime;
        hostState.backoffMultiplier = Math.min(hostState.backoffMultiplier * 1.5, 10);

        console.warn(
          `[RateLimiter] Backing off ${request.host} for ${backoffTime}ms ` +
          `(attempt ${request.retryCount}/${request.maxRetries}): ${error.message}`
        );
      }

      // Re-queue the request with lower priority
      request.priority = Math.max(request.priority - 1, -10);
      hostState.queue.unshift(request);

    } else {
      console.error(
        `[RateLimiter] Request failed for ${request.host} ` +
        `(${request.retryCount}/${request.maxRetries} retries): ${error.message}`
      );
      request.reject(error);
    }
  }

  private shouldRetry(error: any, request: QueuedRequest): boolean {
    // Don't retry if we've exceeded max retries
    if (request.retryCount >= request.maxRetries) {
      return false;
    }

    // Retry on network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return true;
    }

    // Retry on HTTP status codes that might be transient
    if (error.status) {
      const status = error.status;
      return status === 408 || status === 429 || status >= 500;
    }

    // Retry on timeout errors
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return true;
    }

    return false;
  }

  private shouldBackoff(error: any): boolean {
    // Apply backoff for rate limiting and server errors
    if (error.status) {
      const status = error.status;
      return status === 429 || status >= 500;
    }

    // Apply backoff for connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return true;
    }

    return false;
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility method to get current queue stats
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};

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
}

// Default global rate limiter instance
export const globalRateLimiter = new ScrapingRateLimiter({
  requestsPerSecond: 1,
  maxBackoff: 30000,
  maxConcurrent: 10
});
