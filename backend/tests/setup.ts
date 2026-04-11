import { vi, afterAll } from 'vitest';

/**
 * Global test setup
 * Runs before all test suites
 */
export function setup() {
  // No global mocks here - each test file should mock its own dependencies
}

/**
 * Cleanup after all tests
 */
export function teardown() {
  vi.clearAllMocks();
}

// Global afterAll to ensure cleanup after all tests
afterAll(async () => {
  // Final GC hint - gc is exposed when Node runs with --expose-gc
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }
});

// Run setup automatically
setup();
