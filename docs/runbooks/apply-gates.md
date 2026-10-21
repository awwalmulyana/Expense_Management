# Menerapkan gerbang GitHub (untuk pemilik)

Dokumen ini untuk **pemilik repo**. Gerbang fase hanya benar-benar keras bila ketiga lapis aktif (spec 8.4). Lapis 1 dan 2 (prompt dan hook) sudah ada di repo. Lapis 3 (GitHub) **tidak bisa diterapkan agent**: agent tidak punya, dan tidak boleh punya, hak admin. Semua langkah di bawah dikerjakan pemilik, sekali setelah PR fondasi di-merge.

Contoh perintah memakai `gh` yang sudah login sebagai pemilik, dijalankan dari folder repo (`{owner}/{repo}` diisi otomatis oleh `gh`).

## A. Urutan setelah PR fondasi dibuka

1. Review PR "Fondasi proyek". Perhatikan terutama `packages/config/`, `.github/`, dan `.claude/`: berkas-berkas inilah yang membatasi agent.
2. Merge PR itu. Ini satu-satunya merge yang boleh langsung, karena ruleset belum aktif.
3. Siapkan identitas agent (bagian D). Ini harus sebelum ruleset: begitu ruleset aktif, PR yang kamu tulis sendiri tidak bisa kamu setujui, jadi perubahan apa pun sesudahnya perlu dibuat lewat identitas agent.
4. Terapkan ruleset (bagian B).
5. Buat environments (bagian C).
6. Uji gerbang (bagian F). Jangan melanjutkan ke spike (Task 12 dan 13) sebelum semua uji lulus.

## B. Ruleset `main protection`

Ruleset dan environment dengan required reviewer hanya tersedia untuk repo **public** atau akun **GitHub Pro**; repo private di paket gratis menjawab HTTP 403 "Upgrade to GitHub Pro or make this repository public". Repo ini dijadikan public (sebelumnya sudah dipastikan tidak ada secret di riwayat). Isi ruleset ada di `.github/rulesets/main.json`: tanpa bypass, melarang hapus dan force-push, wajib PR dengan satu persetujuan dan review code owner, review basi dibatalkan saat ada push baru, semua thread harus selesai, dan tujuh check wajib hijau (`lint`, `typecheck`, `boundaries`, `gate-check`, `unit`, `integration`, `security`) terhadap kode terbaru.

```
gh api repos/{owner}/{repo}/rulesets --method POST --input .github/rulesets/main.json
gh api repos/{owner}/{repo}/rulesets --jq '.[] | {id, name, enforcement}'
```

Lewat UI: Settings, Rules, Rulesets, New ruleset, Import a ruleset, lalu pilih `.github/rulesets/main.json`.

Nama check baru muncul di daftar setelah CI berjalan sekali; ruleset tetap bisa dibuat lebih dulu.

## C. Environments dan secret

`staging` otomatis; `production` menunggu persetujuanmu (required reviewer).

```
OWNER_ID=$(gh api user --jq .id)
gh api repos/{owner}/{repo}/environments/staging --method PUT
gh api repos/{owner}/{repo}/environments/production --method PUT --input - <<JSON
{
  "reviewers": [{ "type": "User", "id": $OWNER_ID }],
  "deployment_branch_policy": { "protected_branches": true, "custom_branch_policies": false }
}
JSON
```

Pastikan di UI (Settings, Environments, production) bahwa kamu tercantum sebagai required reviewer dan bahwa deployment hanya dari branch yang dilindungi. Secret disimpan per environment, bukan di repo:

```
gh secret set NAMA_SECRET --env staging
gh secret set NAMA_SECRET --env production
```

Daftar secret yang pasti (kredensial Supabase dan Vercel per environment) dicatat di bagian E setelah spike deploy selesai.

## D. Identitas agent

Agent harus bekerja dengan identitas **berbeda dari kamu**. GitHub tidak mengizinkan pembuat PR menyetujui PR miliknya sendiri; bila agent memakai akunmu, review code owner tidak akan pernah bisa kamu berikan. Pilih GitHub App atau akun mesin:

- **GitHub App** (disarankan): dibuat di Settings, Developer settings, GitHub Apps, lalu dipasang hanya pada repo ini.
- **Akun mesin**: akun GitHub terpisah (2FA aktif) sebagai collaborator dengan peran Write, dengan token classic yang hanya diberi scope `repo` dan kedaluwarsa paling lama 90 hari. Token fine-grained belum bisa dipakai untuk repo milik pengguna lain sebagai kolaborator, jadi akun ini hanya boleh punya akses ke repo ini. Peringatan `gh` "Missing required token scopes: read:org" boleh diabaikan; jangan menambah scope.

Izin minimum: **Contents** (read dan write), **Pull requests** (read dan write), **Metadata** (read). Tanpa Administration. Tanpa akses ke environment `production` dan secret-nya. Izin **Workflows** hanya bila DevOps agent boleh mengubah workflow lewat PR. Perhatikan batasnya: workflow yang diubah di PR dari repo yang sama berjalan **sebelum direview**, dengan izin dan secret yang ditentukan workflow itu sendiri; review code owner hanya menahan merge, bukan eksekusinya. Karena itu secret production tidak boleh dapat dijangkau dari PR, dan environment `staging` dibatasi ke branch `main` (Settings, Environments, staging, Deployment branches and tags). Token disimpan di komputer atau secret sesi, tidak pernah di repo.

## E. Vercel

Bagian ini diisi setelah spike deploy (Task 13): mekanisme deploy production yang menunggu persetujuan, project Vercel yang dibuat, dan daftar secret per environment.

## F. Uji gerbang

Lakukan dengan identitas agent, di repo yang sudah dipasangi ruleset:

1. Buka PR yang menambah `modules/x.ts`. Harapan: check `gate-check` **merah** dan PR tidak bisa di-merge selama `docs/prd/prd.md` di `main` belum `approved`.
2. Buka PR yang mengubah `docs/prd/prd.md` menjadi `status: approved` **sekaligus** menambah `modules/x.ts`. Harapan: `gate-check` merah, karena status dibaca dari `main`, bukan dari PR.
3. Buka PR agent yang hanya mengubah sesuatu di `docs/`. Harapan: GitHub meminta review kamu sebagai code owner.
4. Coba push langsung ke `main`. Harapan: ditolak.

Tutup semua PR uji tanpa merge.

## G. Saat fase build menambah check

Fase build menambah check baru (build, Storybook, aksesibilitas, E2E Playwright). Setiap check baru harus ditambahkan ke `required_status_checks` di `.github/rulesets/main.json`, lalu diterapkan ulang:

```
gh api repos/{owner}/{repo}/rulesets --jq '.[] | select(.name=="main protection") | .id'
gh api repos/{owner}/{repo}/rulesets/ID --method PUT --input .github/rulesets/main.json
```

## H. Cara menyetujui PRD dan design

Persetujuan berarti `status: approved` masuk ke `main` lewat PR yang kamu review.

1. Agent membuka PR berisi dokumen dengan `status: draft`.
2. Setelah puas, **kamu** mengubah `status: draft` menjadi `status: approved` langsung di branch PR itu (edit lewat UI GitHub), lalu menyetujui dan merge. Karena PR dibuat oleh identitas agent, review code owner-mu sah.
3. Perubahan status **tidak boleh** digabung dengan perubahan kode di PR yang sama; `gate-check` akan menolaknya.

Keterbatasan yang perlu kamu tahu: pemilik tidak dapat menyetujui PR miliknya sendiri. PR yang kamu buat sendiri ke path yang dilindungi CODEOWNERS (misalnya `CLAUDE.md` atau `packages/config/`) tidak akan bisa kamu setujui sendiri. Jalan keluarnya: minta Lead membuka PR itu lewat identitas agent, lalu kamu yang menyetujui. Menambahkan dirimu sebagai bypass actor (`bypass_mode: pull_request`) juga mungkin, tetapi melonggarkan ruleset dan sebaiknya diputuskan sadar.
