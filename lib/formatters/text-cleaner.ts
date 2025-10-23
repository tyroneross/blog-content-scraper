/**
 * Text cleanup utilities
 * Normalize whitespace, remove excessive line breaks, clean HTML entities
 */

/**
 * Clean text content
 * - Normalize whitespace between paragraphs
 * - Remove excessive line breaks
 * - Decode HTML entities
 * - Trim redundant spaces
 */
export function cleanText(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Step 1: Decode HTML entities
  cleaned = decodeHTMLEntities(cleaned);

  // Step 2: Normalize whitespace
  cleaned = normalizeWhitespace(cleaned);

  // Step 3: Smart paragraph detection
  cleaned = detectParagraphs(cleaned);

  // Step 4: Trim
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Decode HTML entities (&nbsp;, &amp;, etc.)
 */
export function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
    '&ndash;': '–',
    '&mdash;': '—',
    '&hellip;': '…',
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }

  // Handle numeric entities (&#123;, &#x1a2b;)
  decoded = decoded.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10))
  );
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
    String.fromCharCode(parseInt(code, 16))
  );

  return decoded;
}

/**
 * Normalize whitespace
 * - Replace multiple spaces with single space
 * - Replace tabs with spaces
 * - Remove trailing/leading whitespace from lines
 */
export function normalizeWhitespace(text: string): string {
  // Replace tabs with spaces
  let normalized = text.replace(/\t/g, ' ');

  // Replace multiple spaces with single space (but preserve line breaks)
  normalized = normalized.replace(/ {2,}/g, ' ');

  // Trim each line
  normalized = normalized
    .split('\n')
    .map(line => line.trim())
    .join('\n');

  // Replace 3+ consecutive line breaks with just 2
  normalized = normalized.replace(/\n{3,}/g, '\n\n');

  return normalized;
}

/**
 * Detect paragraph boundaries and add proper spacing
 * Looks for sentence endings followed by capital letters
 */
export function detectParagraphs(text: string): string {
  // Split by existing line breaks
  const lines = text.split('\n').filter(line => line.trim().length > 0);

  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i < lines.length - 1 ? lines[i + 1] : '';

    result.push(line);

    // Add paragraph break if:
    // 1. Current line ends with sentence-ending punctuation (. ! ?)
    // 2. Next line starts with capital letter or number
    // 3. Lines are not too short (likely not a title)
    if (
      line.match(/[.!?]$/) &&
      nextLine.match(/^[A-Z0-9]/) &&
      line.length > 40 && // Avoid breaking after short lines
      nextLine.length > 20
    ) {
      result.push(''); // Add empty line for paragraph break
    }
  }

  return result.join('\n');
}

/**
 * Remove URLs from text
 * Useful for cleaning up citations or references
 */
export function removeUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s]+/g, '');
}

/**
 * Truncate text to a maximum length
 * Breaks at word boundaries and adds ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // Find the last space before maxLength
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + '…';
  }

  return truncated + '…';
}

/**
 * Extract plain text from HTML
 * Quick and dirty HTML stripping
 */
export function stripHTML(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
