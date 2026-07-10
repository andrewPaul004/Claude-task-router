import readline from 'node:readline/promises';
import { setConfigValue, type ConfigScope } from '../config/store.js';
import { ModelRegistry } from '../models/registry.js';
import { color, icon } from '../cli/io.js';
import { resolveScope, type CliContext } from '../cli/shared.js';
import { EFFORT_LEVELS } from '../types/analysis.js';

export interface InitFlags {
  yes?: boolean;
  optimization?: string; // balanced | lowest-cost | fastest | highest-quality
  promptHandling?: string; // auto | show-first | off
  routingDisplay?: string; // silent | compact | explain | confirm
  defaultModel?: string;
  allowedModels?: string;
  maxEffort?: string;
  repoContext?: boolean;
  classifierLlm?: boolean;
  logging?: boolean;
}

const OPTIMIZATION_PRESETS: Record<
  string,
  {
    cost: 'low' | 'medium' | 'high';
    quality: 'low' | 'medium' | 'high';
    latency: 'low' | 'medium' | 'high';
  }
> = {
  balanced: { cost: 'medium', quality: 'medium', latency: 'medium' },
  'lowest-cost': { cost: 'high', quality: 'low', latency: 'medium' },
  fastest: { cost: 'medium', quality: 'low', latency: 'high' },
  'highest-quality': { cost: 'low', quality: 'high', latency: 'low' },
};

export async function initCommand(ctx: CliContext, flags: InitFlags): Promise<number> {
  const { scope: installScope, error } = resolveScope(ctx, 'global');
  if (error) {
    ctx.io.err(`${icon.fail()} ${error}\n`);
    return 2;
  }
  const scope: ConfigScope = installScope === 'global' ? 'user' : 'project';
  const interactive = ctx.io.isTTY && !flags.yes;

  ctx.io.out(`${color.bold('Claude Task Router — setup')} (${scope} scope)\n`);
  if (!interactive) ctx.io.out(color.dim('Non-interactive: applying defaults/flags.\n'));

  let optimization = flags.optimization ?? 'balanced';
  let promptHandling = flags.promptHandling ?? 'auto';
  let routingDisplay = flags.routingDisplay ?? 'compact';
  let defaultModel = flags.defaultModel ?? 'sonnet';
  let allowedModels = flags.allowedModels ?? 'haiku,sonnet,opus';
  let maxEffort = flags.maxEffort ?? 'high';
  let repoContext = flags.repoContext ?? true;
  let classifierLlm = flags.classifierLlm ?? false;
  let logging = flags.logging ?? false;

  if (interactive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    try {
      optimization = await choose(
        rl,
        'Optimization preference',
        [
          ['balanced', 'Balanced'],
          ['lowest-cost', 'Lowest cost'],
          ['fastest', 'Fastest'],
          ['highest-quality', 'Highest quality'],
        ],
        optimization
      );
      promptHandling = await choose(
        rl,
        'Prompt handling',
        [
          ['auto', 'Optimize vague prompts automatically'],
          ['show-first', 'Show optimized prompt first'],
          ['off', 'Do not optimize prompts'],
        ],
        promptHandling
      );
      routingDisplay = await choose(
        rl,
        'Routing display',
        [
          ['silent', 'Silent'],
          ['compact', 'Compact'],
          ['explain', 'Explain every decision'],
          ['confirm', 'Ask before routing'],
        ],
        routingDisplay
      );
      defaultModel =
        (await rl.question(`Default model [${defaultModel}]: `)).trim() || defaultModel;
      allowedModels =
        (
          await rl.question(`Allowed models (comma-separated) [${allowedModels}]: `)
        ).trim() || allowedModels;
      maxEffort = await choose(
        rl,
        'Maximum effort',
        EFFORT_LEVELS.map((e) => [e, e] as [string, string]),
        maxEffort
      );
      repoContext = await yesNo(rl, 'Collect bounded repository context?', repoContext);
      classifierLlm = await yesNo(
        rl,
        'Enable optional LLM classifier (uses API calls)?',
        classifierLlm
      );
      logging = await yesNo(rl, 'Enable local logging (prompts never logged)?', logging);
    } finally {
      rl.close();
    }
  }

  const preset = OPTIMIZATION_PRESETS[optimization] ?? OPTIMIZATION_PRESETS.balanced!;
  const registry = new ModelRegistry();
  const models = allowedModels
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaultTier = registry.tierOf(defaultModel);

  const opts = { cwd: ctx.cwd, env: ctx.env, projectRoot: ctx.projectRoot };
  const entries: Array<[string, unknown]> = [
    ['enabled', true],
    ['costPreference', preset.cost],
    ['qualityPreference', preset.quality],
    ['latencyPreference', preset.latency],
    ['optimizationMode', promptHandling],
    ['transparencyMode', routingDisplay],
    ['confirmationMode', routingDisplay === 'confirm' ? 'always' : 'high-risk'],
    ['defaultModel', defaultModel],
    ['defaultModelTier', defaultTier],
    ['allowedModels', models],
    ['maximumEffort', maxEffort],
    ['repositoryContext.enabled', repoContext],
    ['classifier.llmEnabled', classifierLlm],
    ['logging.enabled', logging],
  ];

  try {
    for (const [key, value] of entries) setConfigValue(scope, key, value, opts);
  } catch (err) {
    ctx.io.err(`${icon.fail()} ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  ctx.io.out(`\n${icon.ok()} Saved preferences to ${scope} config.\n`);
  ctx.io.out(
    color.dim('Run `claude-task-router status` to review, or `doctor` to verify.\n')
  );
  return 0;
}

async function choose(
  rl: readline.Interface,
  label: string,
  options: Array<[string, string]>,
  current: string
): Promise<string> {
  const currentIdx = Math.max(
    0,
    options.findIndex(([v]) => v === current)
  );
  process.stderr.write(`\n${label}:\n`);
  options.forEach(([, text], i) => process.stderr.write(`  ${i + 1}. ${text}\n`));
  const answer = (await rl.question(`Choose [${currentIdx + 1}]: `)).trim();
  if (!answer) return current;
  const n = Number.parseInt(answer, 10);
  if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1]![0];
  // Allow typing the value directly.
  const match = options.find(([v]) => v === answer.toLowerCase());
  return match ? match[0] : current;
}

async function yesNo(
  rl: readline.Interface,
  label: string,
  current: boolean
): Promise<boolean> {
  const answer = (await rl.question(`${label} [${current ? 'Y/n' : 'y/N'}]: `))
    .trim()
    .toLowerCase();
  if (!answer) return current;
  return answer === 'y' || answer === 'yes';
}
