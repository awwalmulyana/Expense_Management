import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import edges from '../boundaries/allowed-edges.json';
import { findUnlistedModules } from '../boundaries/rules';
import { runBoundaries } from '../boundaries/run';

const created: string[] = [];

/**
 * Membuat pohon repo uji dari pemetaan path ke isi berkas.
 * @param files - Path relatif ke isi berkas.
 * @returns Akar pohon uji.
 */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'bnd-bypass-'));
  created.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

/**
 * Nama aturan yang dilanggar, unik dan terurut.
 * @param root - Akar pohon uji.
 * @returns Daftar nama aturan.
 */
async function rules(root: string): Promise<string[]> {
  const { violations } = await runBoundaries(root);
  return [...new Set(violations.map((violation) => violation.rule))].sort();
}

const ACCOUNTS = { 'modules/accounts/src/index.ts': 'export const a = 1;\n', 'modules/accounts/src/domain/thing.ts': 'export const t = 1;\n' };
const TRANSACTIONS = { 'modules/transactions/src/index.ts': 'export const x = 1;\n' };

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('jalan memutar aturan batas', () => {
  it('folder bernama fixtures di dalam modul tetap diperiksa', async () => {
    const root = tree({
      ...ACCOUNTS,
      ...TRANSACTIONS,
      'modules/transactions/src/fixtures/bridge.ts': "export * from '../../../accounts/src/domain/thing';\n",
    });
    expect(await rules(root)).toEqual(['no-module-internals']);
  });

  it('perantara di luar apps, modules, dan packages tidak dapat mencuci impor', async () => {
    const root = tree({
      ...ACCOUNTS,
      ...TRANSACTIONS,
      'shared/t.ts': "export * from '../modules/transactions/src/index';\n",
      'modules/accounts/src/use.ts': "export * from '../../../shared/t';\n",
    });
    expect(await rules(root)).toContain('modules-closed-world');
  });

  it('modul boleh mengimpor pustaka npm dan modul inti Node', async () => {
    const root = tree({
      ...ACCOUNTS,
      'modules/accounts/src/use.ts': "import { join } from 'node:path';\nexport const p = join('a', 'b');\n",
    });
    expect(await rules(root)).toEqual([]);
  });

  it('berkas biasa dan symlink langsung di modules/ dilaporkan, berkas tersembunyi tidak', () => {
    const root = tree({ ...ACCOUNTS, 'modules/shared.ts': 'export {};\n', 'modules/.DS_Store': '' });
    symlinkSync(join(root, 'modules/accounts'), join(root, 'modules/linked'), 'dir');
    expect(findUnlistedModules(root, edges)).toEqual(['linked', 'shared.ts']);
  });
});

describe('kesesuaian workspace', () => {
  const okScripts = { scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit', test: 'vitest run' } };
  const okTsconfig = JSON.stringify({ extends: '../../tsconfig.json' });

  /**
   * Menjalankan pemeriksaan dan mengembalikan temuan kesesuaian.
   * @param files - Isi pohon uji.
   * @returns Daftar pesan temuan kesesuaian.
   */
  async function conformance(files: Record<string, string>): Promise<string[]> {
    const { conformance: findings } = await runBoundaries(tree(files));
    return findings;
  }

  const clean = {
    ...ACCOUNTS,
    'modules/accounts/package.json': JSON.stringify({ name: '@finance/accounts', ...okScripts }),
    'modules/accounts/tsconfig.json': okTsconfig,
  };

  it('workspace yang sesuai tidak menghasilkan temuan', async () => expect(await conformance(clean)).toEqual([]));

  it('eslint.config di dalam workspace ditolak', async () => {
    const findings = await conformance({ ...clean, 'modules/accounts/eslint.config.js': 'export default [];\n' });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('modules/accounts/eslint.config.js');
  });

  it('skrip lint, typecheck, atau test yang hilang ditolak', async () => {
    const findings = await conformance({ ...clean, 'modules/accounts/package.json': JSON.stringify({ name: '@finance/accounts', scripts: { lint: 'eslint .' } }) });
    expect(findings.join('\n')).toContain('typecheck');
    expect(findings.join('\n')).toContain('test');
  });

  it('tsconfig yang melonggarkan strict atau tidak extends ditolak', async () => {
    expect(await conformance({ ...clean, 'modules/accounts/tsconfig.json': JSON.stringify({ extends: '../../tsconfig.json', compilerOptions: { strict: false } }) })).toHaveLength(1);
    expect(await conformance({ ...clean, 'modules/accounts/tsconfig.json': JSON.stringify({ compilerOptions: {} }) })).toHaveLength(1);
  });
});
