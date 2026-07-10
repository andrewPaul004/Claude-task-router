#!/usr/bin/env node
import { Command } from 'commander';
import readline from 'node:readline/promises';
import { createCliIO, readStdin } from './io.js';
import { makeContext, type GlobalFlags } from './shared.js';
import { productVersion } from '../version.js';
import { analyzeCommand, optimizeCommand } from '../commands/analyze.js';
import { runCommand } from '../commands/run.js';
import { hookCommand } from '../commands/hook.js';
import { installCommand, uninstallCommand, updateCommand } from '../commands/install.js';
import { doctorCommand } from '../commands/doctor.js';
import { initCommand } from '../commands/init.js';
import {
  configGet,
  configSet,
  configReset,
  configPath,
  configEdit,
} from '../commands/config.js';
import { statusCommand, modelsCommand, versionCommand } from '../commands/status.js';
import { evalCommand } from '../commands/eval.js';
import { benchmarkCommand } from '../commands/benchmark.js';

const COMMANDS = new Set([
  'run',
  'analyze',
  'optimize',
  'install',
  'uninstall',
  'update',
  'doctor',
  'init',
  'config',
  'status',
  'models',
  'version',
  'eval',
  'benchmark',
  'hook',
  'help',
]);

const io = createCliIO();

function globalsFrom(command: Command): GlobalFlags {
  const g = command.optsWithGlobals();
  const flags: GlobalFlags = {};
  if (g.global) flags.global = true;
  if (g.project) flags.project = true;
  if (g.debug) flags.debug = true;
  if (typeof g.cwd === 'string') flags.cwd = g.cwd;
  return flags;
}

function joinPrompt(parts: string[] | undefined): string {
  return (parts ?? []).join(' ').trim();
}

async function resolvePrompt(parts: string[] | undefined): Promise<string> {
  const joined = joinPrompt(parts);
  if (joined) return joined;
  const piped = (await readStdin()).trim();
  return piped;
}

/** Await an action, translating its return code / errors into process exit. */
async function finish(codeP: number | Promise<number>, debug: boolean): Promise<never> {
  try {
    const code = await codeP;
    process.exitCode = code;
  } catch (err) {
    if (debug) io.err(`${(err as Error).stack ?? String(err)}\n`);
    else
      io.err(`claude-task-router: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
  // Allow stdout/stderr to flush.
  return process.exit(process.exitCode ?? 0);
}

function buildProgram(passthrough: string[]): Command {
  const program = new Command();
  program
    .name('claude-task-router')
    .description(
      'Classify, optimize, and route Claude Code prompts to the right model and effort.'
    )
    .version(productVersion(), '-v, --version', 'Output the version number')
    .option('-g, --global', 'Use global (user) scope')
    .option('-p, --project', 'Use project scope')
    .option('--cwd <dir>', 'Run as if in this working directory')
    .option('--debug', 'Print stack traces on error')
    .showHelpAfterError();

  program
    .command('run')
    .description('Route and execute a prompt with Claude Code (wrapper mode)')
    .argument('[prompt...]', 'The prompt (or pipe via stdin; omit for interactive)')
    .option('--model <model>', 'Override the routed model')
    .option('--effort <level>', 'Override the routed effort (low|medium|high|xhigh|max)')
    .option('--dry-run', 'Show the routing decision without executing')
    .option('--no-context', 'Skip repository context collection')
    .option('--no-optimize', 'Do not optimize the prompt')
    .option('--explain', 'Show full routing reasoning')
    .option('--confirm', 'Ask for confirmation before executing')
    .option('--json', 'Output the decision as JSON (does not execute)')
    .option('--print', 'Run Claude Code in non-interactive print mode')
    .option('--debug', 'Verbose errors')
    .action(async (parts: string[], opts, command: Command) => {
      const g = globalsFrom(command);
      let prompt = await resolvePrompt(parts);
      if (!prompt) {
        if (io.isTTY) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stderr,
          });
          prompt = (await rl.question('What would you like Claude to do?\n> ')).trim();
          rl.close();
        }
      }
      if (!prompt) {
        io.err('No prompt provided.\n');
        return finish(2, !!g.debug);
      }
      // commander stores --no-context as opts.context=false, --no-optimize as opts.optimize=false.
      return finish(
        runCommand(makeContext(io, g), prompt, {
          model: opts.model,
          effort: opts.effort,
          dryRun: !!opts.dryRun,
          json: !!opts.json,
          explain: !!opts.explain,
          confirm: !!opts.confirm,
          print: !!opts.print,
          debug: !!opts.debug,
          noContext: opts.context === false,
          noOptimize: opts.optimize === false,
          passthroughArgs: passthrough,
        }),
        !!g.debug
      );
    });

  program
    .command('analyze')
    .description('Analyze a prompt and print the routing decision')
    .argument('[prompt...]')
    .option('--json', 'Machine-readable output')
    .option('--no-optimize', 'Do not include an optimized prompt')
    .action(async (parts: string[], opts, command: Command) => {
      const g = globalsFrom(command);
      const prompt = await resolvePrompt(parts);
      if (!prompt) return noPrompt(g);
      return finish(
        analyzeCommand(makeContext(io, g), prompt, {
          json: !!opts.json,
          noOptimize: opts.optimize === false,
        }),
        !!g.debug
      );
    });

  program
    .command('optimize')
    .description('Print the optimized prompt without executing')
    .argument('[prompt...]')
    .option('--json', 'Machine-readable output')
    .action(async (parts: string[], opts, command: Command) => {
      const g = globalsFrom(command);
      const prompt = await resolvePrompt(parts);
      if (!prompt) return noPrompt(g);
      return finish(
        optimizeCommand(makeContext(io, g), prompt, { json: !!opts.json }),
        !!g.debug
      );
    });

  program
    .command('install')
    .description('Install the Claude Code hook and configuration')
    .option('--dry-run', 'Show what would change without writing')
    .action(async (opts, command: Command) => {
      const g = globalsFrom(command);
      return finish(
        installCommand(makeContext(io, g), { dryRun: !!opts.dryRun }),
        !!g.debug
      );
    });

  program
    .command('uninstall')
    .description('Remove product-owned hook and state (config kept unless --purge)')
    .option('--dry-run', 'Show what would change without writing')
    .option('--purge', 'Also remove configuration')
    .action(async (opts, command: Command) => {
      const g = globalsFrom(command);
      return finish(
        uninstallCommand(makeContext(io, g), {
          dryRun: !!opts.dryRun,
          purge: !!opts.purge,
        }),
        !!g.debug
      );
    });

  program
    .command('update')
    .description('Migrate configuration and show the package update workflow')
    .action(async (_opts, command: Command) => {
      const g = globalsFrom(command);
      return finish(updateCommand(makeContext(io, g)), !!g.debug);
    });

  program
    .command('doctor')
    .description('Diagnose the installation and configuration')
    .option('--json', 'Machine-readable output')
    .action(async (opts, command: Command) => {
      const g = globalsFrom(command);
      return finish(doctorCommand(makeContext(io, g), { json: !!opts.json }), !!g.debug);
    });

  program
    .command('init')
    .description('First-run onboarding (interactive or via flags)')
    .option('--yes', 'Accept defaults / non-interactive')
    .option('--optimization <preset>', 'balanced|lowest-cost|fastest|highest-quality')
    .option('--prompt-handling <mode>', 'auto|show-first|off')
    .option('--routing-display <mode>', 'silent|compact|explain|confirm')
    .option('--default-model <alias>')
    .option('--allowed-models <list>', 'comma-separated')
    .option('--max-effort <level>')
    .option('--repo-context <bool>', 'true|false', parseBool)
    .option('--classifier-llm <bool>', 'true|false', parseBool)
    .option('--logging <bool>', 'true|false', parseBool)
    .action(async (opts, command: Command) => {
      const g = globalsFrom(command);
      return finish(initCommand(makeContext(io, g), opts), !!g.debug);
    });

  const config = program.command('config').description('Get or set configuration');
  config
    .command('get [key]')
    .option('--json', 'Machine-readable output')
    .action(async (key, opts, command: Command) => {
      const g = globalsFrom(command);
      return finish(configGet(makeContext(io, g), key, { json: !!opts.json }), !!g.debug);
    });
  config
    .command('set <key> <value>')
    .action(async (key, value, _opts, command: Command) => {
      const g = globalsFrom(command);
      return finish(configSet(makeContext(io, g), key, value), !!g.debug);
    });
  config.command('reset').action(async (_opts, command: Command) => {
    const g = globalsFrom(command);
    return finish(configReset(makeContext(io, g)), !!g.debug);
  });
  config.command('path').action(async (_opts, command: Command) => {
    const g = globalsFrom(command);
    return finish(configPath(makeContext(io, g)), !!g.debug);
  });
  config.command('edit').action(async (_opts, command: Command) => {
    const g = globalsFrom(command);
    return finish(configEdit(makeContext(io, g)), !!g.debug);
  });

  program
    .command('status')
    .description('Show installation and configuration status')
    .action(async (_opts, command: Command) => {
      const g = globalsFrom(command);
      return finish(statusCommand(makeContext(io, g)), !!g.debug);
    });

  program
    .command('models')
    .description('List model aliases, tiers, and routing categories')
    .option('--json', 'Machine-readable output')
    .action(async (opts, command: Command) => {
      const g = globalsFrom(command);
      return finish(modelsCommand(makeContext(io, g), { json: !!opts.json }), !!g.debug);
    });

  program
    .command('version')
    .description('Print the product version')
    .option('--json', 'Machine-readable output')
    .action(async (opts, command: Command) => {
      const g = globalsFrom(command);
      return finish(
        Promise.resolve(versionCommand(makeContext(io, g), { json: !!opts.json })),
        !!g.debug
      );
    });

  program
    .command('eval')
    .description('Run the offline routing evaluation suite')
    .option('--json', 'Machine-readable output')
    .option('--min-agreement <n>', 'Minimum routing agreement (0-1)', parseFloatOpt)
    .action(async (opts, command: Command) => {
      const g = globalsFrom(command);
      return finish(
        evalCommand(makeContext(io, g), {
          json: !!opts.json,
          minAgreement: opts.minAgreement,
        }),
        !!g.debug
      );
    });

  program
    .command('benchmark')
    .description('Measure classification and hook latency on this machine')
    .option('--json', 'Machine-readable output')
    .option('--iterations <n>', 'Iterations per prompt', (v) => parseInt(v, 10))
    .action(async (opts, command: Command) => {
      const g = globalsFrom(command);
      return finish(
        benchmarkCommand(makeContext(io, g), {
          json: !!opts.json,
          iterations: opts.iterations,
        }),
        !!g.debug
      );
    });

  program
    .command('hook')
    .description('Internal: process a Claude Code UserPromptSubmit hook (reads stdin)')
    .action(async () => {
      return finish(hookCommand(), false);
    });

  return program;
}

function parseBool(v: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}
function parseFloatOpt(v: string): number {
  return Number.parseFloat(v);
}

function noPrompt(g: GlobalFlags): Promise<never> {
  io.err('No prompt provided. Pass a prompt argument or pipe via stdin.\n');
  return finish(2, !!g.debug);
}

async function main(): Promise<void> {
  let argv = process.argv.slice(2);

  // Fast path: the hook is invoked on every prompt — skip all arg parsing.
  if (argv[0] === 'hook') {
    const code = await hookCommand();
    process.exit(code);
  }

  // Split off passthrough args (after `--`) for wrapper execution.
  let passthrough: string[] = [];
  const dd = argv.indexOf('--');
  if (dd >= 0) {
    passthrough = argv.slice(dd + 1);
    argv = argv.slice(0, dd);
  }

  // Bare-prompt form: `ctr "fix the bug"` → treat as `run`.
  const firstNonFlag = argv.find((a) => !a.startsWith('-'));
  const wantsHelpOrVersion =
    argv.some((a) => ['-h', '--help', '-v', '--version'].includes(a)) &&
    !argv.some((a) => COMMANDS.has(a));
  if (argv.length === 0) {
    // Bare `ctr` → interactive run.
    argv = ['run'];
  } else if (firstNonFlag && !COMMANDS.has(firstNonFlag) && !wantsHelpOrVersion) {
    argv = ['run', ...argv];
  } else if (!firstNonFlag && !wantsHelpOrVersion) {
    // Only flags, no command (e.g. `ctr --model opus "x"` with quotes stripped).
    argv = ['run', ...argv];
  }

  const program = buildProgram(passthrough);
  await program.parseAsync(argv, { from: 'user' });
}

main().catch((err) => {
  io.err(`claude-task-router: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
