import {
  fileExists,
  readJson,
  removeFileIfExists,
  writeJsonAtomic,
} from '../platform/fs.js';
import {
  defaultPathContext,
  projectStatePath,
  userStatePath,
  type PathContext,
} from '../platform/paths.js';
import { CURRENT_CONFIG_SCHEMA_VERSION } from '../config/schema.js';
import { productVersion } from '../version.js';

/**
 * Managed installation state.
 *
 * Records exactly what the installer owns — files it created, the settings
 * files and hook commands it added — so upgrades and uninstalls can touch only
 * product-owned changes and never guess. This is the source of truth for
 * "restore only what we changed".
 */

export type InstallScope = 'global' | 'project';

export interface SettingsModification {
  path: string;
  event: string;
  command: string;
}

export interface ManagedState {
  productVersion: string;
  configSchemaVersion: number;
  installDate: string;
  installScope: InstallScope;
  filesCreated: string[];
  settingsModified: SettingsModification[];
  hookIdentifiers: string[];
  backupPaths: string[];
}

export function newState(scope: InstallScope, isoDate: string): ManagedState {
  return {
    productVersion: productVersion(),
    configSchemaVersion: CURRENT_CONFIG_SCHEMA_VERSION,
    installDate: isoDate,
    installScope: scope,
    filesCreated: [],
    settingsModified: [],
    hookIdentifiers: [],
    backupPaths: [],
  };
}

export function statePath(
  scope: InstallScope,
  projectRoot: string | null,
  ctx: PathContext = defaultPathContext()
): string {
  if (scope === 'global') return userStatePath(ctx);
  if (!projectRoot) throw new Error('Project root required for project-scope state.');
  return projectStatePath(projectRoot);
}

export function readState(
  scope: InstallScope,
  projectRoot: string | null,
  ctx: PathContext = defaultPathContext()
): ManagedState | null {
  const p = statePath(scope, projectRoot, ctx);
  return readJson<ManagedState>(p);
}

export function writeState(
  state: ManagedState,
  projectRoot: string | null,
  ctx: PathContext = defaultPathContext()
): string {
  const p = statePath(state.installScope, projectRoot, ctx);
  writeJsonAtomic(p, state, 0o600);
  return p;
}

export function clearState(
  scope: InstallScope,
  projectRoot: string | null,
  ctx: PathContext = defaultPathContext()
): boolean {
  const p = statePath(scope, projectRoot, ctx);
  if (!fileExists(p)) return false;
  return removeFileIfExists(p);
}

export function isInstalled(
  scope: InstallScope,
  projectRoot: string | null,
  ctx: PathContext = defaultPathContext()
): boolean {
  return fileExists(statePath(scope, projectRoot, ctx));
}
