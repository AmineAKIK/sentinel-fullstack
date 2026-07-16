// @ts-check
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.scripts.json'],
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Express router.get/post/... expects (req, res, next) => void but we pass async handlers — intentional
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false } }],
      // pg QueryResult.rows is any[] — unsafe access is unavoidable without full row typing
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // req.query values are string | ParsedQs | ... — template literals with them trigger this; use helper functions
      '@typescript-eslint/no-base-to-string': 'off',
      // declare global { namespace Express } is the only way to augment Express Request types
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      // | unknown in unions is noise from some TypeScript inference paths
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },
  // Relax additional rules for test files
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.integration.test.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
