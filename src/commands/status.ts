import { resolved, type CliContext } from '../cli/shared.js';
import { color, icon } from '../cli/io.js';
import { readState } from '../install/state.js';
import { hasOurHook, readSettings } from '../install/settings.js';
import {
  claudeProjectSettingsPath,
  claudeUserSettingsPath,
  defaultPathContext,
} from '../platform/paths.js';
import { ModelRegistry } from '../models/registry.js';
import { getClaudeInfo } from '../sdk/detect.js';
import { productVersion } from '../version.js';

export async function statusCommand(ctx: CliContext): Promise<number> {
  const { config, sources } = resolved(ctx);
  const pathCtx = { home: defaultPathContext().home, cwd: ctx.cwd, env: ctx.env };

  const globalState = readState('global', ctx.projectRoot, pathCtx);
  const projectState = ctx.projectRoot
    ? readState('project', ctx.projectRoot, pathCtx)
    : null;

  const globalHook = hasOurHook(readSettings(claudeUserSettingsPath(pathCtx)));
  const projectHook = ctx.projectRoot
    ? hasOurHook(readSettings(claudeProjectSettingsPath(ctx.projectRoot)))
    : false;

  const io = ctx.io;
  io.out(`${color.bold('Claude Task Router — status')}  v${productVersion()}\n\n`);

  io.out(`${color.bold('Installation')}\n`);
  io.out(`  Global:  ${installLine(globalState !== null, globalHook)}\n`);
  io.out(
    `  Project: ${ctx.projectRoot ? installLine(projectState !== null, projectHook) : color.dim('n/a (not in a project)')}\n`
  );
  io.out(
    `  User config:    ${sources.userExists ? sources.userConfigPath : color.dim('(defaults)')}\n`
  );
  io.out(
    `  Project config: ${sources.projectConfigPath ? (sources.projectExists ? sources.projectConfigPath : color.dim('(none)')) : color.dim('n/a')}\n`
  );

  io.out(`\n${color.bold('Effective configuration')}\n`);
  io.out(`  enabled:        ${config.enabled}\n`);
  io.out(`  routingMode:    ${config.routingMode}\n`);
  io.out(`  defaultModel:   ${config.defaultModel} (tier ${config.defaultModelTier})\n`);
  io.out(`  fallbackModel:  ${config.fallbackModel}\n`);
  io.out(`  allowedModels:  ${config.allowedModels.join(', ')}\n`);
  io.out(`  maximumEffort:  ${config.maximumEffort}\n`);
  io.out(`  optimization:   ${config.optimizationMode}\n`);
  io.out(`  transparency:   ${config.transparencyMode}\n`);
  io.out(`  confirmation:   ${config.confirmationMode}\n`);
  io.out(`  repoContext:    ${config.repositoryContext.enabled ? 'on' : 'off'}\n`);
  io.out(
    `  classifier LLM: ${config.classifier.llmEnabled ? `on (${config.classifier.model})` : 'off'}\n`
  );
  io.out(`  telemetry:      ${config.telemetry.enabled ? 'on' : color.green('off')}\n`);
  io.out(
    `  logging:        ${config.logging.enabled ? config.logging.level : color.green('off')}\n`
  );

  const info = await getClaudeInfo(config.sdkBehavior.executable, ctx.env).catch(
    () => null
  );
  io.out(`\n${color.bold('Claude Code')}\n`);
  if (info?.available) {
    io.out(
      `  ${icon.ok()} ${config.sdkBehavior.executable} v${info.version ?? 'unknown'}\n`
    );
    io.out(
      `  routing flags: --model ${yn(info.capabilities.model)}  --effort ${yn(info.capabilities.effort)}  --append-system-prompt ${yn(info.capabilities.appendSystemPrompt)}\n`
    );
  } else {
    io.out(`  ${icon.warn()} not detected (hook fails open; wrapper cannot execute)\n`);
  }
  return 0;
}

function installLine(stateExists: boolean, hook: boolean): string {
  if (stateExists && hook) return `${icon.ok()} installed`;
  if (hook) return `${icon.warn()} hook present, no managed state`;
  if (stateExists) return `${icon.warn()} state present, hook missing (run install)`;
  return color.dim('not installed');
}

function yn(b: boolean): string {
  return b ? color.green('yes') : color.yellow('no');
}

export async function modelsCommand(
  ctx: CliContext,
  opts: { json?: boolean }
): Promise<number> {
  const { config } = resolved(ctx);
  const registry = new ModelRegistry();
  const info = await getClaudeInfo(config.sdkBehavior.executable, ctx.env).catch(
    () => null
  );

  const rows = registry.all().map((m) => ({
    alias: m.alias,
    tier: m.tier,
    resolvedModel: m.resolvedModel,
    exampleConcreteId: m.exampleConcreteId ?? null,
    recommendedEfforts: m.recommendedEfforts,
    enabled: config.allowedModels.map((a) => a.toLowerCase()).includes(m.alias),
    isDefault: config.defaultModel.toLowerCase() === m.alias,
    isFallback: config.fallbackModel.toLowerCase() === m.alias,
  }));

  if (opts.json) {
    ctx.io.out(
      `${JSON.stringify(
        {
          models: rows,
          claudeAvailable: info?.available ?? false,
          routingRules: config.routingRules,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  ctx.io.out(`${color.bold('Models')} (alias → tier, resolved by Claude Code)\n\n`);
  for (const r of rows) {
    const tags = [
      r.enabled ? color.green('enabled') : color.dim('disabled'),
      r.isDefault ? color.cyan('default') : '',
      r.isFallback ? color.cyan('fallback') : '',
    ]
      .filter(Boolean)
      .join(' ');
    ctx.io.out(`  ${color.bold(r.alias.padEnd(8))} ${r.tier.padEnd(9)} ${tags}\n`);
    ctx.io.out(
      `    ${color.dim(`--model ${r.resolvedModel}  · efforts: ${r.recommendedEfforts.join('/')}  · e.g. ${r.exampleConcreteId ?? 'n/a'}`)}\n`
    );
  }
  ctx.io.out(`\n${color.bold('Routing categories')}\n`);
  ctx.io.out(
    `  tier thresholds: balanced ≥ ${config.routingRules.tierThresholds.balanced}, deep ≥ ${config.routingRules.tierThresholds.deep}\n`
  );
  ctx.io.out(`  effort by tier:  ${JSON.stringify(config.routingRules.effortByTier)}\n`);
  ctx.io.out(
    `  availability:    ${info?.available ? color.green('Claude Code present') : color.yellow('Claude Code not detected')} ` +
      `${color.dim('(actual model access depends on your Anthropic account/plan)')}\n`
  );
  return 0;
}

export function versionCommand(ctx: CliContext, opts: { json?: boolean }): number {
  if (opts.json) {
    ctx.io.out(`${JSON.stringify({ version: productVersion() })}\n`);
  } else {
    ctx.io.out(`${productVersion()}\n`);
  }
  return 0;
}
