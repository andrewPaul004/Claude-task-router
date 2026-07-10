import type { EffortLevel, ModelTier } from '../types/analysis.js';

/**
 * Evaluation fixtures.
 *
 * Each fixture pins *acceptable* outcomes (usually a small set of tiers/efforts
 * and a numeric range) rather than a single exact value, so the suite measures
 * routing quality without being brittle to minor score tuning. `null` means
 * "no assertion". Runs entirely offline (no LLM classifier).
 */

export interface Fixture {
  id: string;
  category: string;
  prompt: string;
  tiers: ModelTier[];
  efforts: EffortLevel[];
  risk: [number, number];
  complexity: [number, number];
  expectContext: boolean | null;
  expectClarify: boolean | null;
}

const ALL_EFFORTS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const LOWISH: EffortLevel[] = ['low', 'medium'];
const MIDISH: EffortLevel[] = ['low', 'medium', 'high'];
const HIGHISH: EffortLevel[] = ['medium', 'high', 'xhigh', 'max'];

export const FIXTURES: Fixture[] = [
  // ---- Formatting ----
  f(
    'fmt-1',
    'Formatting',
    'Convert these values into a comma-separated list.',
    ['fast'],
    LOWISH,
    [0, 2],
    [0, 3],
    false,
    false
  ),
  f(
    'fmt-2',
    'Formatting',
    'Reformat this JSON with 2-space indentation.',
    ['fast'],
    LOWISH,
    [0, 2],
    [0, 3],
    false,
    false
  ),
  f(
    'fmt-3',
    'Formatting',
    'Convert this block of text to uppercase.',
    ['fast'],
    LOWISH,
    [0, 2],
    [0, 3],
    false,
    false
  ),
  // ---- Extraction ----
  f(
    'ext-1',
    'Extraction',
    'Extract all email addresses from this text.',
    ['fast'],
    LOWISH,
    [0, 2],
    [0, 3],
    false,
    false
  ),
  f(
    'ext-2',
    'Extraction',
    'Pull out the version numbers from this changelog.',
    ['fast'],
    LOWISH,
    [0, 2],
    [0, 3],
    false,
    false
  ),
  f(
    'ext-3',
    'Extraction',
    'List all the URLs mentioned in this document.',
    ['fast'],
    LOWISH,
    [0, 2],
    [0, 4],
    false,
    false
  ),
  // ---- Summarization ----
  f(
    'sum-1',
    'Summarization',
    'Summarize this README in three bullet points.',
    ['fast'],
    LOWISH,
    [0, 2],
    [0, 3],
    false,
    false
  ),
  f(
    'sum-2',
    'Summarization',
    'Give me a TL;DR of this error log.',
    ['fast'],
    LOWISH,
    [0, 3],
    [0, 3],
    false,
    false
  ),
  // ---- Explanation ----
  f(
    'exp-1',
    'Explanation',
    'Explain what a debounce function does.',
    ['fast', 'balanced'],
    LOWISH,
    [0, 2],
    [0, 4],
    null,
    false
  ),
  f(
    'exp-2',
    'Explanation',
    'What does the regex ^\\d{3}-\\d{4}$ match?',
    ['fast', 'balanced'],
    LOWISH,
    [0, 2],
    [0, 4],
    null,
    false
  ),
  f(
    'exp-3',
    'Explanation',
    'How does JavaScript event loop handle promises?',
    ['fast', 'balanced'],
    LOWISH,
    [0, 2],
    [0, 5],
    null,
    false
  ),
  // ---- Small code edits ----
  f(
    'edit-1',
    'Small code edit',
    'Rename the variable foo to userId in utils.ts.',
    ['fast', 'balanced'],
    LOWISH,
    [0, 3],
    [1, 4],
    true,
    false
  ),
  f(
    'edit-2',
    'Small code edit',
    'Add a trailing newline at the end of config.py.',
    ['fast', 'balanced'],
    LOWISH,
    [0, 2],
    [0, 4],
    true,
    false
  ),
  f(
    'edit-3',
    'Small code edit',
    'Change the default timeout from 30 to 60 in client.ts.',
    ['fast', 'balanced'],
    LOWISH,
    [0, 3],
    [1, 5],
    true,
    false
  ),
  // ---- Feature development ----
  f(
    'feat-1',
    'Feature',
    'Add validation to the signup form.',
    ['balanced'],
    MIDISH,
    [1, 5],
    [3, 7],
    true,
    false
  ),
  f(
    'feat-2',
    'Feature',
    'Add a --verbose flag to the CLI.',
    ['fast', 'balanced'],
    MIDISH,
    [0, 4],
    [2, 6],
    true,
    false
  ),
  f(
    'feat-3',
    'Feature',
    'Implement pagination for the users list endpoint.',
    ['balanced'],
    MIDISH,
    [1, 5],
    [3, 7],
    true,
    false
  ),
  f(
    'feat-4',
    'Feature',
    'Build a rate limiter for the public API.',
    ['balanced', 'deep'],
    MIDISH,
    [2, 6],
    [4, 8],
    true,
    false
  ),
  // ---- Routine debugging ----
  f(
    'dbg-1',
    'Routine debugging',
    'Fix the off-by-one error in the paginate() function.',
    ['balanced'],
    MIDISH,
    [1, 5],
    [3, 7],
    true,
    false
  ),
  f(
    'dbg-2',
    'Routine debugging',
    'The date formatter returns NaN for empty input; fix it.',
    ['balanced'],
    MIDISH,
    [1, 5],
    [3, 7],
    true,
    false
  ),
  // ---- Difficult debugging ----
  f(
    'hdbg-1',
    'Difficult debugging',
    'Fix the login issue.',
    ['balanced', 'deep'],
    HIGHISH,
    [3, 8],
    [5, 9],
    true,
    false
  ),
  f(
    'hdbg-2',
    'Difficult debugging',
    'Users are intermittently logged out in production; find and fix the cause.',
    ['deep'],
    HIGHISH,
    [5, 9],
    [6, 10],
    true,
    false
  ),
  f(
    'hdbg-3',
    'Difficult debugging',
    'There is a race condition causing duplicate charges.',
    ['deep'],
    HIGHISH,
    [5, 10],
    [6, 10],
    true,
    null
  ),
  // ---- Testing ----
  f(
    'test-1',
    'Testing',
    'Add unit tests for the auth middleware.',
    ['balanced'],
    MIDISH,
    [1, 5],
    [3, 7],
    true,
    false
  ),
  f(
    'test-2',
    'Testing',
    'Write integration tests for the checkout flow.',
    ['balanced'],
    MIDISH,
    [2, 6],
    [3, 8],
    true,
    false
  ),
  // ---- Refactoring ----
  f(
    'ref-1',
    'Refactoring',
    'Refactor the payment module to reduce duplication.',
    ['balanced', 'deep'],
    MIDISH,
    [2, 6],
    [4, 8],
    true,
    false
  ),
  f(
    'ref-2',
    'Refactoring',
    'Extract the retry logic into a reusable helper.',
    ['balanced'],
    MIDISH,
    [1, 5],
    [3, 7],
    true,
    false
  ),
  // ---- Architecture ----
  f(
    'arch-1',
    'Architecture',
    'Design the architecture for a multi-tenant billing system.',
    ['deep'],
    HIGHISH,
    [3, 8],
    [7, 10],
    true,
    null
  ),
  f(
    'arch-2',
    'Architecture',
    'Propose a system design for real-time notifications at scale.',
    ['deep'],
    HIGHISH,
    [3, 8],
    [7, 10],
    true,
    null
  ),
  // ---- Security ----
  f(
    'sec-1',
    'Security',
    'Do a security review of the authentication flow.',
    ['deep'],
    HIGHISH,
    [5, 10],
    [6, 10],
    true,
    null
  ),
  f(
    'sec-2',
    'Security',
    'Audit the API for injection vulnerabilities.',
    ['deep'],
    HIGHISH,
    [5, 10],
    [6, 10],
    true,
    null
  ),
  // ---- Database ----
  f(
    'db-1',
    'Database',
    'Add an index to speed up the slow orders query.',
    ['balanced', 'deep'],
    MIDISH,
    [2, 6],
    [3, 8],
    true,
    false
  ),
  f(
    'db-2',
    'Database',
    'Redesign the schema to support soft deletes across all tables.',
    ['deep'],
    HIGHISH,
    [3, 8],
    [6, 10],
    true,
    null
  ),
  // ---- Migrations ----
  f(
    'mig-1',
    'Migration',
    'Migrate the database from MySQL to Postgres.',
    ['deep'],
    HIGHISH,
    [5, 10],
    [6, 10],
    true,
    null
  ),
  f(
    'mig-2',
    'Migration',
    'Migrate the codebase from CommonJS to ESM.',
    ['deep'],
    HIGHISH,
    [3, 9],
    [6, 10],
    true,
    null
  ),
  // ---- Distributed systems ----
  f(
    'dist-1',
    'Distributed systems',
    'Fix the eventual consistency bug across our microservices.',
    ['deep'],
    HIGHISH,
    [4, 9],
    [7, 10],
    true,
    null
  ),
  f(
    'dist-2',
    'Distributed systems',
    'Design a sharding strategy for the events table.',
    ['deep'],
    HIGHISH,
    [3, 9],
    [7, 10],
    true,
    null
  ),
  // ---- Documentation ----
  f(
    'doc-1',
    'Documentation',
    'Update the README installation section.',
    ['fast', 'balanced'],
    LOWISH,
    [0, 3],
    [1, 5],
    true,
    false
  ),
  f(
    'doc-2',
    'Documentation',
    'Add JSDoc comments to the exported functions.',
    ['fast', 'balanced'],
    LOWISH,
    [0, 3],
    [1, 6],
    true,
    false
  ),
  // ---- Product planning ----
  f(
    'prod-1',
    'Product planning',
    'Draft a product roadmap for Q3.',
    ['balanced'],
    MIDISH,
    [0, 4],
    [3, 7],
    null,
    null
  ),
  f(
    'prod-2',
    'Product planning',
    'Prioritize the backlog for the next sprint.',
    ['balanced'],
    MIDISH,
    [0, 4],
    [2, 7],
    null,
    null
  ),
  // ---- UX ----
  f(
    'ux-1',
    'UX',
    'Improve the onboarding user flow.',
    ['balanced'],
    MIDISH,
    [0, 4],
    [3, 7],
    null,
    null
  ),
  f(
    'ux-2',
    'UX',
    'Suggest accessibility improvements for the signup form.',
    ['balanced'],
    MIDISH,
    [0, 4],
    [2, 7],
    null,
    null
  ),
  // ---- Research ----
  f(
    'res-1',
    'Research',
    'Compare Redis and Memcached for our caching needs.',
    ['balanced', 'deep'],
    MIDISH,
    [0, 4],
    [3, 8],
    null,
    null
  ),
  f(
    'res-2',
    'Research',
    'Research options for background job processing in Node.',
    ['balanced', 'deep'],
    MIDISH,
    [0, 4],
    [3, 8],
    null,
    null
  ),
  // ---- Vague ----
  f(
    'vague-1',
    'Vague',
    'Make it better.',
    ['fast', 'balanced', 'deep'],
    ALL_EFFORTS,
    [0, 5],
    [0, 8],
    null,
    null
  ),
  f(
    'vague-2',
    'Vague',
    "Something's wrong with the app.",
    ['balanced', 'deep'],
    MIDISH,
    [0, 6],
    [3, 9],
    true,
    null
  ),
  f(
    'vague-3',
    'Vague',
    'Clean this up.',
    ['fast', 'balanced'],
    MIDISH,
    [0, 4],
    [0, 7],
    null,
    null
  ),
  // ---- High-risk ----
  f(
    'risk-1',
    'High-risk',
    'Delete all inactive user accounts.',
    ['balanced', 'deep'],
    HIGHISH,
    [6, 10],
    [3, 9],
    true,
    null
  ),
  f(
    'risk-2',
    'High-risk',
    'Drop the legacy_orders table in production.',
    ['deep'],
    HIGHISH,
    [7, 10],
    [3, 10],
    true,
    null
  ),
  f(
    'risk-3',
    'High-risk',
    'Force-push the rewritten history to main.',
    ['balanced', 'deep'],
    HIGHISH,
    [6, 10],
    [2, 9],
    null,
    null
  ),
  f(
    'risk-4',
    'High-risk',
    'Rotate all production credentials and update the services.',
    ['deep'],
    HIGHISH,
    [6, 10],
    [5, 10],
    true,
    null
  ),
  // ---- Non-coding ----
  f(
    'nc-1',
    'Non-coding',
    'Write a friendly email declining a meeting invite.',
    ['fast', 'balanced'],
    LOWISH,
    [0, 2],
    [0, 5],
    false,
    null
  ),
  f(
    'nc-2',
    'Non-coding',
    'Translate this paragraph into Spanish.',
    ['fast'],
    LOWISH,
    [0, 2],
    [0, 4],
    false,
    false
  ),
  f(
    'nc-3',
    'Non-coding',
    'Proofread this blog introduction.',
    ['fast', 'balanced'],
    LOWISH,
    [0, 2],
    [0, 4],
    false,
    false
  ),
  // ---- Code search ----
  f(
    'search-1',
    'Code search',
    'Find where the API base URL is configured.',
    ['fast', 'balanced'],
    LOWISH,
    [0, 3],
    [1, 5],
    true,
    false
  ),
  f(
    'search-2',
    'Code search',
    'Which file defines the User model?',
    ['fast', 'balanced'],
    LOWISH,
    [0, 3],
    [1, 5],
    true,
    false
  ),
];

function f(
  id: string,
  category: string,
  prompt: string,
  tiers: ModelTier[],
  efforts: EffortLevel[],
  risk: [number, number],
  complexity: [number, number],
  expectContext: boolean | null,
  expectClarify: boolean | null
): Fixture {
  return {
    id,
    category,
    prompt,
    tiers,
    efforts,
    risk,
    complexity,
    expectContext,
    expectClarify,
  };
}
