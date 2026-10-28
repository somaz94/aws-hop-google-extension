import js from '@eslint/js';

const browser = {
  window: 'readonly',
  document: 'readonly',
  location: 'readonly',
  history: 'readonly',
  HTMLButtonElement: 'readonly',
  navigator: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Blob: 'readonly',
  FormData: 'readonly',
  MutationObserver: 'readonly',
  confirm: 'readonly',
  crypto: 'readonly',
  chrome: 'readonly',
  localStorage: 'readonly',
  matchMedia: 'readonly',
};

export default [
  { ignores: ['coverage/', 'dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: browser },
    rules: {
      semi: ['warn', 'always'],
      quotes: ['warn', 'single', { allowTemplateLiterals: true }],
    },
  },
  {
    files: ['src/content/loader.js', 'src/content/nav-bridge.js', 'src/theme-early.js'],
    languageOptions: { sourceType: 'script' },
  },
  {
    files: ['tests/e2e/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly', WebSocket: 'readonly' },
    },
    rules: {
      semi: ['warn', 'always'],
      quotes: ['warn', 'single', { allowTemplateLiterals: true }],
    },
  },
];
