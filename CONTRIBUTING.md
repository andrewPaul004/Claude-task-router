# Contributing

Thanks for your interest in improving Claude Task Router!

## Getting started

```bash
git clone https://github.com/andrewpaul004/claude-task-router
cd claude-task-router
npm install
npm run build
npm test
```

Requires Node.js ≥ 18.18.

## Development workflow

```bash
npm run dev            # tsup watch build
npm run typecheck      # tsc --noEmit (strict)
npm run lint           # eslint
npm run format         # prettier --write
npm test               # vitest (unit + integration)
npm run eval           # offline routing-quality suite
npm run benchmark      # local latency measurements
```

Before opening a PR, run the full gate:

```bash
npm run check          # format:check + lint + typecheck + test
npm run package:check  # build + npm pack --dry-run
```

## Guidelines

- **Keep modules small and cohesive.** The classifier must stay decoupled from
  execution.
- **No shell string building.** Always spawn with an argv array.
- **Routing/classification tuning belongs in data.** Prefer `config.scoring`,
  `config.routingRules`, and the signal tables over ad-hoc logic. If you change
  classification behavior, run `npm run eval` and keep routing agreement high.
- **Preserve the user's prompt.** The optimizer must never drop constraints or
  present invented specifics as requirements.
- **Fail open.** The hook must never block a prompt.
- **Tests never touch a real install.** Use the sandbox helper
  (`test/helpers.ts`) which redirects `CTR_CONFIG_DIR` and `CLAUDE_CONFIG_DIR`
  to a temp directory.
- **Add tests** for new behavior; add an eval fixture when you change
  classification.
- **Don't misrepresent capabilities.** If a feature depends on a Claude Code
  flag, verify it via the adapter and degrade gracefully.

## Commit / PR

- Use clear, imperative commit messages.
- Describe the change and the reasoning in the PR; link any issue.
- Update `CHANGELOG.md` under "Unreleased".
- CI must be green (lint, typecheck, tests, build, package check across the
  supported Node/OS matrix).

## Adding an eval fixture

Add to `src/eval/fixtures.ts` with acceptable tiers/efforts and expected score
ranges, then run `npm run eval`. Prefer a small set of acceptable outcomes over
a single exact value so the suite is not brittle.

## Reporting bugs / requesting features

Use the issue templates. For security issues, follow [`SECURITY.md`](SECURITY.md)
instead of opening a public issue.
