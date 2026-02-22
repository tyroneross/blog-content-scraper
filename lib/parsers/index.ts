/**
 * Parsers Module
 *
 * Single web page extraction - works with any URL, not just articles.
 * Landing pages, documentation, product pages, wiki entries, etc.
 *
 * @example
 * ```typescript
 * import { extractPage } from '@tyroneross/scraper-app/parsers';
 *
 * const page = await extractPage('https://example.com/about');
 * console.log(page.title, page.markdown);
 * ```
 */

// Page extraction
export {
  extractPage,
  type PageContent,
  type PageLink,
  type PageImage,
  type PageHeading,
  type PageTable,
  type PageExtractOptions,
} from './page-extractor';
