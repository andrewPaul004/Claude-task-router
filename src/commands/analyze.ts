import { analyzePrompt } from '../pipeline.js';
import { humanAnalysis } from '../output/format.js';
import { resolved, type CliContext } from '../cli/shared.js';

export async function analyzeCommand(
  ctx: CliContext,
  prompt: string,
  opts: { json?: boolean; noContext?: boolean; noOptimize?: boolean }
): Promise<number> {
  const { config } = resolved(ctx);
  const effective = opts.noOptimize
    ? { ...config, optimizationMode: 'off' as const }
    : config;
  const analysis = await analyzePrompt(prompt, effective);

  if (opts.json) {
    ctx.io.out(`${JSON.stringify(analysis, null, 2)}\n`);
  } else {
    ctx.io.out(`${humanAnalysis(analysis, { showOptimized: true })}\n`);
  }
  return 0;
}

export async function optimizeCommand(
  ctx: CliContext,
  prompt: string,
  opts: { json?: boolean }
): Promise<number> {
  const { config } = resolved(ctx);
  const analysis = await analyzePrompt(prompt, config);
  const changed = analysis.optimizedPrompt.trim() !== prompt.trim();

  if (opts.json) {
    ctx.io.out(
      `${JSON.stringify(
        { originalPrompt: prompt, optimizedPrompt: analysis.optimizedPrompt, changed },
        null,
        2
      )}\n`
    );
  } else {
    ctx.io.out(`${analysis.optimizedPrompt}\n`);
  }
  return 0;
}
