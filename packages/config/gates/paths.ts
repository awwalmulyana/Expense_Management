import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

const SEPARATORS = sep === '\\' ? /[\\/]+/ : /\/+/;

/**
 * Mengikuti symlink satu komponen path bila komponen itu ada.
 * @param candidate - Path absolut.
 * @returns Path nyata bila ada, selain itu path semula (berkas baru belum ada).
 */
function realIfExists(candidate: string): string {
  try {
    return realpathSync.native(candidate);
  } catch {
    return candidate;
  }
}

/**
 * Menyelesaikan path komponen demi komponen dengan semantik kernel:
 * symlink diikuti sebelum `..` diterapkan, sehingga `link/../x` tidak salah dihitung secara leksikal.
 * @param base - Direktori awal absolut dan nyata untuk path relatif.
 * @param rawPath - Path mentah (absolut atau relatif).
 * @returns Path absolut nyata; bagian yang belum ada ditambahkan apa adanya.
 */
function resolveReal(base: string, rawPath: string): string {
  let current = isAbsolute(rawPath) ? parse(rawPath).root : base;
  for (const segment of rawPath.split(SEPARATORS)) {
    if (segment === '' || segment === '.') continue;
    current = segment === '..' ? dirname(current) : realIfExists(join(current, segment));
  }
  return current;
}

/**
 * Mengubah path (absolut atau relatif) menjadi path relatif terhadap akar repo.
 * Symlink pada projectDir maupun di dalam repo diselesaikan lebih dulu.
 * @param filePath - Path berkas yang akan ditulis.
 * @param projectDir - Akar repo (boleh berupa symlink).
 * @returns Path posix relatif repo, `''` untuk akar repo itu sendiri, atau `null` bila di luar repo.
 */
export function toRepoRelative(filePath: string, projectDir: string): string | null {
  const realProject = resolveReal(parse(resolve(projectDir)).root, resolve(projectDir));
  const realTarget = resolveReal(realProject, filePath);
  const relativePath = relative(realProject, realTarget);
  if (relativePath === '') return '';
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return null;
  return relativePath.split(sep).join('/');
}

/** Akar pohon kerja yang memuat sebuah target, dengan path target relatif terhadap akar itu. */
export interface TargetRoot {
  root: string;
  relative: string;
}

/**
 * Mencari direktori `.git` bersama (common dir) milik sebuah akar pohon kerja,
 * baik akar utama (`.git` berupa folder) maupun worktree tertaut (`.git` berupa berkas `gitdir:`).
 * @param root - Akar pohon kerja.
 * @returns Path nyata common dir, atau `null` bila bukan pohon kerja git.
 */
function gitCommonDir(root: string): string | null {
  try {
    const dotGit = join(root, '.git');
    if (lstatSync(dotGit).isDirectory()) return realpathSync.native(dotGit);
    const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'));
    if (!pointer?.[1]) return null;
    const gitDir = resolve(root, pointer[1].trim());
    const commonDir = resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf8').trim());
    return realpathSync.native(commonDir);
  } catch {
    return null;
  }
}

/**
 * Mencari akar pohon kerja git terdekat di atas sebuah path (path boleh belum ada).
 * @param start - Path absolut nyata.
 * @param stopAt - Berhenti setelah memeriksa direktori ini bila diberikan.
 * @returns Akar terdekat yang memuat `.git`, atau `null`.
 */
function nearestWorktreeRoot(start: string, stopAt?: string): string | null {
  let current = start;
  for (;;) {
    if (stopAt !== undefined && current === stopAt) return null;
    if (existsSync(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Menentukan akar-akar pohon kerja yang relevan untuk sebuah target penulisan.
 * Agent bekerja di git worktree (di dalam `.claude/worktrees/` atau di folder saudara) sementara
 * `CLAUDE_PROJECT_DIR` tetap menunjuk akar proyek; path dicocokkan ke akar proyek dan ke akar
 * worktree yang memuatnya, selama worktree itu berasal dari repo yang sama.
 * @param filePath - Path berkas yang akan ditulis.
 * @param projectDir - Akar proyek (`CLAUDE_PROJECT_DIR`).
 * @returns Daftar akar beserta path relatifnya; kosong bila target di luar repo ini dan semua worktree-nya.
 */
export function resolveTargetRoots(filePath: string, projectDir: string): TargetRoot[] {
  const realProject = resolveReal(parse(resolve(projectDir)).root, resolve(projectDir));
  const realTarget = resolveReal(realProject, filePath);
  const targets: TargetRoot[] = [];

  const inProject = toRepoRelative(filePath, projectDir);
  if (inProject !== null) targets.push({ root: realProject, relative: inProject });

  const worktreeRoot = nearestWorktreeRoot(dirname(realTarget), inProject !== null ? realProject : undefined);
  if (worktreeRoot === null || worktreeRoot === realProject) return targets;

  const sameRepo = inProject !== null || (gitCommonDir(worktreeRoot) !== null && gitCommonDir(worktreeRoot) === gitCommonDir(realProject));
  if (!sameRepo) return targets;
  const relativePath = relative(worktreeRoot, realTarget).split(sep).join('/');
  targets.push({ root: worktreeRoot, relative: relativePath });
  return targets;
}
