import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { read } from './helpers';

const REQUIRED_PATHS = ['/docs/', '/CLAUDE.md', '/.claude/', '/packages/config/', '/.github/', '/eslint.config.js', '/turbo.json', '/package.json'];

interface Rule {
  type: string;
  parameters?: Record<string, unknown> & { required_status_checks?: { context: string }[] };
}
interface Ruleset {
  name: string;
  target: string;
  enforcement: string;
  bypass_actors: unknown[];
  conditions: { ref_name: { include: string[]; exclude: string[] } };
  rules: Rule[];
}

/**
 * Pemilik yang tercatat di CODEOWNERS untuk sebuah pola persis.
 * @param pattern - Pola path, misalnya `/docs/`.
 * @returns Daftar pemilik (token yang diawali `@`), kosong bila pola tidak ada.
 */
function ownersOf(pattern: string): string[] {
  const line = read('.github/CODEOWNERS')
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => !entry.startsWith('#') && entry.split(/\s+/)[0] === pattern);
  return line ? line.split(/\s+/).slice(1) : [];
}

/**
 * Membaca ruleset main.
 * @returns Ruleset sebagai objek.
 */
function ruleset(): Ruleset {
  return JSON.parse(read('.github/rulesets/main.json')) as Ruleset;
}

/**
 * Mencari aturan berdasarkan tipenya.
 * @param set - Ruleset.
 * @param type - Tipe aturan.
 * @returns Aturan yang cocok.
 */
function rule(set: Ruleset, type: string): Rule {
  const found = set.rules.find((entry) => entry.type === type);
  if (!found) throw new Error(`aturan ${type} tidak ada`);
  return found;
}

describe('CODEOWNERS', () => {
  it('satu pemilik GitHub yang valid untuk semua path dilindungi', () => {
    const owners = REQUIRED_PATHS.map((pattern) => ownersOf(pattern));
    for (const [index, entry] of owners.entries()) {
      expect(entry, REQUIRED_PATHS[index]).toHaveLength(1);
      expect(entry[0]).toMatch(/^@[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/);
    }
    expect(new Set(owners.map((entry) => entry[0])).size).toBe(1);
  });

  it('tidak memakai placeholder', () => {
    expect(read('.github/CODEOWNERS')).not.toMatch(/\bOWNER\b|CHANGEME|TODO|<.*>/);
  });
});

describe('ruleset main protection', () => {
  it('aktif, tanpa bypass, menargetkan branch default', () => {
    const set = ruleset();
    expect(set.name).toBe('main protection');
    expect(set.target).toBe('branch');
    expect(set.enforcement).toBe('active');
    expect(set.bypass_actors).toEqual([]);
    expect(set.conditions.ref_name.include).toEqual(['~DEFAULT_BRANCH']);
    expect(set.conditions.ref_name.exclude).toEqual([]);
  });

  it('memuat aturan wajib', () => {
    const types = ruleset().rules.map((entry) => entry.type);
    expect(types).toEqual(expect.arrayContaining(['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']));
  });

  it('pull request: satu persetujuan, review code owner, review basi dibatalkan', () => {
    const parameters = rule(ruleset(), 'pull_request').parameters;
    expect(parameters).toMatchObject({
      required_approving_review_count: 1,
      require_code_owner_review: true,
      dismiss_stale_reviews_on_push: true,
      required_review_thread_resolution: true,
      require_last_push_approval: false,
    });
  });

  it('required checks sama persis dengan job CI dan memakai kebijakan strict', () => {
    const parameters = rule(ruleset(), 'required_status_checks').parameters;
    expect(parameters?.strict_required_status_checks_policy).toBe(true);
    const contexts = (parameters?.required_status_checks ?? []).map((check) => check.context).sort();
    const jobs = Object.keys((parse(read('.github/workflows/ci.yml')) as { jobs: Record<string, unknown> }).jobs).sort();
    expect(contexts).toEqual(jobs);
  });
});

describe('runbook pemilik', () => {
  it('memuat langkah pemilik', () => {
    const text = read('docs/runbooks/apply-gates.md');
    for (const needle of ['gh api', 'environments/production', 'GitHub App', 'akun mesin', 'gate-check', 'rulesets', 'required reviewer']) {
      expect(text).toContain(needle);
    }
  });

  it('menjelaskan alur persetujuan status dan keterbatasan PR milik pemilik', () => {
    const text = read('docs/runbooks/apply-gates.md');
    expect(text).toContain('status: approved');
    expect(text).toMatch(/tidak (dapat|bisa) menyetujui PR (miliknya|buatannya) sendiri/);
  });
});
