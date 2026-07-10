import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  claudeUserDir,
  claudeUserSettingsPath,
  claudeProjectSettingsPath,
  projectManagedDir,
  userConfigDir,
} from '../../src/platform/paths.js';

describe('cross-platform path handling', () => {
  it('honors CLAUDE_CONFIG_DIR for the user Claude dir', () => {
    const ctx = {
      home: '/home/u',
      cwd: '/w',
      env: { CLAUDE_CONFIG_DIR: '/custom/claude' },
    };
    expect(claudeUserDir(ctx)).toBe(path.resolve('/custom/claude'));
    expect(claudeUserSettingsPath(ctx)).toBe(
      path.join(path.resolve('/custom/claude'), 'settings.json')
    );
  });

  it('falls back to ~/.claude when no override', () => {
    const ctx = { home: '/home/u', cwd: '/w', env: {} };
    expect(claudeUserDir(ctx)).toBe(path.join('/home/u', '.claude'));
  });

  it('honors CTR_CONFIG_DIR for our user config dir', () => {
    const ctx = { home: '/home/u', cwd: '/w', env: { CTR_CONFIG_DIR: '/custom/ctr' } };
    expect(userConfigDir(ctx)).toBe(path.resolve('/custom/ctr'));
  });

  it('derives project paths under the project root', () => {
    expect(claudeProjectSettingsPath('/repo')).toBe(
      path.join('/repo', '.claude', 'settings.json')
    );
    expect(projectManagedDir('/repo')).toBe(path.join('/repo', '.claude-task-router'));
  });
});
