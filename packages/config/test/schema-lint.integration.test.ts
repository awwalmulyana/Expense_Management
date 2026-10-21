import pg from 'pg';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { lintValidity, MODULE_SCHEMAS } from '../schema-lint/index';

const EXCLUDE_VERSIONED =
  'EXCLUDE USING gist (logical_id WITH =, tstzrange(valid_from, valid_until) WITH &&)';

let client: pg.Client;

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL belum diset: tes integrasi memerlukan PostgreSQL (contoh: postgres://postgres@127.0.0.1:54329/finance_test).');
  }
  client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
});

afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  await client.query('BEGIN');
  for (const schema of [...MODULE_SCHEMAS, 'auth']) await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
});

afterEach(async () => {
  await client.query('ROLLBACK');
});

describe('lintValidity', () => {
  it('MODULE_SCHEMAS memuat lima modul', () => {
    expect([...MODULE_SCHEMAS]).toEqual(['identity', 'accounts', 'transactions', 'budgets', 'reporting']);
  });

  it('tabel valid lolos', async () => {
    await client.query('CREATE TABLE accounts.t (id int, valid_from timestamptz NOT NULL, valid_until timestamptz)');
    expect(await lintValidity(client)).toEqual([]);
  });

  it('tanpa valid_until ditolak', async () => {
    await client.query('CREATE TABLE accounts.t (valid_from timestamptz NOT NULL)');
    const messages = await lintValidity(client);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('accounts.t');
    expect(messages[0]).toContain('valid_until');
  });

  it('tanpa valid_from ditolak', async () => {
    await client.query('CREATE TABLE accounts.t (valid_until timestamptz)');
    const messages = await lintValidity(client);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('valid_from');
  });

  it('valid_from tanpa zona waktu ditolak', async () => {
    await client.query('CREATE TABLE accounts.t (valid_from timestamp NOT NULL, valid_until timestamptz)');
    const messages = await lintValidity(client);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('valid_from');
  });

  it('valid_from yang boleh NULL ditolak', async () => {
    await client.query('CREATE TABLE accounts.t (valid_from timestamptz, valid_until timestamptz)');
    const messages = await lintValidity(client);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('NOT NULL');
  });

  it('valid_until NOT NULL ditolak', async () => {
    await client.query('CREATE TABLE accounts.t (valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL)');
    const messages = await lintValidity(client);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('valid_until');
  });

  it('valid_until bertipe salah ditolak', async () => {
    await client.query('CREATE TABLE accounts.t (valid_from timestamptz NOT NULL, valid_until date)');
    expect(await lintValidity(client)).toHaveLength(1);
  });

  it('logical_id tanpa EXCLUDE ditolak', async () => {
    await client.query('CREATE TABLE accounts.t (logical_id uuid NOT NULL, valid_from timestamptz NOT NULL, valid_until timestamptz)');
    const messages = await lintValidity(client);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('EXCLUDE');
  });

  it('EXCLUDE pada kolom lain tidak cukup', async () => {
    await client.query(
      `CREATE TABLE accounts.t (logical_id uuid NOT NULL, other int, valid_from timestamptz NOT NULL, valid_until timestamptz,
        EXCLUDE USING gist (other WITH =, tstzrange(valid_from, valid_until) WITH &&))`,
    );
    expect(await lintValidity(client)).toHaveLength(1);
  });

  it('logical_id dengan EXCLUDE (logical_id WITH =, tstzrange(valid_from, valid_until) WITH &&) lolos', async () => {
    await client.query(
      `CREATE TABLE accounts.t (logical_id uuid NOT NULL, valid_from timestamptz NOT NULL, valid_until timestamptz, ${EXCLUDE_VERSIONED})`,
    );
    expect(await lintValidity(client)).toEqual([]);
  });

  it('skema di luar modul diabaikan', async () => {
    await client.query('CREATE TABLE auth.users (id int)');
    expect(await lintValidity(client)).toEqual([]);
  });

  it('view dan tabel di skema lain tidak ikut dipindai', async () => {
    await client.query('CREATE TABLE accounts.t (valid_from timestamptz NOT NULL, valid_until timestamptz)');
    await client.query('CREATE VIEW accounts.v AS SELECT * FROM accounts.t');
    expect(await lintValidity(client)).toEqual([]);
  });

  it('pengecualian dihormati', async () => {
    await client.query('CREATE TABLE accounts.schema_migrations (version text)');
    const messages = await lintValidity(client);
    expect(messages).toHaveLength(2);
    expect(messages.every((message) => message.startsWith('accounts.schema_migrations:'))).toBe(true);
    expect(await lintValidity(client, { exceptions: ['accounts.schema_migrations'] })).toEqual([]);
  });

  it('opsi schemas membatasi pemindaian', async () => {
    await client.query('CREATE TABLE accounts.t (id int)');
    expect(await lintValidity(client, { schemas: ['budgets'] })).toEqual([]);
  });

  it('EXCLUDE menolak tumpang tindih tetapi menerima rentang berimpit', async () => {
    await client.query(
      `CREATE TABLE accounts.t (logical_id uuid NOT NULL, valid_from timestamptz NOT NULL, valid_until timestamptz, ${EXCLUDE_VERSIONED})`,
    );
    const id = '00000000-0000-0000-0000-000000000001';
    const insert = 'INSERT INTO accounts.t (logical_id, valid_from, valid_until) VALUES ($1, $2, $3)';
    await client.query(insert, [id, '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z']);
    await client.query(insert, [id, '2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z']);
    await expect(client.query(insert, [id, '2026-01-15T00:00:00Z', '2026-02-15T00:00:00Z'])).rejects.toMatchObject({ code: '23P01' });
  });
});
