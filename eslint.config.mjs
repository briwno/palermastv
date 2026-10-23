import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'src/generated/**',
      'src/server/vendor/**',
    ],
  },
  {
    files: [
      'src/**/*.js',
      'src/**/*.mjs',
      'services/**/*.mjs',
      'scripts/**/*.mjs',
      'tests/**/*.mjs',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.es2025, ...globals.node, caches: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-unreachable': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
    },
  },
  {
    files: ['src/client/**/*.js', 'src/client/**/*.mjs'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['services/signaling/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.worker,
        WebSocketPair: 'readonly',
        WebSocketRequestResponsePair: 'readonly',
      },
    },
  },
];
