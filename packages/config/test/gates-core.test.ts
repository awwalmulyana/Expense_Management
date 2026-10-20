import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findViolations, isLocked, lockedPrefixes } from '../gates/locked-paths';
import { toRepoRelative } from '../gates/paths';
import { parseStatus } from '../gates/status';

/**
 * Membungkus isi front matter menjadi dokumen markdown lengkap.
 * @param body - Isi front matter (tanpa pembatas `---`).
 * @returns Dokumen markdown dengan front matter di awal berkas.
 */
function withFrontMatter(body: string): string {
  return `---\n${body}\n---\n# Dokumen`;
}

describe('parseStatus', () => {
  it('berkas hilang menghasilkan missing', () => expect(parseStatus(undefined)).toBe('missing'));

  it.each([['status: approved'], ['status: "approved"']])('approved: %s', (body) =>
    expect(parseStatus(withFrontMatter(body))).toBe('approved'),
  );

  it('CRLF dan BOM tetap approved', () => {
    expect(parseStatus('---\r\nstatus: approved\r\n---\r\n')).toBe('approved');
    expect(parseStatus('﻿' + withFrontMatter('status: approved'))).toBe('approved');
  });

  it.each([['status: Approved'], ['status: draft\nstatus: approved'], ['status: [approved'], ['status: true'], ['status: !!binary approved'], ['status: &a approved'], ['status: approved\nother: [']])(
    'bukan approved: %s',
    (body) => expect(parseStatus(withFrontMatter(body))).toBe('draft'),
  );

  it.each([
    ['status: "appr\\u006fved"'],
    ['status: |-\n  approved'],
    ['status: >-\n  approved'],
    ['status:\n  approved'],
    ['? status\n: approved'],
    ['{status: approved}'],
    ['"status": approved'],
    ['status: "approved" extra'],
  ])('bentuk YAML yang tidak terbaca jelas sebagai approved ditolak: %s', (body) =>
    expect(parseStatus(withFrontMatter(body))).toBe('draft'),
  );

  it('front matter kosong yang diikuti blok kedua ditolak', () =>
    expect(parseStatus('---\n---\nstatus: approved\n---\n# PRD')).toBe('draft'));

  it.each([["status: 'approved'"], ['status: approved # disetujui pemilik'], ['status: approved\nowner: awwal']])(
    'bentuk polos, kutip, dan komentar tetap approved: %s',
    (body) => expect(parseStatus(withFrontMatter(body))).toBe('approved'),
  );

  it('tanpa front matter atau tidak di awal menghasilkan draft', () => {
    expect(parseStatus('# PRD\n\nstatus: approved')).toBe('draft');
    expect(parseStatus('\n' + withFrontMatter('status: approved'))).toBe('draft');
    expect(parseStatus('--- \nstatus: approved\n---\n')).toBe('draft');
  });

  it('status draft dan front matter kosong menghasilkan draft', () => {
    expect(parseStatus(withFrontMatter('status: draft'))).toBe('draft');
    expect(parseStatus('---\n---\n')).toBe('draft');
  });
});

const DRAFT = { prd: 'draft', design: 'draft' } as const;

describe('lockedPrefixes', () => {
  it('awalan terkunci mengikuti status PRD dan design', () => {
    expect(lockedPrefixes(DRAFT)).toEqual(['packages/design-system/', 'modules/', 'apps/', 'packages/contracts/', 'packages/kernel/']);
    expect(lockedPrefixes({ prd: 'approved', design: 'draft' })).toEqual(['modules/', 'apps/', 'packages/contracts/', 'packages/kernel/']);
    expect(lockedPrefixes({ prd: 'approved', design: 'approved' })).toEqual([]);
    expect(lockedPrefixes({ prd: 'draft', design: 'approved' })).toEqual(lockedPrefixes(DRAFT));
    expect(lockedPrefixes({ prd: 'missing', design: 'missing' })).toEqual(lockedPrefixes(DRAFT));
  });
});

describe('isLocked dan findViolations', () => {
  it.each([
    ['modules/accounts/src/index.ts', true],
    ['modules', true],
    ['packages/contracts-extra/a.ts', false],
    ['Modules/accounts/a.ts', true],
    ['./modules/../modules/a.ts', true],
    ['modules\\accounts\\a.ts', true],
    ['docs/prd/prd.md', false],
    ['packages/config/gates/status.ts', false],
  ])('isLocked %s', (path, expected) => expect(isLocked(path, DRAFT)).toBe(expected));

  it('path yang naik keluar lalu masuk kembali tetap terkunci', () => {
    expect(isLocked('docs/../modules/a.ts', DRAFT)).toBe(true);
    expect(isLocked('docs/../../modules/a.ts', DRAFT)).toBe(false);
  });

  it('PR yang menyetujui sekaligus mengedit modul tetap gagal', () => {
    expect(findViolations(['docs/prd/prd.md', 'modules/a.ts'], DRAFT)).toEqual(['modules/a.ts']);
  });

  it('tidak ada pelanggaran bila gerbang terbuka', () => {
    expect(findViolations(['modules/a.ts', 'apps/b.ts'], { prd: 'approved', design: 'approved' })).toEqual([]);
  });
});

describe('toRepoRelative', () => {
  it('path absolut di dalam repo menjadi relatif', () => {
    expect(toRepoRelative('/repo/modules/a.ts', '/repo')).toBe('modules/a.ts');
  });

  it('path yang keluar repo menghasilkan null', () => {
    expect(toRepoRelative('/repo/../etc/x', '/repo')).toBeNull();
    expect(toRepoRelative('/repoextra/modules/a.ts', '/repo')).toBeNull();
  });

  it('path relatif dianggap terhadap projectDir', () => {
    expect(toRepoRelative('modules/a.ts', '/repo')).toBe('modules/a.ts');
    expect(toRepoRelative('./docs/../modules/a.ts', '/repo')).toBe('modules/a.ts');
  });

  it('projectDir berupa symlink ke folder nyata', () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'gate-')));
    const real = join(base, 'real');
    const link = join(base, 'link');
    mkdirSync(join(real, 'modules'), { recursive: true });
    symlinkSync(real, link);
    expect(toRepoRelative(join(real, 'modules/a.ts'), link)).toBe('modules/a.ts');
    expect(toRepoRelative(join(link, 'modules/a.ts'), link)).toBe('modules/a.ts');
  });

  it('symlink di dalam repo yang menunjuk ke modul tetap terdeteksi', () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'gate-')));
    mkdirSync(join(base, 'modules'), { recursive: true });
    mkdirSync(join(base, 'docs'), { recursive: true });
    symlinkSync(join(base, 'modules'), join(base, 'docs/shortcut'));
    expect(toRepoRelative(join(base, 'docs/shortcut/a.ts'), base)).toBe('modules/a.ts');
  });

  it('".." setelah symlink mengikuti semantik kernel, bukan leksikal', () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'gate-')));
    mkdirSync(join(base, 'modules/sub'), { recursive: true });
    mkdirSync(join(base, 'docs'), { recursive: true });
    symlinkSync(join(base, 'modules/sub'), join(base, 'docs/shortcut'));
    // Leksikal: docs/a.ts (tidak terkunci). Kernel: modules/a.ts (terkunci).
    // Path mentah dibangun dengan string; join() akan menormalkan ".." secara leksikal lebih dulu.
    expect(toRepoRelative(`${base}/docs/shortcut/../a.ts`, base)).toBe('modules/a.ts');
  });

  it('symlink di dalam repo yang menunjuk ke luar repo menghasilkan null', () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'gate-')));
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'gate-outside-')));
    mkdirSync(join(base, 'docs'), { recursive: true });
    symlinkSync(outside, join(base, 'docs/escape'));
    expect(toRepoRelative(join(base, 'docs/escape/x.ts'), base)).toBeNull();
  });
});
