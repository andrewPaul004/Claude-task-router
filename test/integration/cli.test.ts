import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSandbox } from '../helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = path.join(root, 'dist', 'cli', 'index.js');
const built = fs.existsSync(CLI);

function run(args: string[], input?: string, env?: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [CLI, ...args], {
    input: input ?? '',
    encoding: 'utf8',
    env: env ?? { ...process.env, NO_COLOR: '1' },
  });
}

// These exercise the actual built binary (shebang, bin entry, arg parsing).
describe.skipIf(!built)('built CLI end-to-end', () => {
  it('prints its version', () => {
    const r = run(['version']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('analyzes a prompt as JSON', () => {
    const r = run(['analyze', '--json', 'Fix the login issue']);
    expect(r.status).toBe(0);
    const a = JSON.parse(r.stdout);
    expect(a.taskType).toBe('debugging');
    expect(a.recommendedModel).toBeTruthy();
  });

  it('treats a bare prompt as run (dry-run does not execute)', () => {
    const r = run(['--dry-run', 'Add a --verbose flag to the CLI']);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toMatch(/Routing:|Dry run/);
  });

  it('optimizes a trivial prompt unchanged', () => {
    const r = run(['optimize', 'Convert these values into a comma-separated list']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('Convert these values into a comma-separated list');
  });

  it('processes a hook payload from stdin', () => {
    const payload = JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      user_prompt: 'Fix the login issue',
      cwd: process.cwd(),
    });
    const r = run(['hook'], payload);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
  });

  it('runs doctor with JSON output', () => {
    const sb = makeSandbox();
    const r = run(['doctor', '--json'], '', sb.env);
    // doctor exits non-zero only on hard failures; JSON must still parse.
    const parsed = JSON.parse(r.stdout);
    expect(Array.isArray(parsed.checks)).toBe(true);
  });

  it('runs the eval suite and passes the agreement gate', () => {
    const r = run(['eval', '--json']);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.routingAgreement).toBeGreaterThanOrEqual(0.9);
  });
});
