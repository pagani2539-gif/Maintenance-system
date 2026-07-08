const { Pool, types } = require('pg');

// node-postgres returns BIGINT/BIGSERIAL (OID 20) columns as strings by default,
// to avoid silent precision loss above Number.MAX_SAFE_INTEGER. Every primary/
// foreign key in this schema is BIGSERIAL, but the frontend types and equality
// checks (e.g. `companies.find(c => c.id === selectedCompanyId)`) assume plain
// JS numbers — the string/number mismatch silently broke lookups after the
// Postgres migration (e.g. picking a non-default company in the print dialog).
// Row counts here will never approach 2^53, so parsing as int is safe.
types.setTypeParser(20, (val) => parseInt(val, 10));

const pool = new Pool({
  connectionString: process.env.NODE_ENV === 'test'
    ? (process.env.DATABASE_URL_TEST || process.env.DATABASE_URL)
    : process.env.DATABASE_URL,
  // Force every session to UTC regardless of the server/OS locale. TIMESTAMPTZ
  // columns are always stored as an absolute UTC instant, but a *naive*
  // timestamp string (no offset) passed as a query parameter is interpreted
  // using the session's TimeZone setting — on this host that defaults to
  // Asia/Bangkok, which silently shifted values by 7 hours (caught during the
  // Stage 4 migration rehearsal). NOW()/.toISOString() writes were already
  // safe; this closes the gap for any future naive-string parameter too.
  options: '-c timezone=UTC',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

const query = (text, params = []) => pool.query(text, params);

const getClient = () => pool.connect();

const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const closePool = () => pool.end();

module.exports = { pool, query, getClient, withTransaction, closePool };
