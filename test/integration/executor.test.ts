import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeCliAdapter } from '../../src/sdk/adapter.js';
import { resetClaudeInfoCache } from '../../src/sdk/detect.js';
import { runWrapper, type RunIO } from '../../src/executor/executor.js';
import { defaultConfig, type Config } from '../../src/config/schema.js';
import { makeSandbox } from '../helpers.js';

// Use a guaranteed-missing executable so tests never depend on a real Claude
// Code install. The adapter still builds routing flags and reports a note.
const FAKE = 'ctr-nonexistent-binary-zzz';

function config(): Config {
  return {
    ...defaultConfig(),
    sdkBehavior: { ...defaultConfig().sdkBehavior, executable: FAKE },
  };
}

function captureIO(): RunIO & { outText: () => string; errText: () => string } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    isTTY: false,
    outText: () => out.join(''),
    errText: () => err.join(''),
  };
}

beforeEach(() => resetClaudeInfoCache());

describe('ClaudeCliAdapter.plan', () => {
  it('builds routing flags and the prompt as the final argument', async () => {
    const adapter = new ClaudeCliAdapter(config());
    const plan = await adapter.plan({ prompt: 'do it', model: 'opus', effort: 'high' });
    expect(plan.args).toContain('--model');
    expect(plan.args).toContain('opus');
    expect(plan.args).toContain('--effort');
    expect(plan.args).toContain('high');
    expect(plan.args[plan.args.length - 1]).toBe('do it');
    // ROUTER_ACTIVE env guards against hook recursion in the child.
    expect(plan.env.CLAUDE_TASK_ROUTER_ACTIVE).toBe('1');
    // A note flags that the executable was not found.
    expect(plan.notes.join(' ')).toMatch(/not found|not runnable/i);
  });
});

describe('runWrapper (dry-run)', () => {
  it('produces an analysis and plan without executing', async () => {
    const sb = makeSandbox();
    const io = captureIO();
    const outcome = await runWrapper(
      'Fix the login issue',
      config(),
      {
        dryRun: true,
        cwd: sb.project,
        env: sb.env,
        projectRoot: sb.project,
      },
      io
    );
    expect(outcome.executed).toBe(false);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.analysis.originalPrompt).toBe('Fix the login issue');
    expect(io.outText()).toMatch(/Dry run/);
  });

  it('honors explicit model/effort overrides', async () => {
    const sb = makeSandbox();
    const io = captureIO();
    const outcome = await runWrapper(
      'Convert to CSV',
      config(),
      {
        dryRun: true,
        modelOverride: 'opus',
        effortOverride: 'xhigh',
        cwd: sb.project,
        env: sb.env,
        projectRoot: sb.project,
      },
      io
    );
    expect(outcome.analysis.recommendedModel).toBe('opus');
    expect(outcome.analysis.recommendedEffort).toBe('xhigh');
  });

  it('emits JSON and does not execute with --json', async () => {
    const sb = makeSandbox();
    const io = captureIO();
    const outcome = await runWrapper(
      'Add a CLI flag',
      config(),
      {
        json: true,
        cwd: sb.project,
        env: sb.env,
        projectRoot: sb.project,
      },
      io
    );
    expect(outcome.executed).toBe(false);
    const parsed = JSON.parse(io.outText());
    expect(parsed.analysis).toBeDefined();
    expect(parsed.plan).toBeDefined();
  });
});
