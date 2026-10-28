export default {
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    // Chrome-API glue with no logic of its own; everything it calls is covered through src/lib.
    '!src/popup/**',
    '!src/options/**',
    '!src/content/loader.js',
    '!src/content/nav-bridge.js',
    '!src/background/worker.js',
  ],
  coverageThreshold: {
    global: { statements: 90, branches: 90, functions: 90, lines: 90 },
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
};
