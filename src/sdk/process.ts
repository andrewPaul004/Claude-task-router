import { spawn, type SpawnOptions } from 'node:child_process';

/**
 * Safe process spawning.
 *
 * Everything goes through `spawn` with an explicit argv array and NO shell, so
 * there is no shell-injection surface: prompt text and file paths are passed as
 * literal arguments, never interpolated into a command string.
 */

export interface RunCaptureOptions {
  args: string[];
  input?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  signal?: AbortSignal;
  maxBuffer?: number;
}

export interface RunCaptureResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError?: Error;
}

/** Run a command capturing stdout/stderr, with timeout and cancellation. */
export function runCapture(
  command: string,
  options: RunCaptureOptions
): Promise<RunCaptureResult> {
  const {
    args,
    input,
    timeoutMs,
    env,
    cwd,
    signal,
    maxBuffer = 4 * 1024 * 1024,
  } = options;

  return new Promise((resolve) => {
    const spawnOpts: SpawnOptions = {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: env ?? process.env,
      ...(cwd ? { cwd } : {}),
    };

    let child;
    try {
      child = spawn(command, args, spawnOpts);
    } catch (err) {
      resolve({
        code: null,
        signal: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        spawnError: err instanceof Error ? err : new Error(String(err)),
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let overflow = false;

    const finish = (res: Omit<RunCaptureResult, 'stdout' | 'stderr' | 'timedOut'>) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ ...res, stdout, stderr, timedOut });
    };

    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          // Escalate if it does not exit promptly.
          setTimeout(() => child.kill('SIGKILL'), 1500).unref?.();
        }, timeoutMs)
      : null;

    const onAbort = () => {
      child.kill('SIGTERM');
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    function cleanup() {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }

    child.stdout?.on('data', (d: Buffer) => {
      if (overflow) return;
      stdout += d.toString('utf8');
      if (stdout.length > maxBuffer) {
        overflow = true;
        stdout = stdout.slice(0, maxBuffer);
        child.kill('SIGTERM');
      }
    });
    child.stderr?.on('data', (d: Buffer) => {
      if (stderr.length < maxBuffer) stderr += d.toString('utf8');
    });

    child.on('error', (err) => {
      finish({ code: null, signal: null, spawnError: err });
    });
    child.on('close', (code, sig) => {
      finish({ code, signal: sig });
    });

    if (input !== undefined && child.stdin) {
      child.stdin.end(input);
    }
  });
}

/** Run a command with inherited stdio (interactive passthrough). */
export function runInherit(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string; signal?: AbortSignal } = {}
): Promise<{ code: number | null; signal: NodeJS.Signals | null; spawnError?: Error }> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        stdio: 'inherit',
        env: options.env ?? process.env,
        ...(options.cwd ? { cwd: options.cwd } : {}),
      });
    } catch (err) {
      resolve({
        code: null,
        signal: null,
        spawnError: err instanceof Error ? err : new Error(String(err)),
      });
      return;
    }

    const onAbort = () => child.kill('SIGTERM');
    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }

    child.on('error', (err) => {
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
      resolve({ code: null, signal: null, spawnError: err });
    });
    child.on('close', (code, sig) => {
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
      resolve({ code, signal: sig });
    });
  });
}
