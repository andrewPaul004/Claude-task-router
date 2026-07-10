import { resolved, type CliContext } from '../cli/shared.js';
import { color, icon } from '../cli/io.js';
import { findOnPath, parseNodeMajor, platformInfo } from '../platform/detect.js';
import { getClaudeInfo } from '../sdk/detect.js';
import { readState } from '../install/state.js';
import { hasOurHook, HOOK_COMMAND, readSettings } from '../install/settings.js';
import {
  claudeProjectSettingsPath,
  claudeUserSettingsPath,
  defaultPathContext,
} from '../platform/paths.js';
import { readText } from '../platform/fs.js';
import { ModelRegistry } from '../models/registry.js';
import { productVersion } from '../version.js';

type Status = 'pass' | 'warn' | 'fail';
interface Check {
  name: string;
  status: Status;
  detail: string;
  fix?: string;
}

export async function doctorCommand(
  ctx: CliContext,
  opts: { json?: boolean }
): Promise<number> {
  const checks: Check[] = [];
  const pathCtx = { home: defaultPathContext().home, cwd: ctx.cwd, env: ctx.env };

  // 1. Node.js version.
  const plat = platformInfo();
  const major = parseNodeMajor(plat.nodeVersion);
  checks.push({
    name: 'Node.js',
    status: major !== null && major >= 18 ? 'pass' : 'warn',
    detail: `${plat.nodeVersion} on ${plat.os}/${plat.arch}`,
    ...(major !== null && major < 18 ? { fix: 'Upgrade to Node.js 18.18+.' } : {}),
  });

  // 2. Package installation.
  checks.push({
    name: 'Package',
    status: 'pass',
    detail: `claude-task-router v${productVersion()}`,
  });

  // 3/4/5. Claude Code + capabilities.
  let config;
  try {
    config = resolved(ctx).config;
  } catch (err) {
    checks.push({
      name: 'Configuration',
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
      fix: 'Run `claude-task-router config reset` or fix the invalid config file.',
    });
    return report(ctx, checks, opts);
  }

  const info = await getClaudeInfo(config.sdkBehavior.executable, ctx.env).catch(
    () => null
  );
  if (info?.available) {
    checks.push({
      name: 'Claude Code',
      status: 'pass',
      detail: `${config.sdkBehavior.executable} v${info.version ?? 'unknown'}`,
    });
    const missing = [
      !info.capabilities.model && '--model',
      !info.capabilities.effort && '--effort',
      !info.capabilities.appendSystemPrompt && '--append-system-prompt',
    ].filter(Boolean);
    checks.push({
      name: 'Routing flags',
      status: missing.length === 0 ? 'pass' : 'warn',
      detail:
        missing.length === 0
          ? 'model, effort, and system-prompt injection supported'
          : `unsupported: ${missing.join(', ')} (wrapper will recommend, not apply)`,
    });
  } else {
    checks.push({
      name: 'Claude Code',
      status: 'fail',
      detail: `"${config.sdkBehavior.executable}" not found or not runnable`,
      fix: 'Install Claude Code (https://claude.com/claude-code) and ensure it is on PATH.',
    });
  }

  // 6. Hook installation.
  const globalHook = hasOurHook(readSettings(claudeUserSettingsPath(pathCtx)));
  const projectHook = ctx.projectRoot
    ? hasOurHook(readSettings(claudeProjectSettingsPath(ctx.projectRoot)))
    : false;
  checks.push({
    name: 'Hook',
    status: globalHook || projectHook ? 'pass' : 'warn',
    detail: `global: ${globalHook ? 'yes' : 'no'}, project: ${projectHook ? 'yes' : 'no'}`,
    ...(!globalHook && !projectHook
      ? { fix: 'Run `claude-task-router install --global` (or --project).' }
      : {}),
  });

  // 7. Settings validity.
  const settingsFiles = [claudeUserSettingsPath(pathCtx)];
  if (ctx.projectRoot) settingsFiles.push(claudeProjectSettingsPath(ctx.projectRoot));
  let settingsOk = true;
  for (const f of settingsFiles) {
    const raw = readText(f);
    if (raw === null) continue;
    try {
      JSON.parse(raw);
    } catch {
      settingsOk = false;
      checks.push({
        name: 'Settings JSON',
        status: 'fail',
        detail: `Invalid JSON: ${f}`,
        fix: 'Fix or restore from a backup.',
      });
    }
  }
  if (settingsOk)
    checks.push({
      name: 'Settings JSON',
      status: 'pass',
      detail: 'all Claude Code settings parse cleanly',
    });

  // 8. Hook command resolvable on PATH.
  const binName = HOOK_COMMAND.split(' ')[0]!;
  const onPath = findOnPath(binName, ctx.env);
  checks.push({
    name: 'Hook command',
    status: onPath ? 'pass' : 'warn',
    detail: onPath ? `${binName} → ${onPath}` : `${binName} not found on PATH`,
    ...(!onPath
      ? {
          fix: 'Install globally (`npm i -g claude-task-router`) so hooks can invoke it.',
        }
      : {}),
  });

  // 9. Model configuration.
  const registry = new ModelRegistry();
  const allowedOk = config.allowedModels.length > 0;
  const defaultAllowed = config.allowedModels
    .map((m) => m.toLowerCase())
    .includes(config.defaultModel.toLowerCase());
  checks.push({
    name: 'Model config',
    status: allowedOk && defaultAllowed ? 'pass' : 'warn',
    detail: `default=${config.defaultModel} (${registry.tierOf(config.defaultModel)}), allowed=[${config.allowedModels.join(', ')}]`,
    ...(!defaultAllowed
      ? { fix: 'Add the default model to allowedModels, or change defaultModel.' }
      : {}),
  });

  // 10. Managed state / version drift.
  const gState = readState('global', ctx.projectRoot, pathCtx);
  const pState = ctx.projectRoot ? readState('project', ctx.projectRoot, pathCtx) : null;
  const state = pState ?? gState;
  if (state) {
    const drift = state.productVersion !== productVersion();
    checks.push({
      name: 'Managed state',
      status: drift ? 'warn' : 'pass',
      detail: drift
        ? `installed by v${state.productVersion}, now v${productVersion()}`
        : `v${state.productVersion}, ${state.hookIdentifiers.length} hook(s)`,
      ...(drift ? { fix: 'Run `claude-task-router update`.' } : {}),
    });
  } else {
    checks.push({
      name: 'Managed state',
      status: 'warn',
      detail: 'not installed',
      fix: 'Run `claude-task-router install`.',
    });
  }

  // 11. Privacy sanity (should be off by default).
  checks.push({
    name: 'Privacy',
    status: config.telemetry.enabled ? 'warn' : 'pass',
    detail: `telemetry ${config.telemetry.enabled ? 'ON' : 'off'}, prompt logging ${config.logging.logPrompts ? 'ON' : 'off'}`,
  });

  return report(ctx, checks, opts);
}

function report(ctx: CliContext, checks: Check[], opts: { json?: boolean }): number {
  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;

  if (opts.json) {
    ctx.io.out(`${JSON.stringify({ checks, fails, warns }, null, 2)}\n`);
    return fails > 0 ? 1 : 0;
  }

  ctx.io.out(`${color.bold('claude-task-router doctor')}\n\n`);
  for (const c of checks) {
    const mark =
      c.status === 'pass' ? icon.ok() : c.status === 'warn' ? icon.warn() : icon.fail();
    ctx.io.out(`  ${mark} ${color.bold(c.name.padEnd(14))} ${c.detail}\n`);
    if (c.fix) ctx.io.out(`      ${color.dim(`→ ${c.fix}`)}\n`);
  }
  ctx.io.out(
    `\n${fails === 0 ? icon.ok() : icon.fail()} ${checks.length} checks — ` +
      `${color.green(`${checks.length - fails - warns} pass`)}, ${color.yellow(`${warns} warn`)}, ${color.red(`${fails} fail`)}\n`
  );
  return fails > 0 ? 1 : 0;
}
