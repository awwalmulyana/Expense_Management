import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMap, isScalar, parseDocument } from 'yaml';

/** Penanda dokumen YAML di dalam front matter: berarti ada blok kedua yang bisa menyamarkan isi. */
const DOCUMENT_MARKER = /^(?:---|\.\.\.)(?:\s|$)/m;

/** Bentuk teks sumber yang diterima untuk nilai disetujui: polos atau dikutip tanpa escape. */
const APPROVED_SOURCES = new Set(['approved', '"approved"', "'approved'"]);

/** Pemisah kunci dan nilai yang diterima: titik dua lalu spasi pada baris yang sama. */
const SAME_LINE_SEPARATOR = /^[ \t]*:[ \t]+$/;

/** Status satu dokumen gerbang: `approved`, `draft`, atau `missing` (berkas tidak ada). */
export type GateStatus = 'approved' | 'draft' | 'missing';

/** Status kedua dokumen gerbang fase. */
export interface PhaseStatuses {
  prd: GateStatus;
  design: GateStatus;
}

/** Front matter wajib di awal berkas: `---`, isi, lalu `---` pada barisnya sendiri. */
const FRONT_MATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;

/**
 * Membaca `status` dari front matter dokumen markdown, gagal-tertutup.
 * Hanya nilai string persis `approved` (tanpa tag, anchor, atau kunci ganda) yang membuka gerbang;
 * segala bentuk yang meragukan menghasilkan `draft`.
 * @param markdown - Isi berkas, atau `undefined` bila berkas tidak ada.
 * @returns `missing` bila berkas tidak ada, `approved` bila disetujui, selain itu `draft`.
 */
export function parseStatus(markdown: string | undefined): GateStatus {
  if (markdown === undefined) return 'missing';
  try {
    const text = markdown.replace(/^﻿/, '').replace(/\r\n/g, '\n');
    const match = FRONT_MATTER.exec(text);
    if (!match) return 'draft';

    const body = match[1] ?? '';
    if (DOCUMENT_MARKER.test(body)) return 'draft';
    const document = parseDocument(body, { uniqueKeys: true, strict: true });
    if (document.errors.length > 0 || document.warnings.length > 0) return 'draft';
    const root = document.contents;
    if (!isMap(root) || root.flow) return 'draft';

    // Hanya bentuk `status: approved` pada satu baris yang dihitung. Nilai dibandingkan lewat teks
    // sumbernya, bukan nilai hasil parse, agar escape (`\u006f`), block scalar, nilai di baris
    // berikutnya, kunci eksplisit, dan kunci dikutip tidak lolos.
    for (const pair of root.items) {
      const { key, value } = pair;
      if (!isScalar(key) || !key.range || body.slice(key.range[0], key.range[1]) !== 'status') continue;
      if (!isScalar(value) || !value.range || value.tag !== undefined || value.anchor !== undefined) return 'draft';
      if (!SAME_LINE_SEPARATOR.test(body.slice(key.range[1], value.range[0]))) return 'draft';
      return APPROVED_SOURCES.has(body.slice(value.range[0], value.range[1])) && value.value === 'approved' ? 'approved' : 'draft';
    }
    return 'draft';
  } catch {
    return 'draft';
  }
}

/** Lokasi dokumen gerbang relatif terhadap akar repo. */
export const GATE_DOCS = { prd: 'docs/prd/prd.md', design: 'docs/design/design.md' } as const;

/**
 * Membaca status satu berkas gerbang dari disk.
 * Berkas yang tidak ada menghasilkan `missing`; kesalahan baca lain (izin, direktori) dilempar
 * agar pemanggil gagal-tertutup.
 * @param filePath - Path berkas dokumen gerbang.
 * @returns Status hasil `parseStatus`.
 * @throws Error bila berkas ada tetapi tidak dapat dibaca.
 */
export function readGateStatus(filePath: string): GateStatus {
  try {
    return parseStatus(readFileSync(filePath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return parseStatus(undefined);
    throw error;
  }
}

/**
 * Membaca status PRD dan design dari sebuah akar repo.
 * @param projectDir - Akar repo.
 * @returns Status kedua dokumen gerbang.
 * @throws Error bila salah satu berkas ada tetapi tidak dapat dibaca.
 */
export function readPhaseStatuses(projectDir: string): PhaseStatuses {
  return {
    prd: readGateStatus(join(projectDir, GATE_DOCS.prd)),
    design: readGateStatus(join(projectDir, GATE_DOCS.design)),
  };
}
