# Developer Guide: Idea Holiday

## Prerequisites
- **Node.js**: v20.x or later.
- **npm**: v10.x or later.
- **SQLite3**: Pre-installed on macOS/Linux (bundled via `better-sqlite3`).

---

## 1. Local Setup & Quickstart

### Step 1: Install Dependencies
```bash
# 1. Install root Next.js dependencies
npm install

# 2. Install backend Express dependencies
cd backend && npm install

# 3. Install frontend Vite dependencies
cd ../frontend && npm install
```

### Step 2: Seed Initial Local Inventory
The backend contains an idempotent seeder that populates a bookable Goa supplier and active transfer/tour listings:
```bash
cd backend
npm run seed:demo
```

### Step 3: Run Development Servers
Open two separate terminal tabs:

**Terminal 1 (Backend API):**
```bash
cd backend
npm run dev
# Starts Express API at http://localhost:4000 with auto-restart
```

**Terminal 2 (Frontend Client):**
```bash
cd frontend
npm run dev
# Starts Vite client at http://localhost:5173 (configured to proxy /api to :4000)
```

**Terminal 3 (Next.js Auth App - Optional):**
```bash
npm run dev
# Starts Next.js app at http://localhost:3000
```

---

## 2. Database Migrations

The repository includes a dual-engine (SQLite & PostgreSQL) migration runner in `backend/scripts/migrate.js`:

```bash
cd backend

# Inspect migration status (pending vs applied batches)
npm run migrate:status

# Execute all pending SQL migrations
npm run migrate:up

# Roll back the most recent migration batch
npm run migrate:down

# Migrate SQLite data directly to PostgreSQL
npm run migrate:postgres
```

Migration files live under `backend/migrations/` and use standard versioned filenames:
- `001_initial_schema.sql` ... `022_booking_unit_items.sql`.
- Migration state is recorded in the `_schema_migrations` table.

**Numbering rule:** give every new migration a number no existing file uses.
Migrations apply in filename order and the ledger keys on the full filename, so
two files sharing a number make the apply order depend on the description text.
`npm run migrate:status` prints a warning when it finds duplicates. Never
renumber a migration that has already been applied — the ledger would treat the
renamed file as new and run it a second time.

---

## 3. Testing Commands

Execute test suites from the respective package roots:

```bash
# Backend unit test suite (285 tests across 9 suites using node:test)
cd backend && npm test

# Backend coverage test (enforces 70% line & function coverage gate)
cd backend && npm run test:coverage

# Backend isolated HTTP integration journey tests (16 journey tests)
cd backend && npm run test:integration

# Native PostgreSQL concurrency verification test
cd backend && node scripts/test-native-postgres.js

# Test WhatsApp message delivery via CLI
cd backend && npm run test:whatsapp <mobile_number>

# Frontend bundle budget check (< 225 KiB initial JS entry)
cd frontend && npm run check:bundle

# End-to-end browser tests (Playwright)
npm run test:e2e
```

---

## 4. Linting & Building

```bash
# Run Next.js lint checks
npm run lint

# Build frontend production bundle
cd frontend && npm run build

# Build root Next.js application
npm run build
```

---

## 5. Common Troubleshooting & Gotchas

1. **SQLite Database Locked (`SQLITE_BUSY`)**:
   - The backend sets `db.pragma("busy_timeout = 5000")` and uses `WAL` mode.
   - If another external tool has opened `wanderindia.db` with exclusive locks, close the external tool and restart the backend.
2. **Port Conflicts (`EADDRINUSE: 4000`)**:
   - Check if an existing Node process is running: `lsof -i :4000` and kill it with `kill -9 <PID>`.
3. **WhatsApp Messages Not Arriving on Handset**:
   - Meta Cloud API will not deliver free-form text outside the 24-hour customer window. Always send a pre-approved template (e.g., `idea_holiday_ops_alert` or `hello_world`) for initial tests.
   - Run `cd backend && npm run test:whatsapp <mobile_number>` to verify connectivity.
4. **CORS Errors on Localhost**:
   - The backend allowlist includes `http://localhost:5173`, `http://localhost:3000`, and `http://127.0.0.1:5173`. Access the frontend using `http://localhost:5173`.
