import { describe, it, expect } from 'vitest';
import { DefaultModelRouter } from '../../src/router/router.js';
import { defaultConfig, type Config } from '../../src/config/schema.js';
import type { Classification } from '../../src/types/analysis.js';

function classification(partial: Partial<Classification>): Classification {
  return {
    originalPrompt: 'x',
    taskType: 'feature',
    taskSubtype: 'feature',
    complexityScore: 4,
    riskScore: 2,
    ambiguityScore: 2,
    contextRequirement: 'moderate',
    estimatedScope: 'single-file',
    autonomyRequirement: 'medium',
    accuracyRequirement: 'medium',
    latencySensitivity: 'medium',
    costSensitivity: 'medium',
    confidence: 0.7,
    reasons: [],
    missingInformation: [],
    assumptions: [],
    shouldAskClarifyingQuestion: false,
    shouldPlanBeforeExecution: false,
    shouldUseSubagents: false,
    shouldUseRepositoryContext: true,
    shouldRequireConfirmation: false,
    safetyFlags: [],
    classificationSource: 'scoring',
    latencyMs: 1,
    ...partial,
  };
}

const router = new DefaultModelRouter();

describe('model selection', () => {
  it('routes trivial formatting to the fast tier', () => {
    const d = router.route(
      classification({ taskType: 'formatting', complexityScore: 1, riskScore: 0 }),
      defaultConfig()
    );
    expect(d.recommendedModelTier).toBe('fast');
    expect(d.recommendedModel).toBe('haiku');
  });

  it('routes routine feature work to the balanced tier', () => {
    const d = router.route(
      classification({ taskType: 'feature', complexityScore: 4 }),
      defaultConfig()
    );
    expect(d.recommendedModelTier).toBe('balanced');
    expect(d.recommendedModel).toBe('sonnet');
  });

  it('routes architecture to the deep tier', () => {
    const d = router.route(
      classification({
        taskType: 'architecture',
        complexityScore: 8,
        estimatedScope: 'cross-cutting',
      }),
      defaultConfig()
    );
    expect(d.recommendedModelTier).toBe('deep');
    expect(d.recommendedModel).toBe('opus');
  });

  it('escalates one tier on high risk', () => {
    const d = router.route(
      classification({ taskType: 'feature', complexityScore: 4, riskScore: 8 }),
      defaultConfig()
    );
    expect(d.recommendedModelTier).toBe('deep');
  });

  it('never routes to a disallowed model', () => {
    const cfg: Config = { ...defaultConfig(), allowedModels: ['haiku', 'sonnet'] };
    const d = router.route(
      classification({ taskType: 'architecture', complexityScore: 9, riskScore: 8 }),
      cfg
    );
    expect(cfg.allowedModels).toContain(d.recommendedModel);
    expect(d.recommendedModel).toBe('sonnet'); // best available (no deep model allowed)
  });

  it('does not pick deep merely because the prompt is long/complex without risk', () => {
    const d = router.route(
      classification({
        taskType: 'feature',
        complexityScore: 6,
        riskScore: 1,
        estimatedScope: 'single-file',
      }),
      defaultConfig()
    );
    expect(d.recommendedModelTier).not.toBe('deep');
  });
});

describe('effort selection', () => {
  it('caps effort at the configured maximum', () => {
    const cfg: Config = { ...defaultConfig(), maximumEffort: 'low' };
    const d = router.route(
      classification({ taskType: 'architecture', complexityScore: 10, riskScore: 9 }),
      cfg
    );
    expect(d.recommendedEffort).toBe('low');
  });

  it('uses low effort for the fast tier', () => {
    const d = router.route(
      classification({ taskType: 'formatting', complexityScore: 1, riskScore: 0 }),
      defaultConfig()
    );
    expect(d.recommendedEffort).toBe('low');
  });

  it('raises effort for critical-accuracy deep work', () => {
    const d = router.route(
      classification({
        taskType: 'security',
        complexityScore: 9,
        riskScore: 8,
        accuracyRequirement: 'critical',
        safetyFlags: ['security-sensitive'],
      }),
      { ...defaultConfig(), maximumEffort: 'max' }
    );
    expect(['high', 'xhigh', 'max']).toContain(d.recommendedEffort);
  });
});
