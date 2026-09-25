import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC нужен для emitDecoratorMetadata: без него DI NestJS в тестах не работает.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
