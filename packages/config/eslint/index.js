import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

/**
 * Membangun opsi aturan `@typescript-eslint/naming-convention`.
 * Berkas `.tsx` boleh memakai PascalCase untuk variabel dan fungsi (komponen React).
 * @param {boolean} allowPascalCase - true bila PascalCase diizinkan untuk variabel dan fungsi.
 * @returns {import('eslint').Linter.RuleEntry} Entri aturan lengkap (severity + opsi).
 */
function namingRule(allowPascalCase) {
  return [
    'error',
    { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
    {
      selector: 'variable',
      format: allowPascalCase ? ['camelCase', 'UPPER_CASE', 'PascalCase'] : ['camelCase', 'UPPER_CASE'],
      leadingUnderscore: 'allow',
    },
    {
      selector: 'function',
      format: allowPascalCase ? ['camelCase', 'PascalCase'] : ['camelCase'],
      leadingUnderscore: 'allow',
    },
    { selector: 'typeLike', format: ['PascalCase'] },
    { selector: 'enumMember', format: ['PascalCase'] },
    {
      selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty', 'typeMethod', 'import'],
      format: null,
    },
  ];
}

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    // Komentar eslint-disable/enable dan `/* eslint rule: ... */` di dalam kode diabaikan: aturan hanya
    // bisa diubah lewat konfigurasi ini (milik pemilik, CODEOWNERS), bukan oleh agent di tengah berkas.
    linterOptions: { noInlineConfig: true },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin, jsdoc },
    rules: {
      '@typescript-eslint/naming-convention': namingRule(false),
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: false,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
        },
      ],
    },
  },
  {
    files: ['**/*.tsx'],
    rules: { '@typescript-eslint/naming-convention': namingRule(true) },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/*.e2e.ts'],
    rules: { 'jsdoc/require-jsdoc': 'off' },
  },
];
