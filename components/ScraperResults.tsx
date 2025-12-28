/**
 * @package @tyroneross/scraper-testing
 * Results display component for scraper testing
 */

'use client';

import React, { useState } from 'react';
import { ScraperResultsProps, ScrapedArticle, ProgressStage } from '@/lib/types';
import { CheckCircle, AlertCircle, Clock, ExternalLink, ChevronDown, ChevronUp, Filter, Map, Rss } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Progress stages in order
const PROGRESS_STAGES: { stage: ProgressStage; label: string }[] = [
  { stage: 'rss_check', label: 'Checking RSS feeds...' },
  { stage: 'sitemap_discovery', label: 'Discovering sitemaps...' },
  { stage: 'subdomain_check', label: 'Checking blog subdomains...' },
  { stage: 'content_extraction', label: 'Extracting article content...' },
  { stage: 'quality_filtering', label: 'Applying quality filters...' },
  { stage: 'complete', label: 'Complete!' },
];

function getStageIndex(stage: ProgressStage): number {
  return PROGRESS_STAGES.findIndex(s => s.stage === stage);
}

export function ScraperResults({ result, loading, error, className = '', progress }: ScraperResultsProps) {
  if (loading) {
    const currentStageIndex = progress ? getStageIndex(progress.stage) : 0;
    const progressPercent = progress?.percent || 0;

    return (
      <div className={`p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg ${className}`}>
        <div className="space-y-4">
          {/* Main spinner and message */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 border-2 border-blue-200 rounded-full" />
              <div className="absolute top-0 left-0 w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900">
                {progress?.message || 'Scraping in progress...'}
              </p>
              <p className="text-xs text-blue-600">
                {progress?.details || 'This may take 10-30 seconds'}
              </p>
            </div>
          </div>

          {/* Dynamic progress stages */}
          <div className="space-y-2">
            {PROGRESS_STAGES.slice(0, -1).map((stage, index) => {
              const isCompleted = index < currentStageIndex;
              const isCurrent = index === currentStageIndex;

              return (
                <div
                  key={stage.stage}
                  className={`flex items-center gap-2 text-xs transition-all duration-300 ${
                    isCompleted ? 'opacity-50' : isCurrent ? 'opacity-100' : 'opacity-30'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  ) : isCurrent ? (
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  ) : (
                    <div className="w-2 h-2 bg-gray-300 rounded-full" />
                  )}
                  <span className={`${
                    isCompleted ? 'text-green-600 line-through' :
                    isCurrent ? 'text-blue-700 font-medium' :
                    'text-gray-400'
                  }`}>
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Progress bar with actual percentage */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-blue-600">
              <span>Progress</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-900 mb-1">Scraping Failed</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className={`p-6 bg-gray-50 border border-gray-200 rounded-lg ${className}`}>
        <p className="text-sm text-gray-600">Enter a URL and click &ldquo;Test Scraper&rdquo; to begin</p>
      </div>
    );
  }

  const { detectedType, confidence, articles, extractionStats, processingTime, errors, discoveredSitemaps, discoveredFeeds } = result;
  const [showSitemapDetails, setShowSitemapDetails] = useState(false);

  // Determine actual status based on results
  const hasCircuitBreakerError = errors?.some(e => e.includes('CircuitBreaker'));
  const hasTimeoutError = errors?.some(e => e.includes('timeout'));
  const hasCriticalError = hasCircuitBreakerError || hasTimeoutError;
  const hasErrors = (errors?.length ?? 0) > 0;
  const hasArticles = articles.length > 0;

  // Status badge configuration
  const statusConfig = hasCriticalError
    ? { bg: 'bg-red-50', border: 'border-red-200', icon: AlertCircle, iconColor: 'text-red-600', text: 'Failed', textColor: 'text-red-700' }
    : !hasArticles && hasErrors
    ? { bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertCircle, iconColor: 'text-amber-600', text: 'No Results', textColor: 'text-amber-700' }
    : hasArticles && hasErrors
    ? { bg: 'bg-amber-50', border: 'border-amber-200', icon: CheckCircle, iconColor: 'text-amber-600', text: 'Partial', textColor: 'text-amber-700' }
    : { bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle, iconColor: 'text-green-600', text: 'Success', textColor: 'text-green-700' };

  const StatusIcon = statusConfig.icon;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Summary Card */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-medium text-gray-900 mb-1">Scraping Complete</h3>
            <p className="text-sm text-gray-600">{result.url}</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 ${statusConfig.bg} border ${statusConfig.border} rounded-full`}>
            <StatusIcon className={`w-4 h-4 ${statusConfig.iconColor}`} />
            <span className={`text-xs font-medium ${statusConfig.textColor}`}>{statusConfig.text}</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Detected Type</p>
            <p className="text-sm font-medium text-gray-900 capitalize">{detectedType}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Confidence</p>
            <p className="text-sm font-medium text-gray-900 capitalize">{confidence}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Articles Found</p>
            <p className="text-sm font-medium text-gray-900">{articles.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Processing Time</p>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-gray-400" />
              <p className="text-sm font-medium text-gray-900">{processingTime}ms</p>
            </div>
          </div>
        </div>

        {/* Extraction Stats */}
        {extractionStats && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">Extraction Statistics</p>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Attempted:</span>{' '}
                <span className="font-medium text-gray-900">{extractionStats.attempted}</span>
              </div>
              <div>
                <span className="text-gray-500">Successful:</span>{' '}
                <span className="font-medium text-green-600">{extractionStats.successful}</span>
              </div>
              <div>
                <span className="text-gray-500">Failed:</span>{' '}
                <span className="font-medium text-red-600">{extractionStats.failed}</span>
              </div>
              <div>
                <span className="text-gray-500">Filtered:</span>{' '}
                <span className="font-medium text-gray-600">{extractionStats.filtered}</span>
              </div>
            </div>
          </div>
        )}

        {/* Errors */}
        {errors && errors.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">Errors ({errors.length})</p>
            <div className="space-y-1">
              {errors.slice(0, 3).map((err, idx) => (
                <p key={idx} className="text-xs text-red-600">{err}</p>
              ))}
              {errors.length > 3 && (
                <p className="text-xs text-gray-500">...and {errors.length - 3} more</p>
              )}
            </div>
          </div>
        )}

        {/* Sitemap & Feed Discovery */}
        {((discoveredSitemaps && discoveredSitemaps.length > 0) || (discoveredFeeds && discoveredFeeds.length > 0)) && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={() => setShowSitemapDetails(!showSitemapDetails)}
              className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors w-full"
            >
              <Map className="w-3 h-3" />
              <span>Source Discovery Details</span>
              <span className="text-gray-400">
                ({(discoveredSitemaps?.length || 0)} sitemaps, {(discoveredFeeds?.length || 0)} feeds)
              </span>
              {showSitemapDetails ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
            </button>

            {showSitemapDetails && (
              <div className="mt-3 space-y-3">
                {/* Sitemaps */}
                {discoveredSitemaps && discoveredSitemaps.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                      <Map className="w-3 h-3" />
                      Discovered Sitemaps ({discoveredSitemaps.length})
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {discoveredSitemaps.map((sitemap, idx) => (
                        <a
                          key={idx}
                          href={sitemap}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-blue-600 hover:text-blue-800 hover:underline truncate"
                          title={sitemap}
                        >
                          {sitemap}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* RSS Feeds */}
                {discoveredFeeds && discoveredFeeds.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                      <Rss className="w-3 h-3" />
                      Discovered Feeds ({discoveredFeeds.length})
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {discoveredFeeds.map((feed, idx) => (
                        <a
                          key={idx}
                          href={feed.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-orange-600 hover:text-orange-800 hover:underline truncate"
                          title={feed.url}
                        >
                          {feed.title || feed.url} {feed.type && <span className="text-gray-400">({feed.type})</span>}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filtering Statistics */}
      {extractionStats && (extractionStats.totalDiscovered || extractionStats.afterQualityFilter) && (
        <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-blue-600" />
            <h3 className="font-medium text-blue-900">Content-Based Filtering</h3>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-gray-700">{extractionStats.totalDiscovered || 0}</span>
              <span className="text-gray-500">discovered</span>
            </div>

            <span className="text-gray-400">→</span>

            {extractionStats.afterDenyFilter !== undefined && (
              <>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-gray-700">{extractionStats.afterDenyFilter}</span>
                  <span className="text-gray-500">after deny filter</span>
                </div>
                <span className="text-gray-400">→</span>
              </>
            )}

            {extractionStats.afterContentValidation !== undefined && (
              <>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-gray-700">{extractionStats.afterContentValidation}</span>
                  <span className="text-gray-500">content valid</span>
                </div>
                <span className="text-gray-400">→</span>
              </>
            )}

            <div className="flex items-center gap-1">
              <span className="font-semibold text-green-600">{extractionStats.afterQualityFilter || articles.length}</span>
              <span className="text-gray-500">high quality</span>
            </div>

            <span className="text-gray-400">→</span>

            <div className="flex items-center gap-1">
              <span className="font-semibold text-blue-600">{articles.length}</span>
              <span className="text-gray-500">shown</span>
            </div>
          </div>

          {extractionStats.filtered > 0 && (
            <p className="mt-2 text-xs text-gray-600">
              🎯 Filtered out {extractionStats.filtered} low-quality pages (homepages, careers, about pages, etc.)
            </p>
          )}
        </div>
      )}

      {/* Articles List */}
      {articles && articles.length > 0 && (
        <div className="p-6 bg-white border border-gray-200 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-4">
            Scraped Articles ({articles.length})
          </h3>
          <div className="space-y-3">
            {articles.map((article, idx) => (
              <ArticleCard key={idx} article={article} index={idx} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type ViewMode = 'markdown' | 'html' | 'text';

function ArticleCard({ article, index }: { article: ScrapedArticle; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('markdown');

  const confidenceColor =
    article.confidence > 0.8 ? 'text-green-600' :
    article.confidence > 0.5 ? 'text-yellow-600' :
    'text-red-600';

  const hasExpandableContent = article.fullContent || article.fullContentMarkdown || article.fullContentText || (article.description && article.description.length > 200);

  // Quality score styling
  const qualityPercent = Math.round((article.qualityScore || 0) * 100);
  const qualityColor =
    qualityPercent >= 80 ? 'bg-green-100 text-green-700 border-green-200' :
    qualityPercent >= 60 ? 'bg-blue-100 text-blue-700 border-blue-200' :
    'bg-amber-100 text-amber-700 border-amber-200';

  const qualityLabel =
    qualityPercent >= 80 ? '⭐ High Quality' :
    qualityPercent >= 60 ? '✓ Good Quality' :
    '• Low Quality';

  return (
    <div className="border border-gray-100 rounded-lg hover:border-gray-300 transition-colors">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-xs font-medium text-gray-400 flex-shrink-0 mt-0.5">
                #{index + 1}
              </span>
              <h4 className="text-sm font-medium text-gray-900 leading-snug">
                {article.title || 'Untitled'}
              </h4>
            </div>

            {article.description && !expanded && (
              <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                {article.description}
              </p>
            )}

            <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
              {article.publishedDate && (
                <span>
                  {new Date(article.publishedDate).toLocaleDateString()}
                </span>
              )}
              <span className="capitalize">
                Source: {article.source.replace(/-/g, ' ')}
              </span>
              <span className={`font-medium ${confidenceColor}`}>
                {Math.round(article.confidence * 100)}% confidence
              </span>
              {article.qualityScore !== undefined && (
                <span
                  className={`px-2 py-0.5 text-xs font-medium border rounded-full ${qualityColor}`}
                  title={`Quality Score: ${qualityPercent}%\n\nBased on:\n• Content validation (40%)\n• Publication date (20%)\n• Author/byline (15%)\n• Schema.org metadata (15%)\n• Reading time (10%)`}
                >
                  {qualityLabel} {qualityPercent}%
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {hasExpandableContent && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded transition-colors"
                title={expanded ? 'Collapse' : 'Expand content'}
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded transition-colors"
              title="Open article"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50">
          {/* View Mode Tabs */}
          {(article.fullContent || article.fullContentMarkdown || article.fullContentText) && (
            <div className="flex items-center gap-2 mb-3 border-b border-gray-200">
              <button
                onClick={() => setViewMode('markdown')}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  viewMode === 'markdown'
                    ? 'text-blue-700 border-b-2 border-blue-700 -mb-px'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                disabled={!article.fullContentMarkdown}
              >
                📝 Markdown
              </button>
              <button
                onClick={() => setViewMode('html')}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  viewMode === 'html'
                    ? 'text-blue-700 border-b-2 border-blue-700 -mb-px'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                disabled={!article.fullContent}
              >
                🔧 Raw HTML
              </button>
              <button
                onClick={() => setViewMode('text')}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  viewMode === 'text'
                    ? 'text-blue-700 border-b-2 border-blue-700 -mb-px'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                disabled={!article.fullContentText}
              >
                📄 Plain Text
              </button>
            </div>
          )}

          {/* Content Display */}
          {viewMode === 'markdown' && article.fullContentMarkdown ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">Formatted Content</span>
                <span className="text-gray-500">
                  {article.fullContentMarkdown.length.toLocaleString()} characters
                </span>
              </div>
              <div className="text-sm text-gray-700 leading-relaxed max-h-96 overflow-y-auto p-4 bg-white rounded border border-gray-200 prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Handle empty or invalid image sources
                    img: ({ src, alt, ...props }) => {
                      if (!src || src === '') {
                        return null; // Don't render images with empty src
                      }
                      return <img src={src} alt={alt || ''} {...props} />;
                    }
                  }}
                >
                  {article.fullContentMarkdown}
                </ReactMarkdown>
              </div>
            </div>
          ) : viewMode === 'html' && article.fullContent ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Raw HTML</span>
                <span className="text-gray-500">
                  {article.fullContent.length.toLocaleString()} characters
                </span>
              </div>
              <div className="text-xs text-gray-700 leading-relaxed max-h-96 overflow-y-auto p-3 bg-white rounded border border-gray-200 font-mono">
                {article.fullContent.split('\n').map((line, idx) => (
                  line.trim() && <p key={idx} className="mb-1">{line}</p>
                ))}
              </div>
            </div>
          ) : viewMode === 'text' && article.fullContentText ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">Plain Text</span>
                <span className="text-gray-500">
                  {article.fullContentText.length.toLocaleString()} characters
                </span>
              </div>
              <div className="text-sm text-gray-700 leading-relaxed max-h-96 overflow-y-auto p-4 bg-white rounded border border-gray-200">
                {article.fullContentText.split('\n\n').map((paragraph, idx) => (
                  paragraph.trim() && <p key={idx} className="mb-3">{paragraph}</p>
                ))}
              </div>
            </div>
          ) : article.description ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Description Only</span>
              </div>
              <div className="text-xs text-gray-700 leading-relaxed p-3 bg-white rounded border border-gray-200">
                {article.description}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
