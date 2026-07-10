# Architecture

Claude Task Router is a small, layered TypeScript (ESM) package. The classifier,
router, optimizer, and executor are decoupled and independently testable; all
Claude Code and Agent SDK version differences are hidden behind adapters.

## Data flow

```text
prompt
  │
  ▼
TaskClassifier ──► Classification (typed, schema-validated: scores, flags, should*)
  │
  ├─► ModelRouter ──► RoutingDecision (tier, model alias, effort)
  │
  └─► PromptOptimizer ──► optimizedPrompt (original preserved)
                    │
                    ▼
              TaskAnalysis  (assembled + validated in pipeline.ts)
                    │
      ┌─────────────┴──────────────┐
      ▼                            ▼
  Hook mode                    Wrapper mode
  (additionalContext)          (ExecutionAdapter → `claude --model/--effort`)
```

## Module map

```text
src/
  cli/          Commander entry (`index.ts`, shebang), IO, shared context
  commands/     One module per command (analyze, run, install, doctor, …)
  classifier/   signals → fast-path (L1) → scoring (L2) → llm (L3) → orchestrator
  optimizer/    Progressive-enhancement prompt optimizer
  router/       Tier/model/effort policy (data-driven from config)
  context/      Bounded, privacy-conscious repository context collector
  executor/     Wrapper-mode orchestration (transparency, confirm, dry-run)
  sdk/          Claude Code detection + execution adapter + safe process spawn
  hooks/        UserPromptSubmit adapter + fail-open processor
  install/      Safe settings editing, managed state, install manager
  config/       Versioned schema, precedence store, env layer
  migrations/   Config schema migrations
  models/       Model registry (aliases → tiers)
  security/     Secret redactor + sensitive-path denylist
  cache/        In-process LRU + TTL
  logging/      Structured, privacy-first logger
  platform/     Cross-platform paths, fs, os/shell detection, deep-merge
  output/       Human + hook formatting
  eval/         Offline fixtures + eval runner
  types/        Shared types and Zod schemas
```

## Key interfaces

- **`TaskClassifier`** — `classify(prompt, config) → Classification`.
- **`ModelRouter`** — `route(classification, config) → RoutingDecision`.
- **`PromptOptimizer`** — `optimize(classification, config) → OptimizeResult`.
- **`ContextCollector`** — bounded, cancellable repository context.
- **`ExecutionAdapter`** — builds/executes the `claude` argv from a decision,
  gated by verified capabilities.
- **`ConfigStore`** — layered load + validated set/get.
- **`InstallManager`** — install/uninstall with dry-run, backups, and state.
- **`ModelRegistry`** — alias → tier resolution (safe pass-through for unknown).
- **`SecretRedactor`** — masks probable secrets.

## Classification layers

1. **Fast path (L1, deterministic).** High-precision matchers for obvious
   requests (formatting, summaries, explicit architecture/security/migration).
   Guarded so risky/broad prompts fall through. Target <1 ms.
2. **Weighted scoring (L2, deterministic).** Signal rules contribute to four
   axes (complexity/risk/ambiguity/scope) scaled by configurable weights, plus
   task-type votes. Length is intentionally a weak signal.
3. **LLM classifier (L3, optional, off by default).** Consulted only when
   deterministic confidence is below a threshold. Redacts before sending, uses
   the configured low-cost model with `--bare`, a hard timeout, one retry, and
   strict JSON-schema validation; falls back to L2 on any failure.

## Score ranges

- `complexityScore`, `riskScore`, `ambiguityScore`: integers/decimals **0–10**.
- `confidence`: **0–1**.
- Tiers: `fast | balanced | deep`. Effort: `low | medium | high | xhigh | max`.

## Routing policy

All routing lives in `config.routingRules` + `config.scoring` (versioned,
editable), not scattered in code. The router blends the scores, applies
type-tier hints, escalates for high risk or cross-cutting scope, nudges by
cost/quality/latency preference near thresholds, then maps the tier to an
**allowed** model and bounds effort by the model envelope and `maximumEffort`.

## Version compatibility

`sdk/detect.ts` inspects `claude --help` to learn which flags the installed
binary supports (rather than guessing from a version number). The execution
adapter only emits supported flags and records a note for anything it could not
apply, so the product never misrepresents what it did.

## Security boundaries

- No shell: every subprocess uses `spawn` with an argv array.
- Repository content is untrusted input — redacted, size/'count/token/time
  bounded, and never obeyed as instructions.
- The installer only ever touches the `hooks.UserPromptSubmit` entries it owns
  and records them in managed state.
