import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_FOLDERS = ['apps', 'modules', 'packages'] as const;
const REQUIRED_SCRIPTS = ['lint', 'typecheck', 'test'] as const;
const NESTED_ESLINT_CONFIGS = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs'];
const LOOSENED_TSCONFIG = /"(?:strict|noImplicitAny|strictNullChecks)"\s*:\s*false/;

/**
 * Daftar folder workspace (anak langsung `apps/`, `modules/`, `packages/`).
 * @param root - Akar repo.
 * @returns Path relatif posix setiap folder workspace.
 */
function workspaceDirs(root: string): string[] {
  return WORKSPACE_FOLDERS.flatMap((folder) => {
    if (!existsSync(join(root, folder))) return [];
    return readdirSync(join(root, folder), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => `${folder}/${entry.name}`);
  });
}

/**
 * Memeriksa bahwa setiap workspace tunduk pada konfigurasi akar dan tidak melonggarkannya sendiri:
 * tanpa konfigurasi ESLint lokal (yang menggantikan konfigurasi akar), dengan skrip `lint`, `typecheck`,
 * dan `test` (Turborepo diam-diam melewati paket yang tidak punya skrip), dan `tsconfig` yang
 * `extends` konfigurasi dasar tanpa mematikan `strict`.
 * @param root - Akar repo (atau akar pohon uji).
 * @returns Pesan temuan; kosong bila semua workspace sesuai.
 */
export function findConformanceIssues(root: string): string[] {
  const issues: string[] = [];
  for (const dir of workspaceDirs(root)) {
    for (const name of NESTED_ESLINT_CONFIGS) {
      if (existsSync(join(root, dir, name))) issues.push(`${dir}/${name}: konfigurasi ESLint lokal menggantikan konfigurasi akar; hapus.`);
    }

    const pkgPath = join(root, dir, 'package.json');
    if (existsSync(pkgPath)) {
      const scripts = (JSON.parse(readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {};
      for (const script of REQUIRED_SCRIPTS) {
        if (!(script in scripts)) issues.push(`${dir}/package.json: skrip "${script}" wajib ada agar Turborepo menjalankannya.`);
      }
    }

    const tsconfigPath = join(root, dir, 'tsconfig.json');
    if (existsSync(tsconfigPath)) {
      const text = readFileSync(tsconfigPath, 'utf8');
      if (!/"extends"\s*:/.test(text)) issues.push(`${dir}/tsconfig.json: wajib extends tsconfig dasar di akar repo.`);
      if (LOOSENED_TSCONFIG.test(text)) issues.push(`${dir}/tsconfig.json: tidak boleh mematikan opsi strict.`);
    }
  }
  return issues;
}
