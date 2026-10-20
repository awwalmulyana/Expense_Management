import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { read } from './helpers';

const COMMANDS = ['foundation', 'prd', 'design', 'build'];

/**
 * Membaca front matter sebuah command.
 * @param name - Nama command tanpa `.md`.
 * @returns Front matter ter-parse.
 */
function fm(name: string): { description?: string; 'argument-hint'?: string } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(read(`.claude/commands/${name}.md`));
  return match ? (parse(match[1] ?? '') as { description?: string }) : {};
}

/**
 * Membaca isi command setelah front matter.
 * @param name - Nama command tanpa `.md`.
 * @returns Isi markdown tanpa front matter.
 */
function body(name: string): string {
  return read(`.claude/commands/${name}.md`).replace(/^---\n[\s\S]*?\n---\n/, '');
}

describe('command alur fase', () => {
  it.each(COMMANDS)('%s punya description', (name) => expect(fm(name).description).toBeTruthy());

  it('/prd mendelegasikan requirement ke prd-writer dan berhenti untuk persetujuan', () => {
    const text = body('prd');
    for (const needle of ['prd-writer', 'docs/prd/prd.md', 'status: draft', '$ARGUMENTS']) expect(text).toContain(needle);
    expect(fm('prd')['argument-hint']).toBeTruthy();
    expect(text).toMatch(/berhenti/i);
  });

  it('/design memeriksa gerbang PRD lebih dulu', () => {
    const text = body('design');
    expect(text.indexOf('pnpm gate:require prd')).toBeGreaterThanOrEqual(0);
    expect(text).toContain('docs/design/design.md');
    expect(text).toContain('designer');
    expect(text).toMatch(/berhenti/i);
  });

  it('/build memeriksa gerbang design dan berjalan berurutan', () => {
    const text = body('build');
    expect(text).toContain('pnpm gate:require design');
    const order = ['kontrak', 'migrasi', 'modul', 'web', 'E2E', 'staging'].map((keyword) => text.indexOf(keyword));
    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const needle of ['worktree', 'Reviewer', 'tidak men-deploy ke production']) expect(text).toContain(needle);
  });

  it('/build menyebut semua agent pekerja', () => {
    for (const agent of ['module-agent', 'frontend-agent', 'qa-agent', 'devops-agent', 'reviewer']) expect(body('build')).toContain(agent);
  });

  it('/build menaruh pemeriksaan gerbang sebelum langkah lain', () => {
    const text = body('build');
    expect(text.indexOf('pnpm gate:require design')).toBeLessThan(text.indexOf('kontrak'));
  });

  it('/foundation memeriksa kesiapan tanpa mengubah gerbang', () => {
    const text = body('foundation');
    for (const needle of ['.github/CODEOWNERS', 'rulesets', 'environments', 'pnpm install --frozen-lockfile', 'pnpm boundaries']) {
      expect(text).toContain(needle);
    }
    expect(text).toMatch(/tidak (pernah )?mengubah/i);
  });
});
