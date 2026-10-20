import { readFileSync } from 'node:fs';
import { findViolations, unmetGateReason } from './locked-paths';
import { readGateStatus, readPhaseStatuses } from './status';

/**
 * Mengambil nilai sebuah flag `--nama nilai` dari argumen.
 * @param args - Argumen CLI.
 * @param name - Nama flag, termasuk `--`.
 * @returns Nilai flag, atau `undefined` bila tidak ada.
 */
function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

/**
 * Perintah `require <prd|design>`: lolos hanya bila gerbang yang diminta sudah approved.
 * @param target - `prd` atau `design`.
 * @returns Exit code: 0 lolos, 1 gerbang tertutup, 2 salah penggunaan.
 */
function runRequire(target: string | undefined): number {
  if (target !== 'prd' && target !== 'design') {
    console.error('Penggunaan: gate require <prd|design>');
    return 2;
  }
  const reason = unmetGateReason(readPhaseStatuses(process.cwd()), target);
  if (reason) {
    console.error(reason);
    return 1;
  }
  return 0;
}

/**
 * Perintah `check`: gagal bila ada berkas berubah yang terkunci menurut status pada basis.
 * @param args - Argumen setelah `check`.
 * @returns Exit code: 0 bersih, 1 ada pelanggaran, 2 salah penggunaan.
 */
function runCheck(args: string[]): number {
  const prdFile = flagValue(args, '--prd-file');
  const designFile = flagValue(args, '--design-file');
  const changedFile = flagValue(args, '--changed-file');
  if (!prdFile || !designFile || !changedFile) {
    console.error('Penggunaan: gate check --prd-file <p> --design-file <p> --changed-file <p>');
    return 2;
  }
  const statuses = { prd: readGateStatus(prdFile), design: readGateStatus(designFile) };
  const changed = readFileSync(changedFile, 'utf8')
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.length > 0);
  const violations = findViolations(changed, statuses);
  if (violations.length === 0) return 0;

  console.error(unmetGateReason(statuses, 'design') ?? 'Gerbang fase tertutup.');
  console.error('Berkas berikut terkunci pada basis dan tidak boleh diubah di PR ini:');
  for (const path of violations) console.log(path);
  return 1;
}

/**
 * Titik masuk CLI; kesalahan tak terduga selalu berakhir sebagai exit 2 (gagal-tertutup).
 * @param argv - Argumen setelah nama skrip.
 * @returns Exit code proses.
 */
function main(argv: string[]): number {
  try {
    const [command, ...rest] = argv;
    if (command === 'require') return runRequire(rest[0]);
    if (command === 'check') return runCheck(rest);
    console.error('Penggunaan: gate <require|check> ...');
    return 2;
  } catch (error) {
    console.error(`Kesalahan tak terduga: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

process.exit(main(process.argv.slice(2)));
