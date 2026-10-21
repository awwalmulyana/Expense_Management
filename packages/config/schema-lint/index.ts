import type { Client } from 'pg';

/** Skema PostgreSQL milik modul; satu skema per modul dengan nama yang sama. */
export const MODULE_SCHEMAS = ['identity', 'accounts', 'transactions', 'budgets', 'reporting'] as const;

/** Opsi pemindaian lint skema. */
export interface SchemaLintOptions {
  /** Skema yang dipindai; bawaan `MODULE_SCHEMAS`. */
  schemas?: readonly string[];
  /** Tabel yang dikecualikan, berformat `skema.tabel`. */
  exceptions?: readonly string[];
}

const TIMESTAMPTZ = 'timestamp with time zone';

interface ColumnRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
}

interface TableRow {
  table_schema: string;
  table_name: string;
}

interface ExclusionRow extends TableRow {
  definition: string;
}

/**
 * Memeriksa aturan rentang berlaku (spec 14.4) pada tabel dasar di skema modul:
 * (a) `valid_from` bertipe timestamptz NOT NULL;
 * (b) `valid_until` bertipe timestamptz dan boleh NULL;
 * (c) tabel dengan `logical_id` wajib punya constraint EXCLUDE yang memuat `logical_id` dan `valid_from`,
 *     sehingga versi dengan `logical_id` sama tidak bisa tumpang tindih.
 * @param client - Koneksi PostgreSQL (cukup memiliki `query`).
 * @param opts - Skema yang dipindai dan tabel yang dikecualikan.
 * @returns Pesan pelanggaran, terurut; larik kosong berarti lolos.
 */
export async function lintValidity(client: Pick<Client, 'query'>, opts: SchemaLintOptions = {}): Promise<string[]> {
  const schemas = [...(opts.schemas ?? MODULE_SCHEMAS)];
  const exceptions = new Set(opts.exceptions ?? []);

  const tables = await client.query<TableRow>(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_type = 'BASE TABLE' AND table_schema = ANY($1)`,
    [schemas],
  );
  const columns = await client.query<ColumnRow>(
    `SELECT table_schema, table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = ANY($1) AND column_name IN ('valid_from', 'valid_until', 'logical_id')`,
    [schemas],
  );
  const exclusions = await client.query<ExclusionRow>(
    `SELECT n.nspname AS table_schema, c.relname AS table_name, pg_get_constraintdef(k.oid) AS definition
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE k.contype = 'x' AND n.nspname = ANY($1)`,
    [schemas],
  );

  const columnsByTable = new Map<string, Map<string, ColumnRow>>();
  for (const column of columns.rows) {
    const key = `${column.table_schema}.${column.table_name}`;
    const byName = columnsByTable.get(key) ?? new Map<string, ColumnRow>();
    byName.set(column.column_name, column);
    columnsByTable.set(key, byName);
  }
  const exclusionsByTable = new Map<string, string[]>();
  for (const exclusion of exclusions.rows) {
    const key = `${exclusion.table_schema}.${exclusion.table_name}`;
    exclusionsByTable.set(key, [...(exclusionsByTable.get(key) ?? []), exclusion.definition]);
  }

  const messages: string[] = [];
  for (const table of tables.rows) {
    const key = `${table.table_schema}.${table.table_name}`;
    if (exceptions.has(key)) continue;
    const byName = columnsByTable.get(key) ?? new Map<string, ColumnRow>();

    const validFrom = byName.get('valid_from');
    if (!validFrom || validFrom.data_type !== TIMESTAMPTZ) {
      messages.push(`${key}: kolom valid_from bertipe timestamptz wajib ada`);
    } else if (validFrom.is_nullable !== 'NO') {
      messages.push(`${key}: kolom valid_from harus NOT NULL`);
    }

    const validUntil = byName.get('valid_until');
    if (!validUntil || validUntil.data_type !== TIMESTAMPTZ) {
      messages.push(`${key}: kolom valid_until bertipe timestamptz wajib ada`);
    } else if (validUntil.is_nullable !== 'YES') {
      messages.push(`${key}: kolom valid_until harus boleh NULL (NULL berarti masih berlaku)`);
    }

    if (byName.has('logical_id')) {
      const covers = (exclusionsByTable.get(key) ?? []).some(
        (definition) => definition.includes('logical_id') && definition.includes('valid_from'),
      );
      if (!covers) {
        messages.push(`${key}: tabel berversi (logical_id) wajib punya constraint EXCLUDE pada logical_id dan rentang valid_from..valid_until`);
      }
    }
  }
  return messages.sort();
}
