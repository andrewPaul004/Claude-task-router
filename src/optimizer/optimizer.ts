import type { Config } from '../config/schema.js';
import type { Classification, TaskType } from '../types/analysis.js';

export interface OptimizeResult {
  optimizedPrompt: string;
  changed: boolean;
  addedSections: string[];
}

export interface PromptOptimizer {
  optimize(c: Classification, config: Config): OptimizeResult;
}

const TRIVIAL_TYPES: ReadonlySet<TaskType> = new Set<TaskType>([
  'formatting',
  'extraction',
  'summarization',
  'explanation',
  'non-coding',
  'code-search',
]);

const GUIDANCE_HEADER =
  'Execution guidance (added by Claude Task Router; the original request above is authoritative):';

/**
 * Progressive-enhancement prompt optimizer.
 *
 * Guarantees:
 *  - the original prompt is always preserved verbatim at the top,
 *  - trivial requests are returned essentially unchanged,
 *  - added specifics are labeled as assumptions, never presented as new
 *    requirements,
 *  - guidance scales with complexity/risk and is omitted when it adds nothing.
 */
export class DefaultPromptOptimizer implements PromptOptimizer {
  optimize(c: Classification, config: Config): OptimizeResult {
    const original = c.originalPrompt;
    if (config.optimizationMode === 'off') {
      return { optimizedPrompt: original, changed: false, addedSections: [] };
    }

    // Trivial, low-risk, context-free work stays as-is.
    const trivial =
      TRIVIAL_TYPES.has(c.taskType) &&
      c.complexityScore <= 3 &&
      c.riskScore < 2 &&
      c.safetyFlags.length === 0;
    if (trivial) {
      return { optimizedPrompt: original, changed: false, addedSections: [] };
    }

    const bullets: string[] = [];
    const addedSections: string[] = [];

    if (c.shouldPlanBeforeExecution) {
      bullets.push('Outline a brief plan before modifying anything.');
    }
    if (c.shouldUseRepositoryContext) {
      bullets.push('Inspect the relevant existing code and follow its conventions.');
    }

    bullets.push(...taskBullets(c));

    // High-risk safety guidance.
    const highRisk =
      c.riskScore >= config.scoring.planRiskThreshold ||
      c.safetyFlags.some((f) =>
        ['destructive-action', 'production-impact', 'sensitive-data'].includes(f)
      );
    if (highRisk) {
      bullets.push(
        'Identify any destructive or irreversible actions and require explicit approval before running them.',
        'Provide rollback steps and test failure scenarios.',
        'Do not make production changes unless explicitly requested.'
      );
    }

    if (c.shouldUseSubagents) {
      bullets.push('Consider delegating independent sub-tasks to subagents.');
    }

    // Always close coding work with a validation + summary expectation.
    if (!TRIVIAL_TYPES.has(c.taskType)) {
      bullets.push(
        'Run the relevant tests/validation and summarize what changed and why.'
      );
    }

    const parts: string[] = [original.trimEnd()];
    if (bullets.length > 0) {
      parts.push('', GUIDANCE_HEADER, ...dedupe(bullets).map((b) => `- ${b}`));
      addedSections.push('guidance');
    }

    if (c.assumptions.length > 0) {
      parts.push(
        '',
        'Assumptions (correct me if wrong):',
        ...c.assumptions.map((a) => `- ${a}`)
      );
      addedSections.push('assumptions');
    }

    if (c.missingInformation.length > 0 && !c.shouldAskClarifyingQuestion) {
      parts.push(
        '',
        'Resolve by inspection where possible (avoid asking unless truly blocking):',
        ...c.missingInformation.map((m) => `- ${m}`)
      );
      addedSections.push('open-questions');
    }

    if (c.shouldAskClarifyingQuestion) {
      parts.push(
        '',
        'If the request remains materially ambiguous after a quick look, ask ONE focused clarifying question before proceeding.'
      );
      addedSections.push('clarify');
    }

    const optimizedPrompt = parts.join('\n');
    return {
      optimizedPrompt,
      changed: optimizedPrompt.trim() !== original.trim(),
      addedSections,
    };
  }
}

function taskBullets(c: Classification): string[] {
  switch (c.taskType) {
    case 'debugging':
      return [
        'Identify the most likely root cause before changing code.',
        'Implement the smallest safe fix and add regression coverage.',
        'Validate the affected flows and state any unresolved risks.',
      ];
    case 'feature':
    case 'code-edit':
      return [
        'Implement the smallest change consistent with the existing code.',
        'Add or update tests for the new behavior.',
      ];
    case 'refactoring':
      return ['Preserve behavior; make the refactor incrementally and keep tests green.'];
    case 'testing':
      return [
        'Cover the important cases and edge conditions; keep tests focused and fast.',
      ];
    case 'architecture':
      return [
        'Lay out 1–2 viable approaches with trade-offs before recommending one.',
        'Call out risks, constraints, and migration/rollout considerations.',
      ];
    case 'security':
      return [
        'Enumerate concrete threats and affected surfaces.',
        'Prefer defense-in-depth; avoid introducing new sensitive-data exposure.',
      ];
    case 'migration':
      return [
        'Sequence the migration into reversible steps with checkpoints.',
        'Preserve backward compatibility until cutover is verified.',
      ];
    case 'database':
      return ['Review the current schema and data volume before proposing changes.'];
    case 'documentation':
      return ['Match the existing documentation style and keep it concise.'];
    default:
      return [];
  }
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

export function createOptimizer(): DefaultPromptOptimizer {
  return new DefaultPromptOptimizer();
}
