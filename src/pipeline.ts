import type { Config } from './config/schema.js';
import { type TaskAnalysis, TaskAnalysisSchema } from './types/analysis.js';
import {
  DefaultTaskClassifier,
  type ClassifyDeps,
  type TaskClassifier,
} from './classifier/classifier.js';
import { DefaultModelRouter, type ModelRouter } from './router/router.js';
import { DefaultPromptOptimizer, type PromptOptimizer } from './optimizer/optimizer.js';
import { ModelRegistry } from './models/registry.js';

/**
 * The analysis engine: classify → route → optimize, assembled into one
 * schema-validated {@link TaskAnalysis}. Used by every CLI command and by the
 * hook. Components are injectable so they can be tested and swapped
 * independently (the classifier is not coupled to routing or execution).
 */

export interface AnalyzeDeps {
  classifier?: TaskClassifier;
  router?: ModelRouter;
  optimizer?: PromptOptimizer;
  classify?: ClassifyDeps;
}

let sharedClassifier: DefaultTaskClassifier | null = null;

export async function analyzePrompt(
  prompt: string,
  config: Config,
  deps: AnalyzeDeps = {}
): Promise<TaskAnalysis> {
  const registry = new ModelRegistry();
  const classifier =
    deps.classifier ?? (sharedClassifier ??= new DefaultTaskClassifier());
  const router = deps.router ?? new DefaultModelRouter(registry);
  const optimizer = deps.optimizer ?? new DefaultPromptOptimizer();

  const classification = await classifier.classify(prompt, config, deps.classify);
  const decision = router.route(classification, config);
  const optimized = optimizer.optimize(classification, config);

  const reasons = [...classification.reasons, ...decision.reasons].slice(0, 12);

  const analysis: TaskAnalysis = {
    ...classification,
    reasons,
    recommendedModelTier: decision.recommendedModelTier,
    recommendedModel: decision.recommendedModel,
    recommendedEffort: decision.recommendedEffort,
    optimizedPrompt: optimized.optimizedPrompt,
  };

  // Validate the assembled analysis; throws only on a genuine internal bug.
  return TaskAnalysisSchema.parse(analysis);
}
