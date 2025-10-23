/**
 * Store Vercel build fix incident in memory system
 */
import { storeDebugIncident } from '@tyroneross/claude-code-debugger';

const sessionId = `SESSION_${Date.now()}_vercel_build`;

async function storeIncident() {
  await storeDebugIncident(sessionId, {
    root_cause: {
      description: "Vercel build failure due to missing TypeScript type definitions for turndown library. The turndown package doesn't ship with built-in .d.ts files, requiring @types/turndown from DefinitelyTyped for production builds. Local dev mode is more lenient, but Vercel enforces strict TypeScript compilation.",
      category: "build",
      confidence: 0.95,
      code_snippet: `// Error from Vercel logs:
Type error: Could not find a declaration file for module 'turndown'.
'/vercel/path0/node_modules/turndown/lib/turndown.cjs.js' implicitly has an 'any' type.
Try \`npm i --save-dev @types/turndown\` if it exists`,
      file: "package.json",
      line_range: [1, 50]
    },
    fix: {
      approach: "Installed @types/turndown as devDependency to provide TypeScript type definitions during compilation",
      changes: [
        {
          file: "package.json",
          lines_changed: 1,
          change_type: "add",
          summary: "Added @types/turndown to devDependencies"
        },
        {
          file: "package-lock.json",
          lines_changed: 8,
          change_type: "modify",
          summary: "Updated dependency tree with @types/turndown package"
        }
      ],
      time_to_fix: 5
    },
    verification: {
      status: "verified",
      regression_tests_passed: true,
      user_journey_tested: true,
      success_criteria_met: true
    },
    tags: ["vercel", "typescript", "build", "types", "turndown", "deployment"],
    files_changed: ["package.json", "package-lock.json"]
  });

  console.log('✅ Incident stored successfully');
}

storeIncident().catch(console.error);
