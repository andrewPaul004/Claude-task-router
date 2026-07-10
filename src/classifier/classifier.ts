import type { Config } from '../config/schema.js';
import type {
  Classification,
  ClassificationSource,
  ScoredSignals,
} from '../types/analysis.js';
import { LruCache, cacheKey } from '../cache/cache.js';
import { noopLogger, type Logger } from '../logging/logger.js';
import { fastPathClassify } from './fast-path.js';
import { scorePrompt } from './scoring.js';
import { deriveClassification } from './derive.js';
import { llmClassify, type LlmClassifyDeps } from './llm.js';

export interface TaskClassifier {
  classify(prompt: string, config: Config, deps?: ClassifyDeps): Promise<Classification>;
}

export interface ClassifyDeps {
  llm?: LlmClassifyDeps;
  logger?: Logger;
  signal?: AbortSignal;
  now?: () => number;
}

function fingerprint(config: Config): string {
  // Only classification-relevant config participates in the cache key.
  return JSON.stringify({
    s: config.scoring,
    t: config.classificationThresholds,
    c: config.costPreference,
    q: config.qualityPreference,
    l: config.latencyPreference,
    rc: config.repositoryContext.enabled,
    cf: config.confirmationMode,
    llm: config.classifier.llmEnabled,
  });
}

/** Merge an LLM classification over the deterministic base signals. */
function mergeLlm(
  base: ScoredSignals,
  llm: NonNullable<Awaited<ReturnType<typeof llmClassify>>>
): ScoredSignals {
  return {
    taskType: llm.taskType,
    taskSubtype: llm.taskSubtype || llm.taskType,
    complexityScore: llm.complexityScore,
    riskScore: Math.max(llm.riskScore, base.riskScore),
    ambiguityScore: llm.ambiguityScore,
    estimatedScope: llm.estimatedScope,
    reasons: [...new Set([...llm.reasons, ...base.reasons])].slice(0, 8),
    matchedSignals: [...base.matchedSignals, 'llm'],
    // Never let the LLM drop a deterministic safety flag.
    safetyFlags: [...new Set(base.safetyFlags)],
    confidence: Math.max(llm.confidence, base.confidence),
  };
}

export class DefaultTaskClassifier implements TaskClassifier {
  private readonly cache: LruCache<Classification>;

  constructor(cache?: LruCache<Classification>) {
    this.cache = cache ?? new LruCache<Classification>(200, 15 * 60 * 1000);
  }

  async classify(
    prompt: string,
    config: Config,
    deps: ClassifyDeps = {}
  ): Promise<Classification> {
    const logger = deps.logger ?? noopLogger();
    const now = deps.now ?? (() => performance.now());
    const start = now();

    const key = cacheKey(prompt, fingerprint(config));
    if (config.cache.enabled) {
      const hit = this.cache.get(key);
      if (hit) {
        logger.debug('classification cache hit', { source: hit.classificationSource });
        return hit;
      }
    }

    let signals = fastPathClassify(prompt, config);
    let source: ClassificationSource = 'fast-path';
    if (!signals) {
      signals = scorePrompt(prompt, config);
      source = 'scoring';
    }

    if (
      signals.confidence < config.classificationThresholds.llmConfidenceFloor &&
      config.classifier.llmEnabled
    ) {
      try {
        const llmDeps: LlmClassifyDeps = { ...(deps.llm ?? {}) };
        if (deps.signal !== undefined) llmDeps.signal = deps.signal;
        const llm = await llmClassify(prompt, config, llmDeps);
        if (llm) {
          signals = mergeLlm(signals, llm);
          source = 'llm';
          logger.debug('llm classifier applied');
        }
      } catch (err) {
        logger.warn('llm classifier failed; using deterministic result', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const latencyMs = Math.max(0, now() - start);
    const classification = deriveClassification(signals, config, {
      originalPrompt: prompt,
      source,
      latencyMs,
    });

    if (config.cache.enabled) this.cache.set(key, classification);
    return classification;
  }
}

export function createClassifier(): DefaultTaskClassifier {
  return new DefaultTaskClassifier();
}
