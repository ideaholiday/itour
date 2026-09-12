# AGENTS.md — read this first

Operating rules for AI agents and developers on **Idea Holiday**.

**Principle: GOAL-DRIVEN → SCOPE-CONTROLLED → MINIMAL → TESTED → DOCUMENTED**

---

## 1. What we are building

Two products on one backend:

- **`ideaholiday.in`** — the traveler marketplace (Viator / GetYourGuide / Klook).
- **`supply.ideaholiday.in`** — the supplier reservation system (Bókun / FareHarbor).

One Express API, one database, **one pricing authority**. The reservation system
owns price and availability; the marketplace only displays them.

Full detail: [`docs/PRODUCT.md`](docs/PRODUCT.md).

### Never break these

1. **Backend owns price.** Checkout takes a server quote; a browser total is never trusted.
2. **Backend owns booking state.** Transitions happen server-side, in a transaction.
3. **A hold freezes its price.** Repricing mid-checkout cannot move a traveler's total.
4. **Capacity is atomic.** `vacancies = capacity − confirmed − active holds`.
5. **Seat counts stay canonical.** `bookings.adults`/`children` drive capacity, dispatch and vouchers.
6. **Migrations are append-only.** Never edit or renumber an applied migration.
7. **No secrets in the repo** — not in code, tests, fixtures or docs.

---

## 2. Which docs to read

**Read 1–3 files, not all of them.** Each doc owns one subject and does not repeat the others.

| Your task | Read |
| :--- | :--- |
| Understand the goal, users, scope, non-goals | [`PRODUCT.md`](docs/PRODUCT.md) |
| Decide what to work on next | [`ROADMAP.md`](docs/ROADMAP.md) |
| Seats, holds, rates, calendar, capacity | [`RESERVATION_ENGINE.md`](docs/RESERVATION_ENGINE.md) |
| Pricing, commission, refunds, booking state | [`BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) |
| Schema, tables, fields | [`DATA_MODEL.md`](docs/DATA_MODEL.md) |
| Add or change an endpoint | [`API_CONTRACTS.md`](docs/API_CONTRACTS.md) + [`SECURITY.md`](docs/SECURITY.md) |
| Auth, RBAC, PII, dependency CVEs | [`SECURITY.md`](docs/SECURITY.md) |
| How the system fits together, request flows | [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| WhatsApp, payments, email, SMS, channel manager | [`INTEGRATIONS.md`](docs/INTEGRATIONS.md) + [`ENVIRONMENT.md`](docs/ENVIRONMENT.md) |
| Run it locally, migrations, tooling | [`DEVELOPMENT.md`](docs/DEVELOPMENT.md) |
| Write or fix tests | [`TESTING.md`](docs/TESTING.md) |
| Why something was done this way | [`DECISIONS.md`](docs/DECISIONS.md) |
| A term you don't recognise | [`GLOSSARY.md`](docs/GLOSSARY.md) |

When docs conflict, resolve in this order:
**user request → AGENTS.md → PRODUCT.md → BUSINESS_RULES / SECURITY → ARCHITECTURE → the code → your assumptions.**
An assumption never outranks a rule.

---

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

**R7 — Migrations are append-only.** Add a **new** file with an unused number
(`npm run migrate:status` warns on duplicates). Never edit or rename an applied
migration — the ledger keys on filename and checksum, so editing blocks
deployment with `MIGRATION_CHECKSUM_MISMATCH` and renaming re-runs it against
databases that already have it. Give every migration a `-- @down` section.

---

## 4. Workflow

**Before coding**
1. Read this file.
2. Read the 1–3 docs the table points to.
3. Inspect the real implementation with grep/read.
4. Plan the minimal change.

**Stop and ask** when:
- Requirements are ambiguous or contradict an invariant.
- A change risks data loss or dropping production tables/columns.
- You hit an architectural fork (payment provider, identity scheme).
- Required secrets are missing.
- The request contradicts a non-goal in [`PRODUCT.md`](docs/PRODUCT.md).

**Before calling it done**
- [ ] The requested behaviour actually works — verified, not assumed.
- [ ] `cd backend && npm test` passes.
- [ ] `cd backend && npm run test:integration` passes.
- [ ] `cd frontend && npm run build` passes (bundle budget included).
- [ ] New behaviour has a test that fails without the change.
- [ ] Docs updated **only** if schema, rules, contracts or architecture moved.
- [ ] No secrets staged. No scope creep.

Report honestly: if something is broken, skipped or unverified, say so plainly.

---

## 5. Commands

```bash
# Run it
cd backend && npm run dev                # API on :4000
cd frontend && npm run dev               # Marketplace on :5173, proxies /api
npm run dev                              # Next.js auth app on :3000

# Check it
cd backend && npm test                   # 305 unit tests, 9 suites
cd backend && npm run test:integration   # 17 real-HTTP journeys
cd backend && npm run test:coverage      # 70% gate (currently ~87%)
cd backend && npm audit --omit=dev       # must stay at 0
cd frontend && npm run build             # includes bundle budget
npx playwright test                      # 11 browser journeys

# Database
cd backend && npm run migrate:status     # also warns on duplicate numbers
cd backend && npm run migrate:up
cd backend && npm run migrate:down       # rolls back the last batch
```

Migrations `001`–`024`. SQLite locally and in CI; Supabase PostgreSQL in production.
