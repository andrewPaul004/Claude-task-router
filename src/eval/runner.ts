import type { Config } from '../config/schema.js';
import type { ModelTier, TaskAnalysis } from '../types/analysis.js';
import { analyzePrompt } from '../pipeline.js';
import { FIXTURES, type Fixture } from './fixtures.js';

const TIER_INDEX: Record<ModelTier, number> = { fast: 0, balanced: 1, deep: 2 };

export interface FixtureResult {
  fixture: Fixture;
  analysis: TaskAnalysis;
  tierOk: boolean;
  effortOk: boolean;
  riskOk: boolean;
  complexityOk: boolean;
  contextOk: boolean;
  clarifyOk: boolean;
  overRouted: boolean;
  underRouted: boolean;
}

export interface EvalReport {
  total: number;
  routingAgreement: number;
  overRoutingRate: number;
  underRoutingRate: number;
  effortAgreement: number;
  riskAccuracy: number;
  complexityAccuracy: number;
  avgConfidence: number;
  avgLatencyMs: number;
  misclassified: Array<{
    id: string;
    prompt: string;
    expected: ModelTier[];
    got: ModelTier;
  }>;
  results: FixtureResult[];
}

function inRange(v: number, [lo, hi]: [number, number]): boolean {
  return v >= lo && v <= hi;
}

export async function runEval(
  baseConfig: Config,
  fixtures: Fixture[] = FIXTURES
): Promise<EvalReport> {
  // The eval measures the classifier + router BASELINE. It therefore:
  //  - never uses paid model calls (LLM classifier off), and
  //  - neutralizes the cost/quality/latency preference overlay, so a user's
  //    cost-saving or quality-first profile does not skew the baseline the
  //    fixtures encode. (Preference nudges are covered by unit tests.)
  const config: Config = {
    ...baseConfig,
    classifier: { ...baseConfig.classifier, llmEnabled: false },
    costPreference: 'medium',
    qualityPreference: 'medium',
    latencyPreference: 'medium',
  };

  const results: FixtureResult[] = [];
  for (const fixture of fixtures) {
    const analysis = await analyzePrompt(fixture.prompt, config);
    const actualIdx = TIER_INDEX[analysis.recommendedModelTier];
    const acceptableIdx = fixture.tiers.map((t) => TIER_INDEX[t]);
    const minIdx = Math.min(...acceptableIdx);
    const maxIdx = Math.max(...acceptableIdx);

    results.push({
      fixture,
      analysis,
      tierOk: fixture.tiers.includes(analysis.recommendedModelTier),
      effortOk: fixture.efforts.includes(analysis.recommendedEffort),
      riskOk: inRange(analysis.riskScore, fixture.risk),
      complexityOk: inRange(analysis.complexityScore, fixture.complexity),
      contextOk:
        fixture.expectContext === null ||
        fixture.expectContext === analysis.shouldUseRepositoryContext,
      clarifyOk:
        fixture.expectClarify === null ||
        fixture.expectClarify === analysis.shouldAskClarifyingQuestion,
      overRouted: actualIdx > maxIdx,
      underRouted: actualIdx < minIdx,
    });
  }

  const n = results.length || 1;
  const rate = (pred: (r: FixtureResult) => boolean): number =>
    results.filter(pred).length / n;

  return {
    total: results.length,
    routingAgreement: rate((r) => r.tierOk),
    overRoutingRate: rate((r) => r.overRouted),
    underRoutingRate: rate((r) => r.underRouted),
    effortAgreement: rate((r) => r.effortOk),
    riskAccuracy: rate((r) => r.riskOk),
    complexityAccuracy: rate((r) => r.complexityOk),
    avgConfidence: results.reduce((a, r) => a + r.analysis.confidence, 0) / n,
    avgLatencyMs: results.reduce((a, r) => a + r.analysis.latencyMs, 0) / n,
    misclassified: results
      .filter((r) => !r.tierOk)
      .map((r) => ({
        id: r.fixture.id,
        prompt: r.fixture.prompt,
        expected: r.fixture.tiers,
        got: r.analysis.recommendedModelTier,
      })),
    results,
  };
}
