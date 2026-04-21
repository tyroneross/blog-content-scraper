/**
 * Structured-data extraction from HTML.
 *
 * Pulls JSON-LD, OpenGraph, Twitter Card, and Schema.org microdata from a
 * page's `<head>` and returns them in a normalized shape. Useful for
 * enriching extracted article content with machine-readable metadata
 * (author, publish date, canonical URL, article type, etc.) that downstream
 * consumers (RAG pipelines, LLM prompts, feed generators) can trust.
 */

export interface StructuredData {
  /** All <script type="application/ld+json"> blocks, parsed. One entry per block. */
  jsonLd: unknown[];
  /** og:* meta tags, keyed by the suffix (og:title → title). */
  openGraph: Record<string, string>;
  /** twitter:* meta tags, keyed by the suffix (twitter:card → card). */
  twitter: Record<string, string>;
  /** itemprop="..." microdata values, first value wins per key. */
  microdata: Record<string, string>;
  /** Article-relevant fields distilled from the sources above. */
  article: {
    title?: string;
    description?: string;
    author?: string;
    publishedTime?: string;
    modifiedTime?: string;
    canonicalUrl?: string;
    image?: string;
    siteName?: string;
    lang?: string;
    type?: string;
  };
}

/**
 * Extract structured metadata from a parsed Document.
 *
 * Accepts either a real DOM Document or a jsdom Document — anything with
 * querySelector / querySelectorAll that returns elements with getAttribute
 * and textContent.
 */
export function extractStructuredData(doc: Document): StructuredData {
  return {
    jsonLd: extractJsonLd(doc),
    openGraph: extractMetaByPrefix(doc, 'og:'),
    twitter: extractMetaByPrefix(doc, 'twitter:'),
    microdata: extractMicrodata(doc),
    article: distillArticleFields(doc),
  };
}

function extractJsonLd(doc: Document): unknown[] {
  const out: unknown[] = [];
  const blocks = doc.querySelectorAll('script[type="application/ld+json"]');
  blocks.forEach((el) => {
    const text = (el.textContent || '').trim();
    if (!text) return;
    try {
      out.push(JSON.parse(text));
    } catch {
      // Malformed JSON-LD is common; skip silently.
    }
  });
  return out;
}

function extractMetaByPrefix(doc: Document, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  const metas = doc.querySelectorAll('meta');
  metas.forEach((el) => {
    const property = el.getAttribute('property') || el.getAttribute('name') || '';
    if (!property.startsWith(prefix)) return;
    const key = property.slice(prefix.length);
    const content = el.getAttribute('content');
    if (key && content && !(key in out)) {
      out[key] = content;
    }
  });
  return out;
}

function extractMicrodata(doc: Document): Record<string, string> {
  const out: Record<string, string> = {};
  const items = doc.querySelectorAll('[itemprop]');
  items.forEach((el) => {
    const key = el.getAttribute('itemprop');
    if (!key || key in out) return;
    const value =
      el.getAttribute('content') ||
      el.getAttribute('datetime') ||
      el.getAttribute('href') ||
      el.getAttribute('src') ||
      (el.textContent || '').trim();
    if (value) out[key] = value;
  });
  return out;
}

function distillArticleFields(doc: Document): StructuredData['article'] {
  const og = extractMetaByPrefix(doc, 'og:');
  const tw = extractMetaByPrefix(doc, 'twitter:');
  const md = extractMicrodata(doc);
  const jsonLd = extractJsonLd(doc);

  const fromJsonLd = findArticleJsonLd(jsonLd);

  const canonical =
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || undefined;

  const lang = doc.documentElement?.getAttribute('lang') || undefined;

  return {
    title:
      fromJsonLd.headline ||
      og.title ||
      tw.title ||
      md.headline ||
      md.name ||
      undefined,
    description:
      fromJsonLd.description ||
      og.description ||
      tw.description ||
      md.description ||
      undefined,
    author:
      fromJsonLd.author ||
      doc.querySelector('meta[name="author"]')?.getAttribute('content') ||
      md.author ||
      undefined,
    publishedTime:
      fromJsonLd.datePublished ||
      doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
      md.datePublished ||
      undefined,
    modifiedTime:
      fromJsonLd.dateModified ||
      doc.querySelector('meta[property="article:modified_time"]')?.getAttribute('content') ||
      md.dateModified ||
      undefined,
    canonicalUrl: canonical || og.url || fromJsonLd.url || undefined,
    image: og.image || tw.image || fromJsonLd.image || md.image || undefined,
    siteName: og.site_name || fromJsonLd.publisher || undefined,
    lang,
    type: fromJsonLd.type || og.type || undefined,
  };
}

/**
 * Walk JSON-LD entries and pull article-relevant fields from the first
 * entry that looks like an article, blog posting, or news article. Handles
 * flat objects and @graph arrays.
 */
function findArticleJsonLd(entries: unknown[]): {
  headline?: string;
  description?: string;
  author?: string;
  datePublished?: string;
  dateModified?: string;
  url?: string;
  image?: string;
  publisher?: string;
  type?: string;
} {
  const ARTICLE_TYPES = new Set([
    'article',
    'newsarticle',
    'blogposting',
    'scholarlyarticle',
    'techarticle',
  ]);

  const flatten = (e: unknown): unknown[] => {
    if (!e || typeof e !== 'object') return [];
    const obj = e as Record<string, unknown>;
    if (Array.isArray(obj['@graph'])) return obj['@graph'] as unknown[];
    return [obj];
  };

  const all = entries.flatMap(flatten);

  for (const raw of all) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const type = String(obj['@type'] || '').toLowerCase();
    if (!ARTICLE_TYPES.has(type)) continue;

    const author =
      typeof obj.author === 'string'
        ? obj.author
        : typeof (obj.author as Record<string, unknown>)?.name === 'string'
          ? ((obj.author as Record<string, unknown>).name as string)
          : undefined;

    const publisher =
      typeof obj.publisher === 'string'
        ? obj.publisher
        : typeof (obj.publisher as Record<string, unknown>)?.name === 'string'
          ? ((obj.publisher as Record<string, unknown>).name as string)
          : undefined;

    const image =
      typeof obj.image === 'string'
        ? obj.image
        : Array.isArray(obj.image) && typeof obj.image[0] === 'string'
          ? (obj.image[0] as string)
          : typeof (obj.image as Record<string, unknown>)?.url === 'string'
            ? ((obj.image as Record<string, unknown>).url as string)
            : undefined;

    return {
      headline: typeof obj.headline === 'string' ? obj.headline : undefined,
      description: typeof obj.description === 'string' ? obj.description : undefined,
      author,
      datePublished:
        typeof obj.datePublished === 'string' ? obj.datePublished : undefined,
      dateModified:
        typeof obj.dateModified === 'string' ? obj.dateModified : undefined,
      url: typeof obj.url === 'string' ? obj.url : undefined,
      image,
      publisher,
      type,
    };
  }

  return {};
}
