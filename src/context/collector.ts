import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../config/schema.js';
import type { Classification } from '../types/analysis.js';
import { createRedactor } from '../security/redactor.js';
import {
  hasBinaryExtension,
  IGNORED_DIRS,
  isSensitivePath,
} from '../security/denylist.js';
import { estimateTokens } from '../classifier/signals.js';
import { runCapture } from '../sdk/process.js';

/**
 * Bounded, privacy-conscious repository context collector.
 *
 * Hard limits (file count, per-file bytes, total bytes, token estimate, and a
 * wall-clock deadline) are all enforced; the collector is cancellable via an
 * AbortSignal and skips entirely for trivial prompts. Repository text is
 * treated as untrusted: contents are redacted and never interpreted as
 * instructions.
 */

export interface RepositoryContext {
  root: string;
  summaryText: string;
  files: string[];
  languages: string[];
  truncated: boolean;
  elapsedMs: number;
  notes: string[];
}

export interface CollectOptions {
  projectRoot: string;
  config: Config;
  classification: Classification;
  signal?: AbortSignal;
  now?: () => number;
  /** Injectable git runner for tests. */
  git?: (args: string[], cwd: string, signal?: AbortSignal) => Promise<string | null>;
}

export interface ContextCollector {
  shouldCollect(c: Classification, config: Config): boolean;
  collect(opts: CollectOptions): Promise<RepositoryContext | null>;
}

const MANIFESTS = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'Gemfile',
  'composer.json',
  'tsconfig.json',
];

const LANG_BY_MANIFEST: Record<string, string> = {
  'package.json': 'JavaScript/TypeScript',
  'pyproject.toml': 'Python',
  'requirements.txt': 'Python',
  'Cargo.toml': 'Rust',
  'go.mod': 'Go',
  'pom.xml': 'Java',
  'build.gradle': 'Java/Kotlin',
  Gemfile: 'Ruby',
  'composer.json': 'PHP',
};

const defaultGit = async (
  args: string[],
  cwd: string,
  signal?: AbortSignal
): Promise<string | null> => {
  const res = await runCapture('git', {
    args,
    cwd,
    timeoutMs: 1500,
    ...(signal ? { signal } : {}),
  });
  if (res.spawnError || res.timedOut || res.code !== 0) return null;
  return res.stdout;
};

export class DefaultContextCollector implements ContextCollector {
  shouldCollect(c: Classification, config: Config): boolean {
    return config.repositoryContext.enabled && c.shouldUseRepositoryContext;
  }

  async collect(opts: CollectOptions): Promise<RepositoryContext | null> {
    const { projectRoot, config, classification, signal } = opts;
    if (!this.shouldCollect(classification, config)) return null;

    const now = opts.now ?? (() => Date.now());
    const start = now();
    const deadline = start + config.contextLimits.timeoutMs;
    const git = opts.git ?? defaultGit;
    const redactor = createRedactor();
    const limits = config.contextLimits;
    const notes: string[] = [];

    const overBudget = () => now() > deadline || signal?.aborted === true;

    const languages = new Set<string>();
    const includedFiles: string[] = [];
    let totalBytes = 0;
    let truncated = false;

    const sections: string[] = [];

    // 1. Directory structure (shallow, bounded).
    if (!overBudget()) {
      const tree = this.shallowTree(projectRoot, config);
      if (tree.length) sections.push(`Top-level structure:\n${tree.join('\n')}`);
    }

    // 2. Manifests + language indicators.
    for (const manifest of MANIFESTS) {
      if (overBudget()) break;
      const p = path.join(projectRoot, manifest);
      if (!isFile(p)) continue;
      const lang = LANG_BY_MANIFEST[manifest];
      if (lang) languages.add(lang);
      if (manifest === 'package.json') {
        const info = readPackageJson(p);
        if (info) sections.push(info);
      }
    }
    if (languages.size) sections.push(`Detected languages: ${[...languages].join(', ')}`);

    // 3. Project docs (bounded snippets).
    for (const doc of ['CLAUDE.md', 'README.md', 'readme.md']) {
      if (overBudget()) break;
      const p = path.join(projectRoot, doc);
      const snippet = this.readSnippet(p, doc, limits.maxFileBytes, redactor);
      if (snippet) {
        sections.push(`${doc} (excerpt):\n${snippet}`);
        break; // one doc is enough for context
      }
    }

    // 4. Git status / diff / recent commits.
    if (config.repositoryContext.includeGitDiff && !overBudget()) {
      const status = await git(
        ['status', '--porcelain', '--untracked-files=no'],
        projectRoot,
        signal
      );
      if (status && status.trim()) {
        sections.push(`Git status (tracked changes):\n${clip(status, 1200)}`);
      }
      if (!overBudget()) {
        const diffStat = await git(['diff', '--stat'], projectRoot, signal);
        if (diffStat && diffStat.trim()) {
          sections.push(`Current diff (stat):\n${clip(diffStat, 1200)}`);
        }
      }
    }
    if (config.repositoryContext.recentCommits && !overBudget()) {
      const log = await git(
        ['log', '-n', '5', '--pretty=format:%h %s'],
        projectRoot,
        signal
      );
      if (log && log.trim()) sections.push(`Recent commits:\n${clip(log, 800)}`);
    }

    // 5. Prompt-referenced files (bounded, redacted).
    const referenced = this.findReferencedFiles(
      projectRoot,
      classification.originalPrompt,
      config
    );
    for (const rel of referenced) {
      if (overBudget() || includedFiles.length >= limits.maxFiles) {
        if (includedFiles.length >= limits.maxFiles) truncated = true;
        break;
      }
      const abs = path.join(projectRoot, rel);
      const snippet = this.readSnippet(abs, rel, limits.maxFileBytes, redactor);
      if (!snippet) continue;
      if (totalBytes + snippet.length > limits.maxTotalBytes) {
        truncated = true;
        break;
      }
      totalBytes += snippet.length;
      includedFiles.push(rel);
      sections.push(`File ${rel} (excerpt):\n${snippet}`);
    }

    if (overBudget()) {
      truncated = true;
      notes.push('Context collection hit its time/abort budget and was truncated.');
    }

    // Enforce the token budget on the assembled text.
    let summaryText = sections.join('\n\n');
    if (estimateTokens(summaryText) > limits.maxTokensEstimate) {
      const maxChars = limits.maxTokensEstimate * 4;
      summaryText = `${summaryText.slice(0, maxChars)}\n… [context truncated to token budget]`;
      truncated = true;
    }

    return {
      root: projectRoot,
      summaryText,
      files: includedFiles,
      languages: [...languages],
      truncated,
      elapsedMs: Math.max(0, now() - start),
      notes,
    };
  }

  private shallowTree(root: string, config: Config): string[] {
    const out: string[] = [];
    const extraExcludes = config.repositoryContext.exclude;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return out;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    let count = 0;
    for (const e of entries) {
      if (count >= 40) {
        out.push('  …');
        break;
      }
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      if (e.isDirectory() && IGNORED_DIRS.has(e.name)) continue;
      if (extraExcludes.some((x) => e.name === x)) continue;
      out.push(e.isDirectory() ? `  ${e.name}/` : `  ${e.name}`);
      count++;
    }
    return out;
  }

  private readSnippet(
    absPath: string,
    relPath: string,
    maxBytes: number,
    redactor: ReturnType<typeof createRedactor>
  ): string | null {
    if (isSensitivePath(relPath) || hasBinaryExtension(relPath)) return null;
    if (!isFile(absPath)) return null;
    let raw: string;
    try {
      const buf = fs.readFileSync(absPath);
      if (buf.includes(0)) return null; // binary
      raw = buf.subarray(0, maxBytes).toString('utf8');
    } catch {
      return null;
    }
    return redactor.redact(raw).text;
  }

  private findReferencedFiles(root: string, prompt: string, config: Config): string[] {
    // Only include files the prompt explicitly references by path-like token,
    // plus any user-provided include globs (matched by suffix). This keeps the
    // collector from scanning the whole tree.
    const tokens = prompt.match(/[\w./-]+\.[A-Za-z0-9]{1,6}/g) ?? [];
    const found = new Set<string>();
    for (const tok of tokens) {
      const rel = tok.replace(/^\.\//, '');
      if (isSensitivePath(rel)) continue;
      const abs = path.join(root, rel);
      if (isFile(abs) && abs.startsWith(root)) found.add(rel);
    }
    for (const inc of config.repositoryContext.include) {
      const abs = path.join(root, inc);
      if (isFile(abs) && !isSensitivePath(inc)) found.add(inc);
    }
    return [...found];
  }
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function readPackageJson(p: string): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8')) as {
      name?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    const scripts = pkg.scripts ? Object.keys(pkg.scripts).slice(0, 12).join(', ') : '';
    const deps = pkg.dependencies
      ? Object.keys(pkg.dependencies).slice(0, 15).join(', ')
      : '';
    const lines = [`package.json: ${pkg.name ?? '(unnamed)'}`];
    if (scripts) lines.push(`  scripts: ${scripts}`);
    if (deps) lines.push(`  dependencies: ${deps}`);
    return lines.join('\n');
  } catch {
    return null;
  }
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n…` : s;
}

export function createContextCollector(): DefaultContextCollector {
  return new DefaultContextCollector();
}
