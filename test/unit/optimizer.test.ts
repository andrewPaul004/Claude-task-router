import { describe, it, expect } from 'vitest';
import { DefaultPromptOptimizer } from '../../src/optimizer/optimizer.js';
import { analyzePrompt } from '../../src/pipeline.js';
import { defaultConfig } from '../../src/config/schema.js';
import type { Classification } from '../../src/types/analysis.js';

function classification(partial: Partial<Classification>): Classification {
  return {
    originalPrompt: partial.originalPrompt ?? 'do something',
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

const optimizer = new DefaultPromptOptimizer();
const config = defaultConfig();

describe('prompt optimization', () => {
  it('leaves trivial prompts nearly unchanged', () => {
    const c = classification({
      originalPrompt: 'Convert to CSV',
      taskType: 'formatting',
      complexityScore: 1,
      riskScore: 0,
      contextRequirement: 'none',
      shouldUseRepositoryContext: false,
    });
    const r = optimizer.optimize(c, config);
    expect(r.changed).toBe(false);
    expect(r.optimizedPrompt).toBe('Convert to CSV');
  });

  it('adds concise guidance for routine coding work but preserves the original', () => {
    const c = classification({ originalPrompt: 'Add validation to the signup form' });
    const r = optimizer.optimize(c, config);
    expect(r.changed).toBe(true);
    expect(r.optimizedPrompt.startsWith('Add validation to the signup form')).toBe(true);
    expect(r.optimizedPrompt).toMatch(/tests/i);
  });

  it('adds safety guidance for high-risk work', () => {
    const c = classification({
      originalPrompt: 'Delete production data',
      taskType: 'debugging',
      riskScore: 8,
      safetyFlags: ['destructive-action', 'production-impact'],
      shouldPlanBeforeExecution: true,
    });
    const r = optimizer.optimize(c, config);
    expect(r.optimizedPrompt).toMatch(/approval|rollback|destructive/i);
    expect(r.optimizedPrompt).toMatch(/production/i);
  });

  it('respects optimizationMode=off', () => {
    const r = optimizer.optimize(classification({ originalPrompt: 'Fix the bug' }), {
      ...config,
      optimizationMode: 'off',
    });
    expect(r.changed).toBe(false);
    expect(r.optimizedPrompt).toBe('Fix the bug');
  });

  it('labels invented specifics as assumptions, never requirements', () => {
    const c = classification({
      originalPrompt: 'Fix the login issue',
      taskType: 'debugging',
      ambiguityScore: 8,
      assumptions: ['The affected code exists in this repository.'],
    });
    const r = optimizer.optimize(c, config);
    expect(r.optimizedPrompt).toMatch(/Assumptions/);
  });
});

describe('optimize via full pipeline', () => {
  it('preserves the original prompt verbatim at the top', async () => {
    const a = await analyzePrompt(
      'Refactor the auth module to reduce duplication',
      config
    );
    expect(
      a.optimizedPrompt.startsWith('Refactor the auth module to reduce duplication')
    ).toBe(true);
  });
});
