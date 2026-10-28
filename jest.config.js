export default {
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    // DOM and Chrome-API glue; the logic it calls lives in src/lib and src/importers and is tested there.
    '!src/popup/**',
    '!src/options/**',
    '!src/content/loader.js',
    '!src/content/nav-bridge.js',
    '!src/background/worker.js',
    // A three-line classic script that runs before the page modules; the logic it mirrors is src/lib/theme.js.
    '!src/theme-early.js',
  ],
  coverageThreshold: {
    global: { statements: 90, branches: 90, functions: 90, lines: 90 },
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
};
