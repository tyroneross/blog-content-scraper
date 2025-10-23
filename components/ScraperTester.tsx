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
  const [extractFullContent, setExtractFullContent] = useState(true); // Default to true (production mode)
  const [showAdvanced, setShowAdvanced] = useState(false); // Advanced filtering controls
  const [qualityThreshold, setQualityThreshold] = useState(0.6); // Default 60%
  const [customDenyPaths, setCustomDenyPaths] = useState(''); // Optional custom deny patterns
  const [perplexityApiKey, setPerplexityApiKey] = useState(''); // Optional Perplexity API key
  const [showApiKey, setShowApiKey] = useState(false); // Show/hide API key

  const handleTest = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL (must include http:// or https://)');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    if (onTestStart) {
      onTestStart(url);
    }

    try {
      // Parse custom deny paths (one per line, filter empty lines)
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
          url,
          sourceType: 'auto',
          maxArticles: 10,
          extractFullContent,
          qualityThreshold,
          denyPaths: denyPaths.length > 0 ? denyPaths : undefined, // Only send if custom paths provided
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ScraperTestResult = await response.json();
      setResult(data);

      if (onTestComplete) {
        onTestComplete(data);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);

      if (onError && err instanceof Error) {
        onError(err);
      }
    } finally {
      setLoading(false);
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
                placeholder="https://example.com/news"
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
                    Testing...
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
              Enter any news website or blog URL to test the scraper
            </p>
          </div>

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
                  <span className="font-medium">✅ Production mode - Extract full content</span>
                  <span className="block text-xs text-blue-700 mt-0.5">
                    Matches production behavior (~20-60s for 10 articles). Best search quality.
                  </span>
                </>
              ) : (
                <>
                  <span className="font-medium">⚡ Fast mode - Metadata only</span>
                  <span className="block text-xs text-amber-700 mt-0.5">
                    ⚠️ Quick URL validation (~5-10s). Production will extract full content.
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
                <span className="text-sm font-medium text-gray-700">⚙️ Advanced Filtering</span>
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
                    🤖 Perplexity API Key (Optional LLM Fallback)
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
                      {showApiKey ? '🙈 Hide' : '👁️ Show'}
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
