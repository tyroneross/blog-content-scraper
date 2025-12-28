/**
 * @package @tyroneross/scraper-testing
 * Main scraper testing component with URL input and configuration
 */

'use client';

import React, { useState, useMemo } from 'react';
import { ScraperTestProps, ScraperTestResult, ProgressState } from '@/lib/types';
import { ScraperResults } from './ScraperResults';
import { TestTube, Sparkles, Plus, X } from 'lucide-react';

// Default patterns from the scraper - these match source-orchestrator.ts and quality-scorer.ts
const DEFAULT_ALLOW_PATTERNS = [
  '/news/*', '/blog/*', '/articles/*', '/posts/*', '/stories/*',
  '/press/*', '/updates/*', '/announcements/*', '/insights/*',
  '/resources/*', '/publications/*', '/research/*', '/engineering/*'
];

const DEFAULT_DENY_PATTERNS = [
  '/', '/about/*', '/careers/*', '/jobs/*', '/contact/*', '/team/*',
  '/privacy', '/terms', '/legal/*', '/tag/*', '/category/*',
  '/author/*', '/archive/*', '/search/*', '/login', '/signup',
  '/pricing/*', '/features/*', '/demo/*', '/account/*', '/dashboard/*'
];

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

  // Pattern management - track which defaults are enabled and custom additions
  const [enabledAllowPatterns, setEnabledAllowPatterns] = useState<Set<string>>(new Set(DEFAULT_ALLOW_PATTERNS));
  const [enabledDenyPatterns, setEnabledDenyPatterns] = useState<Set<string>>(new Set(DEFAULT_DENY_PATTERNS));
  const [customAllowPatterns, setCustomAllowPatterns] = useState<string[]>([]);
  const [customDenyPatterns, setCustomDenyPatterns] = useState<string[]>([]);
  const [newAllowPattern, setNewAllowPattern] = useState('');
  const [newDenyPattern, setNewDenyPattern] = useState('');

  // Compute final patterns that will be used
  const finalAllowPatterns = useMemo(() => {
    const patterns = [...enabledAllowPatterns, ...customAllowPatterns];
    return patterns;
  }, [enabledAllowPatterns, customAllowPatterns]);

  const finalDenyPatterns = useMemo(() => {
    const patterns = [...enabledDenyPatterns, ...customDenyPatterns];
    return patterns;
  }, [enabledDenyPatterns, customDenyPatterns]);

  // Check if patterns have been modified from defaults
  const patternsModified = useMemo(() => {
    const allowModified = enabledAllowPatterns.size !== DEFAULT_ALLOW_PATTERNS.length ||
      !DEFAULT_ALLOW_PATTERNS.every(p => enabledAllowPatterns.has(p)) ||
      customAllowPatterns.length > 0;
    const denyModified = enabledDenyPatterns.size !== DEFAULT_DENY_PATTERNS.length ||
      !DEFAULT_DENY_PATTERNS.every(p => enabledDenyPatterns.has(p)) ||
      customDenyPatterns.length > 0;
    return allowModified || denyModified;
  }, [enabledAllowPatterns, enabledDenyPatterns, customAllowPatterns, customDenyPatterns]);

  // Toggle a default pattern on/off
  const toggleAllowPattern = (pattern: string) => {
    setEnabledAllowPatterns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pattern)) {
        newSet.delete(pattern);
      } else {
        newSet.add(pattern);
      }
      return newSet;
    });
  };

  const toggleDenyPattern = (pattern: string) => {
    setEnabledDenyPatterns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pattern)) {
        newSet.delete(pattern);
      } else {
        newSet.add(pattern);
      }
      return newSet;
    });
  };

  // Add custom pattern
  const addCustomAllowPattern = () => {
    const pattern = newAllowPattern.trim();
    if (pattern && !customAllowPatterns.includes(pattern) && !enabledAllowPatterns.has(pattern)) {
      setCustomAllowPatterns(prev => [...prev, pattern]);
      setNewAllowPattern('');
    }
  };

  const addCustomDenyPattern = () => {
    const pattern = newDenyPattern.trim();
    if (pattern && !customDenyPatterns.includes(pattern) && !enabledDenyPatterns.has(pattern)) {
      setCustomDenyPatterns(prev => [...prev, pattern]);
      setNewDenyPattern('');
    }
  };

  // Remove custom pattern
  const removeCustomAllowPattern = (pattern: string) => {
    setCustomAllowPatterns(prev => prev.filter(p => p !== pattern));
  };

  const removeCustomDenyPattern = (pattern: string) => {
    setCustomDenyPatterns(prev => prev.filter(p => p !== pattern));
  };

  // Reset to defaults
  const resetPatterns = () => {
    setEnabledAllowPatterns(new Set(DEFAULT_ALLOW_PATTERNS));
    setEnabledDenyPatterns(new Set(DEFAULT_DENY_PATTERNS));
    setCustomAllowPatterns([]);
    setCustomDenyPatterns([]);
  };

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
          allowPaths: finalAllowPatterns.length > 0 ? finalAllowPatterns : undefined,
          denyPaths: finalDenyPatterns.length > 0 ? finalDenyPatterns : undefined,
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
                {patternsModified && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                    Modified
                  </span>
                )}
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
              <div className="p-4 space-y-5 bg-white">
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
                </div>

                {/* Pattern Summary */}
                {patternsModified && (
                  <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-sm text-blue-800">
                      <span className="font-medium">Next search:</span>{' '}
                      {finalAllowPatterns.length} allow, {finalDenyPatterns.length} deny patterns
                    </div>
                    <button
                      onClick={resetPatterns}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      disabled={loading}
                    >
                      Reset to defaults
                    </button>
                  </div>
                )}

                {/* Allow Patterns Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">
                      ✅ Allow Patterns
                    </label>
                    <span className="text-xs text-gray-500">
                      {finalAllowPatterns.length} active
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Click to toggle. Only URLs matching these patterns will be scraped.
                  </p>

                  {/* Default Allow Patterns - Clickable */}
                  <div className="flex flex-wrap gap-1.5">
                    {DEFAULT_ALLOW_PATTERNS.map(pattern => {
                      const isEnabled = enabledAllowPatterns.has(pattern);
                      return (
                        <button
                          key={pattern}
                          onClick={() => toggleAllowPattern(pattern)}
                          disabled={loading}
                          className={`px-2 py-1 text-xs font-mono rounded transition-all ${
                            isEnabled
                              ? 'bg-green-100 text-green-800 border border-green-300 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-400 border border-gray-200 line-through hover:bg-gray-200'
                          }`}
                        >
                          {pattern}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Allow Patterns */}
                  {customAllowPatterns.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {customAllowPatterns.map(pattern => (
                        <span
                          key={pattern}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-green-200 text-green-900 border border-green-400 rounded"
                        >
                          {pattern}
                          <button
                            onClick={() => removeCustomAllowPattern(pattern)}
                            disabled={loading}
                            className="hover:text-green-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Add Custom Allow Pattern */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newAllowPattern}
                      onChange={(e) => setNewAllowPattern(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addCustomAllowPattern()}
                      placeholder="/custom/path/*"
                      className="flex-1 px-3 py-1.5 text-xs font-mono border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      disabled={loading}
                    />
                    <button
                      onClick={addCustomAllowPattern}
                      disabled={loading || !newAllowPattern.trim()}
                      className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-300 rounded hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                </div>

                {/* Deny Patterns Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">
                      🚫 Deny Patterns
                    </label>
                    <span className="text-xs text-gray-500">
                      {finalDenyPatterns.length} active
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Click to toggle. URLs matching these patterns will be blocked.
                  </p>

                  {/* Default Deny Patterns - Clickable */}
                  <div className="flex flex-wrap gap-1.5">
                    {DEFAULT_DENY_PATTERNS.map(pattern => {
                      const isEnabled = enabledDenyPatterns.has(pattern);
                      return (
                        <button
                          key={pattern}
                          onClick={() => toggleDenyPattern(pattern)}
                          disabled={loading}
                          className={`px-2 py-1 text-xs font-mono rounded transition-all ${
                            isEnabled
                              ? 'bg-red-100 text-red-800 border border-red-300 hover:bg-red-200'
                              : 'bg-gray-100 text-gray-400 border border-gray-200 line-through hover:bg-gray-200'
                          }`}
                        >
                          {pattern}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Deny Patterns */}
                  {customDenyPatterns.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {customDenyPatterns.map(pattern => (
                        <span
                          key={pattern}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-red-200 text-red-900 border border-red-400 rounded"
                        >
                          {pattern}
                          <button
                            onClick={() => removeCustomDenyPattern(pattern)}
                            disabled={loading}
                            className="hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Add Custom Deny Pattern */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDenyPattern}
                      onChange={(e) => setNewDenyPattern(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addCustomDenyPattern()}
                      placeholder="/unwanted/path/*"
                      className="flex-1 px-3 py-1.5 text-xs font-mono border border-gray-300 rounded focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      disabled={loading}
                    />
                    <button
                      onClick={addCustomDenyPattern}
                      disabled={loading || !newDenyPattern.trim()}
                      className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-300 rounded hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
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
      <ScraperResults result={result} loading={loading} error={error} progress={progress} />
    </div>
  );
}
