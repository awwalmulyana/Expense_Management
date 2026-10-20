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
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocked, unmetGateReason } from './locked-paths';
import { resolveTargetRoots } from './paths';
import { readPhaseStatuses, type PhaseStatuses } from './status';

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
    const statuses = root === projectDir ? projectStatuses : stricter(projectStatuses, readPhaseStatuses(root));
    if (!isLocked(relative, statuses)) continue;
    const reason = unmetGateReason(statuses, 'design') ?? 'Gerbang fase tertutup.';
    return deny(`Ditolak: ${relative} terkunci. ${reason}`);
  }
  return { allow: true };
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
