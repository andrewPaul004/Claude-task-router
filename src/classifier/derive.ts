import type { Config } from '../config/schema.js';
import type {
  AccuracyLevel,
  Classification,
  ClassificationSource,
  ContextRequirement,
  Level,
  ScoredSignals,
  TaskType,
} from '../types/analysis.js';

const NON_CODE_TRIVIAL: ReadonlySet<TaskType> = new Set<TaskType>([
  'formatting',
  'extraction',
  'summarization',
  'non-coding',
]);
const HEAVY_CONTEXT_TYPES: ReadonlySet<TaskType> = new Set<TaskType>([
  'architecture',
  'security',
  'migration',
  'distributed-systems',
  'database',
]);
const CRITICAL_FLAGS = new Set([
  'destructive-action',
  'production-impact',
  'sensitive-data',
  'security-sensitive',
]);

/** Turn scored signals into the full (non-routing) classification. */
export function deriveClassification(
  signals: ScoredSignals,
  config: Config,
  meta: { originalPrompt: string; source: ClassificationSource; latencyMs: number }
): Classification {
  const { taskType, complexityScore, riskScore, ambiguityScore, estimatedScope } =
    signals;
  const safetyFlags = [...new Set(signals.safetyFlags)];

  const contextRequirement = deriveContext(signals);
  const shouldUseRepositoryContext =
    config.repositoryContext.enabled && contextRequirement !== 'none';

  const accuracyRequirement = deriveAccuracy(taskType, riskScore, safetyFlags);
  const autonomyRequirement = deriveAutonomy(signals);
  const latencySensitivity = deriveLatency(
    taskType,
    complexityScore,
    config.latencyPreference
  );
  const costSensitivity = config.costPreference;

  const shouldRequireConfirmation = deriveConfirmation(config, riskScore, safetyFlags);
  const shouldPlanBeforeExecution =
    riskScore >= config.scoring.planRiskThreshold ||
    complexityScore >= config.scoring.planComplexityThreshold ||
    (['architecture', 'migration', 'distributed-systems'] as TaskType[]).includes(
      taskType
    );

  const shouldUseSubagents =
    complexityScore >= config.scoring.subagentComplexityThreshold ||
    (estimatedScope === 'cross-cutting' && complexityScore >= 6);

  const shouldAskClarifyingQuestion =
    ambiguityScore >= config.scoring.clarificationAmbiguityThreshold &&
    contextRequirement === 'none';

  const missingInformation = deriveMissingInfo(
    taskType,
    ambiguityScore,
    contextRequirement
  );
  const assumptions = deriveAssumptions(
    taskType,
    ambiguityScore,
    shouldUseRepositoryContext
  );

  return {
    originalPrompt: meta.originalPrompt,
    taskType,
    taskSubtype: signals.taskSubtype,
    complexityScore,
    riskScore,
    ambiguityScore,
    contextRequirement,
    estimatedScope,
    autonomyRequirement,
    accuracyRequirement,
    latencySensitivity,
    costSensitivity,
    confidence: signals.confidence,
    reasons: signals.reasons,
    missingInformation,
    assumptions,
    shouldAskClarifyingQuestion,
    shouldPlanBeforeExecution,
    shouldUseSubagents,
    shouldUseRepositoryContext,
    shouldRequireConfirmation,
    safetyFlags,
    classificationSource: meta.source,
    latencyMs: meta.latencyMs,
  };
}

function deriveContext(signals: ScoredSignals): ContextRequirement {
  const { taskType, estimatedScope, ambiguityScore } = signals;
  if (NON_CODE_TRIVIAL.has(taskType)) return 'none';
  if (taskType === 'explanation' || taskType === 'code-search') return 'light';
  if (estimatedScope === 'cross-cutting' || HEAVY_CONTEXT_TYPES.has(taskType))
    return 'heavy';
  if (
    estimatedScope === 'multi-file' ||
    ambiguityScore >= 6 ||
    taskType === 'debugging'
  ) {
    return 'moderate';
  }
  return 'light';
}

function deriveAccuracy(type: TaskType, risk: number, flags: string[]): AccuracyLevel {
  if (flags.some((f) => CRITICAL_FLAGS.has(f))) return 'critical';
  if (
    risk >= 5 ||
    ['security', 'database', 'migration', 'distributed-systems'].includes(type)
  ) {
    return 'high';
  }
  if (['formatting', 'summarization', 'explanation', 'non-coding'].includes(type))
    return 'low';
  return 'medium';
}

function deriveAutonomy(signals: ScoredSignals): Level {
  if (signals.matchedSignals.includes('autonomy-high')) return 'high';
  if (signals.estimatedScope === 'cross-cutting') return 'high';
  if (signals.estimatedScope === 'multi-file' || signals.complexityScore >= 6)
    return 'medium';
  return 'low';
}

function deriveLatency(type: TaskType, complexity: number, pref: Level): Level {
  if (NON_CODE_TRIVIAL.has(type) || type === 'code-search' || type === 'explanation') {
    return 'high';
  }
  if (complexity >= 7) return 'low';
  return pref;
}

function deriveConfirmation(config: Config, risk: number, flags: string[]): boolean {
  switch (config.confirmationMode) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'high-risk':
    default:
      return risk >= 6 || flags.some((f) => CRITICAL_FLAGS.has(f));
  }
}

function deriveMissingInfo(
  type: TaskType,
  ambiguity: number,
  context: ContextRequirement
): string[] {
  if (ambiguity < 5) return [];
  // If the repository will likely resolve it, we don't treat it as "missing".
  if (context !== 'none') return [];
  const byType: Partial<Record<TaskType, string[]>> = {
    debugging: ['Exact error message or failing behavior', 'Steps to reproduce'],
    feature: ['Desired behavior and acceptance criteria'],
    refactoring: ['Target modules and the goal of the refactor'],
    'non-coding': ['Audience, tone, and length'],
    other: ['Concrete goal and success criteria'],
  };
  return byType[type] ?? ['Concrete success criteria'];
}

function deriveAssumptions(
  type: TaskType,
  ambiguity: number,
  usingRepo: boolean
): string[] {
  const out: string[] = [];
  if (ambiguity >= 5 && usingRepo) {
    out.push(
      'The affected code exists in this repository and can be located by inspection.'
    );
  }
  if (type === 'debugging' && ambiguity >= 5) {
    out.push('The reported issue is reproducible with the current codebase.');
  }
  return out;
}
