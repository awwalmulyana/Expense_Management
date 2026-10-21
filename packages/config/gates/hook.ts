/*
 * Hook PreToolUse penjaga gerbang fase (Edit, Write, MultiEdit, NotebookEdit).
 *
 * Format dikonfirmasi terhadap dokumentasi Claude Code (hooks-guide, 2026-10-20):
 * stdin berisi JSON `{ tool_name, tool_input: { file_path | notebook_path }, cwd, hook_event_name }`;
 * exit 2 memblokir dan stderr diteruskan ke Claude; `CLAUDE_PROJECT_DIR` berisi akar proyek.
 *
 * Penyimpangan yang perlu diketahui: exit code selain 0 dan 2 TIDAK memblokir. Karena itu:
 *  - semua kesalahan di dalam berkas ini dipetakan ke exit 2, dan
 *  - settings.json wajib memasang `"onFailure": "block"` (Claude Code >= 2.1.295) agar hook yang
 *    gagal start atau crash sebelum kode ini berjalan juga memblokir.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocked, unmetGateReason } from './locked-paths';
import { resolveTargetRoots } from './paths';
import { GATE_DOCS, parseStatus, readPhaseStatuses, type PhaseStatuses } from './status';

/** Keputusan hook: izinkan, atau tolak dengan alasan untuk Claude. */
export type HookDecision = { allow: true } | { allow: false; reason: string };

/**
 * Membuat keputusan menolak.
 * @param reason - Alasan yang ditampilkan ke Claude.
 * @returns Keputusan tolak.
 */
function deny(reason: string): HookDecision {
  return { allow: false, reason };
}

/**
 * Mengambil path berkas dari input hook (`file_path` atau `notebook_path`).
 * @param input - Hasil parse JSON stdin.
 * @returns Path tidak kosong, atau `undefined` bila tidak ada.
 */
function extractPath(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const toolInput = (input as { tool_input?: unknown }).tool_input;
  if (typeof toolInput !== 'object' || toolInput === null) return undefined;
  const { file_path: filePath, notebook_path: notebookPath } = toolInput as Record<string, unknown>;
  const candidate = typeof filePath === 'string' && filePath !== '' ? filePath : notebookPath;
  return typeof candidate === 'string' && candidate !== '' ? candidate : undefined;
}

/**
 * Memutuskan apakah sebuah pemanggilan tool boleh berjalan. Gagal-tertutup:
 * input rusak, tanpa path, atau kesalahan membaca status berujung penolakan.
 * @param stdin - Isi stdin hook (JSON).
 * @param projectDir - Akar proyek.
 * @returns Keputusan izinkan atau tolak.
 */
export function decideHook(stdin: string, projectDir: string): HookDecision {
  let input: unknown;
  try {
    input = JSON.parse(stdin);
  } catch {
    return deny('Input hook bukan JSON yang valid; penulisan ditolak (gagal-tertutup).');
  }
  const rawPath = extractPath(input);
  if (rawPath === undefined) {
    return deny('Input hook tidak memuat file_path atau notebook_path; penulisan ditolak (gagal-tertutup).');
  }

  const projectStatuses = readPhaseStatuses(projectDir);
  for (const { root, relative } of resolveTargetRoots(rawPath, projectDir)) {
    const selfProtection = selfProtectionReason(input, root, relative);
    if (selfProtection !== undefined) return deny(selfProtection);
    const statuses = root === projectDir ? projectStatuses : stricter(projectStatuses, readPhaseStatuses(root));
    if (!isLocked(relative, statuses)) continue;
    const reason = unmetGateReason(statuses, 'design') ?? 'Gerbang fase tertutup.';
    return deny(`Ditolak: ${relative} terkunci. ${reason}`);
  }
  return { allow: true };
}

/** Berkas pengaturan lokal yang bisa mematikan semua hook (`disableAllHooks`); tidak boleh ditulis agent. */
const LOCAL_SETTINGS = '.claude/settings.local.json';

/**
 * Menghitung isi sebuah berkas setelah pemanggilan Write, Edit, atau MultiEdit diterapkan.
 * @param toolInput - `tool_input` dari hook.
 * @param current - Isi berkas saat ini (kosong bila belum ada).
 * @returns Isi hasil tulis, atau `undefined` bila bentuk inputnya tidak dikenali.
 */
function resultingContent(toolInput: Record<string, unknown>, current: string): string | undefined {
  /**
   * Menerapkan satu penggantian teks.
   * @param text - Teks sebelum penggantian.
   * @param edit - Objek dengan old_string, new_string, dan replace_all opsional.
   * @returns Teks hasil, atau `undefined` bila bentuk edit tidak dikenali.
   */
  const applyEdit = (text: string, edit: Record<string, unknown>): string | undefined => {
    const { old_string: oldString, new_string: newString, replace_all: replaceAll } = edit;
    if (typeof oldString !== 'string' || typeof newString !== 'string') return undefined;
    if (!text.includes(oldString)) return text;
    return replaceAll === true ? text.split(oldString).join(newString) : text.replace(oldString, () => newString);
  };
  if (typeof toolInput.content === 'string') return toolInput.content;
  if (Array.isArray(toolInput.edits)) {
    let text: string | undefined = current;
    for (const edit of toolInput.edits) {
      if (text === undefined || typeof edit !== 'object' || edit === null) return undefined;
      text = applyEdit(text, edit as Record<string, unknown>);
    }
    return text;
  }
  return applyEdit(current, toolInput);
}

/**
 * Menolak penulisan yang akan melonggarkan gerbang dari dalam: mengubah status dokumen gerbang menjadi
 * `approved` (hak pemilik lewat merge PR) atau menulis pengaturan lokal yang mematikan hook.
 * @param input - Hasil parse JSON stdin.
 * @param root - Akar pohon kerja yang memuat target.
 * @param relative - Path target relatif terhadap `root`.
 * @returns Alasan penolakan, atau `undefined` bila bukan pelanggaran.
 */
function selfProtectionReason(input: unknown, root: string, relative: string): string | undefined {
  const lowered = relative.toLowerCase();
  if (lowered === LOCAL_SETTINGS) {
    return `Ditolak: ${LOCAL_SETTINGS} dapat mematikan hook gerbang dan tidak boleh ditulis agent.`;
  }
  const gateDoc = Object.values(GATE_DOCS).find((doc) => doc === lowered);
  if (gateDoc === undefined) return undefined;

  const toolInput = (input as { tool_input: Record<string, unknown> }).tool_input;
  let current = '';
  try {
    current = readFileSync(join(root, relative), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const next = resultingContent(toolInput, current);
  if (next === undefined) return `Ditolak: isi ${relative} setelah penulisan tidak dapat dihitung (gagal-tertutup).`;
  if (parseStatus(next) === 'approved' && parseStatus(current) !== 'approved') {
    return `Ditolak: ${relative} tidak boleh diubah menjadi status approved oleh agent. Hanya pemilik yang menyetujui, lewat review dan merge PR.`;
  }
  return undefined;
}

/**
 * Menggabungkan dua set status dengan mengambil yang lebih ketat: sebuah gerbang terbuka
 * hanya bila `approved` di kedua sisi (akar proyek dan worktree).
 * @param project - Status dari akar proyek.
 * @param worktree - Status dari worktree.
 * @returns Status gabungan.
 */
function stricter(project: PhaseStatuses, worktree: PhaseStatuses): PhaseStatuses {
  return {
    prd: project.prd === 'approved' ? worktree.prd : project.prd,
    design: project.design === 'approved' ? worktree.design : project.design,
  };
}

/**
 * Titik masuk proses: baca stdin, putuskan, lalu keluar dengan 0 (izinkan) atau 2 (tolak/error).
 * @returns Exit code proses.
 */
function main(): number {
  try {
    const decision = decideHook(readFileSync(0, 'utf8'), process.env.CLAUDE_PROJECT_DIR || process.cwd());
    if (decision.allow) return 0;
    process.stderr.write(`${decision.reason}\n`);
    return 2;
  } catch (error) {
    process.stderr.write(`Hook gerbang gagal (${error instanceof Error ? error.message : String(error)}); penulisan ditolak.\n`);
    return 2;
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
