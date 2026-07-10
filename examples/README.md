# Examples

Practical recipes for Claude Task Router. See [`../docs/CONFIG.md`](../docs/CONFIG.md)
for every configuration key.

## Analyze without executing

```bash
claude-task-router analyze "Fix the login issue"
claude-task-router analyze --json "Migrate the database from MySQL to Postgres" | jq .recommendedModelTier
```

## Optimize a prompt

```bash
claude-task-router optimize "Add validation to the signup form"
```

## Route and run (wrapper mode)

```bash
ctr "Refactor the payment module to reduce duplication"
ctr --explain "Design a multi-tenant billing architecture"
ctr --model opus --effort xhigh "Investigate the intermittent logout bug"
ctr --dry-run "Drop the legacy_orders table in production"   # preview only
echo "Summarize README.md in 3 bullets" | ctr
```

## Machine-readable decision (scripting)

```bash
ctr --json "Add a --verbose flag to the CLI" | jq '{model: .analysis.recommendedModel, effort: .analysis.recommendedEffort}'
```

## Install for a single project

```bash
cd my-repo
claude-task-router install --project --dry-run   # preview
claude-task-router install --project
claude-task-router status
```

## Non-interactive onboarding (CI / dotfiles)

```bash
claude-task-router init --yes \
  --optimization balanced \
  --routing-display compact \
  --default-model sonnet \
  --allowed-models "haiku,sonnet,opus" \
  --max-effort high \
  --repo-context true \
  --classifier-llm false
```

## Enable the optional LLM classifier

Off by default. Enable it only if you're comfortable sending a **redacted**
prompt to your low-cost model for ambiguous cases:

```bash
claude-task-router config set classifier.llmEnabled true
claude-task-router config set classifier.model haiku
```

## Cost-saver profile

```bash
claude-task-router config set costPreference high
claude-task-router config set maximumEffort medium
claude-task-router config set allowedModels '["haiku","sonnet"]'
```

## Files in this folder

- [`config.example.json`](config.example.json) — a user-level config.
- [`project-config.example.json`](project-config.example.json) — a project-level config.
