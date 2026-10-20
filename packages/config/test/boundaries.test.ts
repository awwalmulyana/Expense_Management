import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import edges from '../boundaries/allowed-edges.json';
import { assertAcyclic, buildForbiddenRules, findUnlistedModules } from '../boundaries/rules';
import { runBoundaries } from '../boundaries/run';
import { repoRoot } from './helpers';

/**
 * Path absolut ke folder fixture satu kasus.
 * @param name - Nama folder kasus di `fixtures/boundaries`.
 * @returns Path absolut folder kasus.
 */
function fixture(name: string): string {
  return resolve(repoRoot, 'packages/config/fixtures/boundaries', name);
}

/**
 * Nama aturan yang dilanggar, tanpa duplikat dan terurut.
 * @param result - Hasil `runBoundaries`.
 * @returns Daftar nama aturan unik.
 */
function ruleNames(result: { violations: { rule: string }[] }): string[] {
  return [...new Set(result.violations.map((violation) => violation.rule))].sort();
}

const table: [string, string[]][] = [
  ['valid', []],
  ['deep-import', ['no-module-internals']],
  ['type-only-deep-import', ['no-module-internals']],
  ['dynamic-deep-import', ['no-module-internals']],
  ['reexport-deep-import', ['no-module-internals']],
  ['apps-deep-import', ['apps-only-public-door']],
  ['undeclared-edge', ['no-undeclared-module-edge']],
  ['intra-module-cycle', ['no-circular']],
  ['web-imports-module', ['apps-web-no-modules']],
  ['api-imports-web', ['apps-isolated']],
  ['module-imports-app', ['modules-not-to-apps']],
  ['kernel-imports-module', ['packages-no-modules-or-apps']],
  ['contracts-imports-kernel', ['contracts-leaf']],
];

describe('aturan batas modul', () => {
  it.each(table)('%s', async (name, expected) => {
    expect(ruleNames(await runBoundaries(fixture(name)))).toEqual(expected);
  });

  it('modul tak terdaftar terdeteksi', () => {
    expect(findUnlistedModules(fixture('unlisted-module'), edges)).toEqual(['notifications']);
  });

  it('graf siklik ditolak', () => {
    expect(() => assertAcyclic({ a: ['b'], b: ['a'] })).toThrow();
  });

  it('allowed-edges.json acyclic', () => {
    expect(() => assertAcyclic(edges)).not.toThrow();
  });

  it('memuat sepuluh nama aturan', () => {
    const names = new Set(buildForbiddenRules(edges).map((rule) => rule.name));
    expect([...names].sort()).toEqual(
      [
        'apps-isolated',
        'apps-only-public-door',
        'apps-web-no-modules',
        'contracts-leaf',
        'modules-not-to-apps',
        'no-circular',
        'no-module-internals',
        'no-undeclared-module-edge',
        'no-unresolvable',
        'packages-no-modules-or-apps',
      ].sort(),
    );
  });
});
