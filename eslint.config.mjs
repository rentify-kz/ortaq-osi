import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'apps/mobile/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[object.name=/^(localStorage|sessionStorage)$/], MemberExpression[property.name=/^(localStorage|sessionStorage)$/]',
          message: 'Браузерное хранилище запрещено: токены — только в httpOnly cookie (13-security §2).',
        },
      ],
    },
  },
);
