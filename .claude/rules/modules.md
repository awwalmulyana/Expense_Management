---
paths:
  - "modules/**"
  - "apps/**"
---

# Aturan modular monolith

Sumber: spec 3.1-3.3. Penegakan: `pnpm boundaries` (dependency-cruiser, aturan di `packages/config/boundaries/`) dan CI.

- Modul: `identity`, `accounts`, `transactions`, `budgets`, `reporting`. Tiap modul adalah paket workspace dengan **satu pintu publik** `modules/<nama>/src/index.ts`.
- Isi dalam modul (`domain`, `application`, `infrastructure`) tidak boleh diimpor dari luar modul, termasuk lewat `import type`, `import()` dinamis, atau `export * from`.
- `package.json` modul hanya mengekspor `"."` (menunjuk ke pintu publik).
- Antar modul hanya lewat pintu publik atau event. **Definisi event** berada di `packages/contracts/events/`, bukan di modul penerbit. Event bersifat sinkron dan berjalan di transaksi yang sama (via `packages/kernel`).
- Tepi dependensi yang diizinkan ada di `packages/config/boundaries/allowed-edges.json`. Menambah tepi baru butuh persetujuan Lead dan pembaruan spec. Graf harus acyclic.
- Modul tidak boleh bergantung pada `apps/*`. `packages/*` tidak boleh bergantung pada `modules/*` atau `apps/*`. `packages/contracts` tidak mengimpor `kernel`, `design-system`, modul, atau app.
- `apps/api` hanyalah *composition root*: merakit modul lewat pintu publik, tanpa logika bisnis.
- `apps/web` hanya memakai `packages/design-system` dan `packages/contracts`; ia berbicara dengan API lewat HTTP, tidak mengimpor modul.
- Perubahan `packages/contracts/` atau `packages/kernel/` diminta ke Lead; agent modul tidak mengubahnya sendiri.
