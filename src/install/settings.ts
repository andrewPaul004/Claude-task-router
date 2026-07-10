import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, readJson } from '../platform/fs.js';

/**
 * Safe Claude Code settings editing.
 *
 * All functions here are pure with respect to the settings object: they take a
 * parsed object and return a new one, mutating ONLY the
 * `hooks.UserPromptSubmit` entries we own. Every other key — and every hook we
 * did not create — is preserved untouched. The whole settings file is never
 * replaced; the file manager reads, applies a minimal change, backs up, and
 * writes back.
 */

export const HOOK_EVENT = 'UserPromptSubmit';
export const HOOK_COMMAND = 'claude-task-router hook';
export const HOOK_TIMEOUT_SECONDS = 10;

interface HookCommand {
  type?: string;
  command?: string;
  timeout?: number;
  [k: string]: unknown;
}
interface HookGroup {
  matcher?: string;
  hooks?: HookCommand[];
  [k: string]: unknown;
}
export interface Settings {
  hooks?: Record<string, HookGroup[]>;
  [k: string]: unknown;
}

/** Recognize a hook command owned by this product (installed bin or alias). */
export function isOurHookCommand(cmd: string | undefined): boolean {
  if (!cmd) return false;
  return /(?:claude-task-router|\bctr)\s+hook\b/.test(cmd);
}

function groupIsOurs(group: HookGroup): boolean {
  return (
    Array.isArray(group.hooks) && group.hooks.some((h) => isOurHookCommand(h.command))
  );
}

export function hasOurHook(settings: Settings): boolean {
  const groups = settings.hooks?.[HOOK_EVENT];
  return Array.isArray(groups) && groups.some(groupIsOurs);
}

function ourGroup(): HookGroup {
  return {
    hooks: [{ type: 'command', command: HOOK_COMMAND, timeout: HOOK_TIMEOUT_SECONDS }],
  };
}

/** Add our hook idempotently. Returns a new settings object. */
export function addHook(settings: Settings): { settings: Settings; changed: boolean } {
  const next: Settings = structuredClone(settings);
  if (hasOurHook(next)) return { settings: next, changed: false };
  if (!next.hooks) next.hooks = {};
  if (!Array.isArray(next.hooks[HOOK_EVENT])) next.hooks[HOOK_EVENT] = [];
  next.hooks[HOOK_EVENT]!.push(ourGroup());
  return { settings: next, changed: true };
}

/** Remove only our hook entries. Returns a new settings object. */
export function removeHook(settings: Settings): { settings: Settings; removed: number } {
  const next: Settings = structuredClone(settings);
  const groups = next.hooks?.[HOOK_EVENT];
  if (!Array.isArray(groups)) return { settings: next, removed: 0 };

  let removed = 0;
  const kept = groups
    .map((group) => {
      if (!Array.isArray(group.hooks)) return group;
      const before = group.hooks.length;
      const filtered = group.hooks.filter((h) => !isOurHookCommand(h.command));
      removed += before - filtered.length;
      return { ...group, hooks: filtered };
    })
    // Drop groups that became empty (only if they held our hook).
    .filter((group) => (Array.isArray(group.hooks) ? group.hooks.length > 0 : true));

  if (kept.length > 0) {
    next.hooks![HOOK_EVENT] = kept;
  } else {
    delete next.hooks![HOOK_EVENT];
  }
  if (next.hooks && Object.keys(next.hooks).length === 0) delete next.hooks;

  return { settings: next, removed };
}

export function readSettings(settingsPath: string): Settings {
  const data = readJson<Settings>(settingsPath);
  return data && typeof data === 'object' ? data : {};
}

/** Back up an existing settings file. Returns the backup path, or null if the
 * source does not exist. `stamp` is injectable for deterministic tests. */
export function backupSettings(
  settingsPath: string,
  backupDirectory: string,
  stamp?: string
): string | null {
  if (!fs.existsSync(settingsPath)) return null;
  ensureDir(backupDirectory);
  const ts = stamp ?? new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.basename(settingsPath);
  const dest = path.join(backupDirectory, `${base}.${ts}.bak`);
  fs.copyFileSync(settingsPath, dest);
  return dest;
}
