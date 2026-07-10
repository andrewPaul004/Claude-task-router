import type { EffortLevel, ModelTier } from '../types/analysis.js';

/**
 * Model registry.
 *
 * Routing works in terms of *aliases* ("haiku", "sonnet", "opus"), never
 * pinned concrete model ids. The alias is what we pass to `claude --model`,
 * and Claude Code resolves it to the latest concrete model. This is
 * deliberate: when Anthropic ships a new model, the alias keeps working and
 * nothing in this product needs to change.
 *
 * `exampleConcreteId` is informational only (shown by `ctr models`) and is
 * allowed to go stale — it is never sent anywhere or used for routing.
 *
 * Unknown aliases (e.g. a brand-new model a user configures before we know
 * about it) resolve to a safe synthetic descriptor rather than failing.
 */

export interface ModelDescriptor {
  alias: string;
  tier: ModelTier;
  label: string;
  /** Value passed to `claude --model`; resolved to latest by Claude Code. */
  resolvedModel: string;
  /** Informational example of a concrete id in this family. May be stale. */
  exampleConcreteId?: string;
  /** Recommended effort envelope for this tier (not a hard capability claim). */
  recommendedEfforts: EffortLevel[];
  description: string;
  /** Whether this is one of the built-in known aliases. */
  known: boolean;
}

const BUILTINS: ModelDescriptor[] = [
  {
    alias: 'haiku',
    tier: 'fast',
    label: 'Haiku',
    resolvedModel: 'haiku',
    exampleConcreteId: 'claude-haiku-4-5',
    recommendedEfforts: ['low', 'medium'],
    description: 'Fast, low-cost model for mechanical and clearly-specified work.',
    known: true,
  },
  {
    alias: 'sonnet',
    tier: 'balanced',
    label: 'Sonnet',
    resolvedModel: 'sonnet',
    exampleConcreteId: 'claude-sonnet-5',
    recommendedEfforts: ['low', 'medium', 'high', 'xhigh'],
    description: 'Balanced default for most software development work.',
    known: true,
  },
  {
    alias: 'opus',
    tier: 'deep',
    label: 'Opus',
    resolvedModel: 'opus',
    exampleConcreteId: 'claude-opus-4-8',
    recommendedEfforts: ['medium', 'high', 'xhigh', 'max'],
    description: 'Deep-reasoning model for architecture, security, and high-risk work.',
    known: true,
  },
  {
    alias: 'fable',
    tier: 'balanced',
    label: 'Fable',
    resolvedModel: 'fable',
    exampleConcreteId: 'claude-fable-5',
    recommendedEfforts: ['low', 'medium', 'high', 'xhigh'],
    description: 'Alternative balanced-tier model; enable via allowedModels.',
    known: true,
  },
];

export class ModelRegistry {
  private readonly byAlias = new Map<string, ModelDescriptor>();

  constructor(extra: ModelDescriptor[] = []) {
    for (const d of [...BUILTINS, ...extra]) {
      this.byAlias.set(d.alias.toLowerCase(), d);
    }
  }

  /** List all known/built-in descriptors. */
  all(): ModelDescriptor[] {
    return [...this.byAlias.values()];
  }

  has(alias: string): boolean {
    return this.byAlias.has(alias.toLowerCase());
  }

  /**
   * Resolve an alias to a descriptor. Unknown aliases return a safe synthetic
   * descriptor (balanced tier, full effort envelope) so new models never break
   * routing.
   */
  resolve(alias: string): ModelDescriptor {
    const found = this.byAlias.get(alias.toLowerCase());
    if (found) return found;
    return {
      alias,
      tier: 'balanced',
      label: alias,
      resolvedModel: alias,
      recommendedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      description: 'Custom or unrecognized model alias (passed through as-is).',
      known: false,
    };
  }

  tierOf(alias: string): ModelTier {
    return this.resolve(alias).tier;
  }

  /** Allowed models belonging to a given tier, in registry order. */
  allowedInTier(tier: ModelTier, allowed: string[]): ModelDescriptor[] {
    return allowed.map((a) => this.resolve(a)).filter((d) => d.tier === tier);
  }

  /**
   * Choose the best allowed model for a tier.
   * Preference order: an allowed model already in that tier → the configured
   * default (if allowed) → the fallback (if allowed) → the first allowed model.
   */
  pickForTier(
    tier: ModelTier,
    allowed: string[],
    defaultModel: string,
    fallbackModel: string
  ): ModelDescriptor {
    const inTier = this.allowedInTier(tier, allowed);
    if (inTier.length > 0) {
      // Prefer the configured default if it lives in this tier.
      const preferred = inTier.find((d) => d.alias === defaultModel.toLowerCase());
      return preferred ?? inTier[0]!;
    }
    // No allowed model in the requested tier; degrade gracefully.
    if (allowed.some((a) => a.toLowerCase() === defaultModel.toLowerCase())) {
      return this.resolve(defaultModel);
    }
    if (allowed.some((a) => a.toLowerCase() === fallbackModel.toLowerCase())) {
      return this.resolve(fallbackModel);
    }
    return this.resolve(allowed[0] ?? fallbackModel);
  }
}

export function createModelRegistry(): ModelRegistry {
  return new ModelRegistry();
}
