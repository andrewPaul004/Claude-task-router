import { runUserPromptSubmitHook } from '../hooks/user-prompt-submit.js';
import { readStdin } from '../cli/io.js';

/**
 * The `hook` subcommand is what Claude Code invokes for each UserPromptSubmit.
 * It reads the hook JSON from stdin, prints additionalContext JSON on stdout,
 * and always exits 0 (fail-open). It is intentionally dependency-light and is
 * fast-pathed in the CLI entry so it never pays for argument parsing.
 */
export async function hookCommand(): Promise<number> {
  const raw = await readStdin();
  const result = await runUserPromptSubmitHook(raw, {
    env: process.env,
    cwd: process.cwd(),
  });
  if (result.stdout) process.stdout.write(result.stdout);
  return result.exitCode;
}
