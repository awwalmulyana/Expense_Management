import { describe, expect, it } from 'vitest';
import { exists, read, rootPkg } from './helpers';

/** Mengambil daftar glob dari `pnpm-workspace.yaml`. */
function workspaceGlobs(): string[] {
  return [...read('pnpm-workspace.yaml').matchAll(/^\s*-\s*["']?([^"'\n]+?)["']?\s*$/gm)].map((m) => m[1] as string);
}

describe('workspace', () => {
  it('glob workspace', () => expect(workspaceGlobs()).toEqual(['apps/*', 'modules/*', 'packages/*']));

  it('versi Node terkunci', () => {
    expect(read('.nvmrc').trim()).toBe('22');
    expect(rootPkg().engines.node).toBe('>=22 <23');
  });

  it('spec diarsipkan', () =>
    expect(read('docs/specs/2026-10-20-finance-app-design.md')).toContain('Status: **approved**'));

  it('rencana diarsipkan', () => expect(exists('docs/specs/2026-10-20-foundation-plan.md')).toBe(true));
});
