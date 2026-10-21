import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IForbiddenRuleType } from 'dependency-cruiser';

/** Peta modul ke daftar modul yang boleh diimpornya (tepi dependensi). */
export type AllowedEdges = Record<string, readonly string[]>;

/** Semua berkas modul selain pintu publik `src/index.ts` dianggap internal. */
const MODULE_INTERNAL = '^modules/[^/]+/(?!src/index\\.ts$)';

/**
 * Memuat `allowed-edges.json` dari paket config ini.
 * @returns Tepi dependensi yang diizinkan antarmodul.
 */
export function loadAllowedEdges(): AllowedEdges {
  const jsonPath = fileURLToPath(new URL('./allowed-edges.json', import.meta.url));
  return JSON.parse(readFileSync(jsonPath, 'utf8')) as AllowedEdges;
}

/**
 * Memastikan graf tepi dependensi tidak memiliki siklus.
 * @param edges - Peta modul ke modul yang boleh diimpornya.
 * @throws Error bila ditemukan siklus; pesan memuat jalur siklusnya.
 */
export function assertAcyclic(edges: AllowedEdges): void {
  const finished = new Set<string>();
  const inProgress: string[] = [];

  /**
   * Penelusuran DFS dari satu simpul.
   * @param node - Nama modul yang sedang ditelusuri.
   */
  const visit = (node: string): void => {
    if (finished.has(node)) return;
    const cycleStart = inProgress.indexOf(node);
    if (cycleStart !== -1) {
      throw new Error(`Siklus pada allowed-edges: ${[...inProgress.slice(cycleStart), node].join(' -> ')}`);
    }
    inProgress.push(node);
    for (const next of edges[node] ?? []) visit(next);
    inProgress.pop();
    finished.add(node);
  };

  for (const node of Object.keys(edges)) visit(node);
}

/**
 * Mencari isi `modules/` yang bukan folder modul terdaftar: folder yang belum didaftarkan pada `edges`,
 * serta berkas biasa dan symlink (berkas tersembunyi diabaikan).
 * @param root - Akar repo (atau akar fixture).
 * @param edges - Peta modul terdaftar.
 * @returns Nama entri tak terdaftar, terurut.
 */
export function findUnlistedModules(root: string, edges: AllowedEdges): string[] {
  const modulesDir = join(root, 'modules');
  if (!existsSync(modulesDir)) return [];
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && (!entry.isDirectory() || !(entry.name in edges)))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Meloloskan karakter khusus regex pada nama modul.
 * @param text - Teks mentah.
 * @returns Teks yang aman dipakai di dalam regex.
 */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Membangun aturan terlarang dependency-cruiser dari tepi yang diizinkan.
 * @param edges - Peta modul ke modul yang boleh diimpornya.
 * @returns Daftar aturan terlarang; `no-undeclared-module-edge` satu aturan per pasangan terurut yang tak diizinkan.
 */
export function buildForbiddenRules(edges: AllowedEdges): IForbiddenRuleType[] {
  const moduleNames = Object.keys(edges);
  const undeclaredEdgeRules: IForbiddenRuleType[] = [];
  for (const importer of moduleNames) {
    for (const imported of moduleNames) {
      if (imported === importer || (edges[importer] ?? []).includes(imported)) continue;
      undeclaredEdgeRules.push({
        name: 'no-undeclared-module-edge',
        severity: 'error',
        comment: `${importer} tidak boleh bergantung pada ${imported}; daftarkan di allowed-edges.json bila memang diperlukan.`,
        from: { path: `^modules/${escapeRegex(importer)}/` },
        to: { path: `^modules/${escapeRegex(imported)}/` },
      });
    }
  }

  return [
    {
      name: 'no-module-internals',
      severity: 'error',
      comment: 'Modul lain hanya boleh mengimpor pintu publik src/index.ts.',
      from: { path: '^modules/([^/]+)/' },
      to: { path: MODULE_INTERNAL, pathNot: '^modules/$1/' },
    },
    {
      name: 'apps-only-public-door',
      severity: 'error',
      comment: 'Aplikasi hanya boleh mengimpor pintu publik modul.',
      from: { path: '^apps/' },
      to: { path: MODULE_INTERNAL },
    },
    ...undeclaredEdgeRules,
    {
      name: 'modules-closed-world',
      severity: 'error',
      comment: 'Modul hanya boleh mengimpor modul, packages/, pustaka npm, atau modul inti Node; perantara di luar itu dapat mencuci impor (apps/ ditangani modules-not-to-apps).',
      from: { path: '^modules/' },
      to: {
        pathNot: '^(modules|packages|apps)/',
        couldNotResolve: false,
        dependencyTypesNot: ['core', 'npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg', 'npm-unknown'],
      },
    },
    {
      name: 'no-unresolvable',
      severity: 'error',
      comment: 'Impor yang tidak dapat di-resolve tidak bisa diperiksa batasnya; perbaiki impornya, jangan dilewati.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Tidak boleh ada siklus impor, termasuk di dalam satu modul.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'apps-web-no-modules',
      severity: 'error',
      comment: 'apps/web berbicara ke API lewat HTTP, tidak mengimpor modul.',
      from: { path: '^apps/web/' },
      to: { path: '^modules/' },
    },
    {
      name: 'apps-isolated',
      severity: 'error',
      comment: 'Aplikasi tidak boleh mengimpor aplikasi lain.',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'modules-not-to-apps',
      severity: 'error',
      comment: 'Modul tidak boleh bergantung pada aplikasi.',
      from: { path: '^modules/' },
      to: { path: '^apps/' },
    },
    {
      name: 'packages-no-modules-or-apps',
      severity: 'error',
      comment: 'Paket bersama tidak boleh bergantung pada modul atau aplikasi.',
      from: { path: '^packages/' },
      to: { path: '^(modules|apps)/' },
    },
    {
      name: 'contracts-leaf',
      severity: 'error',
      comment: 'packages/contracts adalah daun: tidak mengimpor kernel, design-system, modul, atau aplikasi.',
      from: { path: '^packages/contracts/' },
      to: { path: '^(packages/(kernel|design-system)|modules|apps)/' },
    },
  ];
}
