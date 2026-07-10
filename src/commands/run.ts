import { runWrapper, type RunIO, type RunOptions } from '../executor/executor.js';
import { EFFORT_LEVELS, type EffortLevel } from '../types/analysis.js';
import { resolved, type CliContext } from '../cli/shared.js';

export interface RunCliOptions {
  model?: string;
  effort?: string;
  dryRun?: boolean;
  json?: boolean;
  noContext?: boolean;
  noOptimize?: boolean;
  explain?: boolean;
  confirm?: boolean;
  print?: boolean;
  debug?: boolean;
  passthroughArgs?: string[];
}

export async function runCommand(
  ctx: CliContext,
  prompt: string,
  opts: RunCliOptions
): Promise<number> {
  const { config } = resolved(ctx);

  if (opts.effort && !EFFORT_LEVELS.includes(opts.effort as EffortLevel)) {
    ctx.io.err(
      `Invalid --effort "${opts.effort}". Choose one of: ${EFFORT_LEVELS.join(', ')}.\n`
    );
    return 2;
  }

  const io: RunIO = {
    stdout: ctx.io.out,
    stderr: ctx.io.err,
    confirm: ctx.io.confirm,
    isTTY: ctx.io.isTTY,
  };

  const runOpts: RunOptions = {
    cwd: ctx.cwd,
    env: ctx.env,
    projectRoot: ctx.projectRoot,
  };
  if (opts.model) runOpts.modelOverride = opts.model;
  if (opts.effort) runOpts.effortOverride = opts.effort as EffortLevel;
  if (opts.dryRun) runOpts.dryRun = true;
  if (opts.json) runOpts.json = true;
  if (opts.noContext) runOpts.noContext = true;
  if (opts.noOptimize) runOpts.noOptimize = true;
  if (opts.explain) runOpts.explain = true;
  if (opts.confirm) runOpts.confirm = true;
  if (opts.print) runOpts.print = true;
  if (opts.debug) runOpts.debug = true;
  if (opts.passthroughArgs && opts.passthroughArgs.length) {
    runOpts.passthroughArgs = opts.passthroughArgs;
  }

  const abort = new AbortController();
  const onSigint = () => abort.abort();
  process.once('SIGINT', onSigint);
  runOpts.signal = abort.signal;

  try {
    const outcome = await runWrapper(prompt, config, runOpts, io);
    return outcome.exitCode;
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}
