import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultContextCollector } from '../../src/context/collector.js';
import { analyzePrompt } from '../../src/pipeline.js';
import { defaultConfig } from '../../src/config/schema.js';
import { makeSandbox } from '../helpers.js';

const collector = new DefaultContextCollector();

describe('ContextCollector', () => {
  it('does not collect for trivial prompts', async () => {
    const config = defaultConfig();
    const c = await analyzePrompt('Convert to CSV', config);
    expect(collector.shouldCollect(c, config)).toBe(false);
  });

  it('collects bounded, redacted context and never reads secrets', async () => {
    const sb = makeSandbox();
    // A referenced source file containing a secret, plus a .env that must be skipped.
    fs.writeFileSync(
      path.join(sb.project, 'app.ts'),
      'const KEY = "sk-ant-shouldberedacted999";\n'
    );
    fs.writeFileSync(path.join(sb.project, '.env'), 'DB_PASSWORD=topsecretvalue\n');
    fs.writeFileSync(path.join(sb.project, 'README.md'), '# Fixture project\n');

    const config = defaultConfig();
    const analysis = await analyzePrompt('Fix the bug in app.ts', config);
    const ctx = await collector.collect({
      projectRoot: sb.project,
      config,
      classification: analysis,
    });

    expect(ctx).not.toBeNull();
    // app.ts is referenced and included, but its secret is redacted.
    expect(ctx!.summaryText).not.toContain('sk-ant-shouldberedacted999');
    // .env content is never read.
    expect(ctx!.summaryText).not.toContain('topsecretvalue');
  });

  it('enforces the file-count limit', async () => {
    const sb = makeSandbox();
    const names: string[] = [];
    for (let i = 0; i < 8; i++) {
      const n = `mod${i}.ts`;
      names.push(n);
      fs.writeFileSync(path.join(sb.project, n), `export const x${i} = ${i};\n`);
    }
    const config = {
      ...defaultConfig(),
      contextLimits: { ...defaultConfig().contextLimits, maxFiles: 2 },
    };
    const analysis = await analyzePrompt(
      `Refactor these files: ${names.join(' ')}`,
      config
    );
    const ctx = await collector.collect({
      projectRoot: sb.project,
      config,
      classification: analysis,
    });
    expect(ctx!.files.length).toBeLessThanOrEqual(2);
  });
});
