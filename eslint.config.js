import base from './packages/config/eslint/index.js';

export default [
  ...base,
  {
    ignores: ['**/fixtures/**', '**/dist/**', '**/.next/**', '**/.turbo/**', '**/coverage/**'],
  },
];
