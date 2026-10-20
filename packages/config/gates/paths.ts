import { realpathSync } from 'node:fs';
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
