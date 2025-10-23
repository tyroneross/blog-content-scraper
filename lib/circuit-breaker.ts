interface CircuitBreakerOptions {
  failureThreshold: number;
  timeout: number;
  resetTimeout: number;
  name: string;
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime < this.options.resetTimeout) {
        throw new Error(`[CircuitBreaker:${this.options.name}] Circuit is OPEN - preventing request`);
      } else {
        this.state = 'HALF_OPEN';
        console.log(`🔄 [CircuitBreaker:${this.options.name}] Circuit moving to HALF_OPEN state`);
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

  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`[CircuitBreaker:${this.options.name}] Operation timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);

      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.options.failureThreshold) {
      this.state = 'OPEN';
      console.error(`❌ [CircuitBreaker:${this.options.name}] Circuit opened after ${this.failures} failures`);
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// Pre-configured circuit breakers for common services
export const circuitBreakers = {
  rss: new CircuitBreaker({
    name: 'RSS',
    failureThreshold: 3,
    timeout: 15000, // 15 seconds
    resetTimeout: 30000 // 30 seconds
  }),

  scraping: new CircuitBreaker({
    name: 'Scraping',
    failureThreshold: 5,
    timeout: 10000, // 10 seconds
    resetTimeout: 30000 // 30 seconds
  }),

  scrapingTest: new CircuitBreaker({
    name: 'ScrapingTest',
    failureThreshold: 3,
    timeout: 30000, // 30 seconds for test endpoints
    resetTimeout: 60000 // 1 minute
  })
};
