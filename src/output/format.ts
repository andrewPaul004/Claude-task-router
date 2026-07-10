import type { Config } from '../config/schema.js';
import type { TaskAnalysis, TaskType } from '../types/analysis.js';
import { ModelRegistry } from '../models/registry.js';

/**
 * Presentation helpers. Two audiences:
 *  - humans (analyze/compact/explain terminal output),
 *  - the model (the hook's additionalContext block).
 */

const registry = new ModelRegistry();

const TYPE_LABEL: Partial<Record<TaskType, string>> = {
  'code-edit': 'Code edit',
  'code-search': 'Code search',
  'distributed-systems': 'Distributed systems',
  'product-planning': 'Product planning',
  'non-coding': 'Non-coding',
  feature: 'Feature development',
  ux: 'UX',
  devops: 'DevOps',
};

export function typeLabel(t: TaskType): string {
  return TYPE_LABEL[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
}

export function modelLabel(alias: string): string {
  return registry.resolve(alias).label;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One-line compact routing summary. */
export function compactLine(a: TaskAnalysis): string {
  return `${modelLabel(a.recommendedModel)} / ${a.recommendedEffort} — ${typeLabel(
    a.taskType
  ).toLowerCase()} · ${a.estimatedScope} (complexity ${a.complexityScore}/10, risk ${a.riskScore}/10)`;
}

/** Full human-readable analysis (used by `analyze` and `--explain`). */
export function humanAnalysis(
  a: TaskAnalysis,
  opts: { showOptimized?: boolean } = {}
): string {
  const lines = [
    `Task type:       ${typeLabel(a.taskType)}${a.taskSubtype !== a.taskType ? ` (${a.taskSubtype})` : ''}`,
    `Complexity:      ${a.complexityScore}/10`,
    `Risk:            ${a.riskScore}/10`,
    `Ambiguity:       ${a.ambiguityScore}/10`,
    `Estimated scope: ${cap(a.estimatedScope)}`,
    `Model:           ${modelLabel(a.recommendedModel)} (${a.recommendedModelTier} tier)`,
    `Effort:          ${cap(a.recommendedEffort)}`,
    `Confidence:      ${Math.round(a.confidence * 100)}%`,
    `Context:         ${a.shouldUseRepositoryContext ? 'yes' : 'no'} (${a.contextRequirement})`,
    `Clarify:         ${a.shouldAskClarifyingQuestion ? 'maybe' : 'no'}`,
    `Source:          ${a.classificationSource} (${Math.round(a.latencyMs)}ms)`,
  ];
  if (a.safetyFlags.length) lines.push(`Safety flags:    ${a.safetyFlags.join(', ')}`);
  if (a.reasons.length) {
    lines.push('Reasons:');
    for (const r of a.reasons) lines.push(`  - ${r}`);
  }
  if (a.assumptions.length) {
    lines.push('Assumptions:');
    for (const r of a.assumptions) lines.push(`  - ${r}`);
  }
  if (a.missingInformation.length) {
    lines.push('Missing information:');
    for (const r of a.missingInformation) lines.push(`  - ${r}`);
  }
  if (opts.showOptimized) {
    lines.push('', 'Optimized prompt:', a.optimizedPrompt);
  }
  return lines.join('\n');
}

/**
 * Build the hook's additionalContext block. Returns null when there is nothing
 * useful to add (trivial prompt) so trivial requests are never bloated.
 */
export function hookContext(a: TaskAnalysis, config: Config): string | null {
  const mode = config.hookBehavior.mode;
  const optimizedChanged = a.optimizedPrompt.trim() !== a.originalPrompt.trim();

  // Nothing useful to inject.
  if (!optimizedChanged && mode === 'silent') return null;

  const header =
    `[Claude Task Router] Suggested model: ${modelLabel(a.recommendedModel)} / ` +
    `effort ${a.recommendedEffort} (${typeLabel(a.taskType).toLowerCase()}). ` +
    `Hook mode cannot change the active model — this is a recommendation; ` +
    `run \`ctr "<prompt>"\` for automatic routing.`;

  const parts: string[] = [];
  if (mode !== 'silent') parts.push(header);

  if (mode === 'explain') {
    parts.push(
      `Scores — complexity ${a.complexityScore}/10, risk ${a.riskScore}/10, ambiguity ${a.ambiguityScore}/10.`
    );
    if (a.reasons.length) parts.push(`Why: ${a.reasons.slice(0, 4).join('; ')}.`);
  }

  if (optimizedChanged) {
    // Include only the guidance portion (everything after the original prompt).
    const guidance = a.optimizedPrompt.slice(a.originalPrompt.trimEnd().length).trim();
    if (guidance) parts.push(guidance);
  }

  const text = parts.join('\n\n').trim();
  return text.length > 0 ? text : null;
}

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
