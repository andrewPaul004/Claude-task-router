import { appendFileSync } from 'node:fs';
import { ensureDir } from '../platform/fs.js';
import path from 'node:path';

/**
 * Structured, privacy-first logger.
 *
 * Logging is OFF by default. Even when enabled, prompt bodies are never written
 * unless `logging.logPrompts` is explicitly turned on. Output is line-delimited
 * JSON to stderr and/or a file.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export interface LoggerOptions {
  enabled: boolean;
  level: LogLevel;
  logPrompts: boolean;
  file?: string | null;
  /** Write JSON lines to stderr in addition to the file. */
  stderr?: boolean;
  now?: () => number;
}

export class Logger {
  constructor(private readonly opts: LoggerOptions) {}

  private emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (!this.opts.enabled) return;
    if (ORDER[level] > ORDER[this.opts.level]) return;
    const record = {
      ts: new Date((this.opts.now ?? Date.now)()).toISOString(),
      level,
      message,
      ...(fields ?? {}),
    };
    const line = `${JSON.stringify(record)}\n`;
    if (this.opts.file) {
      try {
        ensureDir(path.dirname(this.opts.file));
        appendFileSync(this.opts.file, line, { mode: 0o600 });
      } catch {
        // Never let logging failures affect the run.
      }
    }
    if (this.opts.stderr !== false && !this.opts.file) {
      process.stderr.write(line);
    }
  }

  error(msg: string, fields?: Record<string, unknown>): void {
    this.emit('error', msg, fields);
  }
  warn(msg: string, fields?: Record<string, unknown>): void {
    this.emit('warn', msg, fields);
  }
  info(msg: string, fields?: Record<string, unknown>): void {
    this.emit('info', msg, fields);
  }
  debug(msg: string, fields?: Record<string, unknown>): void {
    this.emit('debug', msg, fields);
  }

  /** Redact-aware prompt field: only included when logPrompts is enabled. */
  promptField(prompt: string): Record<string, unknown> {
    return this.opts.logPrompts ? { prompt } : { promptChars: prompt.length };
  }
}

export function createLogger(opts: LoggerOptions): Logger {
  return new Logger(opts);
}

export function noopLogger(): Logger {
  return new Logger({ enabled: false, level: 'error', logPrompts: false });
}
