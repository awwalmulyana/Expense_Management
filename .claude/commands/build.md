---
description: Fase 3. Membangun aplikasi secara berurutan dengan banyak agent setelah PRD dan design approved. Production tetap menunggu pemilik.
---

# /build

Kamu adalah Lead (sesi utama). Agent pekerja didefinisikan di `.claude/agents/`.

## Gerbang

Jalankan `pnpm gate:require design`. Bila gagal (exit bukan 0), **berhenti** dan laporkan alasannya; jangan mencoba menyiasatinya. Hook dan `gate-check` di CI akan memblokir path terkunci juga.

## Cara memecah tugas

Baca PRD, design, dan spec, lalu tulis daftar tugas. Setiap tugas memuat (format spec 8.2): pemilik, berkas yang boleh disentuh, tugas yang harus selesai lebih dulu, dan kriteria selesai. Tugas yang prasyaratnya terpenuhi dan tidak berbagi berkas dijalankan bersamaan.

## Tahap

Berurutan: tiap tahap selesai dan hijau sebelum tahap berikutnya.

1. **Tahap kontrak.** Lead sendiri menetapkan `packages/contracts/` (skema, tipe API, event) dan `packages/kernel/` (event bus, unit of work). Agent lain tidak mengubahnya; mereka meminta ke Lead.
2. **Tahap migrasi dan skema** per modul: tabel dengan `valid_from`/`valid_until`, `user_id`, `amount_minor`, dan `EXCLUDE` untuk tabel berversi. Tes skema `lintValidity` harus hijau.
3. **Tahap modul paralel.** Satu `module-agent` per modul (`identity`, `accounts`, `transactions`, `budgets`, `reporting`), masing-masing di git worktree dan branch sendiri, dengan TDD dan satu PR kecil per tugas.
4. **Tahap web.** `frontend-agent` membangun `apps/web` di atas design system dan contracts, lalu merakit `apps/api` sebagai composition root.
5. **Tahap E2E.** `qa-agent` menulis tes dari kriteria penerimaan PRD. Bug dilaporkan ke Lead, bukan diperbaiki oleh QA.
6. **Tahap deploy ke staging.** `devops-agent` memastikan pipeline berjalan: migrasi ke Supabase staging, deploy Vercel staging, lalu smoke test.

## Aturan selama berjalan

- **Reviewer** (agent `reviewer`) memeriksa setiap PR sebelum merge. Merge hanya setelah CI hijau dan temuan Kritis dan Penting beres.
- Berhenti dan tanyakan ke pemilik untuk keputusan di luar wewenang Lead: menambah tepi dependensi baru, mengubah spec, atau mengubah berkas milik pemilik (`CLAUDE.md`, `.claude/`, `packages/config/`, `.github/`).
- Lead **tidak men-deploy ke production**. Production menunggu persetujuan pemilik lewat environment protection di GitHub.
- Akhiri dengan ringkasan: tugas selesai, PR yang terbuka, dan yang menunggu pemilik.
