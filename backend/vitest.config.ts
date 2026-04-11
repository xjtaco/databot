import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Use forks pool with --expose-gc and increased heap for better native memory management
    pool: 'forks',
    execArgv: ['--expose-gc', '--max-old-space-size=8192'],

    // Global test setup
    setupFiles: ['./tests/setup.ts'],

    // Test file patterns
    include: ['tests/**/*.test.ts'],

    // Exclude patterns
    exclude: ['node_modules', 'dist'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/', 'dist/', 'tests/', '**/*.test.ts', '**/*.spec.ts', '**/types.ts'],
      // Coverage thresholds
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },

    // Globals for describe, it, expect, vi
    globals: true,

    // Timeout for tests (2 minutes default, same as BashTool)
    testTimeout: 120000,
    hookTimeout: 120000,

    // Mock configuration
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,

    // Reporters
    reporters: ['verbose'],

    // Watch mode
    watch: false,
  },

  // Path resolution
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@test': resolve(__dirname, './tests'),
    },
  },
});
