import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Platform and shell detection used by the installer and doctor. */

export type OsName = 'macos' | 'linux' | 'windows' | 'unknown';

export function osName(platform: NodeJS.Platform = process.platform): OsName {
  switch (platform) {
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    case 'win32':
      return 'windows';
    default:
      return 'unknown';
  }
}

export function isWindows(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32';
}

/** Best-effort detection of the user's interactive shell. */
export function detectShell(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SHELL) return path.basename(env.SHELL);
  if (isWindows()) {
    if (env.PSModulePath) return 'powershell';
    return 'cmd';
  }
  return 'unknown';
}

export interface PlatformInfo {
  os: OsName;
  platform: NodeJS.Platform;
  arch: string;
  nodeVersion: string;
  shell: string;
  homedir: string;
}

export function platformInfo(): PlatformInfo {
  return {
    os: osName(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    shell: detectShell(),
    homedir: os.homedir(),
  };
}

/**
 * Resolve a command name against PATH (like `which`/`where`), returning the
 * first matching executable path, or null. Honors PATHEXT on Windows.
 */
export function findOnPath(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string | null {
  // Absolute/relative paths are used as-is.
  if (command.includes('/') || command.includes('\\')) {
    return existsExecutable(command) ? command : null;
  }
  const pathVar = env.PATH ?? env.Path ?? '';
  const sep = platform === 'win32' ? ';' : ':';
  const dirs = pathVar.split(sep).filter(Boolean);
  const exts =
    platform === 'win32'
      ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext);
      if (existsExecutable(candidate)) return candidate;
    }
  }
  return null;
}

function existsExecutable(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Parse a Node.js semver-ish version string into numeric parts.
 * Returns null for unparseable input.
 */
export function parseNodeMajor(version: string): number | null {
  const match = /^v?(\d+)\./.exec(version.trim());
  if (!match || match[1] === undefined) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isNaN(n) ? null : n;
}
