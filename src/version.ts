import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve the product version by walking up from this module to the nearest
 * package.json named "claude-task-router". Works both from source (dev/tests)
 * and from the built dist, without inlining the version at build time.
 */
let cachedVersion: string | null = null;

export function productVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    const { root } = path.parse(dir);
    for (;;) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
          name?: string;
          version?: string;
        };
        if (pkg.name === 'claude-task-router' && pkg.version) {
          cachedVersion = pkg.version;
          return cachedVersion;
        }
      }
      if (dir === root) break;
      dir = path.dirname(dir);
    }
  } catch {
    // fall through
  }
  cachedVersion = '0.0.0';
  return cachedVersion;
}
