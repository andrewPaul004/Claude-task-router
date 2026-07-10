import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  // Only ship type declarations for the public library entry point.
  dts: { entry: { index: 'src/index.ts' } },
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: false,
  minify: false,
  // Keep runtime dependencies external; bundle only our own source.
  skipNodeModulesBundle: true,
});
