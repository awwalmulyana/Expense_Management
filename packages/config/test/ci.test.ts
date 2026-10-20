import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { read } from './helpers';

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  steps: Step[];
  services?: Record<string, { image: string }>;
  env?: Record<string, string>;
  permissions?: Record<string, string>;
}
interface Workflow {
  on: { pull_request: { branches: string[] } };
  permissions: Record<string, string>;
  concurrency: Record<string, unknown>;
  jobs: Record<string, Job>;
}

/**
 * Membaca dan mem-parse workflow CI.
 * @returns Workflow sebagai objek.
 */
function ci(): Workflow {
  return parse(read('.github/workflows/ci.yml')) as Workflow;
}

/**
 * Semua nilai `uses` pada seluruh job.
 * @returns Daftar `uses`.
 */
function allUses(): string[] {
  return Object.values(ci().jobs).flatMap((job) => job.steps.flatMap((step) => (step.uses ? [step.uses] : [])));
}

/**
 * Perintah `run` milik satu job.
 * @param jobId - Id job.
 * @returns Daftar isi `run`.
 */
function runs(jobId: string): string[] {
  return (ci().jobs[jobId]?.steps ?? []).flatMap((step) => (step.run ? [step.run] : []));
}

/**
 * Nilai `uses` milik satu job.
 * @param jobId - Id job.
 * @returns Daftar `uses`.
 */
function usesOf(jobId: string): string[] {
  return (ci().jobs[jobId]?.steps ?? []).flatMap((step) => (step.uses ? [step.uses] : []));
}

describe('workflow CI', () => {
  it('pemicu, izin minimal, dan pembatalan eksekusi lama', () => {
    expect(ci().on.pull_request.branches).toContain('main');
    expect(ci().permissions).toEqual({ contents: 'read' });
    expect(ci().concurrency['cancel-in-progress']).toBe(true);
  });

  it('tujuh job dengan id sama dengan nama check', () => {
    expect(Object.keys(ci().jobs).sort()).toEqual(['boundaries', 'gate-check', 'integration', 'lint', 'security', 'typecheck', 'unit']);
  });

  it('semua uses dipin ke SHA commit', () => {
    expect(allUses().length).toBeGreaterThan(0);
    for (const use of allUses()) expect(use).toMatch(/@[0-9a-f]{40}$/);
  });

  it('setiap job memasang dependensi dengan lockfile beku', () => {
    for (const [id, job] of Object.entries(ci().jobs)) {
      if (id === 'security') continue;
      expect(job.steps.some((step) => step.run?.includes('pnpm install --frozen-lockfile')), id).toBe(true);
    }
  });

  it('job memakai perintah proyek', () => {
    expect(runs('lint').join('\n')).toContain('pnpm turbo run lint');
    expect(runs('typecheck').join('\n')).toContain('pnpm turbo run typecheck');
    expect(runs('boundaries').join('\n')).toContain('pnpm boundaries');
    expect(runs('unit').join('\n')).toContain('pnpm turbo run test --affected');
  });

  it('unit membandingkan dengan basis PR', () => {
    expect(ci().jobs.unit?.steps[0]?.with?.['fetch-depth']).toBe(0);
    expect(JSON.stringify(ci().jobs.unit)).toContain('TURBO_SCM_BASE');
    expect(JSON.stringify(ci().jobs.unit)).toContain('origin/${{ github.base_ref }}');
  });

  it('gate-check membaca status dari basis, bukan dari head PR', () => {
    const script = runs('gate-check').join('\n');
    expect(script).toContain('git show origin/${{ github.base_ref }}:docs/prd/prd.md');
    expect(script).toContain('git show origin/${{ github.base_ref }}:docs/design/design.md');
    expect(script).toContain('pnpm gate:check --prd-file');
    expect(script).toContain('--changed-file');
    expect(ci().jobs['gate-check']?.steps[0]?.with?.['fetch-depth']).toBe(0);
  });

  it('gate-check mendaftar rename sebagai dua path dan tidak meloloskan path yang dikutip', () => {
    const script = runs('gate-check').join('\n');
    expect(script).toContain('--no-renames');
    expect(script).toContain('--name-only');
    expect(script).toMatch(/ -z /);
    expect(script).toContain("tr '\\0' '\\n'");
  });

  it('integration memakai PostgreSQL 17', () => {
    expect(ci().jobs.integration?.services?.postgres?.image).toMatch(/^postgres:17/);
    expect(JSON.stringify(ci().jobs.integration)).toContain('TEST_DATABASE_URL');
    expect(runs('integration').join('\n')).toContain('pnpm turbo run test:integration');
  });

  it('security: audit dependensi dan deteksi secret', () => {
    expect(runs('security').join('\n')).toContain('pnpm audit --audit-level=high');
    expect(usesOf('security').some((use) => /gitleaks/.test(use))).toBe(true);
    expect(ci().jobs.security?.steps[0]?.with?.['fetch-depth']).toBe(0);
  });
});
