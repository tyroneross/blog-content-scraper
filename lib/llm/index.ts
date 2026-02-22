/**
 * LLM-Ready Output Module
 *
 * Provides optimized content formatting for LLM consumption with:
 * - Token estimation (GPT-4/Claude compatible)
 * - YAML frontmatter generation
 * - Smart chunking for context windows
 * - Clean text normalization
 */

import { SingleArticleResult } from '../index';
import { convertToMarkdown } from '../formatters/html-to-markdown';
import { cleanText, stripHTML } from '../formatters/text-cleaner';

// ============================================================================
// Types
// ============================================================================

export interface LLMOutput {
  /** Clean markdown content */
  markdown: string;
  /** Plain text content (no formatting) */
  text: string;
  /** Estimated token count (cl100k_base encoding approximation) */
  tokens: number;
  /** Article title */
  title: string;
  /** Short excerpt/summary */
  excerpt: string;
  /** YAML frontmatter string */
  frontmatter: string;
  /** Complete document (frontmatter + content) */
  document: string;
  /** Content chunks for RAG/context windows */
  chunks: LLMChunk[];
  /** Structured metadata */
  metadata: LLMMetadata;
}

export interface LLMChunk {
  /** Chunk content */
  content: string;
  /** Estimated tokens in this chunk */
  tokens: number;
  /** Chunk index (0-based) */
  index: number;
  /** Total number of chunks */
  total: number;
  /** Start character position in original text */
  startPos: number;
  /** End character position in original text */
  endPos: number;
}

export interface LLMMetadata {
  url: string;
  title: string;
  author?: string;
  publishedDate?: string;
  siteName?: string;
  language?: string;
  wordCount: number;
  readingTime: number;
  tokens: number;
  readingLevel?: ReadingLevel;
  readingGrade?: number;
}

export type ReadingLevel = 'elementary' | 'intermediate' | 'advanced' | 'expert';

export interface LLMFormatOptions {
  /** Max tokens per chunk (default: 4000) */
  maxTokensPerChunk?: number;
  /** Token overlap between chunks (default: 200) */
  chunkOverlap?: number;
  /** Include metadata in output (default: true) */
  includeMetadata?: boolean;
  /** Output format for main content (default: 'markdown') */
  format?: 'markdown' | 'text';
  /** Calculate reading level (default: true) */
  calculateReadingLevel?: boolean;
}

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count using cl100k_base encoding approximation
 *
 * Based on OpenAI's tiktoken library behavior:
 * - Average ~4 characters per token for English text
 * - Whitespace and punctuation affect token boundaries
 * - Non-ASCII characters may use more tokens
 *
 * For production accuracy, consider using gpt-tokenizer package
 *
 * @see https://github.com/niieani/gpt-tokenizer
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Normalize whitespace
  const normalized = text.replace(/\s+/g, ' ').trim();

  // Base estimation: ~4 chars per token for English
  let estimate = Math.ceil(normalized.length / 4);

  // Adjust for common patterns that affect tokenization

  // URLs and technical content use more tokens
  const urlCount = (normalized.match(/https?:\/\/[^\s]+/g) || []).length;
  estimate += urlCount * 5;

  // Code blocks use more tokens
  const codeBlockCount = (normalized.match(/```[\s\S]*?```/g) || []).length;
  estimate += codeBlockCount * 10;

  // Numbers often tokenize as individual digits
  const numberCount = (normalized.match(/\d+/g) || []).length;
  estimate += Math.floor(numberCount * 0.5);

  // Non-ASCII characters typically use 2-4 tokens each
  const nonAsciiCount = (normalized.match(/[^\x00-\x7F]/g) || []).length;
  estimate += nonAsciiCount;

  return estimate;
}

/**
 * Check if text is within a token limit without full encoding
 * Useful for quick validation before processing
 */
export function isWithinTokenLimit(text: string, limit: number): boolean {
  return estimateTokens(text) <= limit;
}

// ============================================================================
// Reading Level Analysis
// ============================================================================

/**
 * Calculate Flesch-Kincaid Grade Level
 *
 * Formula: 0.39 × (words/sentences) + 11.8 × (syllables/words) - 15.59
 *
 * Grade levels:
 * - 1-5: Elementary
 * - 6-8: Intermediate
 * - 9-12: Advanced
 * - 13+: Expert/Academic
 */
export function calculateFleschKincaidGrade(text: string): number {
  const sentences = countSentences(text);
  const words = countWords(text);
  const syllables = countSyllables(text);

  if (sentences === 0 || words === 0) return 0;

  const grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  return Math.max(0, Math.round(grade * 10) / 10);
}

/**
 * Convert grade level to reading level category
 */
export function gradeToReadingLevel(grade: number): ReadingLevel {
  if (grade <= 5) return 'elementary';
  if (grade <= 8) return 'intermediate';
  if (grade <= 12) return 'advanced';
  return 'expert';
}

function countSentences(text: string): number {
  // Match sentence-ending punctuation
  const matches = text.match(/[.!?]+/g);
  return matches ? matches.length : 1;
}

function countWords(text: string): number {
  const words = text.trim().split(/\s+/);
  return words.filter(w => w.length > 0).length;
}

function countSyllables(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  let total = 0;

  for (const word of words) {
    total += countWordSyllables(word);
  }

  return total;
}

function countWordSyllables(word: string): number {
  // Remove non-letters
  word = word.replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;

  // Count vowel groups
  const vowelGroups = word.match(/[aeiouy]+/g);
  let count = vowelGroups ? vowelGroups.length : 1;

  // Adjust for silent e
  if (word.endsWith('e') && count > 1) count--;

  // Adjust for common suffixes
  if (word.endsWith('le') && word.length > 2 && !/[aeiouy]/.test(word[word.length - 3])) {
    count++;
  }

  return Math.max(1, count);
}

// ============================================================================
// Content Chunking
// ============================================================================

/**
 * Split content into chunks suitable for LLM context windows
 *
 * Uses semantic boundaries (paragraphs, sentences) when possible
 * Includes configurable overlap for RAG applications
 */
export function chunkContent(
  text: string,
  options: {
    maxTokens?: number;
    overlap?: number;
  } = {}
): LLMChunk[] {
  const { maxTokens = 4000, overlap = 200 } = options;

  if (!text) return [];

  const totalTokens = estimateTokens(text);

  // If text fits in one chunk, return as-is
  if (totalTokens <= maxTokens) {
    return [{
      content: text,
      tokens: totalTokens,
      index: 0,
      total: 1,
      startPos: 0,
      endPos: text.length
    }];
  }

  const chunks: LLMChunk[] = [];
  const paragraphs = text.split(/\n\n+/);

  let currentChunk = '';
  let currentTokens = 0;
  let startPos = 0;
  let currentPos = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);

    // If single paragraph exceeds limit, split by sentences
    if (paragraphTokens > maxTokens) {
      if (currentChunk) {
        chunks.push(createChunk(currentChunk, currentTokens, startPos, currentPos, chunks.length));
        currentChunk = '';
        currentTokens = 0;
        startPos = currentPos;
      }

      const sentenceChunks = chunkBySentences(paragraph, maxTokens, overlap);
      for (const sc of sentenceChunks) {
        chunks.push({
          ...sc,
          index: chunks.length,
          startPos: currentPos + sc.startPos,
          endPos: currentPos + sc.endPos
        });
      }
      currentPos += paragraph.length + 2; // +2 for \n\n
      startPos = currentPos;
      continue;
    }

    // Check if adding paragraph would exceed limit
    if (currentTokens + paragraphTokens > maxTokens) {
      // Save current chunk
      if (currentChunk) {
        chunks.push(createChunk(currentChunk, currentTokens, startPos, currentPos, chunks.length));
      }

      // Start new chunk with overlap
      const overlapText = getOverlapText(currentChunk, overlap);
      currentChunk = overlapText + paragraph;
      currentTokens = estimateTokens(currentChunk);
      startPos = currentPos - overlapText.length;
    } else {
      // Add paragraph to current chunk
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      currentTokens = estimateTokens(currentChunk);
    }

    currentPos += paragraph.length + 2;
  }

  // Don't forget the last chunk
  if (currentChunk) {
    chunks.push(createChunk(currentChunk, currentTokens, startPos, text.length, chunks.length));
  }

  // Update total count
  const total = chunks.length;
  return chunks.map(c => ({ ...c, total }));
}

function createChunk(
  content: string,
  tokens: number,
  startPos: number,
  endPos: number,
  index: number
): LLMChunk {
  return { content, tokens, index, total: 0, startPos, endPos };
}

function chunkBySentences(
  text: string,
  maxTokens: number,
  overlap: number
): LLMChunk[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: LLMChunk[] = [];

  let currentChunk = '';
  let currentTokens = 0;
  let startPos = 0;
  let currentPos = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);

    if (currentTokens + sentenceTokens > maxTokens && currentChunk) {
      chunks.push(createChunk(currentChunk.trim(), currentTokens, startPos, currentPos, chunks.length));
      const overlapText = getOverlapText(currentChunk, overlap);
      currentChunk = overlapText + sentence;
      currentTokens = estimateTokens(currentChunk);
      startPos = currentPos - overlapText.length;
    } else {
      currentChunk += sentence;
      currentTokens = estimateTokens(currentChunk);
    }

    currentPos += sentence.length;
  }

  if (currentChunk) {
    chunks.push(createChunk(currentChunk.trim(), currentTokens, startPos, text.length, chunks.length));
  }

  return chunks;
}

function getOverlapText(text: string, targetTokens: number): string {
  if (!text || targetTokens <= 0) return '';

  // Get approximately the last N tokens worth of text
  const targetChars = targetTokens * 4;
  const lastPart = text.slice(-targetChars);

  // Try to start at a sentence or paragraph boundary
  const sentenceMatch = lastPart.match(/(?:^|\. )[A-Z]/);
  if (sentenceMatch && sentenceMatch.index) {
    return lastPart.slice(sentenceMatch.index + 2);
  }

  return lastPart;
}

// ============================================================================
// Frontmatter Generation
// ============================================================================

/**
 * Generate YAML frontmatter from metadata
 */
export function generateFrontmatter(metadata: LLMMetadata): string {
  const lines: string[] = ['---'];

  lines.push(`title: "${escapeYaml(metadata.title)}"`);
  lines.push(`url: ${metadata.url}`);

  if (metadata.author) {
    lines.push(`author: "${escapeYaml(metadata.author)}"`);
  }

  if (metadata.publishedDate) {
    lines.push(`date: ${metadata.publishedDate}`);
  }

  if (metadata.siteName) {
    lines.push(`source: "${escapeYaml(metadata.siteName)}"`);
  }

  if (metadata.language) {
    lines.push(`language: ${metadata.language}`);
  }

  lines.push(`word_count: ${metadata.wordCount}`);
  lines.push(`reading_time: ${metadata.readingTime}`);
  lines.push(`tokens: ${metadata.tokens}`);

  if (metadata.readingLevel) {
    lines.push(`reading_level: ${metadata.readingLevel}`);
  }

  if (metadata.readingGrade !== undefined) {
    lines.push(`reading_grade: ${metadata.readingGrade}`);
  }

  lines.push('---');

  return lines.join('\n') + '\n';
}

function escapeYaml(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, ' ');
}

// ============================================================================
// Text Cleaning for LLM
// ============================================================================

/**
 * Clean text specifically for LLM consumption
 *
 * - Normalizes whitespace
 * - Removes excessive punctuation
 * - Preserves semantic structure
 * - Removes navigation/UI artifacts
 */
export function cleanTextForLLM(text: string): string {
  let cleaned = text;

  // Normalize line endings
  cleaned = cleaned.replace(/\r\n/g, '\n');

  // Remove multiple consecutive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Remove common navigation/UI artifacts
  cleaned = cleaned.replace(/^(Skip to|Jump to|Navigate to|Menu|Search|Share|Print|Email|Tweet|Facebook|LinkedIn|Copy link).*$/gim, '');

  // Remove "Read more" type links
  cleaned = cleaned.replace(/\[?(Read more|Continue reading|See more|View all|Click here)\.?\]?/gi, '');

  // Normalize whitespace within lines
  cleaned = cleaned.replace(/[ \t]+/g, ' ');

  // Trim each line
  cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');

  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Convert article to LLM-ready format
 *
 * @example
 * ```typescript
 * const article = await extractArticle(url);
 * const llm = toLLMFormat(article);
 *
 * // Use in prompt
 * const prompt = `${llm.frontmatter}\n\n${llm.markdown}`;
 *
 * // Or use chunks for RAG
 * for (const chunk of llm.chunks) {
 *   await vectorStore.add(chunk.content, { tokens: chunk.tokens });
 * }
 * ```
 */
export function toLLMFormat(
  article: SingleArticleResult,
  options: LLMFormatOptions = {}
): LLMOutput {
  const {
    maxTokensPerChunk = 4000,
    chunkOverlap = 200,
    includeMetadata = true,
    format = 'markdown',
    calculateReadingLevel = true
  } = options;

  // Get content in requested format
  const markdown = article.markdown || (article.html ? convertToMarkdown(article.html) : '');
  const text = cleanTextForLLM(article.text || (article.html ? cleanText(stripHTML(article.html)) : ''));

  // Calculate metrics
  const tokens = estimateTokens(text);
  const grade = calculateReadingLevel ? calculateFleschKincaidGrade(text) : undefined;
  const readingLevel = grade !== undefined ? gradeToReadingLevel(grade) : undefined;

  // Build metadata
  const metadata: LLMMetadata = {
    url: article.url,
    title: article.title,
    author: article.author,
    publishedDate: article.publishedDate,
    siteName: article.siteName,
    language: article.lang,
    wordCount: article.wordCount,
    readingTime: article.readingTime,
    tokens,
    readingLevel,
    readingGrade: grade
  };

  // Generate frontmatter
  const frontmatter = includeMetadata ? generateFrontmatter(metadata) : '';

  // Create chunks
  const contentForChunking = format === 'markdown' ? markdown : text;
  const chunks = chunkContent(contentForChunking, {
    maxTokens: maxTokensPerChunk,
    overlap: chunkOverlap
  });

  // Build document
  const document = frontmatter
    ? `${frontmatter}\n\n${format === 'markdown' ? markdown : text}`
    : (format === 'markdown' ? markdown : text);

  return {
    markdown,
    text,
    tokens,
    title: article.title,
    excerpt: article.excerpt,
    frontmatter,
    document,
    chunks,
    metadata
  };
}

/**
 * Scrape a URL and return LLM-ready output
 *
 * This is the "dream API" - one function that does everything:
 * 1. Extracts article content
 * 2. Cleans and formats for LLM
 * 3. Estimates tokens
 * 4. Generates metadata
 *
 * @example
 * ```typescript
 * const { markdown, tokens, title } = await scrapeForLLM(url);
 *
 * const prompt = `
 * Context (${tokens} tokens):
 * ${markdown}
 *
 * Question: {{user_question}}
 * `;
 * ```
 */
export async function scrapeForLLM(
  url: string,
  options: LLMFormatOptions = {}
): Promise<LLMOutput> {
  // Dynamic import to avoid circular dependency
  const { extractArticle } = await import('../index');

  // Validate URL
  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid URL: "${url}". Expected format: https://example.com/path`);
  }

  const article = await extractArticle(url);

  if (!article) {
    throw new Error(`Failed to extract content from: ${url}`);
  }

  return toLLMFormat(article, options);
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Re-export for convenience
  estimateTokens as countTokens,
  isWithinTokenLimit as checkTokenLimit
};
