import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from './helpers';

const TSX = join(repoRoot, 'node_modules/.bin/tsx');
const CLI = join(repoRoot, 'packages/config/gates/cli.ts');
const HOOK = join(repoRoot, 'packages/config/gates/hook.ts');

type Status = 'approved' | 'draft';
interface Statuses {
  prd?: Status;
  design?: Status;
}

/**
 * Menulis dokumen dengan front matter status.
 * @param path - Lokasi berkas.
 * @param status - Nilai status.
 */
function writeDoc(path: string, status: Status): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `---\nstatus: ${status}\n---\n# Dokumen\n`);
}

/**
 * Membuat repo sementara dengan docs/prd/prd.md dan docs/design/design.md sesuai status.
 * @param statuses - Status yang ditulis; yang `undefined` berarti berkas tidak ada.
 * @returns Path nyata repo sementara.
 */
function makeRepo(statuses: Statuses): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'gate-cli-')));
  if (statuses.prd) writeDoc(join(dir, 'docs/prd/prd.md'), statuses.prd);
  if (statuses.design) writeDoc(join(dir, 'docs/design/design.md'), statuses.design);
  return dir;
}

/**
 * Menjalankan CLI gerbang.
 * @param args - Argumen CLI.
 * @param statuses - Status dokumen pada repo sementara (cwd).
 * @returns Hasil proses (status, stdout, stderr).
 */
function run(args: string[], statuses: Statuses) {
  return spawnSync(TSX, [CLI, ...args], { cwd: makeRepo(statuses), encoding: 'utf8' });
}

/**
 * Menjalankan `check` dengan status basis dan daftar berkas berubah.
 * @param base - Status dokumen pada basis.
 * @param changed - Path berkas yang berubah.
 * @returns Hasil proses.
 */
function check(base: Statuses, changed: string[]) {
  const dir = makeRepo(base);
  const changedFile = join(dir, 'changed.txt');
  writeFileSync(changedFile, changed.join('\n') + '\n');
  return spawnSync(
    TSX,
    [CLI, 'check', '--prd-file', join(dir, 'docs/prd/prd.md'), '--design-file', join(dir, 'docs/design/design.md'), '--changed-file', changedFile],
    { cwd: dir, encoding: 'utf8' },
  );
}

/**
 * Menjalankan hook dengan stdin mentah.
 * @param stdin - Isi stdin.
 * @param dir - Nilai CLAUDE_PROJECT_DIR.
 * @returns Hasil proses.
 */
function hookRawIn(stdin: string, dir: string) {
  return spawnSync(TSX, [HOOK], { input: stdin, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
}

describe('CLI require', () => {
  it('require prd gagal bila draft, dengan alasan di stderr', () => {
    const result = run(['require', 'prd'], { prd: 'draft' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PRD');
  });
  it('require prd gagal bila berkas hilang, dengan alasan di stderr', () => {
    const result = run(['require', 'prd'], {});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PRD');
  });
  it('require prd lolos bila approved', () => expect(run(['require', 'prd'], { prd: 'approved' }).status).toBe(0));
  it('require design butuh keduanya', () => {
    const designDraft = run(['require', 'design'], { prd: 'approved', design: 'draft' });
    expect(designDraft.status).toBe(1);
    expect(designDraft.stderr).toContain('esign');
    const prdDraft = run(['require', 'design'], { prd: 'draft', design: 'approved' });
    expect(prdDraft.status).toBe(1);
    expect(prdDraft.stderr).toContain('PRD');
    expect(run(['require', 'design'], { prd: 'approved', design: 'approved' }).status).toBe(0);
  });
  it('target tak dikenal adalah kesalahan penggunaan (exit 2)', () =>
    expect(run(['require', 'foo'], { prd: 'approved' }).status).toBe(2));
});

describe('CLI check', () => {
  it('basis draft + PR menyetujui dan mengedit modul gagal', () => {
    const result = check({ prd: 'draft' }, ['docs/prd/prd.md', 'modules/a.ts']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('modules/a.ts');
  });
  it('hanya docs lolos', () => expect(check({ prd: 'draft' }, ['docs/prd/prd.md']).status).toBe(0));
  it('basis approved lolos untuk modul', () =>
    expect(check({ prd: 'approved', design: 'approved' }, ['modules/a.ts']).status).toBe(0));
  it('argumen kurang adalah kesalahan penggunaan (exit 2)', () => expect(run(['check'], {}).status).toBe(2));
});

describe('hook PreToolUse', () => {
  const tmp = makeRepo({ prd: 'draft' });
  const approved = makeRepo({ prd: 'approved', design: 'approved' });
  const designDraft = makeRepo({ prd: 'approved', design: 'draft' });

  it('memblokir edit modules saat PRD draft', () => {
    const result = hookRawIn(JSON.stringify({ tool_input: { file_path: `${tmp}/modules/x/src/a.ts` } }), tmp);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('PRD');
  });
  it('menyebut design saat PRD approved tetapi design draft', () => {
    const result = hookRawIn(JSON.stringify({ tool_input: { file_path: `${designDraft}/apps/web/a.ts` } }), designDraft);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('esign');
  });
  it('mengizinkan docs/prd saat draft', () =>
    expect(hookRawIn(JSON.stringify({ tool_input: { file_path: `${tmp}/docs/prd/prd.md` } }), tmp).status).toBe(0));
  it('mengizinkan path di luar repo', () =>
    expect(hookRawIn(JSON.stringify({ tool_input: { file_path: '/etc/hosts' } }), tmp).status).toBe(0));
  it('mengizinkan semuanya bila kedua gerbang approved', () =>
    expect(hookRawIn(JSON.stringify({ tool_input: { file_path: `${approved}/modules/x/a.ts` } }), approved).status).toBe(0));
  it('gagal-tertutup pada input rusak', () => {
    expect(hookRawIn('bukan json', tmp).status).toBe(2);
    expect(hookRawIn('', tmp).status).toBe(2);
    expect(hookRawIn('null', tmp).status).toBe(2);
    expect(hookRawIn(JSON.stringify({ tool_input: {} }), tmp).status).toBe(2);
    expect(hookRawIn(JSON.stringify({ tool_input: { file_path: '' } }), tmp).status).toBe(2);
  });
  it('NotebookEdit memakai notebook_path', () =>
    expect(hookRawIn(JSON.stringify({ tool_input: { notebook_path: `${tmp}/apps/web/a.ipynb` } }), tmp).status).toBe(2));
  it('gagal-tertutup bila status tidak bisa dibaca (EISDIR, bukan ENOENT)', () => {
    const broken = makeRepo({});
    mkdirSync(join(broken, 'docs/prd/prd.md'), { recursive: true });
    const result = hookRawIn(JSON.stringify({ tool_input: { file_path: `${broken}/modules/a.ts` } }), broken);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('gagal');
  });
});
