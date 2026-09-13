# Developer Guide: Idea Holiday

> **Summary:** Local setup, seeding, migrations, optional services, deploy commands and troubleshooting.
> **Read when:** running the project or a tool for the first time.

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

To give the demo marketplace a review history as well (20 reviews per published
product, written as `source = 'SEED'`):

```bash
ALLOW_DESTRUCTIVE_SEED=true ALLOW_DEMO_REVIEWS=true node src/seed.js
```

Both flags are refused in production, where a rating only ever comes from a
verified traveler — see BUSINESS_RULES §9.

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
- `NNN_description.sql`, applied in filename order (`npm run migrate:status` lists them). `017` is used twice for historical reasons; do not rename either file.
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
# Backend unit test suite (node:test)
cd backend && npm test

# Backend coverage test (enforces 70% line & function coverage gate)
cd backend && npm run test:coverage

# Backend isolated HTTP integration journey tests (19 journey tests)
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

## 5. Optional Services

### Next.js Supabase-auth app (root)
Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`, then `npm install && npm run dev` (:3000).
For Google sign-up, enable the Google provider in Supabase and allow `http://localhost:3000/auth/callback` (plus the production URL) as a redirect.

### Supabase PostgreSQL seeding
Set `DATABASE_URL` in `backend/.env`, then `cd backend && npm run migrate:up && node seed-supabase.js`.

### Local Prometheus + Grafana
`docker-compose.observability.yml` starts a localhost-only stack with alert rules and dashboards. Follow `observability/README.md`.

### Deploying
CI/CD runs from `.github/workflows/deploy.yml` (staging on `staging`, blue-green production on `main`, with smoke tests and rollback).
Manual deploy: `./deploy.sh`. Smoke-test a URL: `bash scripts/smoke-tests.sh <service-url>`. Roll back: `bash scripts/rollback.sh [SERVICE_NAME] [REGION] [PROJECT_ID]`.

---

## 6. Common Troubleshooting & Gotchas

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
