# Playbook: add a migration

> **Summary:** the steps to change the schema safely on SQLite (local/CI) and Postgres (production).
> **Read when:** a task needs a new table, column or index. Rules: AGENTS.md R7.

1. **Pick the next free number.** `cd backend && npm run migrate:status` lists the files and warns on duplicates.
   Create `backend/migrations/NNN_short_description.sql`. Never edit or rename an existing file.
2. **Start with a comment** saying why the change exists (see `034_supplier_kyb_auto_approval.sql`).
3. **Write SQL that runs on both engines:**
   - Tables: `CREATE TABLE IF NOT EXISTS`, `TEXT` ids, `created_at TEXT NOT NULL DEFAULT (datetime('now'))`.
   - Columns: `ALTER TABLE t ADD COLUMN IF NOT EXISTS c TYPE;` (the runner emulates this on SQLite).
   - The Postgres adapter rewrites `datetime('now')`, and rewrites `INSERT OR IGNORE` **only at the start of a statement**. End every statement with `;` (files are split per statement).
   - No PostgreSQL-only syntax (`JSONB` operators, `SERIAL`, `DO $$`) unless it's wrapped in an engine check in code.
4. **Add a `-- @down` section** that reverses the change (`DROP ... IF EXISTS`). Rollback refuses files without one.
5. **Don't touch `backend/src/db.js`** or the legacy schema files. The migration is the only source.
6. **Apply and roll back locally:**
   ```bash
   cd backend && npm run migrate:up && npm run migrate:down && npm run migrate:up
   ```
7. **Test it.** Unit tests that need the table can load the migration with
   `executeMigrationSql(db, sql.split('-- @down')[0])` from `src/services/migrationRunner.js`
   (see `test/driverDispatchService.test.js`).
8. **Document it.** Add the table or columns to `docs/DATA_MODEL.md`. If a rule changed, update `BUSINESS_RULES.md`.
9. **Finish** with [finish-task.md](finish-task.md).

Production applies pending migrations at API startup (`runPendingMigrations()` in `server.js`). A failing migration stops a production boot, so the up/down/up check in step 6 is not optional.
