import TurndownService from 'turndown';

/**
 * Convert HTML to clean Markdown
 * - Preserves headings, bold, lists, links, code blocks
 * - Strips navigation, forms, UI elements
 * - Smart paragraph detection
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';

  // Create Turndown service with custom rules
  const turndownService = new TurndownService({
    headingStyle: 'atx', // Use # for headings
    codeBlockStyle: 'fenced', // Use ``` for code blocks
    bulletListMarker: '-', // Use - for lists
    emDelimiter: '*', // Use * for emphasis
    strongDelimiter: '**', // Use ** for strong
  });

  // Remove unwanted elements before conversion
  turndownService.remove([
    'script',
    'style',
    'nav',
    'header',
    'footer',
    'aside',
    'form',
    'button',
    'input',
    'select',
    'textarea',
    'iframe',
    'noscript',
  ]);

  // Custom rule: Clean up attributes from elements
  turndownService.addRule('cleanAttributes', {
    filter: ['div', 'span', 'p', 'section', 'article'],
    replacement: (content) => {
      // Just return content, stripping the wrapper
      return content;
    },
  });

  // Convert HTML to Markdown
  let markdown = turndownService.turndown(html);

  // Post-processing: Smart paragraph detection
  markdown = smartParagraphDetection(markdown);

  // Clean up excessive whitespace
  markdown = normalizeWhitespace(markdown);

  return markdown;
}

/**
 * Smart paragraph detection
 * Adds proper spacing between sections
 */
function smartParagraphDetection(markdown: string): string {
  // Split into lines
  const lines = markdown.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : '';
    const nextLine = i < lines.length - 1 ? lines[i + 1] : '';

    result.push(line);

    // Add extra line break after headings
    if (line.match(/^#{1,6}\s/) && nextLine && !nextLine.match(/^#{1,6}\s/)) {
      result.push('');
    }

    // Add extra line break before headings
    if (nextLine.match(/^#{1,6}\s/) && line && !line.match(/^#{1,6}\s/) && !prevLine.match(/^$/)) {
      result.push('');
    }

    // Add line break after lists
    if (line.match(/^[-*+]\s/) && nextLine && !nextLine.match(/^[-*+]\s/) && !nextLine.match(/^$/)) {
      result.push('');
    }
  }

  return result.join('\n');
}

/**
 * Normalize whitespace
 * - Remove excessive line breaks (more than 2)
 * - Trim lines
 */
function normalizeWhitespace(markdown: string): string {
  // Replace 3+ consecutive line breaks with just 2
  markdown = markdown.replace(/\n{3,}/g, '\n\n');

  // Trim each line
  markdown = markdown
    .split('\n')
    .map(line => line.trim())
    .join('\n');

  // Remove leading/trailing whitespace
  markdown = markdown.trim();

  return markdown;
}

/**
 * Strip non-article content from HTML before conversion
 * Removes navigation, forms, UI elements
 */
export function stripNonArticleContent(html: string): string {
  if (!html) return '';

  // Remove elements with specific classes/IDs that indicate non-article content
  const nonArticlePatterns = [
    /<nav\b[^>]*>.*?<\/nav>/gi,
    /<header\b[^>]*>.*?<\/header>/gi,
    /<footer\b[^>]*>.*?<\/footer>/gi,
    /<aside\b[^>]*>.*?<\/aside>/gi,
    /<form\b[^>]*>.*?<\/form>/gi,
    /<div[^>]*class="[^"]*(?:nav|menu|sidebar|advertisement|ads|social|share|comment|popup|modal)[^"]*"[^>]*>.*?<\/div>/gi,
    /<div[^>]*id="[^"]*(?:nav|menu|sidebar|advertisement|ads|social|share|comment|popup|modal)[^"]*"[^>]*>.*?<\/div>/gi,
  ];

  let cleaned = html;
  for (const pattern of nonArticlePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove all class, id, and data attributes
  cleaned = cleaned.replace(/\s*class="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s*id="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s*data-[^=]*="[^"]*"/gi, '');

  return cleaned;
}

/**
 * Convert HTML to Markdown with full cleaning
 * This is the main function developers should use
 */
export function convertToMarkdown(html: string, options: {
  cleanNonArticle?: boolean;
  smartParagraphs?: boolean;
} = {}): string {
  const {
    cleanNonArticle = true,
    smartParagraphs: _smartParagraphs = true,
  } = options;

  let processedHtml = html;

  // Step 1: Strip non-article content if requested
  if (cleanNonArticle) {
    processedHtml = stripNonArticleContent(processedHtml);
  }

  // Step 2: Convert to Markdown
  const markdown = htmlToMarkdown(processedHtml);

  return markdown;
}
