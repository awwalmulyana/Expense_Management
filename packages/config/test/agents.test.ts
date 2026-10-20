import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { read } from './helpers';

const ROLES = ['prd-writer', 'designer', 'module-agent', 'frontend-agent', 'qa-agent', 'devops-agent', 'reviewer'];

const TOOLS: Record<string, string[]> = {
  'prd-writer': ['Read', 'Write', 'Edit', 'Grep', 'Glob'],
  designer: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
  'module-agent': ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
  'frontend-agent': ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
  'qa-agent': ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
  'devops-agent': ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
  reviewer: ['Read', 'Grep', 'Glob'],
};

const ALLOWED: Record<string, string[]> = {
  'prd-writer': ['docs/prd/'],
  designer: ['docs/design/', 'packages/design-system/'],
  'module-agent': ['modules/'],
  'frontend-agent': ['apps/web/'],
  'qa-agent': ['packages/e2e/'],
  'devops-agent': ['.github/', 'scripts/'],
  reviewer: ['hanya membaca'],
};

const FORBIDDEN: Record<string, string[]> = {
  'prd-writer': ['docs/design/', 'status: approved'],
  designer: ['modules/', 'status: approved'],
  'module-agent': ['packages/contracts/', 'packages/kernel/'],
  'frontend-agent': ['modules/'],
  'qa-agent': ['modules/', 'apps/'],
  'devops-agent': ['modules/', 'apps/'],
  reviewer: ['tidak mengubah apa pun'],
};

/**
 * Membaca satu definisi agent dan memisahkan front matter dari isi.
 * @param name - Nama agent (sama dengan nama berkas tanpa `.md`).
 * @returns Front matter ter-parse dan isi markdown.
 */
function agent(name: string): { fm: { name: string; description: string; tools: string; model: string }; body: string } {
  const text = read(`.claude/agents/${name}.md`);
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${name}: front matter tidak ditemukan`);
  return { fm: parse(match[1] ?? ''), body: match[2] ?? '' };
}

describe('definisi agent', () => {
  it.each(ROLES)('%s valid', (name) => {
    const { fm, body } = agent(name);
    expect(fm.name).toBe(name);
    expect(fm.description.length).toBeGreaterThan(20);
    expect(fm.model).toBe('inherit');
    expect(fm.tools.split(/,\s*/).sort()).toEqual([...(TOOLS[name] ?? [])].sort());
    for (const path of ALLOWED[name] ?? []) expect(body).toContain(path);
    for (const path of FORBIDDEN[name] ?? []) expect(body).toContain(path);
  });

  it.each(ROLES)('%s memuat bagian wajib', (name) => {
    const { body } = agent(name);
    for (const heading of ['## Peran', '## Boleh', '## Dilarang', '## Cara kerja', '## Selesai bila']) {
      expect(body).toContain(heading);
    }
  });

  it('reviewer tidak punya tool penulis', () => expect(agent('reviewer').fm.tools).not.toMatch(/Edit|Write|Bash|NotebookEdit/));

  it('prd-writer dan designer menulis status: draft', () => {
    for (const name of ['prd-writer', 'designer']) expect(agent(name).body).toContain('status: draft');
  });

  it('semua agent yang menulis kode atau berkas merujuk .claude/rules dan Lead', () => {
    for (const name of ROLES.filter((role) => role !== 'reviewer')) {
      expect(agent(name).body).toContain('.claude/rules/');
      expect(agent(name).body).toContain('Lead');
    }
  });
});
