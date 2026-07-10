import { z } from 'zod';
import { EFFORT_LEVELS, LEVELS, MODEL_TIERS } from '../types/analysis.js';

/**
 * Versioned configuration schema.
 *
 * Every field carries a default, so `ConfigSchema.parse({})` yields a complete,
 * valid configuration. Partial configs from each source (user file, project
 * file, env, flags) are deep-merged and then parsed once, which is how the
 * precedence hierarchy and built-in defaults are realized in one place.
 *
 * `schemaVersion` gates configuration migrations (see src/migrations).
 */

export const CURRENT_CONFIG_SCHEMA_VERSION = 1;

const level = z.enum(LEVELS);
const effort = z.enum(EFFORT_LEVELS);
const tier = z.enum(MODEL_TIERS);

export const RoutingRulesSchema = z
  .object({
    /**
     * Combined-signal thresholds (0–10) at which the base tier escalates.
     * A weighted blend of complexity/risk/ambiguity at or above `balanced`
     * selects the balanced tier; at or above `deep` selects the deep tier.
     */
    tierThresholds: z
      .object({
        balanced: z.number().min(0).max(10).default(3.5),
        deep: z.number().min(0).max(10).default(6.5),
      })
      .default({}),
    /** High risk alone can escalate the tier by one step. */
    riskEscalation: z.boolean().default(true),
    /** Risk score (0–10) at or above which escalation applies. */
    riskEscalationThreshold: z.number().min(0).max(10).default(6),
    /** Base effort per tier, before per-task adjustment. */
    effortByTier: z
      .object({
        fast: effort.default('low'),
        balanced: effort.default('medium'),
        deep: effort.default('high'),
      })
      .default({}),
    /**
     * Task types that hint a specific tier regardless of raw scores. Keyed by
     * task-type string; unknown keys are ignored (validated softly by doctor).
     */
    typeTierHints: z.record(z.string(), tier).default({
      formatting: 'fast',
      extraction: 'fast',
      summarization: 'fast',
      'code-search': 'fast',
      feature: 'balanced',
      debugging: 'balanced',
      testing: 'balanced',
      refactoring: 'balanced',
      'code-edit': 'balanced',
      database: 'balanced',
      devops: 'balanced',
      'product-planning': 'balanced',
      ux: 'balanced',
      research: 'balanced',
      review: 'balanced',
      architecture: 'deep',
      security: 'deep',
      migration: 'deep',
      'distributed-systems': 'deep',
    }),
  })
  .default({});

export const ScoringSchema = z
  .object({
    /** Multipliers applied to the base signal contributions per axis. */
    weights: z
      .object({
        complexity: z.number().min(0).max(5).default(1),
        risk: z.number().min(0).max(5).default(1),
        ambiguity: z.number().min(0).max(5).default(1),
        scope: z.number().min(0).max(5).default(1),
      })
      .default({}),
    /** Ambiguity (0–10) at/above which a clarifying question is considered. */
    clarificationAmbiguityThreshold: z.number().min(0).max(10).default(7.5),
    /** Risk (0–10) at/above which planning-before-execution is recommended. */
    planRiskThreshold: z.number().min(0).max(10).default(6),
    /** Complexity (0–10) at/above which planning-before-execution is advised. */
    planComplexityThreshold: z.number().min(0).max(10).default(7),
    /** Complexity (0–10) at/above which subagents are suggested. */
    subagentComplexityThreshold: z.number().min(0).max(10).default(8),
  })
  .default({});

export const ContextLimitsSchema = z
  .object({
    maxFiles: z.number().int().positive().default(12),
    maxFileBytes: z.number().int().positive().default(64_000),
    maxTotalBytes: z.number().int().positive().default(256_000),
    maxTokensEstimate: z.number().int().positive().default(6_000),
    timeoutMs: z.number().int().positive().default(2_500),
  })
  .default({});

export const RepositoryContextSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Only collected when explicitly enabled; off by default for privacy. */
    recentCommits: z.boolean().default(false),
    includeGitDiff: z.boolean().default(true),
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
  })
  .default({});

export const ClassifierSchema = z
  .object({
    /** The optional LLM classification layer is OFF unless enabled here. */
    llmEnabled: z.boolean().default(false),
    /** Low-cost model alias used only for classification. */
    model: z.string().default('haiku'),
    timeoutMs: z.number().int().positive().default(4_000),
    maxRetries: z.number().int().min(0).max(2).default(1),
    /** Redact probable secrets before sending anything to the classifier. */
    redactBeforeSend: z.boolean().default(true),
    /** Use `--bare` for the classifier subprocess to avoid recursive hooks. */
    bare: z.boolean().default(true),
  })
  .default({});

export const ClassificationThresholdsSchema = z
  .object({
    /** Below this confidence, escalate to the LLM classifier (if enabled). */
    llmConfidenceFloor: z.number().min(0).max(1).default(0.55),
    /** Fast-path results must meet this confidence to short-circuit. */
    fastPathMinConfidence: z.number().min(0).max(1).default(0.8),
  })
  .default({});

export const PrivacySchema = z
  .object({
    redactSecrets: z.boolean().default(true),
    storePrompts: z.boolean().default(false),
    storeRepositoryContent: z.boolean().default(false),
    /** Treat repository text as untrusted; never auto-obey embedded directives. */
    trustRepositoryInstructions: z.boolean().default(false),
  })
  .default({});

export const LoggingSchema = z
  .object({
    enabled: z.boolean().default(false),
    level: z.enum(['error', 'warn', 'info', 'debug']).default('warn'),
    /** Prompt bodies are never logged unless this is explicitly turned on. */
    logPrompts: z.boolean().default(false),
    file: z.string().nullable().default(null),
  })
  .default({});

export const CacheSchema = z
  .object({
    enabled: z.boolean().default(true),
    maxEntries: z.number().int().positive().default(200),
    ttlMs: z
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
  })
  .default({});

export const TimeoutsSchema = z
  .object({
    classificationMs: z.number().int().positive().default(1_500),
    contextMs: z.number().int().positive().default(2_500),
    llmClassifierMs: z.number().int().positive().default(4_000),
    hookMs: z.number().int().positive().default(8_000),
  })
  .default({});

export const HookBehaviorSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Transparency for the injected context block. */
    mode: z.enum(['silent', 'compact', 'explain']).default('silent'),
    /** Inject additionalContext guidance for Claude Code. */
    injectContext: z.boolean().default(true),
    /** Collect repository context inside the hook (adds latency). */
    collectContext: z.boolean().default(false),
    maxAdditionalContextChars: z.number().int().positive().default(4_000),
  })
  .default({});

export const SdkBehaviorSchema = z
  .object({
    /** Executable used to launch Claude Code. */
    executable: z.string().default('claude'),
    /** Extra args always appended to the Claude Code invocation. */
    extraArgs: z.array(z.string()).default([]),
    /** Pass through a permission mode, or null to leave Claude Code's default. */
    permissionMode: z
      .enum(['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'])
      .nullable()
      .default(null),
    /** Inject routing guidance via --append-system-prompt when routing. */
    appendSystemPrompt: z.boolean().default(true),
  })
  .default({});

export const ConfigSchema = z
  .object({
    schemaVersion: z.number().int().positive().default(CURRENT_CONFIG_SCHEMA_VERSION),
    enabled: z.boolean().default(true),
    installScope: z.enum(['global', 'project', 'none']).default('none'),
    /** 'auto' applies routing flags; 'recommend' only reports them. */
    routingMode: z.enum(['auto', 'recommend', 'off']).default('auto'),
    defaultModelTier: tier.default('balanced'),
    defaultModel: z.string().default('sonnet'),
    /** Safe model used when routing/classification fails. */
    fallbackModel: z.string().default('sonnet'),
    allowedModels: z.array(z.string()).default(['haiku', 'sonnet', 'opus']),
    /** Hard cap on recommended effort. */
    maximumEffort: effort.default('high'),
    /** Prompt handling: auto-optimize, show optimized first, or leave as-is. */
    optimizationMode: z.enum(['auto', 'show-first', 'off']).default('auto'),
    transparencyMode: z
      .enum(['silent', 'compact', 'explain', 'confirm'])
      .default('compact'),
    confirmationMode: z.enum(['never', 'high-risk', 'always']).default('high-risk'),
    costPreference: level.default('medium'),
    qualityPreference: level.default('medium'),
    latencyPreference: level.default('medium'),
    repositoryContext: RepositoryContextSchema,
    contextLimits: ContextLimitsSchema,
    classifier: ClassifierSchema,
    classificationThresholds: ClassificationThresholdsSchema,
    scoring: ScoringSchema,
    routingRules: RoutingRulesSchema,
    privacy: PrivacySchema,
    logging: LoggingSchema,
    telemetry: z.object({ enabled: z.boolean().default(false) }).default({}),
    cache: CacheSchema,
    timeouts: TimeoutsSchema,
    hookBehavior: HookBehaviorSchema,
    sdkBehavior: SdkBehaviorSchema,
  })
  .strict();

export type Config = z.infer<typeof ConfigSchema>;

/** A fully-defaulted configuration object. */
export function defaultConfig(): Config {
  return ConfigSchema.parse({});
}
