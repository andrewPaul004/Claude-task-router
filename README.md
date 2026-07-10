# Claude Task Router

> Classify, optimize, and route every Claude Code prompt to the right model and effort — automatically, safely, and fast.

Claude Task Router (`ctr`) sits between your request and Claude Code. It reads
your prompt, works out **what kind of task it is and how hard it is**, improves
the prompt without changing your intent, and picks a sensible **model** and
**effort** level — so simple work stays cheap and fast, and hard work gets the
reasoning it deserves.

It ships in two complementary modes:

- **Hook mode** — a Claude Code `UserPromptSubmit` hook that runs on every
  prompt and injects concise, task-aware execution guidance plus a model/effort
  recommendation.
- **Wrapper mode** — a CLI (`ctr` / `claude-task-router run`) that performs
  true pre-execution routing: it launches Claude Code with the selected
  `--model` and `--effort`.

```text
Your prompt → Classify → Optimize → Pick model + effort → Run Claude Code
```

---

## Table of contents

1. [What it does](#what-it-does)
2. [Features](#features)
3. [How it works](#how-it-works)
4. [Requirements](#requirements)
5. [Installation](#installation)
6. [Quick start](#quick-start)
7. [Global installation](#global-installation)
8. [Project installation](#project-installation)
9. [Hook mode](#hook-mode)
10. [Wrapper mode](#wrapper-mode)
11. [Configuration](#configuration)
12. [Model routing](#model-routing)
13. [Prompt optimization](#prompt-optimization)
14. [Privacy](#privacy)
15. [Troubleshooting](#troubleshooting)
16. [Uninstallation](#uninstallation)
17. [Upgrading](#upgrading)
18. [Development](#development)
19. [Limitations](#limitations)
20. [Contributing](#contributing)

---

## What it does

Give it a vague prompt like `Fix the login issue` and it determines:

```text
Task type:       Debugging (auth)
Complexity:      7/10
Risk:            4/10
Ambiguity:       7.5/10
Estimated scope: Single-file
Model:           Sonnet (balanced tier)
Effort:          Medium
Confidence:      77%
Context:         yes (moderate)
Clarify:         no
```

…then rewrites it into an actionable execution prompt (original preserved),
and — in wrapper mode — runs `claude --model sonnet --effort medium "…"`.

## Features

- **Three-layer classifier** — a deterministic fast path (<1 ms), configurable
  weighted scoring, and an **optional** low-cost LLM classifier (off by
  default).
- **Progressive prompt optimization** — trivial prompts pass through untouched;
  risky work gets planning, rollback, and approval guidance.
- **Cost-aware routing** — never reaches for the strongest model just because a
  prompt is long; balances complexity, risk, ambiguity, scope, and your
  preferences.
- **Model registry with aliases** — routes by `haiku`/`sonnet`/`opus` aliases,
  so new Anthropic models keep working without an update.
- **Safe installer** — parses and updates Claude Code settings surgically,
  backs up first, is idempotent, records exactly what it owns, and restores
  only that on uninstall.
- **Fail-open hook** — if the router ever errors, your prompt proceeds
  unchanged. It never blocks you.
- **Privacy-first** — no telemetry, no prompt logging, no stored repository
  content. Probable secrets are redacted before anything leaves your machine.
- **Cross-platform** — macOS, Linux, and Windows; no shell string
  interpolation anywhere.

## How it works

1. **Classify** the prompt into a typed, schema-validated analysis (task type,
   complexity/risk/ambiguity scores, scope, and more).
2. **Route** to a model tier (fast / balanced / deep) and effort level using an
   editable policy in your config — not logic scattered through the code.
3. **Optimize** the prompt with just-enough guidance for the task.
4. **Execute** (wrapper mode) via a versioned adapter that only uses Claude
   Code flags your installed version actually supports.

## Requirements

- **Node.js ≥ 18.18** (LTS recommended).
- **Claude Code** installed and on your `PATH` (`claude`). The router detects
  your version and adapts. Without it, hook mode still installs and fails open;
  wrapper mode reports that it cannot execute.

## Installation

```bash
npm install -g claude-task-router
# or run without installing:
npx claude-task-router@latest --help
```

## Quick start

```bash
npm install -g claude-task-router
claude-task-router install --global
claude-task-router init         # optional onboarding (sensible defaults otherwise)
claude-task-router doctor       # verify everything
ctr "Fix the login issue"       # route + run
```

## Global installation

Configures the router for **all** your Claude Code projects by adding the hook
to your user-level Claude Code settings (`~/.claude/settings.json`) and storing
config in your OS config directory.

```bash
claude-task-router install --global
claude-task-router install --global --dry-run   # preview changes first
```

## Project installation

Configures the router for **one repository**. The hook is written to the
project's `.claude/settings.json` (committed) and managed config/state live in
`.claude-task-router/`.

```bash
cd my-project
claude-task-router install --project
```

> Teammates who don't have `claude-task-router` installed are unaffected — the
> hook fails open (a missing command is a non-blocking hook error, so the
> prompt still runs).

## Hook mode

Once installed, the `UserPromptSubmit` hook runs on every Claude Code prompt.
For non-trivial prompts it injects an `additionalContext` block containing:

- a **model/effort recommendation**, and
- concise, task-aware **execution guidance** (e.g. "inspect the auth flow,
  implement the smallest safe fix, add regression coverage").

Trivial prompts get **nothing added** — no bloat.

> **Important:** A `UserPromptSubmit` hook can add context but **cannot change
> the model of the already-running session**, and it cannot rewrite your prompt.
> Hook mode therefore _recommends_ a model/effort and _improves_ the request.
> For **automatic** model/effort switching, use wrapper mode.

Hook transparency is set by `hookBehavior.mode` (`silent` by default; also
`compact`, `explain`).

## Wrapper mode

Wrapper mode performs true pre-execution routing:

```bash
ctr "Fix the login issue"                 # route, then run interactively
claude-task-router run "Fix the login issue"

ctr                                        # interactive: prompts you for the request
echo "Summarize CHANGELOG.md" | ctr        # read the prompt from stdin
```

Useful options:

| Flag               | Effect                                     |
| ------------------ | ------------------------------------------ |
| `--model <alias>`  | Override the routed model                  |
| `--effort <level>` | Override effort (`low`…`max`)              |
| `--dry-run`        | Show the exact command without executing   |
| `--explain`        | Print full scores and reasoning            |
| `--confirm`        | Ask before executing                       |
| `--json`           | Emit the decision as JSON (does not run)   |
| `--no-optimize`    | Send your prompt as-is                     |
| `--no-context`     | Skip repository context collection         |
| `-- <args>`        | Pass extra args straight through to Claude |

```bash
$ ctr --dry-run "Fix the login issue"
Routing: Sonnet / medium — debugging · single-file (complexity 7/10, risk 4/10)
Dry run — would execute:
  claude --model sonnet --effort medium --append-system-prompt "…" "Fix the login issue …"
```

## Configuration

Configuration is layered (later wins):

```text
CLI flags  >  environment variables  >  project config  >  user config  >  built-in defaults
```

- **User config:** your OS config dir (e.g. `~/.config/claude-task-router/config.json`)
- **Project config:** `<repo>/.claude-task-router/config.json`

```bash
claude-task-router config get                 # show effective config
claude-task-router config get defaultModel
claude-task-router config set maximumEffort xhigh
claude-task-router config set allowedModels '["haiku","sonnet","opus"]'
claude-task-router config path                # where is it?
claude-task-router config edit                # open in $EDITOR
claude-task-router config reset
```

Every value is validated against a versioned schema before being written.
Common environment overrides: `CTR_DEFAULT_MODEL`, `CTR_MAX_EFFORT`,
`CTR_TRANSPARENCY`, `CTR_REPO_CONTEXT`, `CTR_LLM_CLASSIFIER`, or a full
`CTR_CONFIG_JSON` object. See [`docs/CONFIG.md`](docs/CONFIG.md) for every key.

## Model routing

Routing uses three conceptual tiers, mapped to model aliases (resolved to the
latest concrete model by Claude Code):

| Tier         | Typical model | Good for                                      | Typical effort |
| ------------ | ------------- | --------------------------------------------- | -------------- |
| **Fast**     | Haiku         | formatting, extraction, summaries, tiny edits | low            |
| **Balanced** | Sonnet        | most dev work, debugging, tests, refactors    | low–high       |
| **Deep**     | Opus          | architecture, security, migrations, high-risk | high–xhigh     |

The router weighs complexity, risk, ambiguity, scope, autonomy, accuracy,
cost/latency preference, and model availability. It **will not** pick the
strongest model just because the prompt is long. Inspect it:

```bash
claude-task-router models
claude-task-router analyze "Design a multi-tenant billing system"
```

## Prompt optimization

Progressive enhancement — guidance scales with the task:

- **Trivial** (`Convert these values into a comma-separated list`) → unchanged.
- **Routine** (`Add validation to the signup form`) → inspect conventions,
  smallest change, add tests, validate, summarize.
- **Vague repo task** (`Fix the login issue`) → investigate auth/session,
  find the root cause, smallest safe fix, regression coverage, state
  assumptions.
- **High-risk** → plan first, flag destructive actions, require approval,
  rollback guidance, avoid production unless asked.

The original prompt is always preserved verbatim; invented specifics are
labeled as **assumptions**, never as new requirements.

## Privacy

- **No telemetry, no analytics, ever.** (Off by default; there is no hosted
  endpoint.)
- **No prompt logging** and **no stored repository content** by default.
- The optional LLM classifier is **disabled by default**; when enabled it sends
  a **redacted** prompt to your configured low-cost model via Claude Code.
- Repository text is treated as **untrusted** and is never obeyed as
  instructions during classification.

See [`SECURITY.md`](SECURITY.md) for the full threat model and what data can
leave your machine.

## Troubleshooting

```bash
claude-task-router doctor        # checks Node, Claude Code, hook, settings, config, PATH…
claude-task-router status        # what's installed and effective config
```

- **Hook not firing?** Run `doctor`. Ensure `claude-task-router` is on your
  `PATH` (global install) and the hook is present in the relevant
  `settings.json`.
- **`--model`/`--effort` not applied?** Your Claude Code version may not
  support them. `doctor` reports this; wrapper mode then recommends instead of
  applying, and says so.
- **Broke your config?** `claude-task-router config reset` or restore a backup
  from the `backups/` directory the installer created.

## Uninstallation

```bash
claude-task-router uninstall --global
claude-task-router uninstall --project
claude-task-router uninstall --global --dry-run   # preview
claude-task-router uninstall --global --purge     # also remove config
```

Uninstall removes **only** the hook entry and state the installer created —
your other Claude Code settings and hooks are left untouched. Config is kept
unless you pass `--purge`.

## Upgrading

```bash
npm install -g claude-task-router@latest
claude-task-router update      # runs config migrations + prints the upgrade steps
claude-task-router doctor
```

Configuration is versioned and migrated automatically (with a backup).

## Development

```bash
git clone https://github.com/andrewpaul004/claude-task-router
cd claude-task-router
npm install
npm run build
npm test
npm run eval        # offline routing quality
npm run benchmark   # local latency
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Limitations

- Hook mode **recommends** a model/effort and improves the prompt; it **cannot**
  switch the active session's model or rewrite your prompt (a Claude Code hook
  constraint). Wrapper mode does true routing.
- Model and effort application depend on the **installed Claude Code version**;
  the router verifies supported flags and degrades to recommendations
  otherwise.
- The deterministic classifier is heuristic. Enable the optional LLM classifier
  for tougher, ambiguous prompts.
- `.gitignore` handling in the context collector is a pragmatic subset (a
  curated ignore list plus your excludes), not a full implementation.

## Contributing

Issues and PRs welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) and our
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Licensed under [MIT](LICENSE).
