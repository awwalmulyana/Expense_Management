import { posix } from 'node:path';
import { GATE_DOCS, type PhaseStatuses } from './status';

const DESIGN_SYSTEM_PREFIXES = ['packages/design-system/'];
const BUILD_PREFIXES = ['modules/', 'apps/', 'packages/contracts/', 'packages/kernel/'];

/**
 * Daftar awalan path yang terkunci untuk status fase saat ini.
 * Design system terbuka setelah PRD approved; kode build terbuka setelah PRD dan design approved.
 * @param statuses - Status PRD dan design.
 * @returns Awalan berakhiran `/`, relatif terhadap akar repo.
 */
export function lockedPrefixes(statuses: PhaseStatuses): string[] {
  if (statuses.prd !== 'approved') return [...DESIGN_SYSTEM_PREFIXES, ...BUILD_PREFIXES];
  if (statuses.design !== 'approved') return [...BUILD_PREFIXES];
  return [];
}

/**
 * Menormalkan path agar tidak bisa mengakali pencocokan awalan:
 * backslash menjadi slash, huruf kecil (filesystem tak peka huruf besar-kecil), `.` dan `..` diselesaikan.
 * @param repoRelativePath - Path relatif terhadap akar repo.
 * @returns Path posix ternormalisasi, huruf kecil.
 */
function normalizeForMatch(repoRelativePath: string): string {
  return posix.normalize(repoRelativePath.replace(/\\/g, '/').toLowerCase()).replace(/^(\.\/)+/, '');
}

/**
 * Menentukan apakah sebuah path terkunci pada status fase saat ini.
 * Pencocokan mengikuti batas direktori: `packages/contracts-extra/` tidak terkunci oleh `packages/contracts/`.
 * @param repoRelativePath - Path relatif terhadap akar repo.
 * @param statuses - Status PRD dan design.
 * @returns `true` bila path berada di bawah salah satu awalan terkunci.
 */
export function isLocked(repoRelativePath: string, statuses: PhaseStatuses): boolean {
  const normalized = normalizeForMatch(repoRelativePath);
  return lockedPrefixes(statuses).some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
}

/**
 * Menyaring daftar berkas berubah menjadi yang terkunci.
 * @param changedFiles - Path relatif repo dari berkas yang diubah.
 * @param statuses - Status PRD dan design pada basis (bukan pada head PR).
 * @returns Path (apa adanya) yang terkunci.
 */
export function findViolations(changedFiles: string[], statuses: PhaseStatuses): string[] {
  return changedFiles.filter((file) => isLocked(file, statuses));
}

/**
 * Alasan satu kalimat bila gerbang belum terbuka.
 * @param statuses - Status PRD dan design.
 * @param upTo - `prd` hanya memeriksa PRD; `design` memeriksa PRD lalu design.
 * @returns Kalimat alasan, atau `null` bila gerbang yang diminta sudah terbuka.
 */
export function unmetGateReason(statuses: PhaseStatuses, upTo: 'prd' | 'design'): string | null {
  if (statuses.prd !== 'approved') {
    return `PRD belum approved (${GATE_DOCS.prd}: ${statuses.prd}); setujui PRD sebelum melanjutkan.`;
  }
  if (upTo === 'design' && statuses.design !== 'approved') {
    return `Design belum approved (${GATE_DOCS.design}: ${statuses.design}); setujui design sebelum membangun.`;
  }
  return null;
}
