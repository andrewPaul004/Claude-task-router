import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { InstallManager } from '../../src/install/manager.js';
import { hasOurHook, readSettings } from '../../src/install/settings.js';
import { readState } from '../../src/install/state.js';
import {
  claudeProjectSettingsPath,
  claudeUserSettingsPath,
  projectConfigPath,
} from '../../src/platform/paths.js';
import { makeSandbox, fileExists } from '../helpers.js';

function opts(sb: ReturnType<typeof makeSandbox>, extra: Record<string, unknown> = {}) {
  return {
    scope: 'project' as const,
    projectRoot: sb.project,
    cwd: sb.project,
    env: sb.env,
    skipDetect: true,
    stamp: '2020-01-01T00-00-00Z',
    ...extra,
  };
}

describe('project install lifecycle', () => {
  it('dry-run writes nothing', async () => {
    const sb = makeSandbox();
    const m = new InstallManager();
    const report = await m.install(opts(sb, { dryRun: true }));
    expect(report.dryRun).toBe(true);
    expect(fileExists(claudeProjectSettingsPath(sb.project))).toBe(false);
    expect(report.changes.length).toBeGreaterThan(0);
  });

  it('installs hook, config, and state', async () => {
    const sb = makeSandbox();
    const m = new InstallManager();
    await m.install(opts(sb));
    const settings = readSettings(claudeProjectSettingsPath(sb.project));
    expect(hasOurHook(settings)).toBe(true);
    expect(fileExists(projectConfigPath(sb.project))).toBe(true);
    const state = readState('project', sb.project, {
      home: '',
      cwd: sb.project,
      env: sb.env,
    });
    expect(state).not.toBeNull();
    expect(state!.hookIdentifiers.length).toBeGreaterThan(0);
    expect(state!.settingsModified.length).toBeGreaterThan(0);
  });

  it('is idempotent (no duplicate hook on re-install)', async () => {
    const sb = makeSandbox();
    const m = new InstallManager();
    await m.install(opts(sb));
    await m.install(opts(sb));
    const settings = readSettings(claudeProjectSettingsPath(sb.project));
    const groups = settings.hooks!.UserPromptSubmit!;
    const ourGroups = groups.filter((g) =>
      (g.hooks ?? []).some((h) => /claude-task-router/.test(h.command ?? ''))
    );
    expect(ourGroups.length).toBe(1);
  });

  it('preserves existing settings and backs up before modifying', async () => {
    const sb = makeSandbox();
    const settingsPath = claudeProjectSettingsPath(sb.project);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        model: 'opus',
        hooks: {
          UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'user-hook.sh' }] }],
          Stop: [{ hooks: [{ type: 'command', command: 'stop.sh' }] }],
        },
      })
    );
    const m = new InstallManager();
    await m.install(opts(sb));
    const settings = readSettings(settingsPath);
    expect(settings.model).toBe('opus');
    expect(settings.hooks!.Stop).toBeDefined();
    const ups = settings.hooks!.UserPromptSubmit!;
    // user-hook preserved + ours added.
    expect(JSON.stringify(ups)).toContain('user-hook.sh');
    expect(hasOurHook(settings)).toBe(true);
    // backup exists.
    const backups = fs.readdirSync(
      path.join(sb.project, '.claude-task-router', 'backups')
    );
    expect(backups.length).toBeGreaterThan(0);
  });
});

describe('uninstall', () => {
  it('removes only our hook, keeping user hooks', async () => {
    const sb = makeSandbox();
    const settingsPath = claudeProjectSettingsPath(sb.project);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'user-hook.sh' }] }],
        },
      })
    );
    const m = new InstallManager();
    await m.install(opts(sb));
    await m.uninstall(opts(sb));
    const settings = readSettings(settingsPath);
    expect(hasOurHook(settings)).toBe(false);
    expect(JSON.stringify(settings)).toContain('user-hook.sh');
    expect(
      readState('project', sb.project, { home: '', cwd: sb.project, env: sb.env })
    ).toBeNull();
  });

  it('keeps config by default, removes it with --purge', async () => {
    const sb = makeSandbox();
    const m = new InstallManager();
    await m.install(opts(sb));
    await m.uninstall(opts(sb));
    expect(fileExists(projectConfigPath(sb.project))).toBe(true);

    await m.install(opts(sb));
    await m.uninstall(opts(sb, { purge: true }));
    expect(fileExists(projectConfigPath(sb.project))).toBe(false);
  });
});

describe('global install', () => {
  it('writes to the user Claude settings and config dirs', async () => {
    const sb = makeSandbox();
    const m = new InstallManager();
    await m.install({
      scope: 'global',
      projectRoot: null,
      cwd: sb.project,
      env: sb.env,
      skipDetect: true,
    });
    expect(
      hasOurHook(
        readSettings(claudeUserSettingsPath({ home: '', cwd: sb.project, env: sb.env }))
      )
    ).toBe(true);
  });
});
