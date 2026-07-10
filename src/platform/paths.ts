import os from 'node:os';
import path from 'node:path';
import envPaths from 'env-paths';

/**
 * Cross-platform path resolution for both our own managed files and the
 * Claude Code configuration we integrate with.
 *
 * Everything is derived from overridable inputs (env vars, an explicit cwd) so
 * tests can redirect all filesystem access into a temp directory and never
 * touch a real installation. In particular `CLAUDE_CONFIG_DIR` (honored by
 * Claude Code itself) relocates the user-level `.claude` directory, and
 * `CTR_CONFIG_DIR` relocates our own user config.
 */

const PRODUCT = 'claude-task-router';

export interface PathContext {
  home: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export function defaultPathContext(): PathContext {
  return { home: os.homedir(), cwd: process.cwd(), env: process.env };
}

/** User-level Claude Code config directory (e.g. ~/.claude). */
export function claudeUserDir(ctx: PathContext = defaultPathContext()): string {
  const override = ctx.env.CLAUDE_CONFIG_DIR;
  if (override && override.trim()) return path.resolve(override);
  return path.join(ctx.home, '.claude');
}

/** User-level Claude Code settings file. */
export function claudeUserSettingsPath(ctx: PathContext = defaultPathContext()): string {
  return path.join(claudeUserDir(ctx), 'settings.json');
}

/** Project-level Claude Code directory (<project>/.claude). */
export function claudeProjectDir(projectRoot: string): string {
  return path.join(projectRoot, '.claude');
}

/** Project-level shared Claude Code settings (committed to git). */
export function claudeProjectSettingsPath(projectRoot: string): string {
  return path.join(claudeProjectDir(projectRoot), 'settings.json');
}

/** Project-level local Claude Code settings (git-ignored). */
export function claudeProjectLocalSettingsPath(projectRoot: string): string {
  return path.join(claudeProjectDir(projectRoot), 'settings.local.json');
}

/** Our user-level config directory, OS-appropriate via env-paths. */
export function userConfigDir(ctx: PathContext = defaultPathContext()): string {
  const override = ctx.env.CTR_CONFIG_DIR;
  if (override && override.trim()) return path.resolve(override);
  // env-paths derives platform-correct locations; suffix '' avoids
  // "-nodejs" being appended to the directory name.
  return envPaths(PRODUCT, { suffix: '' }).config;
}

export function userConfigPath(ctx: PathContext = defaultPathContext()): string {
  return path.join(userConfigDir(ctx), 'config.json');
}

/** Our user-level managed-state file (records what the installer owns). */
export function userStatePath(ctx: PathContext = defaultPathContext()): string {
  return path.join(userConfigDir(ctx), 'state.json');
}

/** Our project-level managed directory (<project>/.claude-task-router). */
export function projectManagedDir(projectRoot: string): string {
  return path.join(projectRoot, '.claude-task-router');
}

export function projectConfigPath(projectRoot: string): string {
  return path.join(projectManagedDir(projectRoot), 'config.json');
}

export function projectStatePath(projectRoot: string): string {
  return path.join(projectManagedDir(projectRoot), 'state.json');
}

/** Directory where settings backups are written before modification. */
export function backupDir(scope: 'global' | 'project', projectRoot: string): string {
  return scope === 'global'
    ? path.join(userConfigDir(), 'backups')
    : path.join(projectManagedDir(projectRoot), 'backups');
}

export const PRODUCT_NAME = PRODUCT;
