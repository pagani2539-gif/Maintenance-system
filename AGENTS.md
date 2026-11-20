# Maintenance System — Agent Working Rules

## Database and test safety

- Production runs through PM2 and uses `server/.env` with the PostgreSQL `public` schema.
- Backend tests must be run from `server` with `npm.cmd test -- --run` on Windows (or `npm test -- --run` on other platforms).
- The test setup sets `NODE_ENV=test`, loads `server/.env.test`, and uses the isolated PostgreSQL schema `maintenance_test` through `PG_TEST_SCHEMA`.
- Never point tests at `DATABASE_URL` or remove `PG_TEST_SCHEMA`. The connection layer is fail-closed and must not be bypassed.
- The current local fallback uses the same PostgreSQL database with a separate schema. A dedicated test database is preferred when the PostgreSQL role has permission to create one.
- `server/.env.test` is local and ignored by Git. Do not commit passwords, connection strings with real credentials, or other secrets.

## Test data

- Tests create their own mock stations, inventory, withdrawals, repairs, purchase orders, and users at runtime; they do not use production records as fixtures.
- New tests must use unique prefixes or random identifiers and clean up every record they create, including dependent ledger, transaction, audit, and child rows.
- Do not delete or bulk-clean production data without first taking a backup, identifying exact target records, and receiving explicit approval.

## Useful references

- Detailed test plan: `docs/TEST_PLAN.md`
- Environment template: `server/.env.example`
- Test connection guard: `server/database/db.js`
- Test migration setup: `server/tests/globalSetup.js`
