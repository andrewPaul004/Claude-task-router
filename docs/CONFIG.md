# Configuration reference

Configuration is JSON, validated against a versioned schema. Precedence (later
wins):

```text
CLI flags  >  environment variables  >  project config  >  user config  >  built-in defaults
```

- **User config:** OS config dir, e.g. `~/.config/claude-task-router/config.json`
  (macOS: `~/Library/Preferences/...`, Windows: `%APPDATA%\...`). Override the
  directory with `CTR_CONFIG_DIR`.
- **Project config:** `<repo>/.claude-task-router/config.json`.

Show effective config and paths:

```bash
claude-task-router config get
claude-task-router config path
```

## Top-level keys

| Key                 | Type                                | Default                     | Notes                                           |
| ------------------- | ----------------------------------- | --------------------------- | ----------------------------------------------- |
| `schemaVersion`     | number                              | `1`                         | Managed automatically; drives migrations.       |
| `enabled`           | boolean                             | `true`                      | Master switch.                                  |
| `installScope`      | `global\|project\|none`             | `none`                      | Recorded by the installer.                      |
| `routingMode`       | `auto\|recommend\|off`              | `auto`                      | `auto` applies flags; `recommend` only reports. |
| `defaultModelTier`  | `fast\|balanced\|deep`              | `balanced`                  |                                                 |
| `defaultModel`      | string (alias)                      | `sonnet`                    |                                                 |
| `fallbackModel`     | string (alias)                      | `sonnet`                    | Used when routing fails.                        |
| `allowedModels`     | string[]                            | `["haiku","sonnet","opus"]` | Router never picks outside this set.            |
| `maximumEffort`     | `low\|medium\|high\|xhigh\|max`     | `high`                      | Hard cap on recommended effort.                 |
| `optimizationMode`  | `auto\|show-first\|off`             | `auto`                      | Prompt handling.                                |
| `transparencyMode`  | `silent\|compact\|explain\|confirm` | `compact`                   | Wrapper display.                                |
| `confirmationMode`  | `never\|high-risk\|always`          | `high-risk`                 | When to pause for approval.                     |
| `costPreference`    | `low\|medium\|high`                 | `medium`                    | Higher = prefer cheaper.                        |
| `qualityPreference` | `low\|medium\|high`                 | `medium`                    | Higher = allow stronger models.                 |
| `latencyPreference` | `low\|medium\|high`                 | `medium`                    | Higher = prefer faster.                         |

## Nested sections

### `repositoryContext`

| Key              | Default | Notes                                        |
| ---------------- | ------- | -------------------------------------------- |
| `enabled`        | `true`  | Collect bounded repo context (wrapper mode). |
| `recentCommits`  | `false` | Include recent commits (opt-in).             |
| `includeGitDiff` | `true`  | Include `git status`/`diff --stat`.          |
| `include`        | `[]`    | Extra files to include.                      |
| `exclude`        | `[]`    | Extra names to exclude.                      |

### `contextLimits`

| Key                 | Default  |
| ------------------- | -------- |
| `maxFiles`          | `12`     |
| `maxFileBytes`      | `64000`  |
| `maxTotalBytes`     | `256000` |
| `maxTokensEstimate` | `6000`   |
| `timeoutMs`         | `2500`   |

### `classifier` (optional LLM layer)

| Key                | Default | Notes                                   |
| ------------------ | ------- | --------------------------------------- |
| `llmEnabled`       | `false` | Off by default.                         |
| `model`            | `haiku` | Low-cost classifier model.              |
| `timeoutMs`        | `4000`  | Hard timeout.                           |
| `maxRetries`       | `1`     | At most one retry.                      |
| `redactBeforeSend` | `true`  | Redact secrets before sending.          |
| `bare`             | `true`  | Use `--bare` (no hooks → no recursion). |

### `classificationThresholds`

| Key                     | Default | Notes                                     |
| ----------------------- | ------- | ----------------------------------------- |
| `llmConfidenceFloor`    | `0.55`  | Below this, consult the LLM (if enabled). |
| `fastPathMinConfidence` | `0.8`   | Minimum confidence to short-circuit.      |

### `scoring`

| Key                                       | Default  | Notes                                 |
| ----------------------------------------- | -------- | ------------------------------------- |
| `weights.complexity/risk/ambiguity/scope` | `1` each | Multipliers for signal contributions. |
| `clarificationAmbiguityThreshold`         | `7.5`    | Ambiguity to consider clarifying.     |
| `planRiskThreshold`                       | `6`      | Risk to recommend planning.           |
| `planComplexityThreshold`                 | `7`      | Complexity to recommend planning.     |
| `subagentComplexityThreshold`             | `8`      | Complexity to suggest subagents.      |

### `routingRules`

| Key                               | Default           | Notes                    |
| --------------------------------- | ----------------- | ------------------------ |
| `tierThresholds.balanced`         | `3.5`             | Blended-score threshold. |
| `tierThresholds.deep`             | `6.5`             | Blended-score threshold. |
| `riskEscalation`                  | `true`            | High risk bumps tier.    |
| `riskEscalationThreshold`         | `6`               |                          |
| `effortByTier.fast/balanced/deep` | `low/medium/high` | Base effort per tier.    |
| `typeTierHints`                   | see defaults      | Map task type → tier.    |

### `privacy`

| Key                           | Default |
| ----------------------------- | ------- |
| `redactSecrets`               | `true`  |
| `storePrompts`                | `false` |
| `storeRepositoryContent`      | `false` |
| `trustRepositoryInstructions` | `false` |

### `logging`

| Key          | Default | Notes                                     |
| ------------ | ------- | ----------------------------------------- |
| `enabled`    | `false` |                                           |
| `level`      | `warn`  | `error\|warn\|info\|debug`                |
| `logPrompts` | `false` | Prompt bodies never logged unless `true`. |
| `file`       | `null`  | Optional log file path.                   |

### `telemetry`

| Key       | Default                      |
| --------- | ---------------------------- |
| `enabled` | `false` (no endpoint exists) |

### `cache`

| Key          | Default  |
| ------------ | -------- |
| `enabled`    | `true`   |
| `maxEntries` | `200`    |
| `ttlMs`      | `900000` |

### `timeouts`

| Key                | Default |
| ------------------ | ------- |
| `classificationMs` | `1500`  |
| `contextMs`        | `2500`  |
| `llmClassifierMs`  | `4000`  |
| `hookMs`           | `8000`  |

### `hookBehavior`

| Key                         | Default  | Notes                                                |
| --------------------------- | -------- | ---------------------------------------------------- |
| `enabled`                   | `true`   |                                                      |
| `mode`                      | `silent` | `silent\|compact\|explain`                           |
| `injectContext`             | `true`   |                                                      |
| `collectContext`            | `false`  | Collect repo context inside the hook (adds latency). |
| `maxAdditionalContextChars` | `4000`   |                                                      |

### `sdkBehavior`

| Key                  | Default  | Notes                                                 |
| -------------------- | -------- | ----------------------------------------------------- |
| `executable`         | `claude` | Claude Code binary.                                   |
| `extraArgs`          | `[]`     | Always-appended args.                                 |
| `permissionMode`     | `null`   | Pass through a permission mode.                       |
| `appendSystemPrompt` | `true`   | Inject routing guidance via `--append-system-prompt`. |

## Environment overrides

`CTR_ENABLED`, `CTR_ROUTING_MODE`, `CTR_DEFAULT_MODEL`, `CTR_FALLBACK_MODEL`,
`CTR_MAX_EFFORT`, `CTR_TRANSPARENCY`, `CTR_OPTIMIZATION_MODE`,
`CTR_ALLOWED_MODELS` (comma-separated), `CTR_REPO_CONTEXT`,
`CTR_LLM_CLASSIFIER`, `CTR_TELEMETRY`, `CTR_LOG_LEVEL`, and `CTR_CONFIG_JSON`
(a full JSON object merged last). `CTR_CONFIG_DIR` and `CLAUDE_CONFIG_DIR`
relocate the respective config directories.
