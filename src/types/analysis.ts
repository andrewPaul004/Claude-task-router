import { z } from 'zod';

/**
 * Core task-analysis types and schemas.
 *
 * All numeric scores use documented, bounded ranges so downstream consumers
 * (router, optimizer, transparency output) can reason about them uniformly:
 *
 * - `complexityScore` 0–10 — how much reasoning/effort the task demands.
 * - `riskScore`       0–10 — blast radius / reversibility of getting it wrong.
 * - `ambiguityScore`  0–10 — how underspecified the request is.
 * - `confidence`      0–1  — the classifier's confidence in this analysis.
 *
 * Everything is expressed as a Zod schema first and the TypeScript type is
 * inferred from it, so the same definition validates the (optional) LLM
 * classifier's JSON output at runtime.
 */

export const TASK_TYPES = [
  'formatting',
  'extraction',
  'summarization',
  'explanation',
  'code-search',
  'code-edit',
  'feature',
  'debugging',
  'testing',
  'refactoring',
  'architecture',
  'security',
  'database',
  'migration',
  'distributed-systems',
  'devops',
  'documentation',
  'review',
  'product-planning',
  'ux',
  'research',
  'non-coding',
  'other',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const MODEL_TIERS = ['fast', 'balanced', 'deep'] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export const CONTEXT_REQUIREMENTS = ['none', 'light', 'moderate', 'heavy'] as const;
export type ContextRequirement = (typeof CONTEXT_REQUIREMENTS)[number];

export const SCOPES = [
  'single-line',
  'single-file',
  'multi-file',
  'cross-cutting',
] as const;
export type EstimatedScope = (typeof SCOPES)[number];

export const LEVELS = ['low', 'medium', 'high'] as const;
export type Level = (typeof LEVELS)[number];

export const ACCURACY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type AccuracyLevel = (typeof ACCURACY_LEVELS)[number];

export const CLASSIFICATION_SOURCES = [
  'fast-path',
  'scoring',
  'llm',
  'fallback',
] as const;
export type ClassificationSource = (typeof CLASSIFICATION_SOURCES)[number];

const score = z.number().min(0).max(10);

/** The complete, schema-validated result of analyzing a single prompt. */
export const TaskAnalysisSchema = z.object({
  /** The user's request, preserved verbatim. Never mutated. */
  originalPrompt: z.string(),
  taskType: z.enum(TASK_TYPES),
  taskSubtype: z.string(),
  complexityScore: score,
  riskScore: score,
  ambiguityScore: score,
  contextRequirement: z.enum(CONTEXT_REQUIREMENTS),
  estimatedScope: z.enum(SCOPES),
  autonomyRequirement: z.enum(LEVELS),
  accuracyRequirement: z.enum(ACCURACY_LEVELS),
  latencySensitivity: z.enum(LEVELS),
  costSensitivity: z.enum(LEVELS),
  recommendedModelTier: z.enum(MODEL_TIERS),
  /** Model alias (e.g. "sonnet"); resolved to a concrete id by Claude Code. */
  recommendedModel: z.string(),
  recommendedEffort: z.enum(EFFORT_LEVELS),
  /** 0–1 confidence in this analysis. */
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  missingInformation: z.array(z.string()),
  assumptions: z.array(z.string()),
  /** The improved prompt. Preserves original intent; may equal the original. */
  optimizedPrompt: z.string(),
  shouldAskClarifyingQuestion: z.boolean(),
  shouldPlanBeforeExecution: z.boolean(),
  shouldUseSubagents: z.boolean(),
  shouldUseRepositoryContext: z.boolean(),
  shouldRequireConfirmation: z.boolean(),
  safetyFlags: z.array(z.string()),
  /** Which classification layer produced this result. */
  classificationSource: z.enum(CLASSIFICATION_SOURCES),
  /** Wall-clock time spent classifying, in milliseconds. */
  latencyMs: z.number().min(0),
});

export type TaskAnalysis = z.infer<typeof TaskAnalysisSchema>;

/**
 * The subset of fields an LLM classifier is asked to return. Scores and
 * categories only — the deterministic pipeline owns model/effort selection,
 * optimization, and prompt preservation so an LLM can never drop a constraint
 * or silently rewrite the user's request.
 */
export const LlmClassificationSchema = z.object({
  taskType: z.enum(TASK_TYPES),
  taskSubtype: z.string().max(80),
  complexityScore: score,
  riskScore: score,
  ambiguityScore: score,
  estimatedScope: z.enum(SCOPES),
  reasons: z.array(z.string()).max(6),
  confidence: z.number().min(0).max(1),
});

export type LlmClassification = z.infer<typeof LlmClassificationSchema>;

/**
 * The classifier's output: everything in a {@link TaskAnalysis} except the
 * fields owned by the router (model/tier/effort) and the optimizer
 * (optimizedPrompt). Keeping these concerns separate avoids coupling the
 * classifier to model selection or execution.
 */
export type Classification = Omit<
  TaskAnalysis,
  'recommendedModelTier' | 'recommendedModel' | 'recommendedEffort' | 'optimizedPrompt'
>;

/** The router's output: the model/tier/effort decision plus its rationale. */
export interface RoutingDecision {
  recommendedModelTier: ModelTier;
  recommendedModel: string;
  recommendedEffort: EffortLevel;
  reasons: string[];
}

/** Intermediate signal bundle produced by the weighted scoring layer. */
export interface ScoredSignals {
  taskType: TaskType;
  taskSubtype: string;
  complexityScore: number;
  riskScore: number;
  ambiguityScore: number;
  estimatedScope: EstimatedScope;
  reasons: string[];
  matchedSignals: string[];
  safetyFlags: string[];
  confidence: number;
}
