import fs from 'node:fs';
import path from 'node:path';

/** Small, dependency-free filesystem helpers with safe defaults. */

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function readText(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

/** Read and parse a JSON file, returning null on missing/invalid JSON. */
export function readJson<T = unknown>(p: string): T | null {
  const raw = readText(p);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Atomically write text: write to a temp file in the same directory, then
 * rename over the target so a crash never leaves a half-written file.
 */
export function writeTextAtomic(p: string, contents: string, mode?: number): void {
  ensureDir(path.dirname(p));
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, contents, mode !== undefined ? { mode } : undefined);
  fs.renameSync(tmp, p);
  if (mode !== undefined) {
    try {
      fs.chmodSync(p, mode);
    } catch {
      // chmod may be a no-op or unsupported on some platforms; ignore.
    }
  }
}

export function writeJsonAtomic(p: string, value: unknown, mode?: number): void {
  writeTextAtomic(p, `${JSON.stringify(value, null, 2)}\n`, mode);
}

export function removeFileIfExists(p: string): boolean {
  try {
    fs.rmSync(p, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** Restrict a file to owner read/write (0o600) where the platform supports it. */
export function restrictPermissions(p: string): void {
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    // Windows / unsupported FS: best-effort only.
  }
}
