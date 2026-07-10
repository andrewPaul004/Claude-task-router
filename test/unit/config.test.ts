import { describe, it, expect } from 'vitest';
import {
  loadConfig,
  setConfigValue,
  getByPath,
  coerceValue,
} from '../../src/config/store.js';
import { ConfigSchema, defaultConfig } from '../../src/config/schema.js';
import { migrateConfig } from '../../src/migrations/index.js';
import { userConfigPath, projectConfigPath } from '../../src/platform/paths.js';
import { makeSandbox, writeJsonFile, readJsonFile } from '../helpers.js';

describe('config precedence (flags > env > project > user > defaults)', () => {
  it('returns defaults when nothing is configured', () => {
    const sb = makeSandbox();
    const { config } = loadConfig({
      cwd: sb.project,
      env: sb.env,
      projectRoot: sb.project,
    });
    expect(config.defaultModel).toBe(defaultConfig().defaultModel);
    expect(config.telemetry.enabled).toBe(false);
  });

  it('user config overrides defaults', () => {
    const sb = makeSandbox();
    writeJsonFile(userConfigPath({ home: '', cwd: sb.project, env: sb.env }), {
      defaultModel: 'opus',
    });
    const { config } = loadConfig({
      cwd: sb.project,
      env: sb.env,
      projectRoot: sb.project,
    });
    expect(config.defaultModel).toBe('opus');
  });

  it('project config overrides user config', () => {
    const sb = makeSandbox();
    writeJsonFile(userConfigPath({ home: '', cwd: sb.project, env: sb.env }), {
      defaultModel: 'opus',
    });
    writeJsonFile(projectConfigPath(sb.project), { defaultModel: 'haiku' });
    const { config } = loadConfig({
      cwd: sb.project,
      env: sb.env,
      projectRoot: sb.project,
    });
    expect(config.defaultModel).toBe('haiku');
  });

  it('env overrides project config', () => {
    const sb = makeSandbox();
    writeJsonFile(projectConfigPath(sb.project), { defaultModel: 'haiku' });
    const env = { ...sb.env, CTR_DEFAULT_MODEL: 'sonnet' };
    const { config } = loadConfig({ cwd: sb.project, env, projectRoot: sb.project });
    expect(config.defaultModel).toBe('sonnet');
  });

  it('flags override everything', () => {
    const sb = makeSandbox();
    writeJsonFile(projectConfigPath(sb.project), { defaultModel: 'haiku' });
    const env = { ...sb.env, CTR_DEFAULT_MODEL: 'sonnet' };
    const { config } = loadConfig({
      cwd: sb.project,
      env,
      projectRoot: sb.project,
      flags: { defaultModel: 'opus' },
    });
    expect(config.defaultModel).toBe('opus');
  });
});

describe('schema validation', () => {
  it('accepts an empty object and fills defaults', () => {
    expect(() => ConfigSchema.parse({})).not.toThrow();
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(() => ConfigSchema.parse({ bogusKey: 1 })).toThrow();
  });

  it('rejects invalid enum values', () => {
    expect(() => ConfigSchema.parse({ maximumEffort: 'nope' })).toThrow();
  });
});

describe('config migration', () => {
  it('migrates v0 legacy keys to v1', () => {
    const result = migrateConfig({ verbosity: 'explain', model: 'opus' });
    expect(result.config.transparencyMode).toBe('explain');
    expect(result.config.defaultModel).toBe('opus');
    expect(result.config.schemaVersion).toBe(1);
    expect(result.notes.length).toBeGreaterThan(0);
    expect('verbosity' in result.config).toBe(false);
  });

  it('flags configs from a newer schema as incompatible without crashing', () => {
    const result = migrateConfig({ schemaVersion: 999 });
    expect(result.incompatible).toBe(true);
  });
});

describe('set/get', () => {
  it('validates before writing and persists only the partial', () => {
    const sb = makeSandbox();
    const opts = { cwd: sb.project, env: sb.env, projectRoot: sb.project };
    setConfigValue('user', 'classifier.llmEnabled', true, opts);
    const raw = readJsonFile<Record<string, any>>(
      userConfigPath({ home: '', cwd: sb.project, env: sb.env })
    );
    expect(raw.classifier.llmEnabled).toBe(true);
    // Did not freeze other defaults into the file.
    expect(raw.defaultModel).toBeUndefined();
  });

  it('rejects invalid values', () => {
    const sb = makeSandbox();
    const opts = { cwd: sb.project, env: sb.env, projectRoot: sb.project };
    expect(() => setConfigValue('user', 'maximumEffort', 'bogus', opts)).toThrow();
  });

  it('coerces CLI string values', () => {
    expect(coerceValue('true')).toBe(true);
    expect(coerceValue('42')).toBe(42);
    expect(coerceValue('["a","b"]')).toEqual(['a', 'b']);
    expect(coerceValue('sonnet')).toBe('sonnet');
  });

  it('reads nested values by path', () => {
    const cfg = defaultConfig();
    expect(getByPath(cfg, 'classifier.model')).toBe('haiku');
    expect(getByPath(cfg, 'routingRules.tierThresholds.deep')).toBe(6.5);
  });
});
