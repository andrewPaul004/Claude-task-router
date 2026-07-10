import {
  coerceValue,
  configFilePath,
  getByPath,
  resetConfig,
  setConfigValue,
  type ConfigScope,
} from '../config/store.js';
import { fileExists, writeJsonAtomic } from '../platform/fs.js';
import { runInherit } from '../sdk/process.js';
import { CURRENT_CONFIG_SCHEMA_VERSION } from '../config/schema.js';
import { color, icon } from '../cli/io.js';
import { resolved, resolveScope, type CliContext } from '../cli/shared.js';

function scopeArg(ctx: CliContext): { scope: ConfigScope; error?: string } {
  const r = resolveScope(ctx, 'global');
  if (r.error) return { scope: 'user', error: r.error };
  return { scope: r.scope === 'global' ? 'user' : 'project' };
}

function loadOpts(ctx: CliContext) {
  return { cwd: ctx.cwd, env: ctx.env, projectRoot: ctx.projectRoot };
}

export function configGet(
  ctx: CliContext,
  key: string | undefined,
  opts: { json?: boolean }
): number {
  const { config } = resolved(ctx);
  const value = key ? getByPath(config, key) : config;
  if (value === undefined) {
    ctx.io.err(`${icon.fail()} Unknown config key "${key}".\n`);
    return 1;
  }
  ctx.io.out(`${JSON.stringify(value, null, opts.json ? 2 : 2)}\n`);
  return 0;
}

export function configSet(ctx: CliContext, key: string, rawValue: string): number {
  const { scope, error } = scopeArg(ctx);
  if (error) {
    ctx.io.err(`${icon.fail()} ${error}\n`);
    return 2;
  }
  try {
    const value = coerceValue(rawValue);
    const result = setConfigValue(scope, key, value, loadOpts(ctx));
    ctx.io.out(
      `${icon.ok()} Set ${color.bold(key)} = ${JSON.stringify(value)} (${scope}: ${result.path})\n`
    );
    return 0;
  } catch (err) {
    ctx.io.err(`${icon.fail()} ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

export function configReset(ctx: CliContext): number {
  const { scope, error } = scopeArg(ctx);
  if (error) {
    ctx.io.err(`${icon.fail()} ${error}\n`);
    return 2;
  }
  const p = resetConfig(scope, loadOpts(ctx));
  ctx.io.out(`${icon.ok()} Reset ${scope} config to defaults (${p}).\n`);
  return 0;
}

export function configPath(ctx: CliContext): number {
  const { scope, error } = scopeArg(ctx);
  if (error) {
    ctx.io.err(`${icon.fail()} ${error}\n`);
    return 2;
  }
  ctx.io.out(`${configFilePath(scope, loadOpts(ctx))}\n`);
  return 0;
}

export async function configEdit(ctx: CliContext): Promise<number> {
  const { scope, error } = scopeArg(ctx);
  if (error) {
    ctx.io.err(`${icon.fail()} ${error}\n`);
    return 2;
  }
  const p = configFilePath(scope, loadOpts(ctx));
  if (!fileExists(p)) {
    writeJsonAtomic(p, { schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION });
  }
  const editor =
    ctx.env.VISUAL ||
    ctx.env.EDITOR ||
    (process.platform === 'win32' ? 'notepad' : 'nano');
  const res = await runInherit(editor, [p], { env: ctx.env });
  if (res.spawnError) {
    ctx.io.err(
      `${icon.fail()} Could not open editor "${editor}": ${res.spawnError.message}\n`
    );
    ctx.io.err(`Edit this file manually: ${p}\n`);
    return 1;
  }
  return res.code ?? 0;
}
