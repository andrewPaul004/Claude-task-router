/**
 * Build a partial configuration layer from environment variables.
 *
 * A small set of common scalar overrides is supported for convenience, plus a
 * `CTR_CONFIG_JSON` escape hatch that merges an arbitrary JSON object — useful
 * in CI and other non-interactive environments without enumerating every key.
 */

function parseBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return undefined;
}

export function envConfigLayer(
  env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> {
  const layer: Record<string, unknown> = {};

  const enabled = parseBool(env.CTR_ENABLED);
  if (enabled !== undefined) layer.enabled = enabled;

  if (env.CTR_ROUTING_MODE) layer.routingMode = env.CTR_ROUTING_MODE;
  if (env.CTR_DEFAULT_MODEL) layer.defaultModel = env.CTR_DEFAULT_MODEL;
  if (env.CTR_FALLBACK_MODEL) layer.fallbackModel = env.CTR_FALLBACK_MODEL;
  if (env.CTR_MAX_EFFORT) layer.maximumEffort = env.CTR_MAX_EFFORT;
  if (env.CTR_TRANSPARENCY) layer.transparencyMode = env.CTR_TRANSPARENCY;
  if (env.CTR_OPTIMIZATION_MODE) layer.optimizationMode = env.CTR_OPTIMIZATION_MODE;

  if (env.CTR_ALLOWED_MODELS) {
    layer.allowedModels = env.CTR_ALLOWED_MODELS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const context = parseBool(env.CTR_REPO_CONTEXT);
  if (context !== undefined) layer.repositoryContext = { enabled: context };

  const llm = parseBool(env.CTR_LLM_CLASSIFIER);
  if (llm !== undefined) layer.classifier = { llmEnabled: llm };

  const telemetry = parseBool(env.CTR_TELEMETRY);
  if (telemetry !== undefined) layer.telemetry = { enabled: telemetry };

  if (env.CTR_LOG_LEVEL) {
    layer.logging = { enabled: true, level: env.CTR_LOG_LEVEL };
  }

  // Escape hatch: merge an arbitrary JSON object last so it wins over the
  // scalar env overrides above.
  if (env.CTR_CONFIG_JSON) {
    try {
      const parsed = JSON.parse(env.CTR_CONFIG_JSON);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...layer, ...(parsed as Record<string, unknown>) };
      }
    } catch {
      // Ignore malformed CTR_CONFIG_JSON rather than crashing.
    }
  }

  return layer;
}
