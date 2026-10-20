import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cruise, type ICruiseResult } from 'dependency-cruiser';
import { findConformanceIssues } from './conformance';
import { assertAcyclic, buildForbiddenRules, findUnlistedModules, loadAllowedEdges } from './rules';

/** Satu pelanggaran batas modul. */
export interface BoundaryViolation {
  rule: string;
  from: string;
  to: string;
}

/** Hasil pemeriksaan batas modul. */
export interface BoundaryReport {
  violations: BoundaryViolation[];
  unlistedModules: string[];
  /** Temuan kesesuaian workspace (ESLint lokal, skrip wajib, tsconfig longgar). */
  conformance: string[];
}

const SOURCE_FOLDERS = ['apps', 'modules', 'packages'] as const;
const EXCLUDED_PATHS = ['^packages/config/fixtures/', '(^|/)node_modules/', '(^|/)dist/', '(^|/)\\.next/', '(^|/)\\.turbo/', '(^|/)coverage/'];

/**
 * Memeriksa batas modul pada satu pohon repo.
 * Impor tipe (`tsPreCompilationDeps`), `import()` dinamis, dan `export * from` ikut dihitung.
 * @param root - Akar repo (atau akar fixture) yang berisi `apps/`, `modules/`, `packages/`.
 * @returns Pelanggaran aturan dan modul yang belum terdaftar di `allowed-edges.json`.
 * @throws Error bila `allowed-edges.json` memiliki siklus.
 */
export async function runBoundaries(root: string): Promise<BoundaryReport> {
  const edges = loadAllowedEdges();
  assertAcyclic(edges);
  const unlistedModules = findUnlistedModules(root, edges);
  const conformance = findConformanceIssues(root);
  const folders = SOURCE_FOLDERS.filter((folder) => existsSync(join(root, folder)));
  if (folders.length === 0) return { violations: [], unlistedModules, conformance };

  // Folder diberikan relatif terhadap baseDir; dependency-cruiser menggabungkan keduanya sendiri.
  const { output } = await cruise(
    [...folders],
    {
      baseDir: root,
      tsPreCompilationDeps: true,
      validate: true,
      ruleSet: { forbidden: buildForbiddenRules(edges) },
      exclude: { path: EXCLUDED_PATHS },
      doNotFollow: { path: 'node_modules' },
      // Modul adalah paket workspace (`@finance/<modul>`): impor lewat nama paket harus di-resolve
      // lewat `exports` agar tetap terlihat oleh aturan batas, bukan dilewati sebagai "tak ditemukan".
      enhancedResolveOptions: {
        exportsFields: ['exports'],
        conditionNames: ['import', 'require', 'node', 'default'],
        extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'],
      },
    },
  );

  const result = output as ICruiseResult;
  const violations = result.summary.violations
    .filter((violation) => violation.rule.severity === 'error')
    .map((violation) => ({ rule: violation.rule.name, from: violation.from, to: violation.to }));
  return { violations, unlistedModules, conformance };
}
