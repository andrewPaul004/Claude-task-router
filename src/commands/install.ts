import { InstallManager, type InstallReport } from '../install/manager.js';
import { readScopeConfig } from '../config/store.js';
import { migrateConfig } from '../migrations/index.js';
import { backupSettings } from '../install/settings.js';
import { backupDir } from '../platform/paths.js';
import { writeJsonAtomic } from '../platform/fs.js';
import { color, icon } from '../cli/io.js';
import { resolveScope, type CliContext } from '../cli/shared.js';
import { productVersion } from '../version.js';

function renderReport(ctx: CliContext, report: InstallReport, verb: string): void {
  const { io } = ctx;
  for (const w of report.warnings) io.err(`${icon.warn()} ${w}\n`);
  io.out(
    `${color.bold(`${verb} (${report.scope} scope)${report.dryRun ? ' — dry run' : ''}`)}\n`
  );
  for (const c of report.changes) {
    const mark =
      c.action === 'skip'
        ? color.dim('skip')
        : c.action === 'remove'
          ? color.yellow(c.action)
          : color.green(c.action);
    io.out(`  ${mark.padEnd(16)} ${c.target}\n`);
    io.out(`  ${' '.repeat(6)}${color.dim(c.detail)}\n`);
  }
}

export async function installCommand(
  ctx: CliContext,
  opts: { dryRun?: boolean }
): Promise<number> {
  const { scope, projectRoot, error } = resolveScope(ctx, 'global');
  if (error) {
    ctx.io.err(`${icon.fail()} ${error}\n`);
    return 2;
  }
  const manager = new InstallManager();
  const report = await manager.install({
    scope,
    projectRoot,
    cwd: ctx.cwd,
    env: ctx.env,
    ...(opts.dryRun ? { dryRun: true } : {}),
  });
  renderReport(ctx, report, 'Install');

  if (!report.dryRun) {
    ctx.io.out(
      `\n${icon.ok()} Installed. Next: ${color.cyan('claude-task-router init')} then ${color.cyan(
        'claude-task-router doctor'
      )}.\n`
    );
    if (report.alreadyInstalled)
      ctx.io.out(color.dim('(installation was already present; refreshed)\n'));
  } else {
    ctx.io.out(`\n${color.dim('Re-run without --dry-run to apply.')}\n`);
  }
  return 0;
}

export async function uninstallCommand(
  ctx: CliContext,
  opts: { dryRun?: boolean; purge?: boolean }
): Promise<number> {
  const { scope, projectRoot, error } = resolveScope(ctx, 'global');
  if (error) {
    ctx.io.err(`${icon.fail()} ${error}\n`);
    return 2;
  }
  const manager = new InstallManager();
  const report = await manager.uninstall({
    scope,
    projectRoot,
    cwd: ctx.cwd,
    env: ctx.env,
    ...(opts.dryRun ? { dryRun: true } : {}),
    ...(opts.purge ? { purge: true } : {}),
  });
  renderReport(ctx, report, 'Uninstall');
  if (!report.dryRun) {
    ctx.io.out(`\n${icon.ok()} Uninstalled product-owned changes only.\n`);
    if (!opts.purge)
      ctx.io.out(color.dim('Configuration kept. Use --purge to remove it too.\n'));
  }
  return 0;
}

/**
 * `update`: run internal config migrations, then explain the package update
 * workflow (never auto-runs npm, to stay safe and predictable).
 */
export async function updateCommand(ctx: CliContext): Promise<number> {
  ctx.io.out(
    `${color.bold('claude-task-router update')} (current v${productVersion()})\n\n`
  );

  // Config migrations for both scopes.
  let migrated = 0;
  for (const scope of ['user', 'project'] as const) {
    try {
      const { path, raw } = readScopeConfig(scope, {
        cwd: ctx.cwd,
        env: ctx.env,
        projectRoot: ctx.projectRoot,
      });
      if (Object.keys(raw).length === 0) continue;
      const result = migrateConfig(raw);
      if (result.notes.length > 0) {
        backupSettings(
          path,
          backupDir(scope === 'user' ? 'global' : 'project', ctx.projectRoot ?? ctx.cwd)
        );
        writeJsonAtomic(path, result.config);
        migrated++;
        ctx.io.out(`${icon.ok()} Migrated ${scope} config (${path}):\n`);
        for (const n of result.notes) ctx.io.out(`    ${color.dim(n)}\n`);
      }
    } catch {
      // scope not applicable (e.g. no project root); skip.
    }
  }
  if (migrated === 0) ctx.io.out(`${icon.ok()} Configuration is already current.\n`);

  ctx.io.out(
    `\n${color.bold('To update the package:')}\n` +
      `  ${color.cyan('npm install -g claude-task-router@latest')}\n` +
      `  ${color.dim('(or `npm update -g claude-task-router`; if installed via another manager, use its upgrade command.)')}\n` +
      `\nAfter updating, run ${color.cyan('claude-task-router doctor')} to verify.\n`
  );
  return 0;
}
