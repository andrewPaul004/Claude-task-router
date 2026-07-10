import { findProjectRoot, loadConfig, type ResolvedConfig } from '../config/store.js';
import type { InstallScope } from '../install/state.js';
import type { CliIO } from './io.js';

/** Options common to all commands (from global flags). */
export interface GlobalFlags {
  global?: boolean;
  project?: boolean;
  debug?: boolean;
  cwd?: string;
}

export interface CliContext {
  io: CliIO;
  cwd: string;
  env: NodeJS.ProcessEnv;
  projectRoot: string | null;
  flags: GlobalFlags;
}

export function makeContext(io: CliIO, flags: GlobalFlags): CliContext {
  const cwd = flags.cwd ?? process.cwd();
  return { io, cwd, env: process.env, projectRoot: findProjectRoot(cwd), flags };
}

export function resolved(
  ctx: CliContext,
  extraFlags?: Record<string, unknown>
): ResolvedConfig {
  const opts: Parameters<typeof loadConfig>[0] = {
    cwd: ctx.cwd,
    env: ctx.env,
    projectRoot: ctx.projectRoot,
  };
  if (extraFlags) opts.flags = extraFlags;
  return loadConfig(opts);
}

/**
 * Resolve the install/config scope from flags. `--global` and `--project` are
 * explicit; otherwise fall back to `fallback` (default 'global').
 */
export function resolveScope(
  ctx: CliContext,
  fallback: InstallScope = 'global'
): { scope: InstallScope; projectRoot: string | null; error?: string } {
  if (ctx.flags.global && ctx.flags.project) {
    return {
      scope: fallback,
      projectRoot: ctx.projectRoot,
      error: 'Choose only one of --global / --project.',
    };
  }
  if (ctx.flags.project) {
    if (!ctx.projectRoot) {
      return {
        scope: 'project',
        projectRoot: null,
        error:
          'No project root found (looked for .git / package.json). Run inside a repository.',
      };
    }
    return { scope: 'project', projectRoot: ctx.projectRoot };
  }
  if (ctx.flags.global) return { scope: 'global', projectRoot: ctx.projectRoot };
  return { scope: fallback, projectRoot: ctx.projectRoot };
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1
  ) {
    super(message);
    this.name = 'CliError';
  }
}
