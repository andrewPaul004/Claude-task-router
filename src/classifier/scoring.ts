import type { Config } from '../config/schema.js';
import type { EstimatedScope, ScoredSignals, TaskType } from '../types/analysis.js';
import { normalizePrompt, SIGNAL_RULES } from './signals.js';

const clamp = (n: number, lo = 0, hi = 10): number => Math.max(lo, Math.min(hi, n));

const TRIVIAL_TYPES: ReadonlySet<TaskType> = new Set<TaskType>([
  'formatting',
  'extraction',
  'summarization',
  'explanation',
  'non-coding',
  'code-search',
]);

const CODE_HINT =
  /\b(code|function|class|method|variable|file|module|component|api|endpoint|test|typescript|javascript|python|rust|go|java|css|html|sql|import|export|async|await)\b/i;

/**
 * Layer 2 — weighted scoring.
 *
 * Applies every signal rule, accumulates the four scoring axes (scaled by the
 * configured per-axis weights), tallies task-type votes, and derives scope and
 * a calibrated confidence. Deliberately keeps prompt length a weak signal so a
 * long-but-simple prompt does not inflate complexity.
 */
export function scorePrompt(prompt: string, config: Config): ScoredSignals {
  const text = normalizePrompt(prompt);
  const weights = config.scoring.weights;

  let complexity = 0;
  let risk = 0;
  let ambiguity = 0;
  let scope = 0;

  const typeVotes = new Map<TaskType, number>();
  const reasons: string[] = [];
  const matchedSignals: string[] = [];
  const safetyFlags = new Set<string>();

  for (const rule of SIGNAL_RULES) {
    if (!rule.patterns.some((p) => p.test(text))) continue;
    matchedSignals.push(rule.id);
    complexity += (rule.complexity ?? 0) * weights.complexity;
    risk += (rule.risk ?? 0) * weights.risk;
    ambiguity += (rule.ambiguity ?? 0) * weights.ambiguity;
    scope += (rule.scope ?? 0) * weights.scope;
    if (rule.typeHint) {
      typeVotes.set(
        rule.typeHint,
        (typeVotes.get(rule.typeHint) ?? 0) + (rule.typeWeight ?? 1)
      );
    }
    if (rule.safetyFlag) safetyFlags.add(rule.safetyFlag);
    reasons.push(rule.reason);
  }

  // Determine task type from votes.
  const { type: taskType, top, second } = pickType(typeVotes, text);

  // Weak length nudge (capped) — never the dominant complexity driver.
  const wordCount = text.split(' ').filter(Boolean).length;
  if (wordCount > 60) complexity += 0.5;
  if (wordCount < 6 && !TRIVIAL_TYPES.has(taskType)) ambiguity += 1.5;

  // Debugging with no concrete detail (no path, code fence, or error text) is
  // inherently more ambiguous and more complex (unknown root cause).
  const hasConcreteDetail =
    /[\\/]\w+\.\w+/.test(text) ||
    /`[^`]+`/.test(prompt) ||
    /\berror:|exception|line \d+/i.test(text);
  if (taskType === 'debugging' && !hasConcreteDetail) {
    ambiguity += 2;
    complexity += 2;
    reasons.push('Debugging request without a concrete reproduction or location.');
  }

  // Baselines so non-trivial coding work is not scored at zero complexity.
  if (!TRIVIAL_TYPES.has(taskType)) complexity += 2;

  const finalComplexity = clamp(complexity);
  const finalRisk = clamp(risk);
  const finalAmbiguity = clamp(ambiguity);

  const estimatedScope = deriveScope(scope, taskType);
  const confidence = deriveConfidence(matchedSignals.length, top, second, taskType);

  return {
    taskType,
    taskSubtype: deriveSubtype(taskType, matchedSignals),
    complexityScore: round1(finalComplexity),
    riskScore: round1(finalRisk),
    ambiguityScore: round1(finalAmbiguity),
    estimatedScope,
    reasons: dedupe(reasons),
    matchedSignals,
    safetyFlags: [...safetyFlags],
    confidence,
  };
}

function pickType(
  votes: Map<TaskType, number>,
  text: string
): { type: TaskType; top: number; second: number } {
  if (votes.size === 0) {
    return { type: CODE_HINT.test(text) ? 'code-edit' : 'other', top: 0, second: 0 };
  }
  const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0]!;
  const second = sorted[1]?.[1] ?? 0;
  return { type: top[0], top: top[1], second };
}

function deriveScope(scopeAcc: number, type: TaskType): EstimatedScope {
  if (scopeAcc >= 5) return 'cross-cutting';
  if (scopeAcc >= 2) return 'multi-file';
  if (TRIVIAL_TYPES.has(type) && scopeAcc === 0) return 'single-line';
  return 'single-file';
}

function deriveConfidence(
  matches: number,
  top: number,
  second: number,
  type: TaskType
): number {
  if (matches === 0) return 0.35;
  const decisiveness = top > 0 ? (top - second) / top : 0;
  let c = 0.45 + Math.min(0.2, matches * 0.04) + decisiveness * 0.2;
  if (type === 'other') c -= 0.15;
  return round2(clamp(c, 0, 0.95));
}

function deriveSubtype(type: TaskType, signals: string[]): string {
  if (signals.includes('risk-destructive')) return `${type}/destructive`;
  if (signals.includes('risk-production')) return `${type}/production`;
  if (signals.includes('concern-auth')) return `${type}/auth`;
  if (signals.includes('concern-performance')) return `${type}/performance`;
  if (signals.includes('scope-broad')) return `${type}/broad`;
  return type;
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
