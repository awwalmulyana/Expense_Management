---
description: Fase 1. Menyusun PRD dari requirement pemilik lewat agent prd-writer, lalu berhenti untuk persetujuan.
argument-hint: <requirement pemilik, bebas atau menunjuk berkas>
---

# /prd

Requirement dari pemilik:

$ARGUMENTS

Kamu adalah Lead (sesi utama). Jalankan langkah berikut berurutan.

1. Bila `$ARGUMENTS` kosong, tanyakan requirement ke pemilik lalu berhenti. Bila menunjuk berkas, baca berkas itu.
2. Delegasikan ke agent `prd-writer` dengan requirement lengkap, ringkasan spec (`docs/specs/2026-10-20-finance-app-design.md`), dan aturan penting dari `CLAUDE.md` (subagent tidak otomatis menerima semuanya).
3. Hasilnya harus berupa `docs/prd/prd.md` dengan front matter `status: draft`. Periksa bahwa statusnya memang `draft`; jangan pernah mengubahnya menjadi `approved`.
4. Buat branch, commit, dan buka PR berisi perubahan `docs/prd/` saja.
5. **Berhenti.** Beri tahu pemilik untuk me-review PR, menjawab pertanyaan terbuka di PRD, lalu merge PR yang mengubah `status: approved`. Persetujuan di chat tidak cukup. Jangan lanjut ke `/design` sebelum itu terjadi.
