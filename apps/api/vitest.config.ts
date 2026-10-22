import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

// SWC вместо esbuild: Nest DI опирается на emitDecoratorMetadata, которого нет в esbuild
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: false,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/env.ts'],
    // Интеграционные тесты делят одну тестовую БД
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
})
