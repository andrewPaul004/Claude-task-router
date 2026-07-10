import { resolved, type CliContext } from '../cli/shared.js';
import { color, icon } from '../cli/io.js';
import { analyzePrompt } from '../pipeline.js';
import { runUserPromptSubmitHook } from '../hooks/user-prompt-submit.js';
import { FIXTURES } from '../eval/fixtures.js';
import type { Config } from '../config/schema.js';

interface Stats {
  count: number;
  avg: number;
  p50: number;
  p95: number;
  max: number;
}

function stats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length || 1;
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    count: sorted.length,
    avg: sorted.reduce((a, b) => a + b, 0) / n,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

export async function benchmarkCommand(
  ctx: CliContext,
  opts: { json?: boolean; iterations?: number }
): Promise<number> {
  const iterations = Math.max(1, opts.iterations ?? 20);
  const base = resolved(ctx).config;
  // Disable cache so each measurement reflects real work.
  const config: Config = { ...base, cache: { ...base.cache, enabled: false } };

  const prompts = FIXTURES.map((f) => f.prompt);

  // Warm up (JIT, module init).
  for (const p of prompts.slice(0, 5)) await analyzePrompt(p, config);

  // Classification/analysis latency.
  const classify: number[] = [];
  for (let i = 0; i < iterations; i++) {
    for (const p of prompts) {
      const t0 = performance.now();
      await analyzePrompt(p, config);
      classify.push(performance.now() - t0);
    }
  }

  // Hook processing latency (no repo context).
  const hook: number[] = [];
  for (let i = 0; i < iterations; i++) {
    for (const p of prompts) {
      const raw = JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        user_prompt: p,
        cwd: ctx.cwd,
      });
      const t0 = performance.now();
      await runUserPromptSubmitHook(raw, { env: { ...ctx.env }, cwd: ctx.cwd });
      hook.push(performance.now() - t0);
    }
  }

  const cs = stats(classify);
  const hs = stats(hook);

  if (opts.json) {
    ctx.io.out(
      `${JSON.stringify({ iterations, classification: cs, hook: hs }, null, 2)}\n`
    );
    return 0;
  }

  const line = (label: string, s: Stats, targetP95: number) => {
    const ok = s.p95 <= targetP95;
    ctx.io.out(
      `  ${ok ? icon.ok() : icon.warn()} ${label.padEnd(22)} avg ${s.avg.toFixed(2)}ms  p50 ${s.p50.toFixed(2)}ms  ` +
        `p95 ${s.p95.toFixed(2)}ms  max ${s.max.toFixed(2)}ms  ${color.dim(`(target p95 ≤ ${targetP95}ms)`)}\n`
    );
  };

  ctx.io.out(
    `${color.bold('Benchmark')} — ${cs.count} classification samples, ${hs.count} hook samples\n\n`
  );
  line('Classification', cs, 100);
  line('Hook (no context)', hs, 300);
  ctx.io.out(
    `\n${color.dim('Measured on this machine; results vary by hardware and Node version.')}\n`
  );
  return 0;
}
