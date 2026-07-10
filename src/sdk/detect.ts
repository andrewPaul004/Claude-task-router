import { runCapture } from './process.js';

/**
 * Detect the installed Claude Code CLI and, crucially, verify its capabilities
 * by inspecting `claude --help` rather than inferring them from a version
 * number. This keeps the product honest: we only route with flags the
 * installed binary actually accepts.
 */

export interface ClaudeCapabilities {
  print: boolean;
  model: boolean;
  effort: boolean;
  appendSystemPrompt: boolean;
  bare: boolean;
  outputFormatJson: boolean;
  permissionMode: boolean;
}

export interface ClaudeInfo {
  available: boolean;
  executable: string;
  version: string | null;
  capabilities: ClaudeCapabilities;
  error?: string;
}

const NO_CAPS: ClaudeCapabilities = {
  print: false,
  model: false,
  effort: false,
  appendSystemPrompt: false,
  bare: false,
  outputFormatJson: false,
  permissionMode: false,
};

function parseVersion(raw: string): string | null {
  const m = /(\d+\.\d+\.\d+)/.exec(raw);
  return m ? m[1]! : null;
}

function parseCapabilities(help: string): ClaudeCapabilities {
  const has = (flag: string): boolean => help.includes(flag);
  return {
    print: has('--print') || has('-p,'),
    model: has('--model'),
    effort: has('--effort'),
    appendSystemPrompt: has('--append-system-prompt'),
    bare: has('--bare'),
    outputFormatJson: has('--output-format'),
    permissionMode: has('--permission-mode'),
  };
}

let cached: ClaudeInfo | null = null;

export async function getClaudeInfo(
  executable = 'claude',
  env: NodeJS.ProcessEnv = process.env,
  opts: { timeoutMs?: number; force?: boolean } = {}
): Promise<ClaudeInfo> {
  if (cached && !opts.force && cached.executable === executable) return cached;
  const timeoutMs = opts.timeoutMs ?? 5000;

  const version = await runCapture(executable, { args: ['--version'], timeoutMs, env });
  if (version.spawnError || (version.code !== 0 && !version.stdout.trim())) {
    const info: ClaudeInfo = {
      available: false,
      executable,
      version: null,
      capabilities: { ...NO_CAPS },
      error:
        version.spawnError?.message ??
        `\`${executable} --version\` exited with code ${version.code ?? 'unknown'}`,
    };
    cached = info;
    return info;
  }

  const help = await runCapture(executable, { args: ['--help'], timeoutMs, env });
  const capabilities = parseCapabilities(`${help.stdout}\n${help.stderr}`);

  const info: ClaudeInfo = {
    available: true,
    executable,
    version: parseVersion(version.stdout || version.stderr),
    capabilities,
  };
  cached = info;
  return info;
}

/** For tests: clear the memoized detection result. */
export function resetClaudeInfoCache(): void {
  cached = null;
}
