import {
  backupDir as backupDirFor,
  claudeProjectSettingsPath,
  claudeUserSettingsPath,
  defaultPathContext,
  projectConfigPath,
  userConfigPath,
  type PathContext,
} from '../platform/paths.js';
import { fileExists, removeFileIfExists, writeJsonAtomic } from '../platform/fs.js';
import { CURRENT_CONFIG_SCHEMA_VERSION } from '../config/schema.js';
import { getClaudeInfo } from '../sdk/detect.js';
import {
  addHook,
  backupSettings,
  HOOK_COMMAND,
  HOOK_EVENT,
  hasOurHook,
  readSettings,
  removeHook,
} from './settings.js';
import {
  clearState,
  isInstalled,
  newState,
  readState,
  statePath as statePathFor,
  writeState,
  type InstallScope,
  type ManagedState,
} from './state.js';
import fs from 'node:fs';
import path from 'node:path';

/** A single planned or applied change, used for dry-run and reporting. */
export interface Change {
  action: 'create' | 'modify' | 'backup' | 'remove' | 'skip';
  target: string;
  detail: string;
}

export interface InstallOptions {
  scope: InstallScope;
  projectRoot: string | null;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  dryRun?: boolean;
  /** Injectable timestamp for deterministic tests. */
  stamp?: string;
  /** Skip Claude Code detection (tests). */
  skipDetect?: boolean;
}

export interface InstallReport {
  scope: InstallScope;
  dryRun: boolean;
  alreadyInstalled: boolean;
  settingsPath: string;
  configPath: string;
  statePath: string;
  changes: Change[];
  warnings: string[];
}

export interface UninstallOptions extends InstallOptions {
  /** Also remove product config + managed directory (destructive to prefs). */
  purge?: boolean;
}

function ctxOf(opts: { cwd?: string; env?: NodeJS.ProcessEnv }): PathContext {
  const base = defaultPathContext();
  return { home: base.home, cwd: opts.cwd ?? base.cwd, env: opts.env ?? base.env };
}

function settingsPathFor(
  scope: InstallScope,
  projectRoot: string | null,
  ctx: PathContext
): string {
  if (scope === 'global') return claudeUserSettingsPath(ctx);
  if (!projectRoot) throw new Error('Project root required for project-scope install.');
  return claudeProjectSettingsPath(projectRoot);
}

function configPathFor(
  scope: InstallScope,
  projectRoot: string | null,
  ctx: PathContext
): string {
  if (scope === 'global') return userConfigPath(ctx);
  if (!projectRoot) throw new Error('Project root required for project-scope install.');
  return projectConfigPath(projectRoot);
}

export class InstallManager {
  async install(opts: InstallOptions): Promise<InstallReport> {
    const ctx = ctxOf(opts);
    const { scope, projectRoot } = opts;
    const settingsPath = settingsPathFor(scope, projectRoot, ctx);
    const configPath = configPathFor(scope, projectRoot, ctx);
    const sPath = statePathFor(scope, projectRoot, ctx);
    const changes: Change[] = [];
    const warnings: string[] = [];

    if (!opts.skipDetect) {
      const info = await getClaudeInfo(process.env.CTR_CLAUDE_BIN ?? 'claude', ctx.env);
      if (!info.available) {
        warnings.push(
          'Claude Code CLI not detected. The hook is still installed and will fail open. ' +
            'Install Claude Code so the router can take effect.'
        );
      } else if (!info.capabilities.model || !info.capabilities.effort) {
        warnings.push(
          `Installed Claude Code (${info.version ?? 'unknown'}) does not advertise ` +
            `${!info.capabilities.model ? '--model ' : ''}${!info.capabilities.effort ? '--effort' : ''}`.trim() +
            '. Wrapper mode will recommend rather than apply those dimensions.'
        );
      }
    }

    const settings = readSettings(settingsPath);
    const settingsExisted = fileExists(settingsPath);
    const alreadyHasHook = hasOurHook(settings);
    const alreadyInstalled = alreadyHasHook && isInstalled(scope, projectRoot, ctx);

    // Plan settings change.
    const { settings: nextSettings, changed } = addHook(settings);
    if (changed) {
      if (settingsExisted) {
        changes.push({
          action: 'backup',
          target: settingsPath,
          detail: 'Back up existing Claude Code settings before modifying.',
        });
      }
      changes.push({
        action: settingsExisted ? 'modify' : 'create',
        target: settingsPath,
        detail: `Add ${HOOK_EVENT} hook: \`${HOOK_COMMAND}\`.`,
      });
    } else {
      changes.push({
        action: 'skip',
        target: settingsPath,
        detail: 'Hook already present.',
      });
    }

    // Plan config seed.
    const configExists = fileExists(configPath);
    if (!configExists) {
      changes.push({
        action: 'create',
        target: configPath,
        detail: 'Seed default configuration.',
      });
    } else {
      changes.push({
        action: 'skip',
        target: configPath,
        detail: 'Config already present.',
      });
    }

    changes.push({
      action: isInstalled(scope, projectRoot, ctx) ? 'modify' : 'create',
      target: sPath,
      detail: 'Record managed installation state.',
    });

    if (opts.dryRun) {
      return {
        scope,
        dryRun: true,
        alreadyInstalled,
        settingsPath,
        configPath,
        statePath: sPath,
        changes,
        warnings,
      };
    }

    // Apply.
    const state: ManagedState =
      readState(scope, projectRoot, ctx) ??
      newState(scope, opts.stamp ?? new Date().toISOString());
    state.installScope = scope;
    state.configSchemaVersion = CURRENT_CONFIG_SCHEMA_VERSION;

    if (changed) {
      if (settingsExisted) {
        const backup = backupSettings(
          settingsPath,
          backupDirFor(scope, projectRoot ?? ctx.cwd),
          opts.stamp
        );
        if (backup && !state.backupPaths.includes(backup)) state.backupPaths.push(backup);
      } else if (!state.filesCreated.includes(settingsPath)) {
        state.filesCreated.push(settingsPath);
      }
      writeJsonAtomic(settingsPath, nextSettings);
      if (
        !state.settingsModified.some(
          (m) => m.path === settingsPath && m.event === HOOK_EVENT
        )
      ) {
        state.settingsModified.push({
          path: settingsPath,
          event: HOOK_EVENT,
          command: HOOK_COMMAND,
        });
      }
      if (!state.hookIdentifiers.includes(HOOK_COMMAND))
        state.hookIdentifiers.push(HOOK_COMMAND);
    }

    if (!configExists) {
      writeJsonAtomic(configPath, {
        schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
        enabled: true,
        installScope: scope,
      });
      if (!state.filesCreated.includes(configPath)) state.filesCreated.push(configPath);
    }

    const writtenStatePath = writeState(state, projectRoot, ctx);

    return {
      scope,
      dryRun: false,
      alreadyInstalled,
      settingsPath,
      configPath,
      statePath: writtenStatePath,
      changes,
      warnings,
    };
  }

  async uninstall(opts: UninstallOptions): Promise<InstallReport> {
    const ctx = ctxOf(opts);
    const { scope, projectRoot } = opts;
    const settingsPath = settingsPathFor(scope, projectRoot, ctx);
    const configPath = configPathFor(scope, projectRoot, ctx);
    const sPath = statePathFor(scope, projectRoot, ctx);
    const changes: Change[] = [];
    const warnings: string[] = [];

    const state = readState(scope, projectRoot, ctx);
    const settings = readSettings(settingsPath);
    const settingsExisted = fileExists(settingsPath);
    const { settings: reduced, removed } = removeHook(settings);
    const weCreatedSettings = state?.filesCreated.includes(settingsPath) ?? false;
    const reducedIsEmpty = Object.keys(reduced).length === 0;

    if (removed > 0) {
      if (settingsExisted) {
        changes.push({
          action: 'backup',
          target: settingsPath,
          detail: 'Back up before removing hook.',
        });
      }
      if (reducedIsEmpty && weCreatedSettings) {
        changes.push({
          action: 'remove',
          target: settingsPath,
          detail: 'Remove settings file we created (now empty).',
        });
      } else {
        changes.push({
          action: 'modify',
          target: settingsPath,
          detail: `Remove ${HOOK_EVENT} hook.`,
        });
      }
    } else {
      changes.push({
        action: 'skip',
        target: settingsPath,
        detail: 'No product hook found.',
      });
    }

    if (opts.purge) {
      if (fileExists(configPath)) {
        changes.push({
          action: 'remove',
          target: configPath,
          detail: 'Purge product configuration.',
        });
      }
    } else if (fileExists(configPath)) {
      changes.push({
        action: 'skip',
        target: configPath,
        detail: 'Keep configuration (use --purge to remove).',
      });
    }

    if (fileExists(sPath)) {
      changes.push({ action: 'remove', target: sPath, detail: 'Remove managed state.' });
    }

    if (opts.dryRun) {
      return {
        scope,
        dryRun: true,
        alreadyInstalled: state !== null,
        settingsPath,
        configPath,
        statePath: sPath,
        changes,
        warnings,
      };
    }

    // Apply.
    if (removed > 0) {
      if (settingsExisted) {
        backupSettings(
          settingsPath,
          backupDirFor(scope, projectRoot ?? ctx.cwd),
          opts.stamp
        );
      }
      if (reducedIsEmpty && weCreatedSettings) {
        removeFileIfExists(settingsPath);
      } else {
        writeJsonAtomic(settingsPath, reduced);
      }
    }

    if (opts.purge) {
      removeFileIfExists(configPath);
      // Remove our project managed directory if it is now empty.
      if (scope === 'project' && projectRoot) {
        tryRemoveEmptyDir(path.dirname(configPath));
      }
    }

    clearState(scope, projectRoot, ctx);

    return {
      scope,
      dryRun: false,
      alreadyInstalled: state !== null,
      settingsPath,
      configPath,
      statePath: sPath,
      changes,
      warnings,
    };
  }
}

function tryRemoveEmptyDir(dir: string): void {
  try {
    const list = fs.readdirSync(dir);
    // Keep the directory if it still holds user files (e.g. backups they may want).
    const meaningful = list.filter((n) => n !== 'backups');
    if (meaningful.length === 0) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // best-effort
  }
}

export function createInstallManager(): InstallManager {
  return new InstallManager();
}
