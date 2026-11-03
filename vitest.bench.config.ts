import { defineConfig } from 'vitest/config';

// Benchmarks are kept out of `pnpm test` (timing depends on the machine). Run: pnpm bench
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/bench/**/*.bench.ts'],
    reporters: ['default'],
    disableConsoleIntercept: true,
  },
});
