import { describe, it, expect } from 'vitest';
import { ModelRegistry } from '../../src/models/registry.js';

describe('ModelRegistry', () => {
  const reg = new ModelRegistry();

  it('resolves known aliases to their tier', () => {
    expect(reg.tierOf('haiku')).toBe('fast');
    expect(reg.tierOf('sonnet')).toBe('balanced');
    expect(reg.tierOf('opus')).toBe('deep');
  });

  it('passes through unknown aliases safely (never throws)', () => {
    const d = reg.resolve('claude-brand-new-9');
    expect(d.known).toBe(false);
    expect(d.tier).toBe('balanced');
    expect(d.resolvedModel).toBe('claude-brand-new-9');
    expect(d.recommendedEfforts.length).toBeGreaterThan(0);
  });

  it('picks a model in the requested tier when allowed', () => {
    const d = reg.pickForTier('deep', ['haiku', 'sonnet', 'opus'], 'sonnet', 'sonnet');
    expect(d.alias).toBe('opus');
  });

  it('prefers the configured default when it is in the tier', () => {
    const d = reg.pickForTier('balanced', ['sonnet', 'fable'], 'fable', 'sonnet');
    expect(d.alias).toBe('fable');
  });

  it('degrades gracefully when no model exists in the tier', () => {
    const d = reg.pickForTier('deep', ['haiku'], 'haiku', 'haiku');
    expect(d.alias).toBe('haiku');
  });
});
