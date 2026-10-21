# Spec Desain: Aplikasi Pengelolaan Keuangan Pribadi (Multi-User)

Tanggal: 2026-10-20
Status: **approved** oleh pemilik pada 2026-10-20
Jenis proyek: proyek belajar untuk membangun pola kerja multi-agent Claude Code

---

## 1. Tujuan dan ukuran keberhasilan

**Tujuan.** Membangun aplikasi web pengelolaan keuangan pribadi yang bisa dipakai banyak pengguna, dengan modular monolith, design system, dan pipeline CI/CD otomatis, dikerjakan oleh beberapa agent Claude Code yang berbagi tugas.

**Ukuran keberhasilan** (pola kerja lebih penting daripada jumlah fitur):
1. Batas modul bersih dan **ditegakkan mesin** di CI.
2. Beberapa agent dapat bekerja paralel tanpa saling menimpa pekerjaan.
3. Alur PRD → design → implementasi → deploy berjalan dengan gerbang persetujuan pemilik yang tidak bisa dilewati.
4. Pipeline CI/CD otomatis sampai staging; production menunggu persetujuan pemilik.

**Ruang lingkup MVP.** Fitur fungsional rinci (layar, aturan bisnis, kategori, dan sebagainya) **tidak ditetapkan di spec ini**. Itu dihasilkan oleh fase PRD (bagian 8) dan disetujui pemilik. Spec ini hanya menetapkan arsitektur, modul, dan cara kerja.

**Di luar lingkup (non-goals).** Integrasi bank atau penyedia pembayaran, aplikasi mobile native, microservices, multi-mata-uang konversi otomatis, fitur kolaborasi antar pengguna.

---

## 2. Keputusan utama

| Topik | Keputusan |
|---|---|
| Stack | TypeScript full-stack: NestJS (backend), Next.js/React (frontend), PostgreSQL |
| Arsitektur | Modular monolith dalam satu monorepo (pnpm workspace + Turborepo) |
| Hosting | Vercel (aplikasi) dan Supabase (PostgreSQL dan Auth) |
| Autentikasi fase 1 | Supabase Auth |
| Autentikasi fase 2 | Auth buatan sendiri di modul `identity` (direncanakan, lihat bagian 5) |
| Kode di | GitHub, CI/CD dengan GitHub Actions |
| Deploy | Staging otomatis; production menunggu persetujuan pemilik |
| Cara kerja agent | Peran di `.claude/agents/`, orkestrasi oleh sesi utama (Lead), gerbang fase ditegakkan di GitHub |

---

## 3. Arsitektur

### 3.1 Struktur repo

```
apps/
  api/              NestJS; hanya "composition root": merakit modul, tanpa logika bisnis
  web/              Next.js; hanya memakai design-system dan contracts
modules/
  identity/         profil dan sesi pengguna (fase 1: adapter Supabase Auth)
  accounts/         rekening dan dompet
  transactions/     pemasukan, pengeluaran, transfer
  budgets/          anggaran per kategori
  reporting/        ringkasan dan laporan (read-only)
packages/
  contracts/        skema Zod, tipe API, format error, dan definisi event domain: satu sumber kebenaran
  kernel/           infrastruktur bersama tanpa logika bisnis: event bus, unit of work, tipe dasar
  design-system/    tokens, komponen, Storybook
  config/           tsconfig, eslint, dan konfigurasi bersama
docs/
  prd/              PRD (status: draft | approved)
  design/           mockup dan keputusan desain (status: draft | approved)
  specs/            spec ini dan spec lanjutan
.claude/
  agents/           definisi peran agent
  commands/         alur fase (/foundation, /prd, /design, /build)
  settings.json     hook penegak gerbang
```

### 3.2 Aturan modular monolith

1. Setiap modul adalah paket workspace dengan **satu pintu publik** (`index.ts`). Isi dalamnya (`domain`, `application`, `infrastructure`) tidak boleh diimpor dari luar modul.
2. Antar modul hanya boleh berkomunikasi lewat **pintu publik** atau **event internal**.
3. **Tidak ada FK, JOIN, atau query lintas modul.** Referensi ke entitas modul lain disimpan sebagai `uuid` biasa.
4. Satu database PostgreSQL; **satu skema per modul** (`identity`, `accounts`, `transactions`, `budgets`, `reporting`).
5. `reporting` hanya membaca lewat query publik modul lain atau menyimpan salinan data dari event.
6. **Definisi event domain berada di `packages/contracts/events/`**, bukan di modul penerbit. Modul penerbit dan modul pendengar sama-sama bergantung pada `contracts`, bukan satu sama lain. Tanpa aturan ini, `transactions` (memanggil `AccountsApi`) dan `accounts` (mendengar event `transactions`) akan saling bergantung.
7. **Graf dependensi antar modul harus acyclic.** Arah awal yang diizinkan: `transactions → accounts` (lewat `AccountsApi`), `budgets → transactions` (query publik atau event), dan `reporting → accounts, transactions, budgets` (query publik atau event). `identity` dan `accounts` tidak bergantung pada modul lain. Menambah arah baru memerlukan persetujuan Lead dan pembaruan spec.
8. Aturan ini **dipaksa mesin** di CI (dependency-cruiser atau eslint-plugin-boundaries) dan diuji dengan architecture test. Pelanggaran membuat CI gagal.

### 3.3 Komunikasi antar modul (contoh: mencatat pengeluaran)

```ts
// modules/accounts/src/index.ts  (satu-satunya yang boleh diimpor)
export interface AccountsApi {
  assertOwnedBy(userId: string, accountId: string): Promise<void>;
  getNames(accountIds: string[]): Promise<Record<string, string>>;
}

// modules/transactions: validasi lewat pintu publik, simpan accountId sebagai uuid biasa
// (ExpenseRecorded diimpor dari packages/contracts/events, bukan dari modul lain)
await this.accounts.assertOwnedBy(userId, input.accountId);
await this.repo.save({ ...input });
events.publish(new ExpenseRecorded({ userId, accountId, amount }));

// modules/accounts: mendengar event dan mengubah saldonya sendiri
@OnEvent(ExpenseRecorded) handle(e) { this.account.debit(e.amount); }
```

**Keputusan event (MVP).** Event bersifat **sinkron, di dalam proses, dan di-await** dalam transaksi database yang sama dengan request. Pola outbox ditunda sampai ada kebutuhan nyata. Mekanismenya: `packages/kernel` menyediakan event bus dan *unit of work* per request, dan repository tiap modul memakai handle transaksi dari kernel. Dengan begitu satu transaksi bisa dipakai bersama tanpa modul mengetahui tabel modul lain. Kegagalan di pendengar membatalkan seluruh transaksi. Alasan: di lingkungan serverless tidak ada jaminan proses tetap hidup setelah respons dikirim, jadi seluruh efek event harus selesai sebelum respons.

**Konsekuensi yang diterima.** Integritas referensi pindah dari database ke kode aplikasi. Tidak ada `ON DELETE CASCADE` lintas modul. Contoh: saat rekening ditutup, `accounts` menerbitkan `AccountClosed`, lalu `transactions` sendiri yang memutuskan perlakuan atas riwayatnya.

---

## 4. Data dan multi-user

1. Setiap tabel data pengguna punya kolom `user_id` (di `identity`, id profil itu sendiri adalah `userId`). Setiap method repository **wajib** menerima `userId`; tidak ada query tanpa pemilik.
2. Aturan kepemilikan ditegakkan di dalam masing-masing modul.
3. Uang disimpan sebagai **bilangan bulat satuan terkecil** (`amount_minor`, bigint) plus kode mata uang. Tidak memakai float.
4. Migrasi berversi, ditulis per modul pada skema modul itu sendiri.
5. Row Level Security (RLS) Supabase sebagai lapisan pengaman kedua **ditunda** ke fase setelah MVP.
6. Skema modul **tidak diekspos** ke Data API Supabase. Aplikasi mengakses data lewat koneksi Postgres dan ORM, bukan lewat Supabase JS client.
7. ORM bawaan keputusan: **Drizzle** (mendukung skema per modul dan migrasi SQL eksplisit). Dikonfirmasi lewat spike singkat di fase fondasi, dan bisa diganti kalau spike menunjukkan hambatan.

---

## 5. Autentikasi

**Fase 1 (MVP): Supabase Auth.**
- Modul `identity` dibuat tipis dan mengekspos pintu publik seperti `IdentityApi` (`verifyToken`, `getCurrentUser`).
- Modul lain **tidak tahu** bahwa Supabase ada di baliknya; mereka hanya memakai `IdentityApi`.
- `identity` memetakan user Supabase ke profil aplikasi (`userId` internal).

**Fase 2 (rencana): auth buatan sendiri.**
- Karena Supabase terisolasi di dalam `identity`, peralihan dilakukan dengan mengganti adapter di modul itu saja, tanpa menyentuh modul lain.
- Fase ini dikerjakan sebagai proyek terpisah setelah MVP berjalan, dengan spec tersendiri (hashing kata sandi, sesi, pemulihan akun, rate limiting).

---

## 6. Penanganan error

1. Setiap modul mendefinisikan **error domain bertipe**.
2. Error dipetakan ke **satu format respons error** yang didefinisikan di `packages/contracts/`.
3. Input divalidasi di batas aplikasi dengan **Zod**; skema yang sama dipakai frontend dan backend.
4. Log terstruktur dengan **correlation id** pada setiap request.

---

## 7. Strategi testing

| Jenis | Cakupan |
|---|---|
| Unit test | Domain dan use case tiap modul (TDD) |
| Integration test | Per modul dengan PostgreSQL asli (service container di CI) |
| Contract test | Pintu publik tiap modul terhadap `contracts/` |
| Architecture test | Batas modul dan aturan impor |
| Komponen dan aksesibilitas | Storybook dan tes aksesibilitas untuk design-system |
| E2E (Playwright) | Alur utama: daftar, catat transaksi, lihat laporan |

---

## 8. Model kerja multi-agent

### 8.1 Peran agent (`.claude/agents/`)

File di folder ini hanya mendefinisikan **peran**: instruksi, tool yang boleh dipakai, dan model.

| Agent | Memiliki | Tidak boleh menyentuh |
|---|---|---|
| **PRD writer** | `docs/prd/` | kode, design |
| **Designer** | `docs/design/`, lalu `packages/design-system/` | `modules/` |
| **Module agent** (satu per modul, paralel) | `modules/<nama>/` miliknya | modul lain, `packages/contracts/`, `packages/kernel/` |
| **Frontend agent** | `apps/web/` | `modules/` |
| **QA agent** | tes E2E | kode produksi |
| **DevOps agent** | `.github/`, skrip deploy | kode aplikasi |
| **Reviewer** (read-only) | tidak mengubah apa pun | semuanya |

`packages/contracts/` dan `packages/kernel/` dimiliki Lead. Bila sebuah modul membutuhkan perubahan kontrak, event, atau kernel, agent modul meminta ke Lead, dan Lead yang mengubahnya lebih dulu sebelum pekerjaan dilanjutkan.

### 8.2 Lead (sesi utama)

Lead adalah **sesi Claude Code yang diajak bicara pemilik**, bukan file di `.claude/agents/`. Orkestrasi dilakukan di sesi utama karena subagent umumnya tidak memanggil subagent lain. Lead membaca `CLAUDE.md`, menjalankan slash command alur fase, memecah tugas, dan memanggil agent sebagai pekerja.

**Cara Lead memecah tugas.** Lead membaca PRD, design, dan `contracts/` yang sudah `approved`, lalu menulis daftar tugas. Tiap tugas berisi: pemilik, file yang boleh disentuh, tugas yang harus selesai lebih dulu, dan kriteria selesai.

```
T4 · accounts: use case "buka rekening"
owner: module-agent · boleh: modules/accounts/**
butuh: T1 (kontrak), T2 (migrasi accounts)
selesai: unit + integration test hijau, PR dibuka
```

**Aturan paralel.** Tugas yang syaratnya terpenuhi **dan** tidak berbagi file dijalankan bersamaan. Tiap agent bekerja di git worktree dan branch sendiri, satu PR kecil per tugas, dengan TDD. Hasil digabung setelah CI hijau dan Reviewer memeriksa.

**Kontrak dulu.** Lead menetapkan atau mengubah `packages/contracts/` lebih dulu, baru agent modul bekerja paralel di atasnya.

### 8.3 Fase dan gerbang persetujuan

1. **PRD.** Agent PRD menyusun `docs/prd/` dari requirement pemilik. Pemilik mereview dan mengubah status menjadi `approved`.
2. **Design.** Setelah PRD `approved`, Designer membuat mockup (halaman HTML atau komponen Storybook). Pemilik mereview dan mengubah status menjadi `approved`.
3. **Implementasi.** Setelah design `approved`: kontrak → skema dan migrasi per modul → modul paralel → web → E2E → deploy ke staging.
4. **Production.** Menunggu persetujuan pemilik.

**Penanda persetujuan.** Persetujuan dicatat di front matter dua berkas: `docs/prd/prd.md` dan `docs/design/design.md`, masing-masing dengan `status: draft` atau `status: approved`. Hanya dua berkas ini yang dibaca oleh hook dan `gate-check`. Persetujuan dilakukan dengan mereview dan merge PR yang mengubah status menjadi `approved`; menyatakan setuju di chat saja tidak cukup.

**Path terkunci.**
- `packages/design-system/**` terkunci sampai PRD `approved`.
- `modules/**`, `apps/**`, `packages/contracts/**`, dan `packages/kernel/**` terkunci sampai PRD **dan** design `approved`.
- Fase fondasi (bagian 11, langkah 1) hanya menyentuh `packages/config/`, `.github/`, `.claude/`, `docs/`, dan konfigurasi di root repo. Kerangka modul dan app dibuat pada fase implementasi.

### 8.4 Penegakan gerbang (tiga lapis)

1. **Instruksi di prompt (lemah).** Command `/build` memerintahkan berhenti bila PRD atau design belum `approved`.
2. **Hook lokal (sedang).** Hook `PreToolUse` di `.claude/settings.json` membaca status di `docs/prd/` dan `docs/design/`. Bila belum `approved`, hook memblokir pengeditan path terkunci (bagian 8.3). Hook ini hanya menjaga sesi lokal dan tidak boleh diandalkan sendirian: agent yang menulis file lewat perintah Bash dapat lolos, karena itu lapis 3 wajib ada.
3. **Server GitHub (keras).**
   - `main` dilindungi branch protection.
   - Folder `docs/` dimiliki pemilik lewat CODEOWNERS, sehingga mengubah `status: approved` butuh review pemilik.
   - Check CI `gate-check` menggagalkan PR yang menyentuh path terkunci (bagian 8.3) selama status di `main` belum `approved`.
   - Deploy production dijaga environment protection dengan pemilik sebagai required reviewer.

**Syarat.** Agent memakai token terbatas, bukan akun admin pemilik, dan token itu tidak boleh bisa membypass aturan protection.

---

## 9. CI/CD (GitHub Actions)

**Setiap PR (semua wajib hijau sebelum merge):**
1. Install dengan cache, lint, typecheck, **cek batas modul**, dan `gate-check`.
2. Unit test pada paket yang terdampak (Turborepo).
3. Integration test dengan PostgreSQL sebagai service container.
4. Build aplikasi dan Storybook, tes aksesibilitas komponen.
5. E2E Playwright.
6. Pemindaian keamanan: audit dependensi dan deteksi secret.

**Merge ke `main`:**
1. Job migrasi database ke project Supabase **staging**.
2. Deploy otomatis ke **staging** di Vercel, lalu smoke test.
3. Deploy ke **production** hanya setelah persetujuan manual (environment protection): migrasi ke Supabase production, lalu deploy ke Vercel.

**Catatan integrasi.** Karena deploy production harus menunggu persetujuan, deploy otomatis production dari integrasi Git Vercel dimatikan, dan deploy dijalankan dari GitHub Actions. Detail mekanisme (Vercel CLI atau promosi deployment) dikonfirmasi di fase fondasi.

---

## 10. Hosting: Vercel dan Supabase

1. **NestJS di Vercel.** Seluruh aplikasi berjalan sebagai satu Vercel Function (Fluid compute), batas ukuran 250 MB. Cukup untuk lingkup ini. `apps/api` dan `apps/web` menjadi dua project Vercel dari satu monorepo.
2. **Tanpa proses permanen.** Tugas terjadwal (misalnya transaksi berulang) memakai Vercel Cron Jobs, bukan scheduler di dalam proses.
3. **Koneksi database.** Aplikasi memakai connection string **pooler Supavisor mode transaksi** (port 6543). Mode transaksi tidak mendukung prepared statement, jadi klien Postgres dikonfigurasi tanpa prepared statement.
4. **Migrasi.** Koneksi langsung Supabase hanya IPv6. Runner GitHub umumnya IPv4, sehingga job migrasi memakai **pooler mode sesi** (port 5432), atau add-on IPv4 di paket berbayar.
5. **Lingkungan.** Satu project Supabase untuk staging dan satu untuk production. Integration test CI memakai PostgreSQL di service container, tidak menyentuh Supabase.
6. **Catatan paket gratis.** Project Supabase paket gratis di-pause setelah tidak aktif. Dapat diterima untuk proyek belajar.
7. **Secret.** Disimpan sebagai GitHub environment secrets dan environment variables Vercel per lingkungan. Tidak ada secret di repo, dan agent tidak diberi akses ke secret production.

---

## 11. Urutan pembangunan (garis besar)

1. **Fondasi** (dimulai setelah prasyarat bagian 13.2 selesai). Kerangka repo, konfigurasi bersama, CI kosong, aturan batas modul, definisi agent, command fase, hook, berkas CODEOWNERS, dan skrip atau ruleset branch protection (diterapkan oleh pemilik, bagian 13.3). Spike ORM dan mekanisme deploy (dikerjakan di luar path terkunci dan tidak digabung ke `main`).
2. **PRD** (gerbang persetujuan pemilik).
3. **Design** (gerbang persetujuan pemilik): tokens, komponen, mockup.
4. **Kontrak awal.**
5. **`identity`**, lalu **`accounts`** dan **`transactions`** paralel.
6. **`budgets`**, **`reporting`**, dan halaman web.
7. **E2E dan pengerasan**, deploy staging, lalu production dengan persetujuan.

Rencana implementasi terperinci dibuat terpisah setelah spec ini disetujui.

---

## 12. Risiko dan asumsi

| Risiko atau asumsi | Penanganan |
|---|---|
| Agent melanggar batas modul | Cek batas modul di CI, CODEOWNERS, Reviewer |
| Gerbang fase dilewati | Penegakan tiga lapis; lapis 3 di GitHub adalah tembok sebenarnya |
| Event sinkron memperlambat request | Dapat diterima untuk skala personal; outbox ditambahkan bila perlu |
| Integritas data lintas modul hanya di kode | Contract test dan integration test per modul |
| Data keuangan pengguna nyata | Production menunggu persetujuan; token agent dibatasi; secret tidak masuk repo |
| Asumsi: kode di GitHub dengan GitHub Actions | Bila berbeda, bagian 9 disesuaikan |
| Asumsi: paket GitHub mendukung branch protection, required reviewer lewat CODEOWNERS, dan environment protection untuk repo ini | Diverifikasi di fase fondasi. Pada repo privat di paket gratis fitur ini mungkin tidak tersedia; opsinya repo publik atau paket berbayar |

---

## 13. Prasyarat dan pembagian peran manusia–agent

### 13.1 Alur ringkas

0. **`/foundation`** (sekali): kerangka repo, CI, agent, hook, command, gerbang.
1. **`/prd`**: agent PRD menulis draft dan membuka PR. Pemilik review lalu merge dengan status `approved`.
2. **`/design`**: Designer membuat tokens, komponen, dan mockup dalam PR. Pemilik review lalu merge dengan status `approved`.
3. **`/build`**: Lead memecah tugas dan menjalankan agent per tahap (kontrak dan migrasi, modul paralel, web, E2E). Staging otomatis; production menunggu persetujuan pemilik.

`/build` dapat berhenti untuk meminta keputusan yang bukan wewenang Lead. Agent paralel memakai kuota langganan Claude lebih cepat daripada satu sesi.

### 13.2 Prasyarat yang dikerjakan pemilik (sebelum `/foundation`)

- [ ] Akun GitHub, Supabase, dan Vercel aktif, paket dipilih. Pastikan paket GitHub mendukung branch protection, required reviewer, dan environment protection untuk repo yang dipakai (lihat bagian 12).
- [ ] **Satu** repo kosong di GitHub. Staging dan production adalah environment dari repo yang sama, bukan repo atau cabang terpisah: commit yang sama dites di staging, lalu dipromosikan ke production setelah disetujui.
- [ ] Dua project Supabase: **staging** dan **production**, di region terdekat (disarankan Singapura). Kata sandi database disimpan di pengelola kata sandi.
- [ ] Token terbatas untuk agent: GitHub (**GitHub App atau akun mesin terpisah**, bukan akun pemilik, tanpa hak admin, hanya untuk repo ini), serta Supabase dan Vercel untuk **staging saja**. Identitas agent harus berbeda dari pemilik karena aturan review mewajibkan persetujuan dan pemilik tidak dapat menyetujui PR yang ia buat sendiri. Token tidak ditempel di chat; disimpan sebagai secret atau variabel lingkungan lokal.
- [ ] Secret production hanya disimpan di GitHub environment `production` dan Vercel production, dikelola pemilik. Agent tidak punya akses.
- [ ] Claude Code terpasang dan login (terminal atau Desktop), dan mode izin untuk sesi `/build` sudah dipilih.

### 13.3 Dikerjakan pemilik setelah PR fondasi di-merge

- [ ] Hubungkan Vercel ke repo (project `api` dan `web`) dan matikan deploy production otomatis dari integrasi Git (bagian 9).
- [ ] Setelah workflow CI berjalan sekali (supaya nama check muncul): aktifkan branch protection `main`, required checks (termasuk `gate-check` dan cek batas modul), review CODEOWNERS untuk `docs/`, dan environment `production` dengan pemilik sebagai required reviewer.
- [ ] Simpan secret staging di GitHub environment `staging`.

Konfigurasi gerbang diterapkan pemilik dengan akun owner, bukan oleh agent. Agent boleh menulis berkas atau skrip pendukung (misalnya ruleset JSON), tetapi pemilik yang menerapkannya. Alasannya: agent yang berhak admin dapat mengubah gerbang yang membatasinya sendiri.

### 13.4 Pembagian per fase

| Fase | Pemilik | Agent |
|---|---|---|
| Fondasi | Prasyarat 13.2, menjalankan `/foundation`, menerapkan gerbang (13.3) | Kerangka monorepo, workflow CI/CD, definisi agent, hook, command, berkas CODEOWNERS, spike ORM dan deploy |
| PRD | Memberi requirement, review, dan merge (approve) | PRD writer menulis draft dan membuka PR |
| Design | Review dan merge (approve) | Designer: tokens, komponen, mockup |
| Build | Menjawab keputusan yang ditanyakan Lead | Kontrak, migrasi, modul, web, semua tes, migrasi dan deploy staging, smoke test, PR kecil dan review |
| Production | Approve di GitHub environment `production` | Migrasi dan deploy production setelah disetujui |

### 13.5 Catatan

Membuat repo dan project Supabase atau Vercel secara teknis dapat didelegasikan ke agent dengan token yang sesuai. Di proyek ini hal itu sengaja dikerjakan pemilik karena melibatkan akun, billing, region, dan kata sandi database. Bila pemilik ingin mendelegasikannya kelak, izin CLI dan API yang diperlukan dikonfirmasi dulu di fase fondasi.

---

## 14. Konvensi kode

Aturan di bagian ini ditegakkan mesin sejauh memungkinkan. Berkas aturan untuk agent dan konfigurasi penegaknya dibuat oleh fase fondasi.

### 14.1 Tempat penyimpanan dan penegakan

| Lapisan | Lokasi | Fungsi |
|---|---|---|
| Aturan untuk agent | `CLAUDE.md` di root repo (singkat, di bawah 200 baris) | Invarian lintas proyek dan penunjuk ke rules |
| Aturan per area | `.claude/rules/naming.md`, `documentation.md`, `database.md`, dengan `paths:` di frontmatter | Dimuat hanya saat agent mengerjakan berkas yang cocok |
| Penegakan | `packages/config/` (ESLint), tes skema, CI | Pelanggaran membuat CI gagal |

- `CLAUDE.md`, `.claude/**`, dan `packages/config/**` dimiliki pemilik lewat CODEOWNERS, supaya agent tidak dapat melonggarkan aturan yang membatasinya.
- `CLAUDE.md` dan rules adalah konteks, bukan penegak. Hal yang wajib pasti ditegakkan oleh lint, tes, dan CI.
- Subagent kustom memuat `CLAUDE.md` proyek secara default. Agent bawaan Explore dan Plan tidak. Lead meneruskan aturan penting di prompt delegasi.

### 14.2 Penamaan

camelCase untuk variabel dan fungsi, PascalCase untuk tipe, kelas, dan interface, UPPER_SNAKE untuk konstanta, snake_case untuk tabel dan kolom database. Ditegakkan dengan `@typescript-eslint/naming-convention`. Ini usulan awal yang dikonfirmasi pemilik saat review spec.

### 14.3 Komentar fungsi

Setiap fungsi memiliki komentar TSDoc. Keberadaannya ditegakkan `eslint-plugin-jsdoc` (`require-jsdoc`); berkas tes dikecualikan. Mutu komentar diperiksa agent Reviewer.

### 14.4 Rentang berlaku (effective dating)

1. Setiap tabel memiliki `valid_from` (wajib) dan `valid_until` (boleh kosong; kosong berarti masih berlaku), bertipe `timestamptz` dengan interval setengah terbuka `[valid_from, valid_until)`.
2. Data referensi yang dapat berubah (misalnya kategori transaksi) tidak ditimpa. Versi lama ditutup dengan mengisi `valid_until`, lalu versi baru dibuat. Satu id logis dapat memiliki banyak versi.
3. Untuk id logis yang sama, rentang berlaku tidak boleh tumpang tindih. Ini ditegakkan dengan constraint exclusion PostgreSQL (`EXCLUDE USING gist`, membutuhkan ekstensi `btree_gist`).
4. Transaksi merujuk id logis kategori sebagai `uuid` biasa (tanpa FK, sesuai bagian 3.2). Versi kategori yang dipakai ditentukan oleh **tanggal transaksi** (as-of). Akibatnya: mengubah kategori hari ini tidak mengubah transaksi lama, dan transaksi yang tanggalnya mundur ke periode lama mengikuti versi lama.
5. Tes skema menggagalkan CI bila ada tabel tanpa kedua kolom itu. Pengecualian (misalnya tabel riwayat migrasi) dicatat di satu berkas daftar di `packages/config/` yang dimiliki pemilik.
6. Ditetapkan di fase PRD dan design: modul pemilik kategori (kecenderungan awal: `transactions`, yang sudah dapat dibaca `budgets` sesuai arah dependensi di bagian 3.2), dan apakah tabel fakta append-only seperti transaksi memakai rentang untuk koreksi atau pembatalan. Sampai ditetapkan, tabel fakta mengikuti aturan "setiap tabel".
