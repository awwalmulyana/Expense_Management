---
paths:
  - "**/migrations/**"
  - "**/*.sql"
  - "modules/*/src/infrastructure/**"
---

# Aturan database

Sumber: spec 3.2, 4, dan 14.4. Penegakan: tes skema `lintValidity` (`packages/config/schema-lint/`) di job integration CI, dan `pnpm boundaries`.

## Umum
- Satu database PostgreSQL, **satu skema per modul** dengan nama modul (`identity`, `accounts`, `transactions`, `budgets`, `reporting`).
- Tabel dan kolom `snake_case`.
- **Tanpa FK, JOIN, atau query lintas modul.** Referensi ke entitas modul lain disimpan sebagai `uuid` biasa. Tidak ada `ON DELETE CASCADE` lintas modul.
- Tabel data pengguna punya kolom `user_id`; setiap method repository wajib menerima `userId`. Tidak ada query tanpa pemilik.
- Uang: `amount_minor` bertipe `bigint` (satuan terkecil) plus kolom kode mata uang. Tidak memakai float atau numeric untuk uang.

## Rentang berlaku (effective dating)
- Setiap tabel dasar di skema modul punya `valid_from timestamptz NOT NULL` dan `valid_until timestamptz` (boleh NULL, artinya masih berlaku). Interval setengah terbuka `[valid_from, valid_until)`.
- Data referensi yang berubah (misalnya kategori) **tidak ditimpa**: tutup versi lama dengan mengisi `valid_until`, lalu buat versi baru.
- Tabel berversi punya kolom `logical_id` (id logis yang sama di semua versi) dan constraint
  `EXCLUDE USING gist (logical_id WITH =, tstzrange(valid_from, valid_until) WITH &&)`; butuh `CREATE EXTENSION IF NOT EXISTS btree_gist`.
- Pembaca memilih versi berdasarkan **tanggal transaksi** (as-of), bukan hari ini.
- Pengecualian (misalnya tabel riwayat migrasi) hanya boleh dicatat di `packages/config/schema-lint/exceptions.json`. Berkas itu milik pemilik; jangan mengubahnya sendiri.

## Koneksi
- Aplikasi memakai pooler Supavisor mode transaksi (port 6543) tanpa prepared statement; migrasi memakai mode sesi (port 5432).
