import { execFileSync, spawnSync } from 'node:child_process';
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
    expect(hookRawIn(JSON.stringify({ tool_input: { file_path: `${tmp}/docs/prd/prd.md`, old_string: '# Dokumen', new_string: '# PRD' } }), tmp).status).toBe(0));
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

describe('hook di dalam git worktree', () => {
  /**
   * Menjalankan git di sebuah repo uji tanpa bergantung pada konfigurasi pengguna.
   * @param cwd - Direktori kerja.
   * @param args - Argumen git.
   */
  function git(cwd: string, ...args: string[]): void {
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'ignore' });
  }

  /**
   * Membuat repo git sungguhan dengan satu commit berisi dokumen gerbang.
   * @param statuses - Status dokumen gerbang.
   * @returns Path nyata repo.
   */
  function gitRepo(statuses: Statuses): string {
    const dir = makeRepo(statuses);
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'init');
    return dir;
  }

  /**
   * Menanyakan hook untuk menulis `modules/x/a.ts` di sebuah akar.
   * @param root - Akar tempat berkas berada.
   * @param projectDir - Nilai CLAUDE_PROJECT_DIR.
   * @returns Hasil proses hook.
   */
  function editModule(root: string, projectDir: string) {
    return hookRawIn(JSON.stringify({ tool_input: { file_path: `${root}/modules/x/a.ts` } }), projectDir);
  }

  it('memblokir worktree di dalam .claude/worktrees saat PRD draft', () => {
    const repo = gitRepo({ prd: 'draft' });
    const worktree = join(repo, '.claude/worktrees/w1');
    git(repo, 'worktree', 'add', '-q', '-b', 'w1', worktree);
    const result = editModule(worktree, repo);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('terkunci');
  });

  it('memblokir worktree saudara (di luar folder repo) saat PRD draft', () => {
    const repo = gitRepo({ prd: 'draft' });
    const sibling = `${repo}-wt`;
    git(repo, 'worktree', 'add', '-q', '-b', 'w2', sibling);
    expect(editModule(sibling, repo).status).toBe(2);
  });

  it('memblokir path baru (belum ada) di worktree', () => {
    const repo = gitRepo({ prd: 'draft' });
    const sibling = `${repo}-wt2`;
    git(repo, 'worktree', 'add', '-q', '-b', 'w3', sibling);
    const result = hookRawIn(JSON.stringify({ tool_input: { file_path: `${sibling}/modules/baru/dalam/a.ts` } }), repo);
    expect(result.status).toBe(2);
  });

  it('memakai status yang lebih ketat antara worktree dan proyek', () => {
    const repo = gitRepo({ prd: 'draft' });
    const sibling = `${repo}-wt3`;
    git(repo, 'worktree', 'add', '-q', '-b', 'w4', sibling);
    writeDoc(join(sibling, 'docs/prd/prd.md'), 'approved');
    writeDoc(join(sibling, 'docs/design/design.md'), 'approved');
    expect(editModule(sibling, repo).status).toBe(2);
  });

  it('mengizinkan worktree bila gerbang approved di kedua sisi', () => {
    const repo = gitRepo({ prd: 'approved', design: 'approved' });
    const sibling = `${repo}-wt4`;
    git(repo, 'worktree', 'add', '-q', '-b', 'w5', sibling);
    expect(editModule(sibling, repo).status).toBe(0);
  });

  it('tetap mengizinkan repo git lain yang tidak terkait', () => {
    const repo = gitRepo({ prd: 'draft' });
    const other = gitRepo({ prd: 'draft' });
    expect(editModule(other, repo).status).toBe(0);
  });
});

describe('hook melindungi gerbang itu sendiri', () => {
  const repo = makeRepo({ prd: 'draft', design: 'draft' });

  /**
   * Menjalankan hook untuk satu pemanggilan tool.
   * @param toolName - Nama tool.
   * @param toolInput - Isi `tool_input`.
   * @returns Hasil proses hook.
   */
  function call(toolName: string, toolInput: Record<string, unknown>) {
    return hookRawIn(JSON.stringify({ tool_name: toolName, tool_input: toolInput }), repo);
  }

  const prd = `${repo}/docs/prd/prd.md`;
  const design = `${repo}/docs/design/design.md`;

  it('menolak Write yang membuat PRD menjadi approved', () => {
    const result = call('Write', { file_path: prd, content: '---\nstatus: approved\n---\n# PRD\n' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('approved');
  });

  it('menolak Edit yang mengubah draft menjadi approved pada design', () =>
    expect(call('Edit', { file_path: design, old_string: 'status: draft', new_string: 'status: approved' }).status).toBe(2));

  it('menolak MultiEdit yang berujung approved', () =>
    expect(
      call('MultiEdit', { file_path: prd, edits: [{ old_string: '# Dokumen', new_string: '# PRD' }, { old_string: 'status: draft', new_string: 'status: approved' }] }).status,
    ).toBe(2));

  it('mengizinkan Write yang tetap draft dan Edit isi dokumen', () => {
    expect(call('Write', { file_path: prd, content: '---\nstatus: draft\n---\n# PRD baru\n' }).status).toBe(0);
    expect(call('Edit', { file_path: prd, old_string: '# Dokumen', new_string: '# Judul' }).status).toBe(0);
  });

  it('gagal-tertutup bila isi hasil tulis tidak dapat dihitung', () =>
    expect(call('Write', { file_path: prd }).status).toBe(2));

  it('menolak menulis settings.local.json yang bisa mematikan hook', () => {
    const result = call('Write', { file_path: `${repo}/.claude/settings.local.json`, content: '{"disableAllHooks": true}' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('settings.local.json');
  });

  it('mengizinkan menulis settings.json biasa (dijaga CODEOWNERS, bukan hook)', () =>
    expect(call('Write', { file_path: `${repo}/.claude/settings.json`, content: '{}' }).status).toBe(0));
});
