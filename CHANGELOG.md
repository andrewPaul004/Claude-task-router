# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-10

Initial release.

### Added

- **Hook mode**: a fail-open `UserPromptSubmit` hook that injects task-aware
  execution guidance and a model/effort recommendation (silent on trivial
  prompts, recursion-guarded).
- **Wrapper mode**: `ctr` / `claude-task-router run` performs true
  pre-execution routing, launching Claude Code with `--model`/`--effort` via a
  capability-verified adapter.
- **Three-layer classifier**: deterministic fast path, configurable weighted
  scoring, and an optional (off-by-default) low-cost LLM classifier.
- **Progressive prompt optimizer** that preserves the original prompt and
  scales guidance from trivial to high-risk.
- **Config-driven model/effort routing** with tiers (fast/balanced/deep) and
  model aliases via a registry that tolerates new/unknown models.
- **Safe installer**: idempotent, backs up settings, edits only owned hook
  entries, records managed state, supports `--global`/`--project` and
  `--dry-run`; uninstall restores only product-owned changes.
- Commands: `install`, `uninstall`, `update`, `doctor`, `init`, `config`,
  `status`, `models`, `version`, `analyze`, `optimize`, `run`, `eval`,
  `benchmark`, and the internal `hook`.
- **Versioned configuration** with precedence (flags > env > project > user >
  defaults) and automatic migrations (with backup).
- **Privacy-first defaults**: no telemetry, no prompt logging, no stored
  repository content; secret redaction and a sensitive-path denylist.
- Offline evaluation suite (57 fixtures) and a benchmark command.
- Documentation, GitHub workflows (CI matrix + optional release), issue/PR
  templates, and examples.

[Unreleased]: https://github.com/andrewpaul004/claude-task-router/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/andrewpaul004/claude-task-router/releases/tag/v0.1.0
