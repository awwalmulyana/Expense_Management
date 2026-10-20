---
description: Fase 2. Membuat mockup, keputusan desain, dan design system lewat agent designer setelah PRD approved, lalu berhenti untuk persetujuan.
---

# /design

Kamu adalah Lead (sesi utama). Jalankan langkah berikut berurutan.

1. Jalankan `pnpm gate:require prd`. Bila gagal (exit bukan 0), **berhenti** dan laporkan alasannya ke pemilik; jangan mencoba menyiasatinya.
2. Delegasikan ke agent `designer`: baca `docs/prd/prd.md` yang sudah `approved`, lalu hasilkan `docs/design/design.md` (`status: draft`), mockup per layar, tokens, dan komponen di `packages/design-system/`.
3. Bila pekerjaan dapat dipisah tanpa berbagi berkas, bagi menjadi beberapa tugas dengan pemilik, berkas yang boleh disentuh, prasyarat, dan kriteria selesai.
4. Pastikan statusnya tetap `draft`; jangan pernah mengubahnya menjadi `approved`.
5. Minta agent `reviewer` memeriksa hasilnya, lalu buka PR (satu PR kecil per tugas).
6. **Berhenti.** Beri tahu pemilik untuk me-review mockup, lalu merge PR yang mengubah `docs/design/design.md` menjadi `status: approved`. Jangan lanjut ke `/build` sebelum itu terjadi.
