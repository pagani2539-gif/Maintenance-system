const { query } = require('../database/db');

/**
 * Bangkok-local date as YYMMDD using a 2-digit Buddhist-era (พ.ศ.) year.
 * e.g. 2026-06-15 (ค.ศ.) → พ.ศ. 2569 → "690615"
 */
function thaiDatePart(d = new Date()) {
  // Shift to UTC+7, then read the UTC fields so the result is Bangkok-local
  const bkk = new Date(d.getTime() + 7 * 3600 * 1000);
  const yy = String((bkk.getUTCFullYear() + 543) % 100).padStart(2, '0');
  const mm = String(bkk.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(bkk.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * Generates a document number "PREFIX-YYMMDD-NNN" with a running sequence that
 * resets each day. The first number of the day is seeded from the highest
 * existing number in the target table (for continuity with legacy data);
 * every number after that is handed out atomically via
 * `INSERT ... ON CONFLICT DO UPDATE SET seq = seq + 1 RETURNING seq`, so
 * concurrent requests can never receive the same number.
 *
 * @param {string} prefix  e.g. 'RP', 'CL', 'PO', 'WD'
 * @param {{table:string, column:string}} opts  table/column that stores the number
 * @returns {Promise<string>}
 */
async function generateDocNo(prefix, { table, column }) {
  const datePart = thaiDatePart();
  const like = `${prefix}-${datePart}-%`;

  const { rows } = await query(
    `SELECT ${column} AS no FROM ${table} WHERE ${column} LIKE $1 ORDER BY ${column} DESC LIMIT 1`,
    [like]
  );
  let seedMax = 0;
  if (rows[0] && rows[0].no) {
    const m = String(rows[0].no).match(/-(\d+)$/);
    if (m) seedMax = parseInt(m[1], 10);
  }

  const result = await query(
    `INSERT INTO sequences (prefix, date_part, seq)
     VALUES ($1, $2, $3)
     ON CONFLICT (prefix, date_part) DO UPDATE SET seq = sequences.seq + 1
     RETURNING seq`,
    [prefix, datePart, seedMax + 1]
  );
  const seq = result.rows[0].seq;
  return `${prefix}-${datePart}-${String(seq).padStart(3, '0')}`;
}

module.exports = { thaiDatePart, generateDocNo };
