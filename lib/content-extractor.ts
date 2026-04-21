/**
 * Simplified content extractor for standalone app
 * Uses Mozilla Readability for article extraction
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { ExtractedContent } from './types';
import { extractStructuredData } from './structured-data';

export class ContentExtractor {
  async extractContent(url: string): Promise<ExtractedContent | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ScraperApp/1.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
        return null;
      }

      // Calculate reading time (200 words per minute)
      const wordCount = article.textContent?.split(/\s+/).length || 0;
      const readingTime = Math.ceil(wordCount / 200);

      // Pull JSON-LD, OpenGraph, Twitter Card, microdata
      const structured = extractStructuredData(dom.window.document);

      // Prefer structured publish time, fall back to legacy selector probe
      const publishedTime =
        structured.article.publishedTime ||
        this.extractPublishedTime(dom.window.document);

      return {
        title: article.title ?? structured.article.title ?? undefined,
        byline: article.byline ?? structured.article.author ?? undefined,
        content: article.content ?? undefined,
        textContent: article.textContent ?? undefined,
        length: article.length ?? undefined,
        excerpt: article.excerpt ?? structured.article.description ?? undefined,
        siteName: article.siteName ?? structured.article.siteName ?? undefined,
        publishedTime,
        lang: structured.article.lang ?? undefined,
        readingTime,
        structured: {
          jsonLd: structured.jsonLd.length ? structured.jsonLd : undefined,
          openGraph:
            Object.keys(structured.openGraph).length ? structured.openGraph : undefined,
          twitter:
            Object.keys(structured.twitter).length ? structured.twitter : undefined,
        },
      };
    } catch (error) {
      console.error(`[ContentExtractor] Failed to extract from ${url}:`, error);
      return null;
    }
  }

  /**
   * Extract published time from document metadata
   */
  private extractPublishedTime(doc: Document): string | undefined {
    // Try various metadata sources
    const selectors = [
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[property="og:published_time"]',
      'meta[name="published_time"]',
      'meta[name="date"]',
      'time[datetime]',
    ];

    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element) {
        const content = element.getAttribute('content') || element.getAttribute('datetime');
        if (content) return content;
      }
    }

    return undefined;
  }
}
