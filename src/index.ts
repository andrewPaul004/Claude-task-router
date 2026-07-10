/**
 * Public programmatic API for claude-task-router.
 *
 * The CLI is the primary interface, but the core engine is exported so it can
 * be embedded or tested directly.
 */

export * from './types/analysis.js';
export {
  ConfigSchema,
  defaultConfig,
  CURRENT_CONFIG_SCHEMA_VERSION,
} from './config/schema.js';
export type { Config } from './config/schema.js';
export { loadConfig, findProjectRoot } from './config/store.js';
export type { ResolvedConfig } from './config/store.js';

export { analyzePrompt } from './pipeline.js';
export type { AnalyzeDeps } from './pipeline.js';

export { DefaultTaskClassifier, createClassifier } from './classifier/classifier.js';
export type { TaskClassifier } from './classifier/classifier.js';
export { DefaultModelRouter, createRouter } from './router/router.js';
export type { ModelRouter } from './router/router.js';
export { DefaultPromptOptimizer, createOptimizer } from './optimizer/optimizer.js';
export type { PromptOptimizer, OptimizeResult } from './optimizer/optimizer.js';
export { DefaultContextCollector, createContextCollector } from './context/collector.js';
export type { ContextCollector, RepositoryContext } from './context/collector.js';

export { ModelRegistry, createModelRegistry } from './models/registry.js';
export type { ModelDescriptor } from './models/registry.js';

export { SecretRedactor, createRedactor } from './security/redactor.js';

export { ClaudeCliAdapter, ROUTER_ACTIVE_ENV } from './sdk/adapter.js';
export type { ExecutionAdapter, ExecutionPlan } from './sdk/adapter.js';
export { getClaudeInfo } from './sdk/detect.js';
export type { ClaudeInfo, ClaudeCapabilities } from './sdk/detect.js';

export { runUserPromptSubmitHook } from './hooks/user-prompt-submit.js';
export { UserPromptSubmitAdapter } from './hooks/adapter.js';

export { InstallManager, createInstallManager } from './install/manager.js';
export { runWrapper } from './executor/executor.js';
export { productVersion } from './version.js';
