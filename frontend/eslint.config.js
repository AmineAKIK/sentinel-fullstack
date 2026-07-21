import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // JSX event handlers returning promises are fine (React ignores the return value)
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // autoFocus in modals is intentional for accessibility (focus trap)
      'jsx-a11y/no-autofocus': 'off',
      // setState inside effects is a common idiom for derived/initial state
      'react-hooks/set-state-in-effect': 'off',
      // Impure function in useMemo tracked via ref is intentional
      'react-hooks/purity': 'off',
      // jsx-a11y cannot detect that our custom SelectField is an accessible control
      'jsx-a11y/label-has-associated-control': 'off',
    },
  },
  // Relax rules for test files — mocks are inherently any-typed
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  // IncidentMetricsBar takes a business-domain `role` prop (OPERATOR/MAINTENANCE/RESPONSABLE),
  // not an ARIA role — jsx-a11y/aria-role can't distinguish a custom component prop from a
  // native element's ARIA attribute and flags it as an invalid ARIA role value.
  {
    files: ['src/components/__tests__/IncidentMetricsBar.test.tsx'],
    rules: {
      'jsx-a11y/aria-role': 'off',
    },
  }
);
