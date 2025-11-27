/**
 * F1 Score Test Runner
 *
 * This script runs F1 score validation tests to verify the claimed
 * 92.2% F1 score for Mozilla Readability content extraction.
 *
 * Usage:
 *   npm run test:f1
 *   npx tsx tests/run-f1-tests.ts
 */

import { F1ScoreValidator } from './f1-score-validator';
import { TEST_ARTICLES } from './test-dataset';
import * as path from 'path';

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║         F1 Score Validation for Mozilla Readability        ║
║                                                            ║
║  Testing content extraction quality against ground truth  ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);

  // Initialize validator
  const testDataDir = path.join(__dirname, 'data');
  const validator = new F1ScoreValidator(testDataDir);

  try {
    // Run tests
    const results = await validator.runAllTests(TEST_ARTICLES);

    // Print detailed report
    validator.printReport(results);

    // Exit with appropriate code
    if (results.successful === results.totalTests) {
      console.log(`✅ All tests passed!\n`);
      process.exit(0);
    } else {
      console.log(`⚠️  Some tests failed. See report above for details.\n`);
      process.exit(1);
    }

  } catch (error) {
    console.error(`\n❌ Test execution failed:\n`);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
