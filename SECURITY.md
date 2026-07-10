# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**. Do not open a public
issue for a security problem.

- Preferred: open a [GitHub Security Advisory](https://github.com/andrewpaul004/claude-task-router/security/advisories/new).
- Or email the maintainers (see `package.json` `author`).

Include a description, reproduction steps, affected versions, and impact. We aim
to acknowledge within a few days and to coordinate a fix and disclosure
timeline with you. Please allow reasonable time to remediate before any public
disclosure.

Supported for fixes: the latest published minor version.

## What this software does with your data

Claude Task Router runs **entirely locally**. It has no hosted backend and no
network calls of its own.

| Data                   | Default behavior                                                                                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telemetry / analytics  | **None.** No endpoint exists.                                                                                                                                                                                                      |
| Prompt logging         | **Off.** Never written unless `logging.logPrompts` is explicitly enabled.                                                                                                                                                          |
| Repository content     | **Not stored.** Collected context is in-memory only.                                                                                                                                                                               |
| Debug logs             | **Off.**                                                                                                                                                                                                                           |
| Data sent to Anthropic | Only in **wrapper mode** (your prompt goes to Claude Code, exactly as if you ran `claude` yourself) and, if you **opt in**, the **optional LLM classifier** (a redacted prompt to your configured low-cost model via Claude Code). |

The optional LLM classifier is **disabled by default**. When enabled, probable
secrets are redacted before the prompt is sent (see below), and the subprocess
runs with `--bare` (no hooks) to prevent recursion.

## Threat model

Assets: your source code, your prompts, and your Claude Code configuration.

Threats considered and mitigations:

- **Secret leakage.** A `SecretRedactor` masks provider API keys (Anthropic,
  OpenAI, GitHub, Slack, Google, AWS), `key=value` secrets, JWTs, PEM private
  keys, and credentials embedded in URLs before any text is logged or sent to
  the optional classifier. A sensitive-path **denylist** ensures `.env`,
  `id_rsa`, `*.pem`, `secrets.*`, `.aws/`, `.ssh/`, and similar are never read
  by the context collector.
- **Prompt injection from repository files.** Repository content is treated as
  untrusted. Collected context is clearly labeled as untrusted data and is never
  interpreted as instructions during classification. `privacy.trustRepositoryInstructions`
  is `false` by default.
- **Shell injection.** No command is ever built by string concatenation. Every
  subprocess (`claude`, `git`, `$EDITOR`) is launched via `spawn` with an
  explicit argument array and no shell.
- **Config-as-code.** Configuration is data (JSON) validated by a schema. It is
  never `eval`'d or executed.
- **Destructive installs.** The installer parses and edits only the
  `hooks.UserPromptSubmit` entries it owns, backs up settings before writing,
  is idempotent, and records what it created in a managed state file so
  uninstall restores **only** product-owned changes and never deletes
  user-created configuration.
- **Unbounded scans.** The context collector enforces file-count, per-file,
  total-byte, token, and wall-clock limits, and is cancellable.
- **Recursion.** The wrapper sets `CLAUDE_TASK_ROUTER_ACTIVE=1`; the hook
  no-ops when it sees it, and the classifier subprocess uses `--bare`.

## Hardening notes

- Managed state and config files are written with `0600` permissions where the
  platform supports it.
- Denylist and redaction patterns are configurable; contributions that add
  coverage are welcome.

## Non-goals

This tool does not sandbox Claude Code, does not replace your own review of what
Claude Code does, and makes no guarantee of catching every possible secret —
redaction is defense-in-depth, not a guarantee. Keep real secrets out of
prompts and out of tracked files.
