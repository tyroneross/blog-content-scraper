/**
 * React Hook Module
 *
 * React hooks for using the omniscraper in React applications.
 * This module requires React as a peer dependency.
 *
 * NOTE: This module is FEATURE FLAGGED and requires explicit opt-in.
 * React is not bundled - it must be installed separately.
 *
 * @example
 * ```typescript
 * // In your React component
 * import { useScraper } from '@tyroneross/omniscraper/react';
 *
 * function MyComponent() {
 *   const { scrape, data, isLoading, error, progress } = useScraper();
 *
 *   const handleScrape = async () => {
 *     await scrape('https://example.com/blog');
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleScrape} disabled={isLoading}>
 *         {isLoading ? `Loading... ${progress}%` : 'Scrape'}
 *       </button>
 *       {error && <p>Error: {error}</p>}
 *       {data?.articles.map(a => <div key={a.url}>{a.title}</div>)}
 *     </div>
 *   );
 * }
 * ```
 */

// Feature flag check - React hooks are opt-in
const REACT_HOOKS_ENABLED = process.env.BLOG_SCRAPER_ENABLE_REACT === 'true';

// ============================================================================
// Types
// ============================================================================

import type { ScrapeResult, ScrapeOptions, SingleArticleResult } from '../index';

export interface UseScraperState {
  data: ScrapeResult | null;
  isLoading: boolean;
  error: string | null;
  progress: number;
}

export interface UseScraperActions {
  scrape: (url: string, options?: ScrapeOptions) => Promise<ScrapeResult | null>;
  extractArticle: (url: string) => Promise<SingleArticleResult | null>;
  cancel: () => void;
  reset: () => void;
}

export type UseScraperResult = UseScraperState & UseScraperActions;

export interface UseArticleState {
  article: SingleArticleResult | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseArticleActions {
  extract: (url: string) => Promise<SingleArticleResult | null>;
  cancel: () => void;
  reset: () => void;
}

export type UseArticleResult = UseArticleState & UseArticleActions;

export interface ScraperProviderProps {
  children: React.ReactNode;
  defaultOptions?: ScrapeOptions;
}

// ============================================================================
// Feature Flag Check
// ============================================================================

function checkReactAvailable(): void {
  if (!REACT_HOOKS_ENABLED) {
    throw new Error(
      'React hooks are feature flagged. To enable, set BLOG_SCRAPER_ENABLE_REACT=true in your environment.\n' +
      'Also ensure React is installed as a peer dependency: npm install react'
    );
  }
}

// ============================================================================
// Hook Implementations
// ============================================================================

/**
 * Main scraper hook for React applications
 *
 * @example
 * ```typescript
 * function BlogList() {
 *   const { scrape, data, isLoading, error, progress, cancel } = useScraper();
 *
 *   useEffect(() => {
 *     scrape('https://techcrunch.com', { maxArticles: 5 });
 *     return () => cancel(); // Cancel on unmount
 *   }, []);
 *
 *   if (isLoading) return <p>Loading... {progress}%</p>;
 *   if (error) return <p>Error: {error}</p>;
 *   if (!data) return null;
 *
 *   return (
 *     <ul>
 *       {data.articles.map(article => (
 *         <li key={article.url}>{article.title}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useScraper(defaultOptions?: ScrapeOptions): UseScraperResult {
  checkReactAvailable();

  // Dynamic import React to avoid bundling issues
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react') as typeof import('react');
  const { useState, useCallback, useRef } = React;

  const [state, setState] = useState<UseScraperState>({
    data: null,
    isLoading: false,
    error: null,
    progress: 0
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const scrape = useCallback(async (
    url: string,
    options?: ScrapeOptions
  ): Promise<ScrapeResult | null> => {
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      progress: 0
    }));

    try {
      const { scrapeWebsite } = await import('../index');

      const result = await scrapeWebsite(url, {
        ...defaultOptions,
        ...options,
        signal: abortControllerRef.current.signal,
        onProgress: (completed, total) => {
          const progress = Math.round((completed / total) * 100);
          setState(prev => ({ ...prev, progress }));
          options?.onProgress?.(completed, total);
        }
      });

      setState(prev => ({
        ...prev,
        data: result,
        isLoading: false,
        progress: 100
      }));

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Don't set error state if cancelled
      if (message === 'Operation cancelled') {
        setState(prev => ({ ...prev, isLoading: false }));
        return null;
      }

      setState(prev => ({
        ...prev,
        error: message,
        isLoading: false
      }));

      return null;
    }
  }, [defaultOptions]);

  const extractArticle = useCallback(async (url: string): Promise<SingleArticleResult | null> => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      progress: 0
    }));

    try {
      const { extractArticle: extract } = await import('../index');
      const result = await extract(url);

      if (result) {
        setState(prev => ({
          ...prev,
          data: {
            url,
            detectedType: 'single-article',
            articles: [{
              url: result.url,
              title: result.title,
              publishedDate: result.publishedDate,
              description: result.excerpt,
              fullContent: result.html,
              fullContentMarkdown: result.markdown,
              fullContentText: result.text,
              confidence: result.confidence,
              source: 'direct-extraction',
              qualityScore: 0.9
            }],
            stats: { totalDiscovered: 1, afterQualityFilter: 1, processingTime: 0 }
          },
          isLoading: false,
          progress: 100
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: 'Failed to extract article',
          isLoading: false
        }));
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        error: message,
        isLoading: false
      }));
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setState(prev => ({ ...prev, isLoading: false }));
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setState({
      data: null,
      isLoading: false,
      error: null,
      progress: 0
    });
  }, []);

  return {
    ...state,
    scrape,
    extractArticle,
    cancel,
    reset
  };
}

/**
 * Hook for extracting a single article
 *
 * @example
 * ```typescript
 * function ArticlePage({ url }) {
 *   const { extract, article, isLoading, error } = useArticle();
 *
 *   useEffect(() => {
 *     extract(url);
 *   }, [url]);
 *
 *   if (isLoading) return <p>Loading...</p>;
 *   if (error) return <p>Error: {error}</p>;
 *   if (!article) return null;
 *
 *   return (
 *     <article>
 *       <h1>{article.title}</h1>
 *       <div dangerouslySetInnerHTML={{ __html: article.html }} />
 *     </article>
 *   );
 * }
 * ```
 */
export function useArticle(): UseArticleResult {
  checkReactAvailable();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react') as typeof import('react');
  const { useState, useCallback, useRef } = React;

  const [state, setState] = useState<UseArticleState>({
    article: null,
    isLoading: false,
    error: null
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const extract = useCallback(async (url: string): Promise<SingleArticleResult | null> => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setState({ article: null, isLoading: true, error: null });

    try {
      const { extractArticle } = await import('../index');
      const result = await extractArticle(url);

      if (result) {
        setState({ article: result, isLoading: false, error: null });
      } else {
        setState({ article: null, isLoading: false, error: 'Failed to extract article' });
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setState({ article: null, isLoading: false, error: message });
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setState(prev => ({ ...prev, isLoading: false }));
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setState({ article: null, isLoading: false, error: null });
  }, []);

  return { ...state, extract, cancel, reset };
}

/**
 * Hook for batch URL processing
 *
 * @example
 * ```typescript
 * function BatchProcessor({ urls }) {
 *   const { process, results, isLoading, progress } = useBatchScraper();
 *
 *   const handleProcess = () => {
 *     process(urls, { concurrency: 2 });
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleProcess} disabled={isLoading}>
 *         Process {urls.length} URLs
 *       </button>
 *       {isLoading && <p>Progress: {progress.completed}/{progress.total}</p>}
 *       {results && <p>Success: {results.stats.successful}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useBatchScraper() {
  checkReactAvailable();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react') as typeof import('react');
  const { useState, useCallback, useRef } = React;

  interface BatchState {
    results: Awaited<ReturnType<typeof import('../batch').scrapeUrls>> | null;
    isLoading: boolean;
    error: string | null;
    progress: { total: number; completed: number; failed: number; percentage: number };
  }

  const [state, setState] = useState<BatchState>({
    results: null,
    isLoading: false,
    error: null,
    progress: { total: 0, completed: 0, failed: 0, percentage: 0 }
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const process = useCallback(async (
    urls: string[],
    options?: Parameters<typeof import('../batch').scrapeUrls>[1]
  ) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      progress: { total: urls.length, completed: 0, failed: 0, percentage: 0 }
    }));

    try {
      const { scrapeUrls } = await import('../batch');

      const results = await scrapeUrls(urls, {
        ...options,
        signal: abortControllerRef.current.signal,
        onProgress: (progress) => {
          setState(prev => ({
            ...prev,
            progress: {
              total: progress.total,
              completed: progress.completed,
              failed: progress.failed,
              percentage: progress.percentage
            }
          }));
          options?.onProgress?.(progress);
        }
      });

      setState(prev => ({
        ...prev,
        results,
        isLoading: false
      }));

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        error: message,
        isLoading: false
      }));
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setState(prev => ({ ...prev, isLoading: false }));
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setState({
      results: null,
      isLoading: false,
      error: null,
      progress: { total: 0, completed: 0, failed: 0, percentage: 0 }
    });
  }, []);

  return { ...state, process, cancel, reset };
}

// ============================================================================
// Context Provider (Optional)
// ============================================================================

/**
 * Optional context provider for sharing scraper options across components
 */
export function createScraperContext() {
  checkReactAvailable();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react') as typeof import('react');
  const { createContext, useContext } = React;

  const ScraperContext = createContext<{
    defaultOptions: ScrapeOptions;
  } | null>(null);

  function ScraperProvider({ children, defaultOptions = {} }: ScraperProviderProps) {
    return React.createElement(
      ScraperContext.Provider,
      { value: { defaultOptions } },
      children
    );
  }

  function useScraperContext() {
    const context = useContext(ScraperContext);
    if (!context) {
      throw new Error('useScraperContext must be used within a ScraperProvider');
    }
    return context;
  }

  return { ScraperProvider, useScraperContext, ScraperContext };
}
