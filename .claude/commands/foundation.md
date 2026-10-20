---
description: Memeriksa kesiapan fondasi proyek (idempoten) dan melaporkan apa yang sudah ok dan apa yang masih kurang.
---

# /foundation

Pemeriksa kesiapan fondasi. Aman dijalankan berulang kali. Pembuatan pertama fondasi dilakukan lewat rencana implementasi di `docs/specs/2026-10-20-foundation-plan.md`; command ini hanya memeriksa dan melaporkan.

Kamu adalah Lead (sesi utama). Jalankan pemeriksaan berikut dan catat hasilnya. Jangan berhenti pada kegagalan pertama; kumpulkan semuanya.

## Pemeriksaan lokal

1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm boundaries`
6. Berkas ada: `CLAUDE.md`, `.claude/settings.json`, `.claude/agents/` (tujuh agent), `.claude/commands/` (empat command), `.claude/rules/` (empat rules), `.github/CODEOWNERS`, `.github/workflows/ci.yml`.

## Pemeriksaan GitHub (butuh `gh` yang sudah login)

7. `gh api repos/{owner}/{repo}/rulesets` memuat ruleset `main protection` yang aktif.
8. `gh api repos/{owner}/{repo}/environments` memuat environment `staging` dan `production`, dan `production` punya required reviewer.

Bila `gh` tidak tersedia atau belum login, tandai butir 7 dan 8 sebagai "tidak dapat diperiksa", bukan "ok".

## Laporan

Tampilkan tabel dengan kolom: pemeriksaan, status (ok / kurang / tidak dapat diperiksa), dan catatan singkat. Untuk setiap yang kurang, sebutkan langkah perbaikannya (rujuk `docs/runbooks/apply-gates.md` untuk gerbang GitHub).

Kamu tidak pernah mengubah gerbang sendiri: ruleset, CODEOWNERS, environment, dan reviewer production diterapkan oleh pemilik.
