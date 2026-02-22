/**
 * F1 Score Validator for Mozilla Readability
 *
 * This test validates the extraction quality of Mozilla Readability
 * by comparing extracted content against manually-labeled ground truth.
 *
 * F1 Score = 2 × (Precision × Recall) / (Precision + Recall)
 * - Precision: % of extracted tokens that are in ground truth
 * - Recall: % of ground truth tokens that were extracted
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

interface TestArticle {
  name: string;
  url: string;
  htmlFile: string;
  groundTruth: {
    title: string;
    content: string; // Clean text content (ground truth)
    minWordCount: number; // Expected minimum words
  };
}

interface ExtractionResult {
  precision: number;
  recall: number;
  f1Score: number;
  extractedWords: number;
  groundTruthWords: number;
  commonWords: number;
}

interface TestResult {
  article: string;
  url: string;
  success: boolean;
  result?: ExtractionResult;
  error?: string;
  details: {
    extractedTitle?: string;
    expectedTitle: string;
    titleMatch: boolean;
    extractedWordCount?: number;
    expectedMinWords: number;
  };
}

export class F1ScoreValidator {
  private testDataDir: string;

  constructor(testDataDir: string = './tests/data') {
    this.testDataDir = testDataDir;
  }

  /**
   * Tokenize text into normalized words for comparison
   */
  private tokenize(text: string): Set<string> {
    if (!text) return new Set();

    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .split(/\s+/)
        .filter(word => word.length > 2) // Filter short words
        .filter(word => !this.isStopWord(word)) // Remove common stop words
    );
  }

  /**
   * Common stop words to exclude from F1 calculation
   * (These don't contribute to content quality measurement)
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was',
      'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may',
      'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'down', 'had', 'have',
      'more', 'than', 'that', 'this', 'with', 'from', 'they', 'been', 'into', 'only',
      'some', 'such', 'then', 'them', 'were', 'will', 'what', 'when', 'your'
    ]);
    return stopWords.has(word);
  }

  /**
   * Calculate precision, recall, and F1 score
   */
  private calculateF1(extracted: string, groundTruth: string): ExtractionResult {
    const extractedTokens = this.tokenize(extracted);
    const groundTruthTokens = this.tokenize(groundTruth);

    // Find common tokens
    const commonTokens = new Set(
      [...extractedTokens].filter(token => groundTruthTokens.has(token))
    );

    const precision = extractedTokens.size > 0
      ? commonTokens.size / extractedTokens.size
      : 0;

    const recall = groundTruthTokens.size > 0
      ? commonTokens.size / groundTruthTokens.size
      : 0;

    const f1Score = (precision + recall) > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

    return {
      precision,
      recall,
      f1Score,
      extractedWords: extractedTokens.size,
      groundTruthWords: groundTruthTokens.size,
      commonWords: commonTokens.size
    };
  }

  /**
   * Test a single article
   */
  async testArticle(article: TestArticle): Promise<TestResult> {
    try {
      // Read HTML file
      const htmlPath = path.join(this.testDataDir, article.htmlFile);
      const html = fs.readFileSync(htmlPath, 'utf-8');

      // Extract content using Readability
      const dom = new JSDOM(html, { url: article.url });
      const reader = new Readability(dom.window.document);
      const extracted = reader.parse();

      if (!extracted || !extracted.textContent) {
        return {
          article: article.name,
          url: article.url,
          success: false,
          error: 'Readability failed to extract content',
          details: {
            expectedTitle: article.groundTruth.title,
            titleMatch: false,
            expectedMinWords: article.groundTruth.minWordCount
          }
        };
      }

      // Calculate F1 score
      const result = this.calculateF1(
        extracted.textContent,
        article.groundTruth.content
      );

      // Check title match
      const titleMatch = this.normalizeTitle(extracted.title ?? '') ===
                        this.normalizeTitle(article.groundTruth.title);

      return {
        article: article.name,
        url: article.url,
        success: true,
        result,
        details: {
          extractedTitle: extracted.title ?? undefined,
          expectedTitle: article.groundTruth.title,
          titleMatch,
          extractedWordCount: result.extractedWords,
          expectedMinWords: article.groundTruth.minWordCount
        }
      };

    } catch (error) {
      return {
        article: article.name,
        url: article.url,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          expectedTitle: article.groundTruth.title,
          titleMatch: false,
          expectedMinWords: article.groundTruth.minWordCount
        }
      };
    }
  }

  /**
   * Normalize title for comparison
   */
  private normalizeTitle(title: string): string {
    return title.toLowerCase().trim().replace(/[^\w\s]/g, '');
  }

  /**
   * Run all tests and calculate aggregate F1 score
   */
  async runAllTests(articles: TestArticle[]): Promise<{
    totalTests: number;
    successful: number;
    failed: number;
    averageF1: number;
    averagePrecision: number;
    averageRecall: number;
    results: TestResult[];
  }> {
    console.log(`\n🧪 Running F1 Score Validation Tests...\n`);
    console.log(`Testing ${articles.length} articles against ground truth\n`);

    const results: TestResult[] = [];

    for (const article of articles) {
      console.log(`Testing: ${article.name}...`);
      const result = await this.testArticle(article);
      results.push(result);

      if (result.success && result.result) {
        console.log(`  ✅ F1: ${(result.result.f1Score * 100).toFixed(1)}% | P: ${(result.result.precision * 100).toFixed(1)}% | R: ${(result.result.recall * 100).toFixed(1)}%`);
      } else {
        console.log(`  ❌ Failed: ${result.error}`);
      }
    }

    // Calculate aggregate scores
    const successfulResults = results.filter(r => r.success && r.result);
    const f1Scores = successfulResults.map(r => r.result!.f1Score);
    const precisionScores = successfulResults.map(r => r.result!.precision);
    const recallScores = successfulResults.map(r => r.result!.recall);

    const averageF1 = f1Scores.length > 0
      ? f1Scores.reduce((a, b) => a + b, 0) / f1Scores.length
      : 0;

    const averagePrecision = precisionScores.length > 0
      ? precisionScores.reduce((a, b) => a + b, 0) / precisionScores.length
      : 0;

    const averageRecall = recallScores.length > 0
      ? recallScores.reduce((a, b) => a + b, 0) / recallScores.length
      : 0;

    return {
      totalTests: articles.length,
      successful: successfulResults.length,
      failed: articles.length - successfulResults.length,
      averageF1,
      averagePrecision,
      averageRecall,
      results
    };
  }

  /**
   * Print detailed test report
   */
  printReport(summary: Awaited<ReturnType<typeof this.runAllTests>>): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 F1 SCORE VALIDATION REPORT`);
    console.log(`${'='.repeat(60)}\n`);

    console.log(`Total Tests:      ${summary.totalTests}`);
    console.log(`Successful:       ${summary.successful} ✅`);
    console.log(`Failed:           ${summary.failed} ❌`);
    console.log(`\n${'─'.repeat(60)}\n`);

    console.log(`Average F1 Score:       ${(summary.averageF1 * 100).toFixed(1)}%`);
    console.log(`Average Precision:      ${(summary.averagePrecision * 100).toFixed(1)}%`);
    console.log(`Average Recall:         ${(summary.averageRecall * 100).toFixed(1)}%`);

    console.log(`\n${'─'.repeat(60)}\n`);

    console.log(`📋 Individual Test Results:\n`);
    summary.results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.article}`);
      console.log(`   URL: ${result.url}`);

      if (result.success && result.result) {
        console.log(`   ✅ Success`);
        console.log(`   F1 Score:  ${(result.result.f1Score * 100).toFixed(1)}%`);
        console.log(`   Precision: ${(result.result.precision * 100).toFixed(1)}%`);
        console.log(`   Recall:    ${(result.result.recall * 100).toFixed(1)}%`);
        console.log(`   Title Match: ${result.details.titleMatch ? '✅' : '❌'}`);
        console.log(`   Words Extracted: ${result.details.extractedWordCount}/${result.details.expectedMinWords} min`);
      } else {
        console.log(`   ❌ Failed: ${result.error}`);
      }
      console.log('');
    });

    console.log(`${'='.repeat(60)}\n`);

    // Validation against claimed score
    const claimedF1 = 0.922; // 92.2%
    const difference = Math.abs(summary.averageF1 - claimedF1) * 100;

    if (summary.averageF1 >= claimedF1 * 0.95) {
      console.log(`✅ VALIDATION PASSED`);
      console.log(`   Achieved F1 score is within acceptable range of claimed 92.2%`);
      console.log(`   Difference: ${difference.toFixed(1)}%`);
    } else if (summary.averageF1 >= claimedF1 * 0.85) {
      console.log(`⚠️  VALIDATION WARNING`);
      console.log(`   Achieved F1 score is lower than claimed but within reasonable variance`);
      console.log(`   Difference: ${difference.toFixed(1)}%`);
      console.log(`   Note: Results vary based on test dataset composition`);
    } else {
      console.log(`❌ VALIDATION FAILED`);
      console.log(`   Achieved F1 score significantly differs from claimed 92.2%`);
      console.log(`   Difference: ${difference.toFixed(1)}%`);
      console.log(`   Consider updating the README claim or expanding test dataset`);
    }

    console.log(`\n${'='.repeat(60)}\n`);
  }
}
