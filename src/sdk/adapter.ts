import type { Config } from '../config/schema.js';
import type { EffortLevel } from '../types/analysis.js';
import { getClaudeInfo, type ClaudeInfo } from './detect.js';
import { runInherit } from './process.js';

/**
 * Execution adapter.
 *
 * Encapsulates every Claude Code version difference behind one interface. It
 * builds the `claude` argv from a routing decision, but only using flags the
 * installed binary actually supports (verified via {@link getClaudeInfo}); any
 * unsupported routing dimension is reported as a note instead of silently
 * dropped or fabricated.
 */

/** Env var set on the spawned process so the hook knows routing already ran. */
export const ROUTER_ACTIVE_ENV = 'CLAUDE_TASK_ROUTER_ACTIVE';

export interface ExecuteOptions {
  /** The prompt to run (typically the optimized prompt). */
  prompt?: string;
  model?: string;
  effort?: EffortLevel;
  appendSystemPrompt?: string;
  print?: boolean;
  /** Extra args appended verbatim (advanced/passthrough). */
  passthroughArgs?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface ExecutionPlan {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  applied: {
    model: string | null;
    effort: EffortLevel | null;
    appendSystemPrompt: boolean;
    permissionMode: string | null;
  };
  /** Human-readable capability limitations that affected the plan. */
  notes: string[];
}

export interface ExecutionResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  spawnError?: Error;
  plan: ExecutionPlan;
}

export interface ExecutionAdapter {
  info(): Promise<ClaudeInfo>;
  plan(opts: ExecuteOptions): Promise<ExecutionPlan>;
  execute(opts: ExecuteOptions): Promise<ExecutionResult>;
}

export class ClaudeCliAdapter implements ExecutionAdapter {
  constructor(
    private readonly config: Config,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  info(): Promise<ClaudeInfo> {
    return getClaudeInfo(this.config.sdkBehavior.executable, this.env);
  }

  async plan(opts: ExecuteOptions): Promise<ExecutionPlan> {
    const info = await this.info();
    const caps = info.capabilities;
    const sdk = this.config.sdkBehavior;
    const args: string[] = [];
    const notes: string[] = [];
    const applied: ExecutionPlan['applied'] = {
      model: null,
      effort: null,
      appendSystemPrompt: false,
      permissionMode: null,
    };

    if (!info.available) {
      notes.push(
        `Claude Code executable "${sdk.executable}" was not found or is not runnable. ` +
          `Install it or set sdkBehavior.executable.`
      );
    }

    if (opts.print) {
      if (caps.print) args.push('-p');
      else
        notes.push(
          'Installed Claude Code does not advertise --print; running interactively.'
        );
    }

    if (opts.model) {
      if (caps.model || !info.available) {
        args.push('--model', opts.model);
        applied.model = opts.model;
      } else {
        notes.push(
          `--model unsupported by installed Claude Code; "${opts.model}" not applied.`
        );
      }
    }

    if (opts.effort) {
      if (caps.effort || !info.available) {
        args.push('--effort', opts.effort);
        applied.effort = opts.effort;
      } else {
        notes.push(
          `--effort unsupported by installed Claude Code; effort "${opts.effort}" not applied ` +
            `(recommendation only).`
        );
      }
    }

    if (sdk.permissionMode) {
      if (caps.permissionMode || !info.available) {
        args.push('--permission-mode', sdk.permissionMode);
        applied.permissionMode = sdk.permissionMode;
      } else {
        notes.push(
          '--permission-mode unsupported by installed Claude Code; not applied.'
        );
      }
    }

    if (opts.appendSystemPrompt && sdk.appendSystemPrompt) {
      if (caps.appendSystemPrompt || !info.available) {
        args.push('--append-system-prompt', opts.appendSystemPrompt);
        applied.appendSystemPrompt = true;
      } else {
        notes.push(
          '--append-system-prompt unsupported; execution guidance not injected.'
        );
      }
    }

    args.push(...sdk.extraArgs);
    if (opts.passthroughArgs) args.push(...opts.passthroughArgs);

    // The prompt is always the final positional argument, passed literally.
    if (opts.prompt !== undefined && opts.prompt.length > 0) {
      args.push(opts.prompt);
    }

    const env: NodeJS.ProcessEnv = {
      ...(opts.env ?? this.env),
      [ROUTER_ACTIVE_ENV]: '1',
    };

    return { executable: sdk.executable, args, env, applied, notes };
  }

  async execute(opts: ExecuteOptions): Promise<ExecutionResult> {
    const plan = await this.plan(opts);
    const runOpts: { env: NodeJS.ProcessEnv; cwd?: string; signal?: AbortSignal } = {
      env: plan.env,
    };
    if (opts.cwd !== undefined) runOpts.cwd = opts.cwd;
    if (opts.signal !== undefined) runOpts.signal = opts.signal;
    const result = await runInherit(plan.executable, plan.args, runOpts);
    return { ...result, plan };
  }
}
