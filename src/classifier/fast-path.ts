import type { Config } from '../config/schema.js';
import type { ScoredSignals, TaskType } from '../types/analysis.js';
import { normalizePrompt } from './signals.js';

/**
 * Layer 1 — deterministic fast path.
 *
 * Returns a high-confidence classification for a small set of *obvious*
 * requests, so the pipeline never reaches for scoring nuance or the optional
 * LLM. Every trivial detector is guarded: if the prompt also carries risk,
 * broad scope, or destructive language, the fast path declines (returns null)
 * and the weighted scorer takes over.
 */

const HEAVY = [
  /\b(delete|drop|remove|destroy|wipe|truncate|purge|rm -rf|drop table)\b/i,
  /\b(production|prod|customers|payment|billing|pii|credentials|secret|security)\b/i,
  /\b(everywhere|entire|whole|codebase|system-wide|across|all files)\b/i,
  /\b(migrate|migration|refactor|architecture)\b/i,
];

function looksHeavy(text: string): boolean {
  return HEAVY.some((r) => r.test(text));
}

interface FastRule {
  id: string;
  type: TaskType;
  patterns: RegExp[];
  complexity: number;
  risk: number;
  ambiguity: number;
  scope: ScoredSignals['estimatedScope'];
  confidence: number;
  safetyFlags?: string[];
  reason: string;
  /** Skip this rule when heavy signals are present. */
  guardHeavy: boolean;
  maxWords?: number;
}

const RULES: FastRule[] = [
  {
    id: 'trivial-format',
    type: 'formatting',
    patterns: [
      /\b(format|reformat|indent|prettify)\b/i,
      /\bconvert\b.*\b(csv|json|list|yaml|table|comma[- ]separated)\b/i,
      /\bcomma[- ]separated\b/i,
      /\bto (uppercase|lowercase|title case)\b/i,
    ],
    complexity: 1,
    risk: 0,
    ambiguity: 1,
    scope: 'single-line',
    confidence: 0.9,
    reason: 'Mechanical formatting/conversion with no side effects.',
    guardHeavy: true,
    maxWords: 40,
  },
  {
    id: 'trivial-extract',
    type: 'extraction',
    patterns: [
      /\bextract\b.*\b(value|values|email|emails|url|urls|number|numbers|field|fields|name|names|date|dates|price|prices|data|text|entries)\b/i,
      /\bpull out\b/i,
      /\blist (all|the) (values|items|numbers|emails|urls)\b/i,
    ],
    complexity: 1,
    risk: 0,
    ambiguity: 1,
    scope: 'single-line',
    confidence: 0.85,
    reason: 'Straightforward extraction task.',
    guardHeavy: true,
    maxWords: 40,
  },
  {
    id: 'trivial-summary',
    type: 'summarization',
    patterns: [/\bsummari(ze|se)\b/i, /\btl;?dr\b/i, /\bgive me a (summary|recap)\b/i],
    complexity: 1,
    risk: 0,
    ambiguity: 1,
    scope: 'single-line',
    confidence: 0.88,
    reason: 'Summarization task.',
    guardHeavy: true,
    maxWords: 60,
  },
  {
    id: 'simple-explanation',
    type: 'explanation',
    patterns: [/\bwhat (is|are|does)\b/i, /\bexplain\b/i, /\bhow (does|do) \b/i],
    complexity: 2,
    risk: 0,
    ambiguity: 2,
    scope: 'single-file',
    confidence: 0.82,
    reason: 'Explanation request.',
    guardHeavy: true,
    maxWords: 40,
  },
  {
    id: 'code-search',
    type: 'code-search',
    patterns: [
      /\b(find|locate|search for|grep|where is|where are)\b/i,
      /\bwhich file\b/i,
    ],
    complexity: 2,
    risk: 0,
    ambiguity: 2,
    scope: 'multi-file',
    confidence: 0.82,
    reason: 'Locating code in the repository.',
    guardHeavy: true,
    maxWords: 30,
  },
  // Explicit heavy intents — these WANT the deep tier.
  {
    id: 'explicit-architecture',
    type: 'architecture',
    patterns: [
      /\barchitect(ure)?\b/i,
      /\bsystem design\b/i,
      /\bdesign (a|the) (system|architecture|service)\b/i,
    ],
    complexity: 8,
    risk: 5,
    ambiguity: 4,
    scope: 'cross-cutting',
    confidence: 0.85,
    reason: 'Explicit architecture/system-design request.',
    guardHeavy: false,
  },
  {
    id: 'explicit-security',
    type: 'security',
    patterns: [
      /\bsecurity (review|audit)\b/i,
      /\baudit\b.*\bvulnerab/i,
      /\bthreat model\b/i,
    ],
    complexity: 7,
    risk: 7,
    ambiguity: 3,
    scope: 'cross-cutting',
    confidence: 0.85,
    safetyFlags: ['security-sensitive'],
    reason: 'Explicit security review request.',
    guardHeavy: false,
  },
  {
    id: 'explicit-migration',
    type: 'migration',
    patterns: [
      /\bdatabase migration\b/i,
      /\bmigrat(e|ion)\b.*\b(from|to)\b/i,
      /\bport\b.*\bto\b/i,
    ],
    complexity: 7,
    risk: 6,
    ambiguity: 4,
    scope: 'cross-cutting',
    confidence: 0.8,
    safetyFlags: ['migration'],
    reason: 'Explicit migration request.',
    guardHeavy: false,
  },
];

export function fastPathClassify(prompt: string, config: Config): ScoredSignals | null {
  const text = normalizePrompt(prompt);
  const wordCount = text.split(' ').filter(Boolean).length;
  const heavy = looksHeavy(text);

  for (const rule of RULES) {
    if (rule.guardHeavy && heavy) continue;
    if (rule.maxWords !== undefined && wordCount > rule.maxWords) continue;
    if (!rule.patterns.some((p) => p.test(text))) continue;
    if (rule.confidence < config.classificationThresholds.fastPathMinConfidence) continue;

    return {
      taskType: rule.type,
      taskSubtype: rule.type,
      complexityScore: rule.complexity,
      riskScore: rule.risk,
      ambiguityScore: rule.ambiguity,
      estimatedScope: rule.scope,
      reasons: [rule.reason],
      matchedSignals: [`fast-path:${rule.id}`],
      safetyFlags: rule.safetyFlags ?? [],
      confidence: rule.confidence,
    };
  }
  return null;
}
