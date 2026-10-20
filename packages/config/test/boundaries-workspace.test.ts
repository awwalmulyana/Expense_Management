import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runBoundaries } from '../boundaries/run';

const created: string[] = [];

/**
 * Menulis berkas (beserta folder induknya) di bawah sebuah akar.
 * @param root - Akar pohon uji.
 * @param path - Path relatif berkas.
 * @param content - Isi berkas.
 */
function put(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/**
 * Membuat pohon repo uji bergaya pnpm: tiap modul adalah paket workspace
 * (`@finance/<nama>`, hanya mengekspor `.`) yang di-symlink ke `node_modules` akar.
 * @param modules - Nama modul yang dibuat.
 * @param extra - Pemetaan path ke isi berkas tambahan.
 * @returns Akar pohon uji.
 */
function workspaceTree(modules: string[], extra: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'bnd-ws-'));
  created.push(root);
  mkdirSync(join(root, 'node_modules/@finance'), { recursive: true });
  for (const name of modules) {
    put(root, `modules/${name}/package.json`, JSON.stringify({ name: `@finance/${name}`, exports: { '.': './src/index.ts', './*': './src/*.ts' } }));
    put(root, `modules/${name}/src/index.ts`, 'export const x = 1;\n');
    put(root, `modules/${name}/src/domain/thing.ts`, 'export const y = 1;\n');
    symlinkSync(join(root, 'modules', name), join(root, 'node_modules/@finance', name), 'dir');
  }
  for (const [path, content] of Object.entries(extra)) put(root, path, content);
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

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('impor lewat nama paket workspace', () => {
  it('tepi tak terdaftar lewat @finance/<modul> terdeteksi', async () => {
    const root = workspaceTree(['accounts', 'transactions'], {
      'modules/accounts/src/use.ts': "import { x } from '@finance/transactions';\nexport const z = x;\n",
    });
    expect(await rules(root)).toEqual(['no-undeclared-module-edge']);
  });

  it('tepi yang terdaftar lewat @finance/<modul> lolos', async () => {
    const root = workspaceTree(['accounts', 'transactions'], {
      'modules/transactions/src/use.ts': "import { x } from '@finance/accounts';\nexport const z = x;\n",
    });
    expect(await rules(root)).toEqual([]);
  });

  it('internal modul lewat subpath ekspor terdeteksi', async () => {
    const root = workspaceTree(['accounts', 'transactions'], {
      'modules/transactions/src/use.ts': "import { y } from '@finance/accounts/domain/thing';\nexport const z = y;\n",
    });
    expect(await rules(root)).toEqual(['no-module-internals']);
  });

  it('aplikasi yang mengimpor internal modul lewat nama paket terdeteksi', async () => {
    const root = workspaceTree(['accounts'], {
      'apps/api/src/main.ts': "import { y } from '@finance/accounts/domain/thing';\nexport const z = y;\n",
    });
    expect(await rules(root)).toEqual(['apps-only-public-door']);
  });

  it('impor yang tidak dapat di-resolve ditolak, bukan dilewati diam-diam', async () => {
    const root = workspaceTree(['accounts', 'transactions'], {
      'modules/transactions/src/use.ts': "import { y } from '@finance/accounts/src/domain/nope';\nexport const z = y;\n",
    });
    expect(await rules(root)).toEqual(['no-unresolvable']);
  });
});
