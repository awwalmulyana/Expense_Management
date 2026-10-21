# Fondasi Aplikasi Keuangan — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah repo GitHub kosong menjadi fondasi proyek: workspace, penegak konvensi dan batas modul, mesin gerbang fase, definisi agent dan command, CI, dan berkas gerbang GitHub untuk diterapkan pemilik; ditambah dua spike yang menutup keputusan terbuka (ORM dan deploy).

**Architecture:** Semua logika penegakan hidup di satu paket `@finance/config` (`packages/config`) sebagai pustaka TypeScript ber-tes. Aturan diuji dengan fixture, sehingga terbukti bekerja sebelum satu pun modul ada. Konfigurasi Claude ada di `CLAUDE.md` dan `.claude/`, workflow di `.github/`. Tidak ada kode aplikasi atau modul pada fase ini.

**Tech Stack:** Node 22, pnpm 10 (workspace), Turborepo, TypeScript 5, Vitest, ESLint 9 (flat config) + typescript-eslint + eslint-plugin-jsdoc, dependency-cruiser, tsx, yaml, pg, GitHub Actions.

**Spec:** `docs/specs/2026-10-20-finance-app-design.md` (status approved). Rencana ini disalin ke repo di `docs/specs/2026-10-20-foundation-plan.md` pada Task 1.

## Global Constraints

- Fondasi hanya menyentuh `packages/config/`, `.github/`, `.claude/`, `docs/`, dan konfigurasi di root repo. Tidak membuat `modules/**`, `apps/**`, `packages/contracts/**`, `packages/kernel/**`, `packages/design-system/**` (spec 8.3).
- `pnpm-workspace.yaml` berisi `apps/*`, `modules/*`, `packages/*` (spec 2, 3.1).
- Modul: `identity`, `accounts`, `transactions`, `budgets`, `reporting`. Satu skema PostgreSQL per modul dengan nama yang sama. Satu pintu publik `modules/<nama>/src/index.ts`; internal `domain`, `application`, `infrastructure` (spec 3.1, 3.2).
- Tepi dependensi yang diizinkan: `transactions → accounts`, `budgets → transactions`, `reporting → accounts, transactions, budgets`. `identity` dan `accounts` tidak bergantung pada modul lain. Graf wajib acyclic (spec 3.2 butir 7).
- Event domain di `packages/contracts/events/`; infrastruktur bersama di `packages/kernel/` (spec 3.2 butir 6, 3.3).
- Penamaan: camelCase variabel dan fungsi, PascalCase tipe/kelas/interface, UPPER_SNAKE konstanta, snake_case tabel dan kolom database (spec 14.2).
- Setiap fungsi punya komentar TSDoc; berkas tes dikecualikan (spec 14.3).
- Rentang berlaku: `valid_from` (wajib) dan `valid_until` (boleh kosong), tipe `timestamptz`, interval setengah terbuka `[valid_from, valid_until)`, tanpa tumpang tindih lewat `EXCLUDE USING gist` dengan ekstensi `btree_gist` (spec 14.4).
- Uang: `amount_minor` bigint plus kode mata uang; setiap method repository menerima `userId` (spec 4).
- Gerbang: status di `docs/prd/prd.md` dan `docs/design/design.md` bernilai `draft` atau `approved`. `packages/design-system/**` terkunci sampai PRD `approved`; `modules/**`, `apps/**`, `packages/contracts/**`, `packages/kernel/**` terkunci sampai PRD **dan** design `approved` (spec 8.3).
- Dimiliki pemilik lewat CODEOWNERS: `docs/`, `CLAUDE.md`, `.claude/**`, `packages/config/**` (spec 8.4, 14.1). Pemilik, bukan agent, menerapkan konfigurasi gerbang GitHub (spec 13.3).
- Setiap PR menjalankan: lint, typecheck, cek batas modul, `gate-check`, unit test paket terdampak, integration test dengan PostgreSQL service container, audit dependensi dan deteksi secret (spec 9).
- `CLAUDE.md` di bawah 200 baris (spec 14.1).

## Review Focus

Lima kondisi yang disiratkan spec tetapi paling mudah lolos dari tes biasa. Tes penguncinya ada di tugas yang ditunjuk.

1. **Berkas status yang aneh harus gagal-tertutup.** BOM, CRLF, nilai berkutip, `Approved`, kunci `status` ganda, YAML rusak, tanpa front matter, front matter bukan di awal berkas, dan berkas hilang: hanya `status: approved` persis yang membuka gerbang. (Task 4)
2. **Pencocokan path tidak boleh bisa diakali.** `packages/contracts-extra/` bukan `packages/contracts/`; `Modules/` pada filesystem tak peka huruf besar-kecil; `./modules/../modules/`; backslash; symlink (`/var` vs `/private/var`); path absolut. (Task 4)
3. **PR yang mengubah `status: approved` sekaligus mengedit `modules/` harus gagal.** `gate-check` membaca status dari basis `main`, bukan dari head PR. (Task 4 untuk logika, Task 10 untuk workflow)
4. **Batas modul gagal-tertutup.** `import type`, `import()` dinamis, `export * from` terhadap internal modul lain, modul baru yang belum terdaftar di `allowed-edges.json`, dan siklus di dalam satu modul tetap tertangkap. (Task 3)
5. **Hook yang crash tidak boleh diam-diam mengizinkan.** JSON rusak, input tanpa path, atau error runtime berujung exit code 2. (Task 5)

## Keputusan rencana di luar spec (untuk ditinjau pemilik)

1. CODEOWNERS juga memuat `/.github/`, `/eslint.config.js`, `/turbo.json`, `/package.json`, agar agent tidak bisa melonggarkan lint atau workflow yang membatasinya (alasan sama dengan spec 8.4 dan 14.1).
2. Identitas agent di GitHub harus berbeda dari pemilik (GitHub App atau akun mesin), karena pemilik tidak bisa menyetujui PR miliknya sendiri. Spec 13.2 sudah diperjelas.
3. `/foundation` berfungsi sebagai pemeriksa kesiapan yang idempoten. Pembuatan pertama fondasi dilakukan lewat rencana ini, karena command-nya sendiri baru dibuat di dalamnya.
4. QA agent memiliki `packages/e2e/`; DevOps agent memiliki `.github/` dan `scripts/` (spec tidak menyebut lokasi).
5. Tabel berversi ditandai kolom `logical_id`; tabel seperti itu wajib punya constraint `EXCLUDE` (membuat spec 14.4 butir 3 dapat diuji).
6. Identifier berbahasa Inggris; komentar TSDoc dan dokumen proyek berbahasa Indonesia. Dapat dibalik dengan mengubah `.claude/rules/documentation.md`.
7. Hook hanya mencakup Edit, Write, MultiEdit, NotebookEdit dan gagal-tertutup. Penulisan lewat Bash tidak tercakup (batas yang sudah diakui spec 8.4); penjaga sebenarnya adalah GitHub.
8. Versi: Node 22, pnpm 10, PostgreSQL 17 di CI (samakan dengan versi mayor Supabase; dikonfirmasi di Task 12). Semua `uses:` di workflow dipin ke SHA commit.
9. Fondasi dikirim sebagai **satu PR** (Task 1-11). Spike (Task 12-13) menjadi PR kedua setelah pemilik menerapkan gerbang.

## Peta berkas

```
package.json, pnpm-workspace.yaml, turbo.json, tsconfig.json, eslint.config.js, .nvmrc, .gitignore
CLAUDE.md
.claude/{settings.json, rules/*.md, agents/*.md, commands/*.md}
.github/{CODEOWNERS, workflows/ci.yml, rulesets/main.json}
docs/{specs/, runbooks/apply-gates.md}
packages/config/
  eslint/index.js                 konfigurasi ESLint bersama
  boundaries/{rules.ts, run.ts, cli.ts, allowed-edges.json}
  gates/{status.ts, locked-paths.ts, paths.ts, cli.ts, hook.ts}
  schema-lint/{index.ts, exceptions.json}
  fixtures/boundaries/<kasus>/    pohon mini untuk tes batas modul
  test/*.test.ts
```

---

### Task 1: Kerangka workspace dan arsip spec

**Files:**
- Create: `.gitignore`, `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`
- Create: `packages/config/{package.json, tsconfig.base.json, tsconfig.json, vitest.config.ts, vitest.integration.config.ts, test/helpers.ts}`
- Create (salinan): `docs/specs/2026-10-20-finance-app-design.md`, `docs/specs/2026-10-20-foundation-plan.md`
- Test: `packages/config/test/workspace.test.ts`

**Interfaces:**
- Produces: skrip root `lint`, `typecheck`, `test`, `test:integration`, masing-masing `turbo run <nama>`. Task 3 dan 5 menambah `boundaries`, `gate:require`, `gate:check`.
- Produces: paket `@finance/config` (ESM) dengan skrip `lint` (`eslint .`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`, tanpa `*.integration.test.ts`), `test:integration` (`vitest run -c vitest.integration.config.ts`, hanya `*.integration.test.ts`).
- Produces: `repoRoot: string` di `packages/config/test/helpers.ts`. `tsconfig.base.json` memakai `strict`, `noUncheckedIndexedAccess`, target `ES2022`, `moduleResolution: "Bundler"`, `noEmit`; `tsconfig.json` paket mengecualikan `fixtures/`.
- `turbo.json`: task `lint`, `typecheck`, `test`, dan `test:integration` (`cache: false`, `env: ["TEST_DATABASE_URL"]`).

- [ ] **Step 1: Siapkan cabang kerja.** Bila repo belum punya commit, buat commit awal `.gitignore` (`node_modules/`, `dist/`, `.next/`, `.turbo/`, `coverage/`, `.env*`, `.vercel/`) di `main` dan push. Lalu `git switch -c foundation`.
- [ ] **Step 2: Inisialisasi paket.** Buat `package.json` root (`private: true`, `packageManager` pnpm 10.x stabil terkini, `engines.node` `>=22 <23`), `pnpm-workspace.yaml`, dan `packages/config/package.json` (`name: "@finance/config"`, `type: "module"`). Jalankan `pnpm add -Dw turbo typescript tsx vitest` lalu `pnpm install`. Run: `pnpm -v` → mulai dengan `10.`.
- [ ] **Step 3: Tulis tes yang gagal** di `workspace.test.ts`:

```ts
it('glob workspace', () => expect(workspaceGlobs()).toEqual(['apps/*', 'modules/*', 'packages/*']));
it('versi Node terkunci', () => { expect(read('.nvmrc').trim()).toBe('22'); expect(rootPkg().engines.node).toBe('>=22 <23'); });
it('spec diarsipkan', () => expect(read('docs/specs/2026-10-20-finance-app-design.md')).toContain('Status: **approved**'));
it('rencana diarsipkan', () => expect(exists('docs/specs/2026-10-20-foundation-plan.md')).toBe(true));
```
- [ ] **Step 4: Jalankan** `pnpm --filter @finance/config test`. Expected: FAIL (`.nvmrc` dan arsip belum ada).
- [ ] **Step 5: Buat berkas yang tersisa** sesuai blok Files dan Interfaces; salin spec dan rencana ini ke `docs/specs/`.
- [ ] **Step 6: Jalankan** `pnpm --filter @finance/config test` lalu `pnpm turbo run typecheck test`. Expected: PASS, exit 0.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "chore: workspace skeleton and archived spec"`

---

### Task 2: Konvensi penamaan dan komentar (ESLint)

**Files:**
- Create: `packages/config/eslint/index.js`, `eslint.config.js` (root)
- Modify: `packages/config/package.json` (`exports["./eslint"]`, devDependencies `eslint`, `typescript-eslint`, `eslint-plugin-jsdoc`)
- Test: `packages/config/test/eslint.test.ts`

**Interfaces:**
- Produces: ekspor default `Linter.Config[]` dari `@finance/config/eslint`.
- Produces: `eslint.config.js` root = konfigurasi itu ditambah `ignores: ['**/fixtures/**', '**/dist/**', '**/.next/**', '**/.turbo/**', '**/coverage/**']`.

- [ ] **Step 1: Tulis tes yang gagal.** Helper `lint(code, filePath): Promise<string[]>` memakai `new ESLint({ overrideConfigFile: <index.js> })` dan `lintText`, mengembalikan `ruleId` pesan. Asersi:

```ts
const NAMING = '@typescript-eslint/naming-convention', DOC = 'jsdoc/require-jsdoc';
it('variabel snake_case ditolak', async () => expect(await lint('const user_name = 1;', 'a.ts')).toContain(NAMING));
it('konstanta UPPER_SNAKE diterima', async () => expect(await lint('const MAX_RETRY = 3;', 'a.ts')).not.toContain(NAMING));
it('fungsi PascalCase ditolak di .ts', async () => expect(await lint('/** Hitung. */ export function DoThing() {}', 'a.ts')).toContain(NAMING));
it('komponen PascalCase diterima di .tsx', async () => expect(await lint('/** Tombol. */ export function Button() { return null; }', 'a.tsx')).not.toContain(NAMING));
it('tipe snake_case ditolak', async () => expect(await lint('type account_id = string;', 'a.ts')).toContain(NAMING));
it('fungsi tanpa komentar ditolak', async () => expect(await lint('export function add(a: number, b: number) { return a + b; }', 'a.ts')).toContain(DOC));
it('arrow function yang ditugaskan ke variabel ditolak', async () => expect(await lint('export const f = () => 1;', 'a.ts')).toContain(DOC));
it('fungsi berkomentar diterima', async () => expect(await lint('/** Menjumlahkan. */\nexport function add(a: number, b: number) { return a + b; }', 'a.ts')).not.toContain(DOC));
it('callback inline dikecualikan', async () => expect(await lint('[1].map((x) => x);', 'a.ts')).not.toContain(DOC));
it('berkas tes dikecualikan', async () => expect(await lint('export function add() {}', 'a.test.ts')).not.toContain(DOC));
```
- [ ] **Step 2: Jalankan** `pnpm --filter @finance/config test -- eslint`. Expected: FAIL (`index.js` belum ada).
- [ ] **Step 3: Implementasikan** `eslint/index.js`. `@typescript-eslint/naming-convention`: default `camelCase`; `variable` boleh `camelCase` dan `UPPER_CASE`; `function` `camelCase`; `typeLike` dan `enumMember` `PascalCase`; `leadingUnderscore: allow`; properti objek tidak diatur. Override untuk `**/*.tsx` menambah `PascalCase` pada `variable` dan `function`. `jsdoc/require-jsdoc` untuk `FunctionDeclaration`, `MethodDefinition`, `ArrowFunctionExpression`, `FunctionExpression`; override `off` untuk `**/*.test.ts`, `**/*.spec.ts`, `**/*.e2e.ts`. Tidak mengaktifkan aturan jsdoc lain (spec hanya mewajibkan keberadaan komentar).
- [ ] **Step 4: Jalankan** `pnpm --filter @finance/config test -- eslint` lalu `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add eslint.config.js packages/config && git commit -m "feat(config): naming and tsdoc lint rules"`

---

### Task 3: Aturan batas modul (dependency-cruiser)

**Files:**
- Create: `packages/config/boundaries/{allowed-edges.json, rules.ts, run.ts, cli.ts}`, `packages/config/fixtures/boundaries/<kasus>/**` (pohon mini bertingkat `modules/`, `apps/`, `packages/`)
- Modify: `package.json` root (skrip `boundaries`: `tsx packages/config/boundaries/cli.ts`); `packages/config/package.json` (devDependency `dependency-cruiser`)
- Test: `packages/config/test/boundaries.test.ts`

**Interfaces:**
- Produces `allowed-edges.json`: `{"identity":[],"accounts":[],"transactions":["accounts"],"budgets":["transactions"],"reporting":["accounts","transactions","budgets"]}`.
- Produces (`rules.ts`):

```ts
export type AllowedEdges = Record<string, readonly string[]>;
export function assertAcyclic(edges: AllowedEdges): void;                    // melempar Error bila ada siklus
export function findUnlistedModules(root: string, edges: AllowedEdges): string[]; // nama folder di modules/ yang tidak ada di edges
export function buildForbiddenRules(edges: AllowedEdges): IForbiddenRuleType[];
```
- Produces (`run.ts`): `runBoundaries(root: string): Promise<{ violations: { rule: string; from: string; to: string }[]; unlistedModules: string[] }>`. Memanggil `assertAcyclic`, memakai API `cruise` dengan `baseDir: root`, `tsPreCompilationDeps: true` (impor tipe ikut dihitung), hanya folder `apps`, `modules`, `packages` yang ada, dan mengecualikan `fixtures`.
- Nama aturan: `no-module-internals`, `apps-only-public-door`, `no-undeclared-module-edge`, `no-circular`, `apps-web-no-modules`, `apps-isolated`, `modules-not-to-apps`, `packages-no-modules-or-apps`, `contracts-leaf`.

- [ ] **Step 1: Tulis tes yang gagal.** Fixture di `fixtures/boundaries/<kasus>/`; tes berbasis tabel memanggil `runBoundaries(<folder kasus>)`:

| Kasus | Isi singkat | Aturan yang dilanggar |
|---|---|---|
| `valid` | transactions→accounts (lewat `index.ts`), budgets→transactions, modul→`packages/contracts/events`, kernel→contracts, api→index modul, web→design-system dan contracts | tidak ada |
| `deep-import` | transactions impor `accounts/src/domain/account` | `no-module-internals` |
| `type-only-deep-import` | `import type` dari internal accounts | `no-module-internals` |
| `dynamic-deep-import` | `await import(...)` ke internal accounts | `no-module-internals` |
| `reexport-deep-import` | `export * from` internal accounts | `no-module-internals` |
| `apps-deep-import` | `apps/api` impor internal modul | `apps-only-public-door` |
| `undeclared-edge` | accounts impor index transactions | `no-undeclared-module-edge` |
| `intra-module-cycle` | `domain/a.ts` ↔ `application/b.ts` dalam accounts | `no-circular` |
| `web-imports-module` | `apps/web` impor `modules/*` | `apps-web-no-modules` |
| `api-imports-web` | `apps/api` impor `apps/web` | `apps-isolated` |
| `module-imports-app` | modul impor `apps/*` | `modules-not-to-apps` |
| `kernel-imports-module` | `packages/kernel` impor modul | `packages-no-modules-or-apps` |
| `contracts-imports-kernel` | `packages/contracts` impor kernel | `contracts-leaf` |

```ts
it.each(table)('%s', async (name, expected) => expect(ruleNames(await runBoundaries(fixture(name)))).toEqual(expected));
it('modul tak terdaftar terdeteksi', () => expect(findUnlistedModules(fixture('unlisted-module'), edges)).toEqual(['notifications']));
it('graf siklik ditolak', () => expect(() => assertAcyclic({ a: ['b'], b: ['a'] })).toThrow());
it('allowed-edges.json acyclic', () => expect(() => assertAcyclic(edges)).not.toThrow());
```
- [ ] **Step 2: Jalankan** `pnpm --filter @finance/config test -- boundaries`. Expected: FAIL (modul belum ada).
- [ ] **Step 3: Implementasikan** `rules.ts`. `no-module-internals` memakai grup tangkap `^modules/([^/]+)/` dan `to.pathNot: ^modules/$1/`. `no-undeclared-module-edge` menghasilkan satu aturan terlarang untuk setiap pasangan modul terurut yang tidak ada di `edges`. `contracts-leaf` melarang contracts mengimpor `kernel`, `design-system`, `modules`, dan `apps`. Aturan lain mengikuti namanya dan Global Constraints.
- [ ] **Step 4: Implementasikan** `run.ts` dan `cli.ts` (cetak pelanggaran dan modul tak terdaftar, exit 1 bila ada; exit 0 pada repo tanpa `apps`/`modules`). Tambahkan skrip `boundaries`.
- [ ] **Step 5: Jalankan** `pnpm --filter @finance/config test -- boundaries` lalu `pnpm boundaries`. Expected: PASS; `pnpm boundaries` exit 0 pada repo ini.
- [ ] **Step 6: Commit.** `git add packages/config package.json && git commit -m "feat(config): module boundary rules with fixtures"`

---

### Task 4: Inti gerbang fase (status dan path terkunci)

**Files:**
- Create: `packages/config/gates/{status.ts, locked-paths.ts, paths.ts}`
- Modify: `packages/config/package.json` (dependency `yaml`)
- Test: `packages/config/test/gates-core.test.ts`

**Interfaces:**
- Produces:

```ts
export type GateStatus = 'approved' | 'draft' | 'missing';
export interface PhaseStatuses { prd: GateStatus; design: GateStatus }
export function parseStatus(markdown: string | undefined): GateStatus;      // undefined → 'missing'
export function lockedPrefixes(s: PhaseStatuses): string[];                 // awalan ber-akhiran '/', relatif repo
export function isLocked(repoRelativePath: string, s: PhaseStatuses): boolean;
export function findViolations(changedFiles: string[], s: PhaseStatuses): string[]; // path yang terkunci
export function toRepoRelative(filePath: string, projectDir: string): string | null; // null bila di luar repo
```

- [ ] **Step 1: Tulis tes yang gagal** (Review Focus 1, 2, 3):

```ts
const A = (body: string) => `---\n${body}\n---\n# Dokumen`;
it('missing', () => expect(parseStatus(undefined)).toBe('missing'));
it.each([['status: approved'], ['status: "approved"']])('approved: %s', (b) => expect(parseStatus(A(b))).toBe('approved'));
it('CRLF dan BOM tetap approved', () => { expect(parseStatus('---\r\nstatus: approved\r\n---\r\n')).toBe('approved'); expect(parseStatus('﻿' + A('status: approved'))).toBe('approved'); });
it.each([['status: Approved'], ['status: draft\nstatus: approved'], ['status: [approved'], ['status: true']])('bukan approved: %s', (b) => expect(parseStatus(A(b))).toBe('draft'));
it('tanpa front matter atau tidak di awal → draft', () => { expect(parseStatus('# PRD\n\nstatus: approved')).toBe('draft'); expect(parseStatus('\n' + A('status: approved'))).toBe('draft'); });

const D = { prd: 'draft', design: 'draft' } as const;
it('awalan terkunci', () => {
  expect(lockedPrefixes(D)).toEqual(['packages/design-system/', 'modules/', 'apps/', 'packages/contracts/', 'packages/kernel/']);
  expect(lockedPrefixes({ prd: 'approved', design: 'draft' })).toEqual(['modules/', 'apps/', 'packages/contracts/', 'packages/kernel/']);
  expect(lockedPrefixes({ prd: 'approved', design: 'approved' })).toEqual([]);
  expect(lockedPrefixes({ prd: 'draft', design: 'approved' })).toEqual(lockedPrefixes(D));
  expect(lockedPrefixes({ prd: 'missing', design: 'missing' })).toEqual(lockedPrefixes(D));
});
it.each([['modules/accounts/src/index.ts', true], ['modules', true], ['packages/contracts-extra/a.ts', false], ['Modules/accounts/a.ts', true],
  ['./modules/../modules/a.ts', true], ['modules\\accounts\\a.ts', true], ['docs/prd/prd.md', false], ['packages/config/gates/status.ts', false]])('isLocked %s', (p, x) => expect(isLocked(p, D)).toBe(x));
it('PR yang menyetujui sekaligus mengedit modul tetap gagal', () => expect(findViolations(['docs/prd/prd.md', 'modules/a.ts'], D)).toEqual(['modules/a.ts']));
it('toRepoRelative', () => { /* /repo/modules/a.ts → modules/a.ts; /repo/../etc/x → null; /repoextra/modules/a.ts → null; relatif dianggap terhadap projectDir;
  symlink: projectDir = tautan ke folder nyata, path lewat folder nyata → modules/a.ts */ });
```
- [ ] **Step 2: Jalankan** `pnpm --filter @finance/config test -- gates-core`. Expected: FAIL (modul belum ada).
- [ ] **Step 3: Implementasikan** `parseStatus` dengan parser `yaml` mode ketat pada blok front matter di awal berkas (buang BOM; hanya nilai string persis `approved` yang menghasilkan `approved`; kesalahan parse menghasilkan `draft`). Implementasikan `paths.ts` (normalisasi posix, huruf kecil, `realpath` pada projectDir dan leluhur terdalam yang ada) dan `locked-paths.ts` (pencocokan awalan dengan batas direktori).
- [ ] **Step 4: Jalankan** `pnpm --filter @finance/config test -- gates-core`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add packages/config && git commit -m "feat(config): phase gate core (status and locked paths)"`

---

### Task 5: CLI gerbang dan hook penjaga

**Files:**
- Create: `packages/config/gates/{cli.ts, hook.ts}`
- Modify: `package.json` root (skrip `gate:require`: `tsx packages/config/gates/cli.ts require`, `gate:check`: `tsx packages/config/gates/cli.ts check`)
- Test: `packages/config/test/gates-cli.test.ts`

**Interfaces:**
- Consumes (Task 4): `parseStatus`, `findViolations`, `isLocked`, `toRepoRelative`, `PhaseStatuses`.
- Produces:

```ts
export type HookDecision = { allow: true } | { allow: false; reason: string };
export function decideHook(stdin: string, projectDir: string): HookDecision;  // di hook.ts
```
- CLI `require <prd|design>`: membaca `docs/prd/prd.md` dan `docs/design/design.md` di direktori kerja. `require prd` → exit 0 hanya bila PRD `approved`. `require design` → exit 0 hanya bila PRD **dan** design `approved`. Gagal → exit 1 dan satu kalimat alasan di stderr.
- CLI `check --prd-file <p> --design-file <p> --changed-file <p>`: berkas status yang tidak ada berarti `missing`; `--changed-file` berisi satu path per baris. Ada pelanggaran → cetak path-nya dan exit 1.
- `hook.ts` (entri proses): membaca JSON dari stdin; path diambil dari `tool_input.file_path` atau `tool_input.notebook_path`; projectDir dari `CLAUDE_PROJECT_DIR` (cadangan `process.cwd()`); ditolak atau error apa pun → alasan ke stderr dan exit 2; diizinkan → exit 0.

- [ ] **Step 1: Konfirmasi format hook** terhadap dokumentasi saat ini (`https://code.claude.com/docs/en/hooks-guide`): bentuk input stdin PreToolUse dan arti exit code 2. Catat penyimpangan di komentar berkas.
- [ ] **Step 2: Tulis tes yang gagal** (Review Focus 3 dan 5). Buat repo sementara di tmp dengan `docs/prd/prd.md` dan `docs/design/design.md`:

```ts
it('require prd gagal bila draft', () => expect(run(['require', 'prd'], { prd: 'draft' }).status).toBe(1));
it('require design butuh keduanya', () => { expect(run(['require', 'design'], { prd: 'approved', design: 'draft' }).status).toBe(1);
  expect(run(['require', 'design'], { prd: 'approved', design: 'approved' }).status).toBe(0); });
it('check: basis draft + PR menyetujui dan mengedit modul → gagal', () => expect(check({ prd: 'draft' }, ['docs/prd/prd.md', 'modules/a.ts']).status).toBe(1));
it('check: hanya docs → lolos', () => expect(check({ prd: 'draft' }, ['docs/prd/prd.md']).status).toBe(0));
it('hook memblokir edit modules saat PRD draft', () => { const r = hook({ tool_input: { file_path: `${tmp}/modules/x/src/a.ts` } }); expect(r.status).toBe(2); expect(r.stderr).toContain('PRD'); });
it('hook mengizinkan docs/prd saat draft', () => expect(hook({ tool_input: { file_path: `${tmp}/docs/prd/prd.md` } }).status).toBe(0));
it('hook mengizinkan semuanya bila kedua gerbang approved', () => expect(hookApproved({ tool_input: { file_path: `${tmp}/modules/x/a.ts` } }).status).toBe(0));
it('hook gagal-tertutup', () => { expect(hookRaw('bukan json').status).toBe(2); expect(hook({ tool_input: {} }).status).toBe(2); });
it('NotebookEdit memakai notebook_path', () => expect(hook({ tool_input: { notebook_path: `${tmp}/apps/web/a.ipynb` } }).status).toBe(2));
```
- [ ] **Step 3: Jalankan** `pnpm --filter @finance/config test -- gates-cli`. Expected: FAIL.
- [ ] **Step 4: Implementasikan** `cli.ts` dan `hook.ts` (tangkap semua exception di level teratas → exit 2); tambahkan dua skrip root.
- [ ] **Step 5: Jalankan** `pnpm --filter @finance/config test -- gates-cli` lalu `pnpm gate:require prd`. Expected: PASS; `pnpm gate:require prd` exit 1 karena `docs/prd/prd.md` belum ada.
- [ ] **Step 6: Commit.** `git add packages/config package.json && git commit -m "feat(config): gate CLI and PreToolUse hook"`

---

### Task 6: Lint skema database (rentang berlaku)

**Files:**
- Create: `packages/config/schema-lint/{index.ts, exceptions.json}` (isi awal `[]`)
- Modify: `packages/config/package.json` (dependency `pg`, devDependency `@types/pg`)
- Test: `packages/config/test/schema-lint.integration.test.ts`

**Interfaces:**
- Produces:

```ts
export const MODULE_SCHEMAS = ['identity', 'accounts', 'transactions', 'budgets', 'reporting'] as const;
export interface SchemaLintOptions { schemas?: readonly string[]; exceptions?: readonly string[] } // 'skema.tabel'
export async function lintValidity(client: Pick<import('pg').Client, 'query'>, opts?: SchemaLintOptions): Promise<string[]>; // pesan pelanggaran, kosong = lolos
```
- Aturan per tabel dasar di skema yang dipindai (bawaan `MODULE_SCHEMAS`), kecuali yang ada di `exceptions`: (a) kolom `valid_from` bertipe `timestamp with time zone` dan `NOT NULL`; (b) kolom `valid_until` bertipe `timestamp with time zone` dan boleh NULL; (c) bila ada kolom `logical_id`, harus ada constraint eksklusi (`pg_constraint.contype = 'x'`).

- [ ] **Step 1: Tulis tes yang gagal.** Memakai `TEST_DATABASE_URL`; bila tidak diset, tes **gagal** dengan pesan jelas (bukan di-skip). Setiap kasus berjalan dalam `BEGIN … ROLLBACK` agar tidak meninggalkan sisa; `CREATE EXTENSION IF NOT EXISTS btree_gist` di awal.

```ts
it('tabel valid lolos', ...);                                     // accounts.t(valid_from timestamptz NOT NULL, valid_until timestamptz)
it('tanpa valid_until ditolak', ...);
it('valid_from tanpa zona waktu ditolak', ...);                   // timestamp, bukan timestamptz
it('valid_until NOT NULL ditolak', ...);
it('logical_id tanpa EXCLUDE ditolak', ...);
it('logical_id dengan EXCLUDE (logical_id WITH =, tstzrange(valid_from, valid_until) WITH &&) lolos', ...);
it('skema di luar modul diabaikan', ...);                         // tabel di skema "auth" tanpa kolom → tidak dilaporkan
it('pengecualian dihormati', ...);                                // opts.exceptions = ['accounts.schema_migrations']
it('EXCLUDE menolak tumpang tindih tetapi menerima rentang berimpit', ...); // insert [a,b) dan [b,c) boleh; [a,c) menumpuk → kode 23P01
```
- [ ] **Step 2: Jalankan** `TEST_DATABASE_URL=postgres://… pnpm --filter @finance/config test:integration`. Expected: FAIL (`index.ts` belum ada). Tanpa variabel itu: FAIL dengan pesan "TEST_DATABASE_URL belum diset".
- [ ] **Step 3: Implementasikan** `lintValidity` dengan kueri ke `information_schema.columns` dan `pg_constraint`. `exceptions.json` dibaca oleh pemanggil, bukan oleh `lintValidity`.
- [ ] **Step 4: Jalankan** tes integrasi yang sama. Expected: PASS.
- [ ] **Step 5: Commit.** `git add packages/config && git commit -m "feat(config): schema lint for validity ranges"`

---

### Task 7: Instruksi proyek untuk Claude

**Files:**
- Create: `CLAUDE.md`, `.claude/rules/{naming,documentation,database,modules}.md`, `.claude/settings.json`
- Test: `packages/config/test/claude-config.test.ts`

**Interfaces:**
- Consumes (Task 5): `packages/config/gates/hook.ts`; skrip root `gate:require`.
- Produces: `.claude/settings.json` dengan `hooks.PreToolUse[0]` bermatcher `Edit|Write|MultiEdit|NotebookEdit` yang menjalankan `pnpm exec tsx "$CLAUDE_PROJECT_DIR/packages/config/gates/hook.ts"`.

- [ ] **Step 1: Tulis tes yang gagal:**

```ts
it('CLAUDE.md di bawah 200 baris', () => expect(lines('CLAUDE.md')).toBeLessThan(200));
it('CLAUDE.md menunjuk keempat rules', () => ['naming', 'documentation', 'database', 'modules'].forEach((n) => expect(read('CLAUDE.md')).toContain(`.claude/rules/${n}.md`)));
it('skrip yang disebut CLAUDE.md ada di package.json', () => mentionedPnpmScripts('CLAUDE.md').forEach((s) => expect(Object.keys(rootPkg().scripts)).toContain(s)));
it('setiap rules punya paths tak kosong', () => rulesFiles().forEach((f) => expect(frontMatter(f).paths.length).toBeGreaterThan(0)));
it('hook terpasang', () => { const h = settings().hooks.PreToolUse[0]; expect(h.matcher).toMatch(/Edit/); expect(h.matcher).toMatch(/Write/); expect(JSON.stringify(h)).toContain('packages/config/gates/hook.ts'); });
```
- [ ] **Step 2: Jalankan** `pnpm --filter @finance/config test -- claude-config`. Expected: FAIL.
- [ ] **Step 3: Tulis rules** (Bahasa Indonesia, identifier Inggris), tiap berkas dengan `paths:` di front matter:
  - `naming.md` (`**/*.ts`, `**/*.tsx`): aturan spec 14.2 dan pengecualian komponen React PascalCase.
  - `documentation.md` (`**/*.ts`, `**/*.tsx`): TSDoc di setiap fungsi, berbahasa Indonesia, berkas tes dikecualikan.
  - `database.md` (`**/migrations/**`, `**/*.sql`, `modules/*/src/infrastructure/**`): snake_case; `user_id` pada tabel data pengguna; `amount_minor` bigint plus kode mata uang; `valid_from`/`valid_until`; `logical_id` dan `EXCLUDE` untuk tabel berversi; tanpa FK atau JOIN lintas modul; skema per modul; daftar pengecualian di `packages/config/schema-lint/exceptions.json` (milik pemilik).
  - `modules.md` (`modules/**`, `apps/**`): satu pintu publik, folder internal, `package.json` modul hanya mengekspor `"."`, event dari `packages/contracts/events`, tepi di `allowed-edges.json`, `apps/api` hanya composition root.
- [ ] **Step 4: Tulis `CLAUDE.md`** (di bawah 200 baris): ringkasan proyek; alur fase dan command (`/foundation`, `/prd`, `/design`, `/build`); aturan tak dapat ditawar (jangan menetapkan `status: approved`; jangan menyentuh wilayah agent lain; jangan mengubah `CLAUDE.md`, `.claude/`, `packages/config/`, `.github/` kecuali tugasnya memang itu; satu PR kecil per tugas; TDD); perintah penting (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm boundaries`, `pnpm gate:require <prd|design>`); daftar check CI; penunjuk ke spec.
- [ ] **Step 5: Tulis `.claude/settings.json`** sesuai blok Interfaces.
- [ ] **Step 6: Jalankan** `pnpm --filter @finance/config test -- claude-config`. Expected: PASS.
- [ ] **Step 7: Commit.** `git add CLAUDE.md .claude && git commit -m "docs: CLAUDE.md, rules and gate hook wiring"`

---

### Task 8: Definisi agent

**Files:**
- Create: `.claude/agents/{prd-writer, designer, module-agent, frontend-agent, qa-agent, devops-agent, reviewer}.md`
- Test: `packages/config/test/agents.test.ts`

**Interfaces:**
- Produces: tujuh agent. Front matter: `name` (sama dengan nama berkas), `description` (kapan dipakai), `tools`, `model: inherit`. Isi: Peran, Boleh, Dilarang, Cara kerja (worktree sendiri, TDD, satu PR kecil, patuhi `.claude/rules/`, minta Lead bila butuh perubahan kontrak atau kernel), Selesai bila.

| Agent | Boleh | Dilarang | Tools |
|---|---|---|---|
| `prd-writer` | `docs/prd/` | kode, `docs/design/`, menetapkan `status: approved` | Read, Write, Edit, Grep, Glob |
| `designer` | `docs/design/`, lalu `packages/design-system/` | `modules/`, menetapkan `status: approved` | Read, Write, Edit, Grep, Glob, Bash |
| `module-agent` | `modules/<nama>/` yang ditugaskan | modul lain, `packages/contracts/`, `packages/kernel/` | Read, Write, Edit, Grep, Glob, Bash |
| `frontend-agent` | `apps/web/` | `modules/` | Read, Write, Edit, Grep, Glob, Bash |
| `qa-agent` | `packages/e2e/` | `modules/`, `apps/` | Read, Write, Edit, Grep, Glob, Bash |
| `devops-agent` | `.github/`, `scripts/` | `modules/`, `apps/` | Read, Write, Edit, Grep, Glob, Bash |
| `reviewer` | (hanya membaca) | semua perubahan | Read, Grep, Glob |

- [ ] **Step 1: Tulis tes yang gagal:**

```ts
it.each(ROLES)('%s valid', (name) => {
  const { fm, body } = agent(name);
  expect(fm.name).toBe(name); expect(fm.description.length).toBeGreaterThan(20); expect(fm.model).toBe('inherit');
  expect(fm.tools.split(/,\s*/).sort()).toEqual([...TOOLS[name]].sort());      // TOOLS = kolom Tools tabel di atas
  ALLOWED[name].forEach((p) => expect(body).toContain(p)); FORBIDDEN[name].forEach((p) => expect(body).toContain(p));
});
it('reviewer tidak punya tool penulis', () => expect(agent('reviewer').fm.tools).not.toMatch(/Edit|Write|Bash|NotebookEdit/));
it('prd-writer dan designer menulis status: draft', () => ['prd-writer', 'designer'].forEach((n) => expect(agent(n).body).toContain('status: draft')));
```
- [ ] **Step 2: Jalankan** `pnpm --filter @finance/config test -- agents`. Expected: FAIL.
- [ ] **Step 3: Tulis ketujuh berkas** sesuai tabel (Bahasa Indonesia).
- [ ] **Step 4: Jalankan** tes yang sama. Expected: PASS.
- [ ] **Step 5: Commit.** `git add .claude/agents packages/config && git commit -m "feat(agents): role definitions"`

---

### Task 9: Command alur fase

**Files:**
- Create: `.claude/commands/{foundation, prd, design, build}.md`
- Test: `packages/config/test/commands.test.ts`

**Interfaces:**
- Consumes: skrip `gate:require` (Task 5); agent `prd-writer`, `designer`, `module-agent`, `frontend-agent`, `qa-agent`, `devops-agent`, `reviewer` (Task 8).
- Produces: empat command dengan front matter `description` (dan `argument-hint` untuk `/prd`).

- [ ] **Step 1: Tulis tes yang gagal:**

```ts
it('semua command punya description', () => COMMANDS.forEach((c) => expect(fm(c).description).toBeTruthy()));
it('/prd', () => { const t = body('prd'); ['prd-writer', 'docs/prd/prd.md', 'status: draft', '$ARGUMENTS'].forEach((s) => expect(t).toContain(s)); });
it('/design memeriksa gerbang PRD lebih dulu', () => { const t = body('design'); expect(t.indexOf('pnpm gate:require prd')).toBeGreaterThanOrEqual(0); expect(t).toContain('docs/design/design.md'); });
it('/build memeriksa gerbang design dan berurutan', () => { const t = body('build'); expect(t).toContain('pnpm gate:require design');
  const order = ['kontrak', 'migrasi', 'modul', 'web', 'E2E', 'staging'].map((k) => t.indexOf(k)); expect(order).toEqual([...order].sort((a, b) => a - b)); expect(order).not.toContain(-1);
  ['worktree', 'Reviewer', 'tidak men-deploy ke production'].forEach((s) => expect(t).toContain(s)); });
it('/foundation memeriksa kesiapan', () => ['.github/CODEOWNERS', 'rulesets', 'environments'].forEach((s) => expect(body('foundation')).toContain(s)));
```
- [ ] **Step 2: Jalankan** `pnpm --filter @finance/config test -- commands`. Expected: FAIL.
- [ ] **Step 3: Tulis command** (Bahasa Indonesia):
  - `/prd`: delegasikan `$ARGUMENTS` (requirement pemilik) ke `prd-writer`; hasil `docs/prd/prd.md` dengan `status: draft`; buka PR; **berhenti** dan minta pemilik me-review dan merge dengan `status: approved`.
  - `/design`: langkah pertama `pnpm gate:require prd`, berhenti bila gagal; delegasikan ke `designer`; hasil `docs/design/design.md` (`status: draft`), tokens, komponen, mockup; buka PR; berhenti untuk persetujuan.
  - `/build`: langkah pertama `pnpm gate:require design`. Tahap berurutan: kontrak (Lead menetapkan `packages/contracts/` dan `packages/kernel/`), migrasi dan skema per modul, modul paralel (satu agent per modul, masing-masing di git worktree sendiri), web, E2E, lalu deploy staging. Tiap tugas ditulis dengan pemilik, file yang boleh disentuh, prasyarat, dan kriteria selesai (format spec 8.2). Reviewer memeriksa tiap PR sebelum merge. Berhenti dan bertanya pada keputusan di luar wewenang Lead. Lead tidak men-deploy ke production.
  - `/foundation`: pemeriksa kesiapan idempoten. Menjalankan `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm boundaries`; memeriksa `.github/CODEOWNERS` ada; `gh api repos/{owner}/{repo}/rulesets` memuat `main protection`; `gh api repos/{owner}/{repo}/environments` memuat `staging` dan `production`. Melaporkan tabel ok/kurang. Tidak pernah mengubah gerbang sendiri.
- [ ] **Step 4: Jalankan** tes yang sama. Expected: PASS.
- [ ] **Step 5: Commit.** `git add .claude/commands packages/config && git commit -m "feat(commands): phase commands"`

---

### Task 10: Workflow CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Test: `packages/config/test/ci.test.ts`

**Interfaces:**
- Consumes: skrip `lint`, `typecheck`, `boundaries`, `gate:check`, `test`, `test:integration`.
- Produces: tujuh job dengan id sama dengan nama: `lint`, `typecheck`, `boundaries`, `gate-check`, `unit`, `integration`, `security`. Task 11 memakai namanya sebagai required checks.

- [ ] **Step 1: Tulis tes yang gagal** (parse YAML dengan paket `yaml`):

```ts
it('pemicu', () => { expect(ci().on.pull_request.branches).toContain('main'); expect(ci().permissions).toEqual({ contents: 'read' }); expect(ci().concurrency['cancel-in-progress']).toBe(true); });
it('tujuh job', () => expect(Object.keys(ci().jobs).sort()).toEqual(['boundaries', 'gate-check', 'integration', 'lint', 'security', 'typecheck', 'unit']));
it('semua uses dipin ke SHA', () => allUses().forEach((u) => expect(u).toMatch(/@[0-9a-f]{40}$/)));
it('gate-check membaca status dari basis', () => { const s = runs('gate-check').join('\n');
  expect(s).toContain('git show origin/${{ github.base_ref }}:docs/prd/prd.md'); expect(s).toContain('git show origin/${{ github.base_ref }}:docs/design/design.md');
  expect(s).toContain('pnpm gate:check --prd-file'); expect(s).toContain('--changed-file'); expect(ci().jobs['gate-check'].steps[0].with['fetch-depth']).toBe(0); });
it('integration memakai PostgreSQL 17', () => { expect(ci().jobs.integration.services.postgres.image).toMatch(/^postgres:17/); expect(JSON.stringify(ci().jobs.integration)).toContain('TEST_DATABASE_URL'); });
it('security', () => { expect(runs('security').join('\n')).toContain('pnpm audit --audit-level=high'); expect(usesOf('security').some((u) => /gitleaks/.test(u))).toBe(true); });
```
- [ ] **Step 2: Jalankan** `pnpm --filter @finance/config test -- ci`. Expected: FAIL.
- [ ] **Step 3: Tulis `ci.yml`.** Setiap job: checkout, `pnpm/action-setup`, `actions/setup-node` (Node dari `.nvmrc`, cache pnpm), `pnpm install --frozen-lockfile`. `lint`/`typecheck`: `pnpm turbo run lint` / `typecheck`. `boundaries`: `pnpm boundaries`. `unit`: `pnpm turbo run test --affected` (dengan `fetch-depth: 0` dan `TURBO_SCM_BASE=origin/${{ github.base_ref }}`). `integration`: service `postgres:17`, `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres`, `pnpm turbo run test:integration`. `gate-check`: simpan `git diff --name-only origin/${{ github.base_ref }}...HEAD` ke `changed.txt`; tulis status basis dengan `git show origin/${{ github.base_ref }}:<path> > base-<x>.md 2>/dev/null || rm -f base-<x>.md`; jalankan `pnpm gate:check`. Pin semua `uses:` ke SHA commit (cari lewat `gh api repos/<aksi>/commits/<tag> --jq .sha`), tuliskan versi di komentar.
- [ ] **Step 4: Jalankan** `pnpm --filter @finance/config test -- ci`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add .github/workflows packages/config && git commit -m "ci: pull request pipeline"`

---

### Task 11: CODEOWNERS, ruleset, runbook pemilik, dan PR fondasi

**Files:**
- Create: `.github/CODEOWNERS`, `.github/rulesets/main.json`, `docs/runbooks/apply-gates.md`
- Test: `packages/config/test/gates-files.test.ts`

**Interfaces:**
- Consumes (Task 10): nama job CI.
- Input dari pemilik: **handle GitHub-nya**. Tanyakan langsung; jangan menebak dan jangan memakai placeholder.
- Produces: `CODEOWNERS` dengan satu pemilik untuk `/docs/`, `/CLAUDE.md`, `/.claude/`, `/packages/config/`, `/.github/`, `/eslint.config.js`, `/turbo.json`, `/package.json`. Ruleset `main protection` (`target: branch`, `enforcement: active`, `bypass_actors: []`, kondisi `~DEFAULT_BRANCH`) dengan aturan `deletion`, `non_fast_forward`, `pull_request` (`required_approving_review_count: 1`, `require_code_owner_review: true`, `dismiss_stale_reviews_on_push: true`, `required_review_thread_resolution: true`), dan `required_status_checks` (`strict_required_status_checks_policy: true`) berisi ketujuh job Task 10.

- [ ] **Step 1: Tulis tes yang gagal:**

```ts
it('CODEOWNERS', () => { const owners = REQUIRED.map((p) => ownerOf(p)); owners.forEach((o) => expect(o).toMatch(/^@[A-Za-z0-9][A-Za-z0-9-]*$/)); expect(new Set(owners).size).toBe(1); });
it('ruleset', () => { const r = ruleset(); expect(r.bypass_actors).toEqual([]); expect(r.enforcement).toBe('active'); expect(types(r)).toEqual(expect.arrayContaining(['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']));
  expect(rule(r, 'pull_request').parameters.require_code_owner_review).toBe(true); });
it('required checks sama persis dengan job CI', () => expect(requiredContexts(ruleset()).sort()).toEqual(Object.keys(ci().jobs).sort()));
it('runbook memuat langkah pemilik', () => ['gh api', 'environments/production', 'GitHub App', 'akun mesin', 'gate-check'].forEach((s) => expect(read('docs/runbooks/apply-gates.md')).toContain(s)));
```
- [ ] **Step 2: Jalankan** `pnpm --filter @finance/config test -- gates-files`. Expected: FAIL.
- [ ] **Step 3: Verifikasi skema ruleset** terhadap dokumentasi REST GitHub saat ini (`POST /repos/{owner}/{repo}/rulesets`), lalu tulis `main.json` dan `CODEOWNERS`.
- [ ] **Step 4: Tulis runbook** (Bahasa Indonesia, untuk pemilik): (A) urutan setelah PR fondasi di-merge; (B) menerapkan ruleset dengan `gh api repos/{owner}/{repo}/rulesets --method POST --input .github/rulesets/main.json` atau lewat UI; (C) environments `staging` dan `production` (required reviewer = pemilik pada production) dan secret per environment; (D) identitas agent: GitHub App atau akun mesin terpisah, izin minimum Contents dan Pull requests (read/write) serta Metadata (read), tanpa admin, tanpa akses environment production; izin Workflows hanya bila DevOps agent boleh mengubah workflow lewat PR (tetap butuh review pemilik); (E) bagian Vercel, diisi oleh Task 13; (F) uji gerbang: PR uji yang menyentuh `modules/x.ts` harus ditolak `gate-check`, dan PR agent yang mengubah `docs/` harus meminta review pemilik; (G) saat fase build menambah check (build, Storybook, a11y, E2E), pemilik memperbarui `required_status_checks`.
- [ ] **Step 5: Jalankan** `pnpm --filter @finance/config test -- gates-files` lalu seluruh suite: `pnpm turbo run lint typecheck test boundaries` dan `TEST_DATABASE_URL=… pnpm test:integration`. Expected: semua PASS.
- [ ] **Step 6: Commit lalu push dan buka PR.** `git add .github docs packages/config && git commit -m "ci: codeowners, ruleset and owner runbook"`; push cabang `foundation`; buka PR ke `main` berjudul "Fondasi proyek". Run: `gh pr checks --watch`. Expected: ketujuh check hijau.
- [ ] **Step 7: Serahkan ke pemilik.** Minta pemilik me-review dan merge PR, lalu mengikuti runbook `docs/runbooks/apply-gates.md`. Jangan lanjut ke Task 12 sebelum gerbang diterapkan.

---

### Task 12: Spike ORM

Spike: keluarannya jawaban, bukan kode. Kode probe hidup di cabang `spike/orm` (tidak dipush, tidak digabung), laporan masuk PR kedua.

**Files:**
- Create (cabang `spike/orm`, dibuang): `spikes/orm/**` (paket mandiri, di luar glob workspace; `pnpm install --ignore-workspace`)
- Create (cabang `docs/spike-reports`): `docs/specs/2026-10-20-spike-orm.md`
- Test: `packages/config/test/spike-reports.test.ts`

**Interfaces:**
- Input dari pemilik (variabel lingkungan lokal, bukan di repo): `TEST_DATABASE_URL` (PostgreSQL 17 lokal), `SUPABASE_STAGING_POOLER_URL` (port 6543, mode transaksi), `SUPABASE_STAGING_SESSION_URL` (port 5432, pooler mode sesi). Bila variabel Supabase belum ada: kerjakan Q1, Q2, Q4, Q5 di PostgreSQL lokal, tandai Q3 "tertunda", dan laporkan ke pemilik. Jangan membuat project Supabase sendiri.
- Produces: laporan dengan bagian `## Q1` sampai `## Q5`, masing-masing berisi Hasil, Bukti (perintah dan ringkasan keluaran), dan Keputusan; baris `Keputusan:` (Drizzle dipertahankan atau diganti); satu atau lebih baris `Perubahan spec:` menunjuk bagian spec 4 dan 10 yang perlu diubah.

- [ ] **Step 1: Tulis tes laporan yang gagal** (di cabang `docs/spike-reports` dari `main`):

```ts
it('laporan ORM lengkap', () => { const t = read('docs/specs/2026-10-20-spike-orm.md');
  ['## Q1', '## Q2', '## Q3', '## Q4', '## Q5'].forEach((h) => expect(t).toContain(h)); expect(t).toMatch(/^Keputusan: /m); expect(t).toMatch(/^Perubahan spec: /m); });
```
Run: `pnpm --filter @finance/config test -- spike-reports`. Expected: FAIL.
- [ ] **Step 2: Siapkan probe** di cabang `spike/orm` dengan lima test bernama `Q1`-`Q5`:
  - **Q1** dua `pgSchema` (`accounts`, `transactions`) dengan folder migrasi terpisah per modul; menerapkan migrasi `accounts` tidak membuat objek `transactions` (periksa `information_schema`).
  - **Q2** migrasi SQL kustom (`drizzle-kit generate --custom`) membuat `btree_gist` dan constraint `EXCLUDE`; `drizzle-kit generate` berikutnya melaporkan tidak ada perubahan.
  - **Q3** `postgres(url, { prepare: false })` lewat pooler transaksi: `db.transaction` commit dan rollback benar, 20 transaksi paralel sukses; URL pooler sesi (5432) dapat dipakai menjalankan migrasi.
  - **Q4** `UnitOfWork.run(fn)` membagikan satu `tx` ke repository dari dua skema berbeda tanpa saling mengimpor tabel; listener yang melempar error di dalam `fn` membatalkan kedua penulisan.
  - **Q5** kolom `amount_minor` bigint round-trip untuk `9007199254740993n`; `JSON.stringify` baris mentah melempar `TypeError`; tetapkan representasi di API (string) dan uji skema Zod `z.string().regex(/^-?\d+$/)` yang diubah ke `bigint`.
- [ ] **Step 3: Jalankan probe** di PostgreSQL lokal, lalu dengan `SPIKE_TARGET=supabase` terhadap Supabase staging. Expected: setiap Q punya hasil lulus atau gagal beserta penyebab. Catat juga versi mayor PostgreSQL Supabase untuk menegaskan `postgres:17` di CI.
- [ ] **Step 4: Tulis laporan** `docs/specs/2026-10-20-spike-orm.md` sesuai Interfaces. Bila Drizzle gagal pada Q1-Q4, nama pengganti dan alasannya wajib ada di `Keputusan:`.
- [ ] **Step 5: Jalankan** `pnpm --filter @finance/config test -- spike-reports`. Expected: PASS.
- [ ] **Step 6: Commit** laporan dan tes saja di cabang `docs/spike-reports`; pastikan `git status` tidak memuat `spikes/`. `git commit -m "docs: ORM spike report"`

---

### Task 13: Spike deploy

Aturan sama seperti Task 12: probe di cabang `spike/deploy` (tidak digabung), laporan di PR kedua.

**Files:**
- Create (cabang `spike/deploy`, dibuang): `spikes/deploy/{api, web}/**` (NestJS minimal dengan satu route cron; halaman Next minimal), workflow uji `workflow_dispatch` atau draft PR yang ditutup tanpa merge
- Create (cabang `docs/spike-reports`): `docs/specs/2026-10-20-spike-deploy.md`
- Modify: `docs/runbooks/apply-gates.md` (isi bagian E "Vercel"), `packages/config/test/spike-reports.test.ts`

**Interfaces:**
- Input dari pemilik: token Vercel untuk lingkup staging, akses Vercel yang sudah dihubungkan ke GitHub, dan URL Supabase staging dari Task 12. Bila belum ada: hentikan, laporkan, jangan membuat akun atau project sendiri.
- Produces: laporan dengan bagian `## D1` sampai `## D7`, baris `Keputusan:` dan `Perubahan spec:`, serta kerangka dua workflow CD (`deploy-staging`, `deploy-production`) yang ditulis `devops-agent` di fase build.
- Pertanyaan:
  - **D1** seluruh NestJS berjalan sebagai satu Vercel Function dari `apps/api` di monorepo pnpm, dideploy dengan Vercel CLI dari GitHub Actions; ukuran bundel di bawah 250 MB.
  - **D2** cara memodelkan staging dan production di Vercel pada paket pemilik: custom environment atau project terpisah (`api`, `web` masing-masing), dan pengikatan variabel lingkungan Supabase staging versus production.
  - **D3** deploy production dari GitHub Actions setelah persetujuan: build ulang commit yang sama dengan `--prod` versus mempromosikan deployment staging; apakah variabel lingkungan production ikut terpasang.
  - **D4** cara mematikan deploy production otomatis dari integrasi Git Vercel.
  - **D5** Vercel Cron: konfigurasi di `vercel.json` dan autentikasi pemanggilan (`CRON_SECRET`).
  - **D6** versi Node yang didukung Vercel (konfirmasi Node 22) dan pengaruhnya pada `.nvmrc` serta `engines`.
  - **D7** posisi job migrasi (pooler mode sesi dari runner GitHub, IPv4) terhadap deploy: urutan, dan perilaku bila migrasi gagal.

- [ ] **Step 1: Perluas tes laporan yang gagal** di `spike-reports.test.ts`:

```ts
it('laporan deploy lengkap', () => { const t = read('docs/specs/2026-10-20-spike-deploy.md');
  ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].forEach((d) => expect(t).toContain(`## ${d}`)); expect(t).toMatch(/^Keputusan: /m); expect(t).toMatch(/^Perubahan spec: /m); });
it('runbook memuat bagian Vercel yang terisi', () => expect(read('docs/runbooks/apply-gates.md')).toMatch(/## E\. Vercel[\s\S]*vercel/i));
```
Run: `pnpm --filter @finance/config test -- spike-reports`. Expected: FAIL.
- [ ] **Step 2: Siapkan aplikasi probe** di cabang `spike/deploy` dan jalankan alur D1-D6 dengan Vercel CLI dari mesin lokal.
- [ ] **Step 3: Buktikan D7 dan sisi runner** lewat draft PR dari `spike/deploy` ke `main` yang menjalankan workflow uji di runner GitHub; tutup PR tanpa merge setelah hasil dicatat.
- [ ] **Step 4: Tulis laporan** `docs/specs/2026-10-20-spike-deploy.md` dan isi bagian E "Vercel" di runbook (langkah menghubungkan Vercel ke repo, project atau environment yang dibuat, mematikan deploy production otomatis, variabel lingkungan per lingkungan).
- [ ] **Step 5: Jalankan** `pnpm --filter @finance/config test -- spike-reports`. Expected: PASS.
- [ ] **Step 6: Commit lalu PR kedua.** `git commit -m "docs: deploy spike report and Vercel runbook"`; push cabang `docs/spike-reports`; buka PR berjudul "Laporan spike ORM dan deploy" (kena CODEOWNERS `docs/`, sehingga pemilik me-review). Run: `gh pr checks --watch`. Expected: ketujuh check hijau.
- [ ] **Step 7: Serahkan ke pemilik** untuk review dan merge, beserta daftar `Perubahan spec:` dari kedua laporan agar spec diperbarui lewat PR terpisah.

---

## Di luar rencana ini (sengaja)

- Spec bagian 3.3 (isi `packages/kernel` dan event di `packages/contracts`), 4 (skema data nyata), 5 (adapter Supabase Auth), 6 (format error), dan 7 (tes per modul) dikerjakan pada fase build, setelah PRD dan design disetujui. Rencananya disusun saat itu.
- Workflow CD (`deploy-staging`, `deploy-production`) dan job CI tambahan (build, Storybook, a11y, E2E) ditulis `devops-agent` pada fase build berdasarkan hasil Task 12-13.
- Fase 2 autentikasi (auth buatan sendiri) adalah proyek terpisah dengan spec sendiri (spec bagian 5).
