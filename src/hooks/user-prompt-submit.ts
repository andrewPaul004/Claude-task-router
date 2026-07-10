import { loadConfig } from '../config/store.js';
import { analyzePrompt } from '../pipeline.js';
import { hookContext, truncate } from '../output/format.js';
import { ROUTER_ACTIVE_ENV } from '../sdk/adapter.js';
import { UserPromptSubmitAdapter } from './adapter.js';

/**
 * UserPromptSubmit hook processor.
 *
 * Contract, in order of priority:
 *  1. FAIL OPEN. Any error → exit 0 with no output. The original prompt must
 *     never be blocked because the router failed. (We never exit 2, which
 *     would erase the prompt.)
 *  2. Avoid recursion / double-routing: if the wrapper already routed
 *     (CLAUDE_TASK_ROUTER_ACTIVE=1), do nothing.
 *  3. Be fast and quiet: inject guidance only when it is actually useful.
 */

export interface HookResult {
  stdout: string;
  exitCode: number;
  injected: boolean;
}

const NOOP: HookResult = { stdout: '', exitCode: 0, injected: false };

export interface HookRunOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** Injectable config loader / analyzer for tests. */
  load?: typeof loadConfig;
  analyze?: typeof analyzePrompt;
  timeoutMs?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    timer.unref?.();
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

export async function runUserPromptSubmitHook(
  rawStdin: string,
  opts: HookRunOptions = {}
): Promise<HookResult> {
  try {
    const env = opts.env ?? process.env;

    // (2) Recursion / double-route guard.
    if (env[ROUTER_ACTIVE_ENV] === '1') return NOOP;

    const adapter = new UserPromptSubmitAdapter();
    const input = adapter.parse(rawStdin);
    if (!input || !input.prompt.trim()) return NOOP;

    const cwd = input.cwd ?? opts.cwd ?? process.cwd();
    const load = opts.load ?? loadConfig;
    const analyze = opts.analyze ?? analyzePrompt;

    const { config } = load({ cwd, env });
    if (!config.enabled || !config.hookBehavior.enabled || config.routingMode === 'off') {
      return NOOP;
    }

    const analysis = await withTimeout(
      analyze(input.prompt, config),
      opts.timeoutMs ?? config.timeouts.hookMs,
      null
    );
    if (!analysis) return NOOP;

    const context = hookContext(analysis, config);
    if (!context) return NOOP;

    const bounded = truncate(context, config.hookBehavior.maxAdditionalContextChars);
    return { stdout: adapter.formatContext(bounded), exitCode: 0, injected: true };
  } catch {
    // (1) Fail open — never block the prompt.
    return NOOP;
  }
}
