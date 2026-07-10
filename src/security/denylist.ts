/**
 * Configurable denylist for the repository-context collector.
 *
 * These defaults keep dependency/build/generated directories, binaries, and —
 * most importantly — anything that looks like a secret out of collected
 * context. The collector unions these with `.gitignore` entries and any
 * user-provided exclude patterns.
 */

/** Directories never descended into. */
export const IGNORED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'target',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.gradle',
  '.idea',
  '.vscode',
  '.cache',
  '.turbo',
  'bin',
  'obj',
  '.terraform',
]);

/** File names / suffixes treated as sensitive and never read. */
export const SENSITIVE_PATTERNS: RegExp[] = [
  /(^|[/\\])\.env(\..+)?$/i,
  /(^|[/\\])\.npmrc$/i,
  /(^|[/\\])\.netrc$/i,
  /(^|[/\\])id_(rsa|dsa|ecdsa|ed25519)$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /\.keystore$/i,
  /(^|[/\\])credentials$/i,
  /(^|[/\\])\.aws([/\\]|$)/i,
  /(^|[/\\])\.ssh([/\\]|$)/i,
  /(^|[/\\])secrets?\.(json|ya?ml|toml)$/i,
  /(^|[/\\])\.git-credentials$/i,
];

/** Binary/opaque extensions skipped when reading file contents. */
export const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.tgz',
  '.bz2',
  '.xz',
  '.7z',
  '.rar',
  '.mp3',
  '.mp4',
  '.mov',
  '.avi',
  '.wav',
  '.flac',
  '.ogg',
  '.webm',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.wasm',
  '.so',
  '.dylib',
  '.dll',
  '.exe',
  '.o',
  '.a',
  '.class',
  '.jar',
  '.bin',
  '.dat',
  '.db',
  '.sqlite',
  '.lock',
]);

export function isSensitivePath(relPath: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(relPath));
}

export function hasBinaryExtension(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  return BINARY_EXTENSIONS.has(name.slice(dot).toLowerCase());
}
