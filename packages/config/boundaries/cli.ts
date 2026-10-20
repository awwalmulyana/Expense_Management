import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBoundaries } from './run';

/**
 * Menjalankan pemeriksaan batas modul dan mencetak hasilnya.
 * Akar repo dihitung dari lokasi berkas ini; argumen pertama dapat menggantinya.
 * @returns Exit code: 0 bila bersih, 1 bila ada pelanggaran atau modul tak terdaftar.
 */
async function main(): Promise<number> {
  const defaultRoot = resolve(fileURLToPath(import.meta.url), '../../../..');
  const root = process.argv[2] ? resolve(process.argv[2]) : defaultRoot;
  const { violations, unlistedModules, conformance } = await runBoundaries(root);

  for (const violation of violations) {
    console.error(`[${violation.rule}] ${violation.from} -> ${violation.to}`);
  }
  for (const name of unlistedModules) {
    console.error(`[unlisted-module] modules/${name} belum terdaftar di packages/config/boundaries/allowed-edges.json (atau bukan folder modul)`);
  }

  for (const issue of conformance) console.error(`[conformance] ${issue}`);

  const total = violations.length + unlistedModules.length + conformance.length;
  if (total > 0) {
    console.error(`Batas modul dilanggar: ${total} temuan.`);
    return 1;
  }
  console.log('Batas modul: bersih.');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
