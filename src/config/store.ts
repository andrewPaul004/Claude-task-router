import path from 'node:path';
import { dirExists, fileExists, readJson, writeJsonAtomic } from '../platform/fs.js';
import { defaultPathContext, type PathContext } from '../platform/paths.js';
import { projectConfigPath, userConfigPath } from '../platform/paths.js';
import { mergeLayers } from '../platform/merge.js';
import { migrateConfig } from '../migrations/index.js';
import { type Config, ConfigSchema } from './schema.js';
import { envConfigLayer } from './env.js';

export type ConfigScope = 'user' | 'project';

export interface LoadConfigOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Highest-precedence overrides from CLI flags. */
  flags?: Record<string, unknown>;
  /** Explicit project root; if omitted it is discovered from cwd. */
  projectRoot?: string | null;
  /** Skip the environment-variable layer (used by some tests). */
  skipEnv?: boolean;
}

export interface ResolvedConfig {
  config: Config;
  projectRoot: string | null;
  sources: {
    userConfigPath: string;
    projectConfigPath: string | null;
    userExists: boolean;
    projectExists: boolean;
  };
  migrationNotes: string[];
}

/** Walk up from `cwd` to find a project root (git repo or existing config). */
export function findProjectRoot(cwd: string): string | null {
  let dir = path.resolve(cwd);
  const { root } = path.parse(dir);
  for (;;) {
    if (
      dirExists(path.join(dir, '.git')) ||
      dirExists(path.join(dir, '.claude')) ||
      dirExists(path.join(dir, '.claude-task-router')) ||
      fileExists(path.join(dir, 'package.json'))
    ) {
      return dir;
    }
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

function pathCtx(opts: LoadConfigOptions): PathContext {
  const base = defaultPathContext();
  return {
    home: base.home,
    cwd: opts.cwd ?? base.cwd,
    env: opts.env ?? base.env,
  };
}

function readAndMigrate(p: string): { raw: Record<string, unknown>; notes: string[] } {
  const data = readJson<Record<string, unknown>>(p);
  if (!data || typeof data !== 'object') return { raw: {}, notes: [] };
  const migrated = migrateConfig(data);
  return { raw: migrated.config, notes: migrated.notes };
}

/** Load and resolve configuration across all sources (see precedence order). */
export function loadConfig(opts: LoadConfigOptions = {}): ResolvedConfig {
  const ctx = pathCtx(opts);
  const projectRoot =
    opts.projectRoot === undefined ? findProjectRoot(ctx.cwd) : opts.projectRoot;

  const uPath = userConfigPath(ctx);
  const pPath = projectRoot ? projectConfigPath(projectRoot) : null;

  const notes: string[] = [];
  const userLayer = readAndMigrate(uPath);
  notes.push(...userLayer.notes);
  const projectLayer = pPath ? readAndMigrate(pPath) : { raw: {}, notes: [] };
  notes.push(...projectLayer.notes);

  const envLayer = opts.skipEnv ? {} : envConfigLayer(ctx.env);

  // Precedence (lowest → highest): defaults < user < project < env < flags.
  // Defaults are supplied by the schema itself when parsing.
  const merged = mergeLayers([
    userLayer.raw,
    projectLayer.raw,
    envLayer,
    opts.flags ?? {},
  ]);

  const config = ConfigSchema.parse(merged);

  return {
    config,
    projectRoot,
    sources: {
      userConfigPath: uPath,
      projectConfigPath: pPath,
      userExists: fileExists(uPath),
      projectExists: pPath ? fileExists(pPath) : false,
    },
    migrationNotes: notes,
  };
}

function scopePath(
  scope: ConfigScope,
  ctx: PathContext,
  projectRoot: string | null
): string {
  if (scope === 'user') return userConfigPath(ctx);
  if (!projectRoot) {
    throw new Error(
      'No project root found. Run inside a project directory or use --global.'
    );
  }
  return projectConfigPath(projectRoot);
}

/** Read the raw (un-merged) config object stored at a given scope. */
export function readScopeConfig(
  scope: ConfigScope,
  opts: LoadConfigOptions = {}
): { path: string; raw: Record<string, unknown> } {
  const ctx = pathCtx(opts);
  const projectRoot =
    opts.projectRoot === undefined ? findProjectRoot(ctx.cwd) : opts.projectRoot;
  const p = scopePath(scope, ctx, projectRoot);
  const data = readJson<Record<string, unknown>>(p);
  return { path: p, raw: data && typeof data === 'object' ? data : {} };
}

/** Parse a CLI-provided string value into a JSON value where possible. */
export function coerceValue(value: string): unknown {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function setByPath(obj: Record<string, unknown>, keyPath: string, value: unknown): void {
  const parts = keyPath.split('.').filter(Boolean);
  if (parts.length === 0) throw new Error('Empty config key.');
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = node[key];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]!] = value;
}

export function getByPath(obj: unknown, keyPath: string): unknown {
  const parts = keyPath.split('.').filter(Boolean);
  let node: unknown = obj;
  for (const part of parts) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

export interface SetResult {
  path: string;
  scope: ConfigScope;
  key: string;
  value: unknown;
}

/**
 * Set a single config key at a scope. The full resulting configuration is
 * validated (with all layers applied) before anything is written, so an
 * invalid value is rejected with a clear error and never persisted.
 */
export function setConfigValue(
  scope: ConfigScope,
  keyPath: string,
  value: unknown,
  opts: LoadConfigOptions = {}
): SetResult {
  const { path: p, raw } = readScopeConfig(scope, opts);

  // Apply the change to a clone of the stored partial.
  const updatedPartial = structuredClone(raw);
  setByPath(updatedPartial, keyPath, value);

  // Migrate legacy keys and stamp the current schema version.
  const migrated = migrateConfig(updatedPartial);
  const partial = migrated.config;
  partial.schemaVersion = ConfigSchema.parse({}).schemaVersion;

  // Validate by parsing the partial: this applies defaults and rejects
  // unknown top-level keys and bad types before anything is written.
  try {
    ConfigSchema.parse(partial);
  } catch (err) {
    throw new Error(`Invalid value for "${keyPath}": ${describeZodError(err)}`);
  }

  // Persist only the partial (never the fully-defaulted config) so future
  // default changes still take effect for keys the user never set.
  writeJsonAtomic(p, partial);
  return { path: p, scope, key: keyPath, value };
}

/** Reset (delete contents of) a scope config file, leaving an empty stub. */
export function resetConfig(scope: ConfigScope, opts: LoadConfigOptions = {}): string {
  const { path: p } = readScopeConfig(scope, opts);
  writeJsonAtomic(p, { schemaVersion: ConfigSchema.parse({}).schemaVersion });
  return p;
}

export function configFilePath(scope: ConfigScope, opts: LoadConfigOptions = {}): string {
  const ctx = pathCtx(opts);
  const projectRoot =
    opts.projectRoot === undefined ? findProjectRoot(ctx.cwd) : opts.projectRoot;
  return scopePath(scope, ctx, projectRoot);
}

function describeZodError(err: unknown): string {
  if (err && typeof err === 'object' && 'issues' in err) {
    const issues = (err as { issues: Array<{ path: unknown[]; message: string }> })
      .issues;
    return issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  }
  return err instanceof Error ? err.message : String(err);
}
