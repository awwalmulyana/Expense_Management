import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Folder akar repo, dihitung dari lokasi berkas ini (packages/config/test). */
export const repoRoot: string = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Membaca berkas teks yang path-nya relatif terhadap akar repo. */
export function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

/** Memeriksa apakah path relatif terhadap akar repo ada. */
export function exists(relativePath: string): boolean {
  return existsSync(resolve(repoRoot, relativePath));
}

/** Membaca `package.json` root sebagai objek. */
export function rootPkg(): { engines: { node: string }; scripts: Record<string, string> } {
  return JSON.parse(read('package.json'));
}
