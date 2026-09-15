# AGENTS.md — read this first

Operating rules for AI agents and developers on **Idea Holiday**.

**Principle: GOAL-DRIVEN → SCOPE-CONTROLLED → MINIMAL → TESTED → DOCUMENTED**

## 1. What we are building

Two products on one backend:

- **`ideaholiday.in`** — the traveler marketplace (Viator / GetYourGuide / Klook).
- **`supply.ideaholiday.in`** — the supplier reservation system (Bókun / FareHarbor).

One Express API, one database, **one pricing authority**. The reservation system
owns price and availability; the marketplace only displays them.

Full detail: [`docs/PRODUCT.md`](docs/PRODUCT.md).

### Stack map — check which app you are in

| Folder | What it is | Key versions |
| :--- | :--- | :--- |
| `backend/` | Express API (:4000), ESM, `node:test` | Express **4**, zod **4**, better-sqlite3 (local/CI), pg (prod) |
| `frontend/` | Marketplace + supplier/admin UI (:5173). **This is what ships** (Dockerfile) | React 19, Vite 8, react-router 7, zod **4**, Tailwind **3**, lucide-react 1.x |
| `app/`, `components/`, `lib/` (root) | Optional Next.js Supabase-auth app (:3000) | Next 16, zod **3**, Tailwind 3, lucide-react 0.x |
| `e2e/` | Playwright browser journeys | Playwright 1.6x |
| `android-driver/` | Driver Android app: trip page in a WebView + native location service. Built with Gradle, not in `npm run check` | Kotlin, AGP 9.4, target SDK 36, min SDK 26 |

zod differs between the root app (3) and the rest (4). Express is 4, so async handlers do **not** forward rejections; don't copy Express 5 examples.

### Never break these

1. **Backend owns price.** Checkout takes a server quote; a browser total is never trusted.
2. **Backend owns booking state.** Transitions happen server-side, in a transaction.
3. **A hold freezes its price.** Repricing mid-checkout cannot move a traveler's total.
4. **Capacity is atomic.** `vacancies = capacity − confirmed − active holds`.
5. **Seat counts stay canonical.** `bookings.adults`/`children` drive capacity, dispatch and vouchers.
6. **Migrations are append-only.** Never edit or renumber an applied migration.
7. **No secrets in the repo** — not in code, tests, fixtures or docs.

## 2. Which docs to read

**Read 1–3 files, not all of them.** Each doc owns one subject and opens with a
two-line summary; for large docs, `grep -n '^##'` and read only the section you need.
**Don't read:** `README.md` (human intro), `docs/CHANGELOG.md` (use `git log`), lockfiles, `seed*.js`, `dist/`.
Legacy and noise files are hidden from search by `.ignore` / `.geminiignore`.

| Your task | Read |
| :--- | :--- |
| Find where a feature's code lives | [`CODEMAP.md`](docs/CODEMAP.md) |
| Step by step: add a migration, add an endpoint, finish a task | [`playbooks/`](docs/playbooks/) |
| Understand the goal, users, scope, non-goals | [`PRODUCT.md`](docs/PRODUCT.md) |
| Decide what to work on next | [`ROADMAP.md`](docs/ROADMAP.md) |
| Seats, holds, rates, calendar, capacity | [`RESERVATION_ENGINE.md`](docs/RESERVATION_ENGINE.md) |
| Pricing, commission, refunds, booking state, coupons, supplier subscriptions | [`BUSINESS_RULES.md`](docs/BUSINESS_RULES.md), [`COUPONS.md`](docs/COUPONS.md), [`SUPPLIER_PLANS.md`](docs/SUPPLIER_PLANS.md), [`REFUND_CREDIT.md`](docs/REFUND_CREDIT.md) |
| Schema, tables, fields | [`DATA_MODEL.md`](docs/DATA_MODEL.md) |
| Add or change an endpoint | [`API_CONTRACTS.md`](docs/API_CONTRACTS.md) + [`SECURITY.md`](docs/SECURITY.md) |
| Auth, RBAC, PII, dependency CVEs | [`SECURITY.md`](docs/SECURITY.md) |
| How the system fits together, request flows | [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| WhatsApp, payments, email, SMS, channel manager | [`INTEGRATIONS.md`](docs/INTEGRATIONS.md) + [`ENVIRONMENT.md`](docs/ENVIRONMENT.md) |
| Run it locally, migrations, tooling | [`DEVELOPMENT.md`](docs/DEVELOPMENT.md) |
| Write or fix tests | [`TESTING.md`](docs/TESTING.md) |
| Why something was done this way | [`DECISIONS.md`](docs/DECISIONS.md) |
| A term you don't recognise | [`GLOSSARY.md`](docs/GLOSSARY.md) |
| A library or framework API (Context7 IDs) | [`LIBRARIES.md`](docs/LIBRARIES.md) |

When docs conflict, resolve in this order:
**user request → AGENTS.md → PRODUCT.md → BUSINESS_RULES / SECURITY → ARCHITECTURE → the code → your assumptions.**
An assumption never outranks a rule.

## 3. Rules

**R1 — Do the requested task.** Fulfil the actual request within existing
constraints. Do not redesign or inflate the project around it.

**R2 — Do not expand scope.** No new libraries, frameworks, services or queues
unless asked. Never promote a `NEXT`/`LATER` roadmap item to current work without
being told.

**R3 — Do not invent.** No imaginary endpoints, columns, pricing rules or
provider behaviour. Inspect the code. If something is genuinely unknown, mark it
`UNKNOWN` rather than guessing.

**R4 — Make the smallest safe change.** Don't touch unrelated files. Preserve
surrounding comments, formatting and idiom.

**R5 — Preserve what works.** Trace callers before changing a function. Fixing
transfers must not break circuit pricing.

**R6 — No unrequested refactors**, dependency bumps, UI redesigns, schema
renames or mass reformatting.

**R7 — Migrations are append-only, and the only place schema changes.** Never
add tables to `db.js` or `supabase_schema.sql`. Add a **new** file with an unused number
(`npm run migrate:status` warns on duplicates). Never edit or rename an applied
migration — the ledger keys on filename and checksum, so editing blocks
deployment with `MIGRATION_CHECKSUM_MISMATCH` and renaming re-runs it against
databases that already have it. Give every migration a `-- @down` section.

**R8 — Project knowledge lives in the repo.** Claude, Codex and Gemini each keep
private memory the others cannot see. Record owner decisions in
[`DECISIONS.md`](docs/DECISIONS.md) and rules in the matching doc. Keep agent
memory for personal preferences only.

## 4. Workflow

**Before coding**
1. Read the 1–3 docs the table points to.
2. Inspect the real implementation with grep/read.
3. Plan the minimal change.

**Stop and ask** when:
- Requirements are ambiguous or contradict an invariant.
- A change risks data loss or dropping production tables/columns.
- You hit an architectural fork (payment provider, identity scheme).
- Required secrets are missing.
- The request contradicts a non-goal in [`PRODUCT.md`](docs/PRODUCT.md).

**Before calling it done**
- [ ] The requested behaviour actually works — verified, not assumed.
- [ ] `npm run check` passes (backend unit + integration tests, frontend build with bundle budget).
- [ ] New behaviour has a test that fails without the change.
- [ ] Docs updated **only** if schema, rules, contracts, architecture or file locations (CODEMAP) moved.
- [ ] No secrets staged. No scope creep.

Report honestly: if something is broken, skipped or unverified, say so plainly.

## 5. Commands

```bash
# Run it
cd backend && npm run dev                # API on :4000
cd frontend && npm run dev               # Marketplace on :5173, proxies /api
npm run dev                              # Next.js auth app on :3000

# Check it — prefer `npm run check`: it prints one line per step, and only the failures
npm run check                            # agent docs + unit + integration + frontend build
npm run check -- unit                    # one step: docs | test-db | unit | integration | frontend | next
cd backend && npm run test:coverage      # 70% line/function gate (CI)
cd backend && npm audit --omit=dev       # must stay at 0
npx playwright test                      # browser journeys in e2e/

# Database
cd backend && npm run migrate:status     # also warns on duplicate numbers
cd backend && npm run migrate:up
cd backend && npm run migrate:down       # rolls back the last batch
```

SQLite locally and in CI; Supabase PostgreSQL in production.
