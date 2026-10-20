---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Aturan penamaan

Sumber: spec 14.2. Ditegakkan oleh `@typescript-eslint/naming-convention` di `packages/config/eslint/index.js`; pelanggaran membuat `pnpm lint` dan CI gagal.

- **Identifier berbahasa Inggris.** Komentar TSDoc dan dokumen proyek berbahasa Indonesia (lihat `documentation.md`).
- Variabel dan fungsi: `camelCase`. Properti objek tidak diatur (boleh mengikuti format API eksternal).
- Konstanta tingkat modul yang nilainya tetap: `UPPER_SNAKE`.
- Tipe, kelas, interface, enum, dan anggota enum: `PascalCase`.
- Berkas `.tsx`: variabel dan fungsi boleh `PascalCase` karena komponen React.
- Awalan `_` hanya untuk parameter atau variabel yang sengaja tidak dipakai.
- Tabel dan kolom database: `snake_case` (lihat `database.md`). Pemetaan ke `camelCase` dilakukan di lapisan repository, bukan dengan mengubah nama kolom.

Jangan menonaktifkan aturan ini dengan komentar `eslint-disable`. Bila sebuah nama memang tidak bisa mengikuti aturan, minta pemilik mengubah konfigurasi di `packages/config/`.
