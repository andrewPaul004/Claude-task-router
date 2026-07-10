import type { Config } from '../config/schema.js';
import {
  type Classification,
  type EffortLevel,
  EFFORT_LEVELS,
  type ModelTier,
  MODEL_TIERS,
  type RoutingDecision,
} from '../types/analysis.js';
import { ModelRegistry } from '../models/registry.js';

export interface ModelRouter {
  route(classification: Classification, config: Config): RoutingDecision;
}

const TIER_INDEX: Record<ModelTier, number> = { fast: 0, balanced: 1, deep: 2 };
const TIER_BY_INDEX = MODEL_TIERS;

function effortIndex(e: EffortLevel): number {
  return EFFORT_LEVELS.indexOf(e);
}
function effortAt(i: number): EffortLevel {
  return EFFORT_LEVELS[Math.max(0, Math.min(EFFORT_LEVELS.length - 1, i))]!;
}
function clampEffort(e: EffortLevel, min: EffortLevel, max: EffortLevel): EffortLevel {
  return effortAt(Math.max(effortIndex(min), Math.min(effortIndex(max), effortIndex(e))));
}

/**
 * Default router.
 *
 * Selects a tier from a blended signal score, tier hints, and risk escalation;
 * nudges by cost/quality/latency preference only near thresholds; then maps the
 * tier to an allowed model and an effort level bounded by the model's envelope
 * and the configured maximum effort. All policy comes from `config.routingRules`
 * and `config.scoring` — nothing is hard-coded here.
 */
export class DefaultModelRouter implements ModelRouter {
  constructor(private readonly registry: ModelRegistry = new ModelRegistry()) {}

  route(c: Classification, config: Config): RoutingDecision {
    const rules = config.routingRules;
    const reasons: string[] = [];

    const blend = 0.55 * c.complexityScore + 0.35 * c.riskScore + 0.1 * c.ambiguityScore;

    // Base tier from blended score.
    let tierIdx =
      blend >= rules.tierThresholds.deep
        ? TIER_INDEX.deep
        : blend >= rules.tierThresholds.balanced
          ? TIER_INDEX.balanced
          : TIER_INDEX.fast;
    reasons.push(
      `Blended score ${blend.toFixed(1)} → ${TIER_BY_INDEX[tierIdx]} tier ` +
        `(balanced ≥ ${rules.tierThresholds.balanced}, deep ≥ ${rules.tierThresholds.deep}).`
    );

    // Type hint can raise the tier.
    const hint = rules.typeTierHints[c.taskType];
    if (hint && TIER_INDEX[hint] > tierIdx) {
      tierIdx = TIER_INDEX[hint];
      reasons.push(`Task type "${c.taskType}" hints the ${hint} tier.`);
    }

    // Risk escalation.
    if (
      rules.riskEscalation &&
      c.riskScore >= rules.riskEscalationThreshold &&
      tierIdx < TIER_INDEX.deep
    ) {
      tierIdx += 1;
      reasons.push(
        `Risk ${c.riskScore} ≥ ${rules.riskEscalationThreshold} escalates one tier.`
      );
    }

    // Cross-cutting scope escalates one tier (broad blast radius warrants care).
    if (c.estimatedScope === 'cross-cutting' && tierIdx < TIER_INDEX.deep) {
      tierIdx += 1;
      reasons.push('Cross-cutting scope escalates one tier.');
    }

    // Critical accuracy floor.
    if (c.accuracyRequirement === 'critical' && tierIdx < TIER_INDEX.balanced) {
      tierIdx = TIER_INDEX.balanced;
      reasons.push('Critical accuracy requirement raises tier to at least balanced.');
    }

    // Preference nudges, only near a threshold and never for risky work.
    const safeToDemote =
      c.riskScore < rules.riskEscalationThreshold &&
      c.accuracyRequirement !== 'critical' &&
      c.safetyFlags.length === 0;
    if (
      (config.costPreference === 'high' || config.latencyPreference === 'high') &&
      safeToDemote &&
      tierIdx > TIER_INDEX.fast &&
      blend <= thresholdFor(tierIdx, rules) + 1
    ) {
      tierIdx -= 1;
      reasons.push('Cost/latency preference demotes one tier near the boundary.');
    } else if (
      config.qualityPreference === 'high' &&
      tierIdx < TIER_INDEX.deep &&
      blend >= thresholdFor(tierIdx + 1, rules) - 1
    ) {
      tierIdx += 1;
      reasons.push('Quality preference promotes one tier near the boundary.');
    }

    // Map to an allowed tier that actually has a model.
    const desiredTier = TIER_BY_INDEX[tierIdx]!;
    const { tier, model } = this.resolveModel(desiredTier, config, reasons);

    // Effort selection.
    const effort = this.resolveEffort(tier, c, config, reasons);

    return {
      recommendedModelTier: tier,
      recommendedModel: model,
      recommendedEffort: effort,
      reasons,
    };
  }

  private resolveModel(
    desired: ModelTier,
    config: Config,
    reasons: string[]
  ): { tier: ModelTier; model: string } {
    const order = tierSearchOrder(TIER_INDEX[desired]);
    for (const idx of order) {
      const t = TIER_BY_INDEX[idx]!;
      const inTier = this.registry.allowedInTier(t, config.allowedModels);
      if (inTier.length > 0) {
        const picked = this.registry.pickForTier(
          t,
          config.allowedModels,
          config.defaultModel,
          config.fallbackModel
        );
        if (t !== desired) {
          reasons.push(
            `No allowed model in ${desired} tier; using ${t} tier (${picked.alias}).`
          );
        }
        return { tier: t, model: picked.alias };
      }
    }
    // Nothing allowed anywhere — fall back safely.
    reasons.push(
      `No allowed models configured for any tier; using fallback "${config.fallbackModel}".`
    );
    return {
      tier: this.registry.tierOf(config.fallbackModel),
      model: config.fallbackModel,
    };
  }

  private resolveEffort(
    tier: ModelTier,
    c: Classification,
    config: Config,
    reasons: string[]
  ): EffortLevel {
    let idx = effortIndex(config.routingRules.effortByTier[tier]);

    if (tier === 'deep' && c.complexityScore >= 9) {
      idx += 1;
      reasons.push('Very high complexity raises effort within the deep tier.');
    }
    if (tier === 'fast' && c.complexityScore <= 2) {
      idx = effortIndex('low');
    }
    if (c.accuracyRequirement === 'critical') {
      idx += 1;
      reasons.push('Critical accuracy raises effort.');
    }
    if (c.latencySensitivity === 'high' && c.riskScore < 4) {
      idx -= 1;
      reasons.push('High latency sensitivity lowers effort for low-risk work.');
    }

    let effort = effortAt(idx);

    // Bound by the model's recommended envelope.
    const model = this.registry.resolve(
      this.registry.pickForTier(
        tier,
        config.allowedModels,
        config.defaultModel,
        config.fallbackModel
      ).alias
    );
    const envelope = model.recommendedEfforts;
    if (envelope.length > 0) {
      const min = envelope[0]!;
      const max = envelope[envelope.length - 1]!;
      const bounded = clampEffort(effort, min, max);
      if (bounded !== effort) {
        reasons.push(`Effort bounded to ${model.label}'s range (${min}–${max}).`);
        effort = bounded;
      }
    }

    // Bound by the configured maximum effort.
    if (effortIndex(effort) > effortIndex(config.maximumEffort)) {
      reasons.push(`Effort capped at configured maximum (${config.maximumEffort}).`);
      effort = config.maximumEffort;
    }
    return effort;
  }
}

function thresholdFor(tierIdx: number, rules: Config['routingRules']): number {
  if (tierIdx >= TIER_INDEX.deep) return rules.tierThresholds.deep;
  if (tierIdx >= TIER_INDEX.balanced) return rules.tierThresholds.balanced;
  return 0;
}

/** Search order preferring the desired tier, then higher, then lower. */
function tierSearchOrder(desired: number): number[] {
  const order: number[] = [desired];
  for (let up = desired + 1; up <= 2; up++) order.push(up);
  for (let down = desired - 1; down >= 0; down--) order.push(down);
  return order;
}

export function createRouter(): DefaultModelRouter {
  return new DefaultModelRouter();
}
