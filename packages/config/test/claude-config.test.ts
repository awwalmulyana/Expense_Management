import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { read, repoRoot, rootPkg } from './helpers';

const RULES = ['naming', 'documentation', 'database', 'modules'];
const PNPM_BUILTINS = new Set(['install', 'exec', 'add', 'dlx', 'run', 'i', 'update', 'remove']);

/**
 * Jumlah baris sebuah berkas teks.
 * @param path - Path relatif akar repo.
 * @returns Jumlah baris.
 */
function lines(path: string): number {
  return read(path).split('\n').length;
}

/**
 * Nama skrip `pnpm <skrip>` yang disebut dalam sebuah berkas (tanpa perintah bawaan pnpm).
 * @param path - Path relatif akar repo.
 * @returns Nama skrip unik yang disebut.
 */
function mentionedPnpmScripts(path: string): string[] {
  const found = [...read(path).matchAll(/pnpm (?:run )?([a-z][\w:-]*)/g)].map((match) => match[1] ?? '');
  return [...new Set(found.filter((name) => !PNPM_BUILTINS.has(name)))];
}

/**
 * Daftar berkas rules proyek.
 * @returns Path relatif akar repo untuk setiap `.claude/rules/*.md`.
 */
function rulesFiles(): string[] {
  return readdirSync(resolve(repoRoot, '.claude/rules'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `.claude/rules/${name}`);
}

/**
 * Mem-parse front matter YAML sebuah berkas markdown.
 * @param path - Path relatif akar repo.
 * @returns Objek front matter, atau objek kosong bila tidak ada.
 */
function frontMatter(path: string): { paths?: string[] } {
  const match = /^---\n([\s\S]*?)\n---/.exec(read(path));
  return match ? (parse(match[1] ?? '') as { paths?: string[] }) : {};
}

/**
 * Membaca `.claude/settings.json`.
 * @returns Isi settings sebagai objek.
 */
function settings(): { hooks: { PreToolUse: { matcher: string; hooks: Record<string, unknown>[] }[] } } {
  return JSON.parse(read('.claude/settings.json'));
}

describe('CLAUDE.md', () => {
  it('di bawah 200 baris', () => expect(lines('CLAUDE.md')).toBeLessThan(200));

  it('menunjuk keempat rules', () => {
    for (const name of RULES) expect(read('CLAUDE.md')).toContain(`.claude/rules/${name}.md`);
  });

  it('skrip yang disebut ada di package.json', () => {
    const scripts = mentionedPnpmScripts('CLAUDE.md');
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(Object.keys(rootPkg().scripts)).toContain(script);
  });

  it('memuat alur fase, larangan status approved, dan penunjuk spec', () => {
    const text = read('CLAUDE.md');
    for (const command of ['/foundation', '/prd', '/design', '/build']) expect(text).toContain(command);
    expect(text).toContain('status: approved');
    expect(text).toContain('docs/specs/2026-10-20-finance-app-design.md');
  });
});

describe('.claude/rules', () => {
  it('ada empat berkas rules', () => expect(rulesFiles().sort()).toEqual(RULES.map((name) => `.claude/rules/${name}.md`).sort()));

  it('setiap rules punya paths tak kosong', () => {
    for (const file of rulesFiles()) expect(frontMatter(file).paths?.length ?? 0).toBeGreaterThan(0);
  });

  it('cakupan paths sesuai area', () => {
    expect(frontMatter('.claude/rules/naming.md').paths).toEqual(expect.arrayContaining(['**/*.ts', '**/*.tsx']));
    expect(frontMatter('.claude/rules/documentation.md').paths).toEqual(expect.arrayContaining(['**/*.ts', '**/*.tsx']));
    expect(frontMatter('.claude/rules/database.md').paths).toEqual(expect.arrayContaining(['**/migrations/**', '**/*.sql']));
    expect(frontMatter('.claude/rules/modules.md').paths).toEqual(expect.arrayContaining(['modules/**', 'apps/**']));
  });
});

describe('.claude/settings.json', () => {
  it('hook penjaga gerbang terpasang', () => {
    const entry = settings().hooks.PreToolUse[0];
    expect(entry?.matcher).toBe('Edit|Write|MultiEdit|NotebookEdit');
    expect(JSON.stringify(entry)).toContain('packages/config/gates/hook.ts');
  });

  it('hook gagal-tertutup lewat onFailure block (exit selain 0/2 tidak memblokir)', () => {
    const hook = settings().hooks.PreToolUse[0]?.hooks[0];
    expect(hook?.type).toBe('command');
    expect(hook?.onFailure).toBe('block');
  });
});
