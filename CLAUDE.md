# Aplikasi Keuangan Pribadi

Aplikasi web pengelolaan keuangan pribadi **multi-user**. Sekaligus proyek belajar membangun pola kerja multi-agent Claude Code. Spec lengkap: `docs/specs/2026-10-20-finance-app-design.md` (status approved). Baca bagian yang relevan sebelum bekerja; berkas ini hanya merangkum invarian.

## Stack dan struktur

TypeScript, monorepo Turborepo (manajer paket: pnpm), NestJS (`apps/api`), Next.js (`apps/web`), PostgreSQL di Supabase, deploy ke Vercel. Modular monolith:

- `modules/{identity,accounts,transactions,budgets,reporting}`: satu pintu publik `src/index.ts` per modul.
- `packages/contracts` (skema, tipe API, event), `packages/kernel` (event bus, unit of work), `packages/design-system`, `packages/config` (lint, batas modul, gerbang, tes skema).
- `docs/prd`, `docs/design`, `docs/specs`; `.claude/agents`, `.claude/commands`, `.claude/rules`.

## Alur fase

Sesi utama (Lead) menjalankan command; agent adalah pekerjanya.

1. `/foundation`: memeriksa kesiapan fondasi (idempoten).
2. `/prd`: agent PRD menyusun `docs/prd/prd.md`. Pemilik mereview dan menyetujui lewat PR.
3. `/design`: Designer membuat mockup di `docs/design/`, lalu `packages/design-system/`. Pemilik menyetujui.
4. `/build`: kontrak, skema dan migrasi, modul paralel, web, E2E, deploy ke **staging**. Production menunggu persetujuan pemilik.

Setiap command berhenti bila gerbang sebelumnya belum `approved` (`pnpm gate:require <prd|design>`).

## Aturan tak dapat ditawar

- **Jangan pernah menulis `status: approved`** di `docs/prd/prd.md` atau `docs/design/design.md`, dan jangan mengubah statusnya dengan cara apa pun. Hanya pemilik yang menyetujui, lewat review dan merge PR. Persetujuan di chat tidak cukup.
- Jangan mengedit path terkunci selagi gerbang tertutup: `packages/design-system/**` sebelum PRD approved; `modules/**`, `apps/**`, `packages/contracts/**`, `packages/kernel/**` sebelum PRD **dan** design approved. Hook akan memblokir, dan `gate-check` di CI membaca status dari `main`.
- Jangan menulis ke path terkunci lewat Bash untuk menghindari hook. Penjaga sebenarnya adalah GitHub.
- Jangan mengubah `CLAUDE.md`, `.claude/`, `packages/config/`, `.github/`, `eslint.config.js`, `turbo.json`, atau `package.json` root kecuali tugasnya memang itu. Berkas-berkas ini milik pemilik (CODEOWNERS) agar aturan tidak dilonggarkan oleh agent yang dibatasinya.
- Tetap di wilayah perannya: jangan menyentuh modul lain, `packages/contracts/`, atau `packages/kernel/` kecuali Lead memintanya.
- Satu PR kecil per tugas, di git worktree dan branch sendiri.
- **TDD**: tulis tes yang gagal, lihat gagalnya, baru implementasikan. Jangan menonaktifkan, melewati, atau melonggarkan tes, lint, atau aturan batas modul agar hijau.
- Jangan menaruh secret, token, atau connection string di repo. Konfigurasi lewat environment dan GitHub Secrets.

## Aturan per area (dimuat otomatis saat berkas cocok)

- `.claude/rules/naming.md`: penamaan.
- `.claude/rules/documentation.md`: komentar TSDoc di setiap fungsi.
- `.claude/rules/database.md`: skema, uang, rentang berlaku (`valid_from`/`valid_until`), tanpa FK lintas modul.
- `.claude/rules/modules.md`: pintu publik, tepi dependensi, event.

CLAUDE.md dan rules adalah konteks, bukan penegak. Yang wajib pasti ditegakkan oleh lint, tes, hook, dan CI.

## Perintah

Jalankan `pnpm install` lebih dulu: hook gerbang memakai `tsx` dari dependensi proyek, dan memblokir semua pengeditan bila hook tidak bisa berjalan.

- `pnpm lint`: ESLint (penamaan, TSDoc).
- `pnpm typecheck`: TypeScript strict.
- `pnpm test`: unit test (Vitest) lewat Turborepo.
- `pnpm test:integration`: butuh `TEST_DATABASE_URL` ke PostgreSQL 17 dengan ekstensi `btree_gist`.
- `pnpm boundaries`: cek batas modul dan modul yang belum terdaftar.
- `pnpm gate:require <prd|design>`: exit 0 hanya bila gerbang terbuka.

## Check CI pada setiap PR (semua wajib hijau)

`lint`, `typecheck`, `boundaries`, `gate-check`, `unit`, `integration` (PostgreSQL service container), `security` (audit dependensi dan deteksi secret). Fase build menambah build, Storybook, aksesibilitas, dan E2E Playwright.

## Bahasa

Identifier dalam bahasa Inggris. Komentar TSDoc dan dokumen proyek dalam Bahasa Indonesia.
