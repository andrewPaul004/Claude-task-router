import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

/**
 * Test sandbox: an isolated temp directory plus an env that redirects BOTH our
 * config (CTR_CONFIG_DIR) and Claude Code's config (CLAUDE_CONFIG_DIR) into it.
 * This guarantees no test ever reads or writes a real installation.
 */

const created: string[] = [];

afterEach(() => {
  while (created.length) {
    const dir = created.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

export interface Sandbox {
  root: string;
  project: string;
  env: NodeJS.ProcessEnv;
}

export function makeSandbox(): Sandbox {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-test-'));
  created.push(root);
  const project = path.join(root, 'project');
  fs.mkdirSync(project, { recursive: true });
  // Make it look like a project root.
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({ name: 'fixture' })
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CTR_CONFIG_DIR: path.join(root, 'ctr-config'),
    CLAUDE_CONFIG_DIR: path.join(root, 'claude-config'),
    // Ensure env-var config layer never bleeds in from the outer process.
    CTR_CONFIG_JSON: undefined,
    NO_COLOR: '1',
  };
  return { root, project, env };
}

export function readJsonFile<T = unknown>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

export function writeJsonFile(p: string, value: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2));
}

export function fileExists(p: string): boolean {
  return fs.existsSync(p);
}
