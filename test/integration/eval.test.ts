import { describe, it, expect } from 'vitest';
import { runEval } from '../../src/eval/runner.js';
import { FIXTURES } from '../../src/eval/fixtures.js';
import { defaultConfig } from '../../src/config/schema.js';

describe('evaluation suite', () => {
  it('has at least 50 fixtures across many categories', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(50);
    const categories = new Set(FIXTURES.map((f) => f.category));
    expect(categories.size).toBeGreaterThanOrEqual(15);
  });

  it('achieves high routing agreement with low over-routing', async () => {
    const report = await runEval(defaultConfig());
    expect(report.routingAgreement).toBeGreaterThanOrEqual(0.9);
    expect(report.overRoutingRate).toBeLessThanOrEqual(0.1);
    expect(report.effortAgreement).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies quickly (avg well under the 100ms target)', async () => {
    const report = await runEval(defaultConfig());
    expect(report.avgLatencyMs).toBeLessThan(50);
  });
});
