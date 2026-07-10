import { describe, it, expect } from 'vitest';
import { runUserPromptSubmitHook } from '../../src/hooks/user-prompt-submit.js';
import { makeSandbox } from '../helpers.js';

interface HookOut {
  hookSpecificOutput: { hookEventName: string; additionalContext: string };
}

function input(prompt: string, cwd: string): string {
  return JSON.stringify({
    hook_event_name: 'UserPromptSubmit',
    user_prompt: prompt,
    cwd,
  });
}

describe('UserPromptSubmit hook', () => {
  it('injects guidance for non-trivial prompts', async () => {
    const sb = makeSandbox();
    const res = await runUserPromptSubmitHook(input('Fix the login issue', sb.project), {
      env: sb.env,
    });
    expect(res.exitCode).toBe(0);
    expect(res.injected).toBe(true);
    const out = JSON.parse(res.stdout) as HookOut;
    expect(out.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(out.hookSpecificOutput.additionalContext.length).toBeGreaterThan(0);
  });

  it('stays silent for trivial prompts', async () => {
    const sb = makeSandbox();
    const res = await runUserPromptSubmitHook(
      input('Convert these to a CSV list', sb.project),
      {
        env: sb.env,
      }
    );
    expect(res.exitCode).toBe(0);
    expect(res.injected).toBe(false);
    expect(res.stdout).toBe('');
  });

  it('avoids recursion when the wrapper already routed', async () => {
    const sb = makeSandbox();
    const env = { ...sb.env, CLAUDE_TASK_ROUTER_ACTIVE: '1' };
    const res = await runUserPromptSubmitHook(input('Fix the login issue', sb.project), {
      env,
    });
    expect(res.injected).toBe(false);
    expect(res.stdout).toBe('');
  });

  it('fails open on malformed input', async () => {
    const sb = makeSandbox();
    const res = await runUserPromptSubmitHook('this is not json', { env: sb.env });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe('');
  });

  it('respects enabled=false via env', async () => {
    const sb = makeSandbox();
    const env = { ...sb.env, CTR_ENABLED: 'false' };
    const res = await runUserPromptSubmitHook(input('Fix the login issue', sb.project), {
      env,
    });
    expect(res.injected).toBe(false);
  });

  it('never throws even if analysis fails (fail open)', async () => {
    const sb = makeSandbox();
    const res = await runUserPromptSubmitHook(input('Fix the login issue', sb.project), {
      env: sb.env,
      analyze: async () => {
        throw new Error('boom');
      },
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe('');
  });

  it('reads the legacy `prompt` field defensively', async () => {
    const sb = makeSandbox();
    const raw = JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Fix the login issue',
    });
    const res = await runUserPromptSubmitHook(raw, { env: sb.env, cwd: sb.project });
    expect(res.injected).toBe(true);
  });
});
