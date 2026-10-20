import { isMap, isScalar, parseDocument } from 'yaml';

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

    const document = parseDocument(match[1] ?? '', { uniqueKeys: true, strict: true });
    if (document.errors.length > 0 || document.warnings.length > 0) return 'draft';
    if (!isMap(document.contents)) return 'draft';

    const node = document.contents.get('status', true);
    if (!isScalar(node) || node.tag !== undefined || node.anchor !== undefined) return 'draft';
    const value: unknown = node.value;
    return value === 'approved' ? 'approved' : 'draft';
  } catch {
    return 'draft';
  }
}
