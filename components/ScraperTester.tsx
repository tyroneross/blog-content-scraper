/**
 * @package @tyroneross/scraper-testing
 * Main scraper testing component with URL input and configuration
 */

'use client';

import React, { useState } from 'react';
import { ScraperTestProps, ScraperTestResult } from '@/lib/types';
import { ScraperResults } from './ScraperResults';
import { TestTube, Sparkles } from 'lucide-react';

const EXAMPLE_URLS = [
  { name: 'Anthropic News', url: 'https://www.anthropic.com/news' },
  { name: 'OpenAI Blog', url: 'https://openai.com/news/' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/discover/blog/' },
  { name: 'Meta AI', url: 'https://ai.meta.com/blog/' },
];

interface ProgressState {
  phase: string;
  percent: number;
  detail: string;
}

export function ScraperTester({
  onTestComplete,
  onTestStart,
  onError,
  className = '',
  defaultUrl = '',
}: ScraperTestProps) {
  const [url, setUrl] = useState(defaultUrl);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScraperTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extractFullContent, setExtractFullContent] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [qualityThreshold, setQualityThreshold] = useState(0.6);
  const [customDenyPaths, setCustomDenyPaths] = useState('');
  const [perplexityApiKey, setPerplexityApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  const handleTest = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    let normalizedUrl = url.trim();
    if (!normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    try {
      new URL(normalizedUrl);
    } catch {
      setError('Please enter a valid URL (e.g., example.com or https://example.com)');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setProgress({ phase: 'init', percent: 0, detail: 'Starting...' });

    if (onTestStart) {
      onTestStart(normalizedUrl);
    }

    try {
      const denyPaths = customDenyPaths
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      const response = await fetch('/api/scraper-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(perplexityApiKey ? { 'X-Perplexity-API-Key': perplexityApiKey } : {}),
        },
        body: JSON.stringify({
          url: normalizedUrl,
          sourceType: 'auto',
          maxArticles: 10,
          extractFullContent,
          qualityThreshold,
          denyPaths: denyPaths.length > 0 ? denyPaths : undefined,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === 'progress') {
                setProgress({
                  phase: event.phase,
                  percent: event.percent,
                  detail: event.detail || '',
                });
              } else if (event.type === 'result') {
                setResult(event.data);
                if (onTestComplete) {
                  onTestComplete(event.data);
                }
              } else if (event.type === 'error') {
                throw new Error(event.error);
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);

      if (onError && err instanceof Error) {
        onError(err);
      }
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const loadExample = (exampleUrl: string) => {
    setUrl(exampleUrl);
    setResult(null);
    setError(null);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Input Section */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <div className="flex items-center gap-2 mb-4">
          <TestTube className="w-5 h-5 text-blue-600" />
          <h2 className="font-medium text-gray-900">Web Scraper Tester</h2>
        </div>

        <div className="space-y-4">
          {/* URL Input */}
          <div>
            <label htmlFor="scraper-url" className="block text-sm font-medium text-gray-700 mb-2">
              Website URL
            </label>
            <div className="flex gap-2">
              <input
                id="scraper-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && handleTest()}
                placeholder="example.com/news"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                disabled={loading}
              />
              <button
                onClick={handleTest}
                disabled={loading || !url.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {progress?.percent || 0}%
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Test Scraper
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Enter any website URL (https:// is optional)
            </p>
          </div>

          {/* Progress Indicator */}
          {loading && progress && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">{progress.detail}</span>
                <span className="text-sm font-bold text-blue-600">{progress.percent}%</span>
              </div>
              <div className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Full Content Extraction Option */}
          <div className={`flex items-center gap-2 p-3 border rounded-lg ${
            extractFullContent
              ? 'bg-blue-50 border-blue-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <input
              type="checkbox"
              id="extract-full-content"
              checked={extractFullContent}
              onChange={(e) => setExtractFullContent(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <label htmlFor="extract-full-content" className={`text-sm cursor-pointer ${
              extractFullContent ? 'text-blue-900' : 'text-amber-900'
            }`}>
              {extractFullContent ? (
                <>
                  <span className="font-medium">Production mode - Extract full content</span>
                  <span className="block text-xs text-blue-700 mt-0.5">
                    Matches production behavior (~20-60s for 10 articles). Best search quality.
                  </span>
                </>
              ) : (
                <>
                  <span className="font-medium">Fast mode - Metadata only</span>
                  <span className="block text-xs text-amber-700 mt-0.5">
                    Quick URL validation (~5-10s). Production will extract full content.
                  </span>
                </>
              )}
            </label>
          </div>

          {/* Advanced Filtering (Collapsible) */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              disabled={loading}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Advanced Filtering</span>
                <span className="text-xs text-gray-500">(Optional)</span>
              </div>
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showAdvanced && (
              <div className="p-4 space-y-4 bg-white">
                {/* Quality Threshold Slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">
                      Quality Threshold
                    </label>
                    <span className="text-sm font-semibold text-blue-600">
                      {Math.round(qualityThreshold * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.4"
                    max="0.9"
                    step="0.05"
                    value={qualityThreshold}
                    onChange={(e) => setQualityThreshold(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    disabled={loading}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>More articles</span>
                    <span>Better quality</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Only show articles scoring ≥{Math.round(qualityThreshold * 100)}% (includes date, author, content quality)
                  </p>
                </div>

                {/* Custom Deny Paths */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Custom Deny Patterns (Optional)
                  </label>
                  <textarea
                    value={customDenyPaths}
                    onChange={(e) => setCustomDenyPaths(e.target.value)}
                    placeholder={`Leave empty for defaults, or add custom patterns:\n/pricing\n/docs/*\n/api/*`}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                    rows={4}
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    One pattern per line. Defaults block: /, /about, /careers, /contact, /tag/*, etc.
                  </p>
                </div>

                {/* Perplexity API Key */}
                <div className="border-t border-gray-200 pt-4">
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Perplexity API Key (Optional LLM Fallback)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={perplexityApiKey}
                      onChange={(e) => setPerplexityApiKey(e.target.value)}
                      placeholder="pplx-..."
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      disabled={loading}
                    >
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-600">
                      When sites have no RSS/sitemap, Perplexity can discover articles using AI search.
                    </p>
                    <p className="text-xs text-gray-500">
                      Get your API key at{' '}
                      <a
                        href="https://www.perplexity.ai/settings/api"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        perplexity.ai/settings/api
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Example URLs */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Quick Examples:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_URLS.map((example) => (
                <button
                  key={example.url}
                  onClick={() => loadExample(example.url)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {example.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <ScraperResults result={result} loading={loading} error={error} />
    </div>
  );
}
