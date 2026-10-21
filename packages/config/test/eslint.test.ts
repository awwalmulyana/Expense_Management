import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { repoRoot } from './helpers';

const NAMING = '@typescript-eslint/naming-convention';
const DOC = 'jsdoc/require-jsdoc';
const CONFIG_PATH = resolve(repoRoot, 'packages/config/eslint/index.js');

/**
 * Menjalankan ESLint pada potongan kode dan mengembalikan daftar `ruleId` yang dilanggar.
 * @param code - Kode sumber yang diperiksa.
 * @param filePath - Nama berkas (menentukan override .ts/.tsx/.test.ts).
 * @returns Daftar `ruleId` dari pesan lint, tanpa pesan tanpa ruleId.
 */
async function lint(code: string, filePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: CONFIG_PATH });
  const [result] = await eslint.lintText(code, { filePath: resolve(repoRoot, 'packages/config', filePath) });
  return (result?.messages ?? []).flatMap((message) => (message.ruleId ? [message.ruleId] : []));
}

describe('konvensi penamaan', () => {
  it('variabel snake_case ditolak', async () => expect(await lint('const user_name = 1;', 'a.ts')).toContain(NAMING));
  it('konstanta UPPER_SNAKE diterima', async () => expect(await lint('const MAX_RETRY = 3;', 'a.ts')).not.toContain(NAMING));
  it('fungsi PascalCase ditolak di .ts', async () =>
    expect(await lint('/** Hitung. */ export function DoThing() {}', 'a.ts')).toContain(NAMING));
  it('komponen PascalCase diterima di .tsx', async () =>
    expect(await lint('/** Tombol. */ export function Button() { return null; }', 'a.tsx')).not.toContain(NAMING));
  it('tipe snake_case ditolak', async () => expect(await lint('type account_id = string;', 'a.ts')).toContain(NAMING));
});

describe('komentar fungsi (TSDoc)', () => {
  it('fungsi tanpa komentar ditolak', async () =>
    expect(await lint('export function add(a: number, b: number) { return a + b; }', 'a.ts')).toContain(DOC));
  it('arrow function yang ditugaskan ke variabel ditolak', async () =>
    expect(await lint('export const f = () => 1;', 'a.ts')).toContain(DOC));
  it('fungsi berkomentar diterima', async () =>
    expect(await lint('/** Menjumlahkan. */\nexport function add(a: number, b: number) { return a + b; }', 'a.ts')).not.toContain(DOC));
  it('callback inline dikecualikan', async () => expect(await lint('[1].map((x) => x);', 'a.ts')).not.toContain(DOC));
  it('berkas tes dikecualikan', async () => expect(await lint('export function add() {}', 'a.test.ts')).not.toContain(DOC));
});

describe('konfigurasi tidak dapat dilonggarkan dari dalam kode', () => {
  it('komentar eslint-disable tidak mematikan aturan', async () => {
    expect(await lint('/* eslint-disable */\nconst user_name = 1;', 'a.ts')).toContain(NAMING);
    expect(await lint('// eslint-disable-next-line\nconst user_name = 1;', 'a.ts')).toContain(NAMING);
  });

  it('folder bernama fixtures di luar packages/config tetap di-lint', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    expect(await eslint.isPathIgnored(resolve(repoRoot, 'modules/transactions/src/fixtures/a.ts'))).toBe(false);
    expect(await eslint.isPathIgnored(resolve(repoRoot, 'packages/config/fixtures/boundaries/valid/a.ts'))).toBe(true);
  });
});
