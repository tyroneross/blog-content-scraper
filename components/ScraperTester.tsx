/**
 * @package @tyroneross/scraper-testing
 * Main scraper testing component with URL input and configuration
 */

'use client';

import React, { useState } from 'react';
import { ScraperTestProps, ScraperTestResult, ProgressState } from '@/lib/types';
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
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [extractFullContent, setExtractFullContent] = useState(true); // Default to true (production mode)
  const [showAdvanced, setShowAdvanced] = useState(false); // Advanced filtering controls
  const [qualityThreshold, setQualityThreshold] = useState(0.6); // Default 60%
  const [customAllowPaths, setCustomAllowPaths] = useState(''); // Optional custom allow patterns
  const [customDenyPaths, setCustomDenyPaths] = useState(''); // Optional custom deny patterns

  const handleTest = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    // Auto-add https:// if protocol is missing
    let normalizedUrl = url.trim();
    if (!normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    // Validate URL format
    try {
      new URL(normalizedUrl);
    } catch {
      setError('Please enter a valid URL (e.g., example.com or https://example.com)');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(null);

    if (onTestStart) {
      onTestStart(normalizedUrl);
    }

    try {
      // Parse custom paths (one per line, filter empty lines)
      const allowPaths = customAllowPaths
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0);
      const denyPaths = customDenyPaths
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      // Use streaming endpoint for real-time progress
      const response = await fetch('/api/scraper-test/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: normalizedUrl,
          sourceType: 'auto',
          maxArticles: 5, // Reduced for faster testing
          extractFullContent,
          qualityThreshold,
          allowPaths: allowPaths.length > 0 ? allowPaths : undefined,
          denyPaths: denyPaths.length > 0 ? denyPaths : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Read the SSE stream
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

        // Parse SSE events from buffer
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep incomplete event in buffer

        for (const eventData of lines) {
          if (eventData.startsWith('data: ')) {
            try {
              const event = JSON.parse(eventData.slice(6));

              if (event.type === 'progress') {
                setProgress({
                  stage: event.stage,
                  message: event.message,
                  percent: event.percent,
                  details: event.details,
                });
              } else if (event.type === 'result') {
                setResult(event.data);
                if (onTestComplete) {
                  onTestComplete(event.data);
                }
              } else if (event.type === 'error') {
                throw new Error(event.message);
              }
            } catch (parseError) {
              // Ignore JSON parse errors for incomplete events
              if (parseError instanceof SyntaxError) continue;
              throw parseError;
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
              Enter any website URL (https:// is optional)
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
                    Fetches 5 most recent articles (~10-30s). Best search quality.
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

                {/* Default Patterns Info */}
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs font-medium text-gray-700 mb-2">Current Default Deny Patterns:</p>
                  <div className="flex flex-wrap gap-1">
                    {['/', '/about/*', '/careers/*', '/jobs/*', '/contact/*', '/team/*', '/privacy', '/terms', '/legal/*', '/tag/*', '/category/*', '/search', '/login', '/signup'].map(p => (
                      <span key={p} className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded font-mono">{p}</span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">These are blocked by default. Override below if needed.</p>
                </div>

                {/* Custom Allow Paths */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    ✅ Allow Patterns (Optional)
                  </label>
                  <textarea
                    value={customAllowPaths}
                    onChange={(e) => setCustomAllowPaths(e.target.value)}
                    placeholder={`Only scrape URLs matching these patterns:\n/blog/*\n/news/*\n/articles/*`}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono"
                    rows={3}
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    One pattern per line. If set, only URLs matching these patterns will be scraped.
                  </p>
                </div>

                {/* Custom Deny Paths */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    🚫 Deny Patterns (Override Defaults)
                  </label>
                  <textarea
                    value={customDenyPaths}
                    onChange={(e) => setCustomDenyPaths(e.target.value)}
                    placeholder={`Leave empty to use defaults above, or specify custom patterns:\n/pricing\n/docs/*\n/api/*`}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono"
                    rows={3}
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    One pattern per line. If set, replaces the defaults above.
                  </p>
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
      <ScraperResults result={result} loading={loading} error={error} progress={progress} />
    </div>
  );
}
