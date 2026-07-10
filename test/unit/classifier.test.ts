import { describe, it, expect } from 'vitest';
import { DefaultTaskClassifier } from '../../src/classifier/classifier.js';
import { scorePrompt } from '../../src/classifier/scoring.js';
import { fastPathClassify } from '../../src/classifier/fast-path.js';
import { analyzePrompt } from '../../src/pipeline.js';
import { defaultConfig } from '../../src/config/schema.js';

const config = defaultConfig();

describe('deterministic classification', () => {
  it('fast-paths trivial formatting with high confidence', () => {
    const s = fastPathClassify(
      'Convert these values into a comma-separated list',
      config
    );
    expect(s).not.toBeNull();
    expect(s!.taskType).toBe('formatting');
    expect(s!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(s!.riskScore).toBe(0);
  });

  it('declines the fast path for risky/broad prompts', () => {
    expect(fastPathClassify('Delete all production data now', config)).toBeNull();
  });

  it('classifies the canonical "Fix the login issue" as high-ambiguity debugging', () => {
    const s = scorePrompt('Fix the login issue', config);
    expect(s.taskType).toBe('debugging');
    expect(s.ambiguityScore).toBeGreaterThanOrEqual(6);
    expect(s.complexityScore).toBeGreaterThanOrEqual(6);
    expect(s.safetyFlags).toContain('auth-or-session');
  });

  it('scores destructive production work as high risk', () => {
    const s = scorePrompt('Drop the users table in production', config);
    expect(s.riskScore).toBeGreaterThanOrEqual(6);
    expect(s.safetyFlags).toContain('destructive-action');
    expect(s.safetyFlags).toContain('production-impact');
  });

  it('does not inflate complexity for long-but-simple prompts', () => {
    const long = `Please summarize the following text. ${'word '.repeat(120)}`;
    const s = scorePrompt(long, config);
    expect(s.complexityScore).toBeLessThanOrEqual(3);
  });

  it('keeps classification latency well under target', async () => {
    const classifier = new DefaultTaskClassifier();
    const c = await classifier.classify('Add validation to the signup form', config);
    expect(c.latencyMs).toBeLessThan(100);
  });

  it('caches equivalent classifications', async () => {
    const classifier = new DefaultTaskClassifier();
    const a = await classifier.classify('Refactor the payment module', config);
    const b = await classifier.classify('Refactor the payment module', config);
    // Cache hit returns the identical stored object.
    expect(b).toBe(a);
  });
});

describe('analyze pipeline preserves the original prompt', () => {
  it('never mutates the original prompt', async () => {
    const prompt = 'Fix the login issue';
    const analysis = await analyzePrompt(prompt, config);
    expect(analysis.originalPrompt).toBe(prompt);
    expect(analysis.optimizedPrompt.startsWith(prompt)).toBe(true);
  });

  it('produces a schema-valid analysis with all fields', async () => {
    const analysis = await analyzePrompt('Add a rate limiter to the API', config);
    expect(analysis.recommendedModel).toBeTruthy();
    expect(analysis.recommendedModelTier).toBeTruthy();
    expect(['low', 'medium', 'high', 'xhigh', 'max']).toContain(
      analysis.recommendedEffort
    );
    expect(analysis.confidence).toBeGreaterThan(0);
    expect(analysis.confidence).toBeLessThanOrEqual(1);
  });
});
