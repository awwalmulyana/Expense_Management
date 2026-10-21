import base from './packages/config/eslint/index.js';

export default [
  ...base,
  {
    ignores: ['packages/config/fixtures/**', '**/dist/**', '**/.next/**', '**/.turbo/**', '**/coverage/**'],
  },
];
