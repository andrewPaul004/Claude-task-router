import { CURRENT_CONFIG_SCHEMA_VERSION } from '../config/schema.js';

/**
 * Configuration migrations.
 *
 * Persisted config files carry a `schemaVersion`. Files written by an older
 * product version are migrated up to {@link CURRENT_CONFIG_SCHEMA_VERSION}
 * step-by-step before being merged and validated. Files with no version are
 * treated as version 0 (pre-1.0 drafts).
 *
 * Each step is a pure transform over a plain object so it is trivially
 * testable and never executes configuration as code.
 */

export interface MigrationStep {
  from: number;
  to: number;
  describe: string;
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * v0 → v1: normalize early-draft key names.
 * Pre-1.0 drafts used `verbosity` and `model`; these became `transparencyMode`
 * and `defaultModel` respectively.
 */
const v0_to_v1: MigrationStep = {
  from: 0,
  to: 1,
  describe: 'Rename legacy keys (verbosity → transparencyMode, model → defaultModel).',
  migrate: (raw) => {
    const out = { ...raw };
    if ('verbosity' in out && !('transparencyMode' in out)) {
      out.transparencyMode = out.verbosity;
    }
    delete out.verbosity;
    if ('model' in out && !('defaultModel' in out)) {
      out.defaultModel = out.model;
    }
    delete out.model;
    return out;
  },
};

const STEPS: MigrationStep[] = [v0_to_v1];

export interface MigrationResult {
  config: Record<string, unknown>;
  from: number;
  to: number;
  notes: string[];
  /** True when the file was written by a newer product than we understand. */
  incompatible: boolean;
}

function detectVersion(raw: Record<string, unknown>): number {
  const v = raw.schemaVersion;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function migrateConfig(raw: Record<string, unknown>): MigrationResult {
  const from = detectVersion(raw);
  const notes: string[] = [];

  if (from > CURRENT_CONFIG_SCHEMA_VERSION) {
    return {
      config: raw,
      from,
      to: from,
      incompatible: true,
      notes: [
        `Config schemaVersion ${from} is newer than this version supports ` +
          `(${CURRENT_CONFIG_SCHEMA_VERSION}). Using it as-is; consider upgrading claude-task-router.`,
      ],
    };
  }

  let current = { ...raw };
  let version = from;
  while (version < CURRENT_CONFIG_SCHEMA_VERSION) {
    const step = STEPS.find((s) => s.from === version);
    if (!step) break; // no path forward; validation will apply defaults
    current = step.migrate(current);
    notes.push(`Migrated config v${step.from} → v${step.to}: ${step.describe}`);
    version = step.to;
  }
  current.schemaVersion = CURRENT_CONFIG_SCHEMA_VERSION;

  return {
    config: current,
    from,
    to: CURRENT_CONFIG_SCHEMA_VERSION,
    incompatible: false,
    notes,
  };
}

export function needsMigration(raw: Record<string, unknown>): boolean {
  return detectVersion(raw) < CURRENT_CONFIG_SCHEMA_VERSION;
}
