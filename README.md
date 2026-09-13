# Idea Holiday — Experiences & Transfer Marketplace for India

Tours, airport transfers, day sightseeing, attraction tickets and multi-day
packages, sold by Indian suppliers through one marketplace.

Two products share one Express API and one database:

| Role | Where they work | What they do |
| :--- | :--- | :--- |
| **Traveler** | `ideaholiday.in` | Search, hold seats for 10 minutes, pay, receive a QR voucher |
| **Supplier / fleet vendor** | `supply.ideaholiday.in` | Pass KYB, publish listings, set seats, rates and schedules |
| **Ground ops** | `/ops` | Resolve dispatch exceptions, verify OTPs, monitor live trips |
| **Admin** | `admin.ideaholiday.in` | Approve suppliers, moderate products, manage commission and payouts |

The backend is the single source of truth for price and booking state. A browser
total is never trusted: checkout takes a server quote, creates a
`pending_payment` booking, and only a verified payment confirms it.

---

## Quick start

You need **Node.js 20.9+**. Local development uses SQLite, so there is no database to install.

```bash
# Terminal 1 — API on http://localhost:4000
cd backend && npm install
npm run seed:demo        # adds a bookable Goa demo supplier and catalog
npm run dev

# Terminal 2 — marketplace on http://localhost:5173 (proxies /api to :4000)
cd frontend && npm install
npm run dev
```

Open <http://localhost:5173>. Use `supply.localhost:5173` or `admin.localhost:5173`
(or `?portal=supplier` / `?portal=admin`) for the other portals. Add
`MAPPLS_API_KEY` to `backend/.env` for pickup autocomplete.

The optional Next.js sign-in app, Supabase seeding, observability and deployment
are covered in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Checking your work

```bash
npm run check            # agent docs, backend unit + integration tests, frontend build (quiet output)
npx playwright test      # browser journeys in e2e/
```

CI (`.github/workflows/ci.yml`) also runs coverage (70% gate), dependency audits
and the root Next.js build.

---

## Project layout

```
backend/        Express API — routes/, services/, middleware/, migrations/, test/, integration/
frontend/       Vite + React 19 marketplace, supplier and admin UI (what ships)
app/ components/ lib/   Optional Next.js Supabase-auth app
e2e/            Playwright journeys
docs/           Reference docs, one subject each
observability/  Prometheus + Grafana provisioning
scripts/        check, smoke tests, rollback, post-deploy monitor
```

To find the code for a feature, see [`docs/CODEMAP.md`](docs/CODEMAP.md).

## Documentation

**Contributors and AI agents: start with [`AGENTS.md`](AGENTS.md).** It has the
rules, the invariants, and a table of which doc to read for each task.

| Subject | Doc |
| :--- | :--- |
| Goal, users, scope | [`PRODUCT.md`](docs/PRODUCT.md) · [`ROADMAP.md`](docs/ROADMAP.md) |
| Seats, holds, rates, capacity | [`RESERVATION_ENGINE.md`](docs/RESERVATION_ENGINE.md) |
| Pricing, commission, refunds, booking state | [`BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) |
| Schema | [`DATA_MODEL.md`](docs/DATA_MODEL.md) |
| Endpoints | [`API_CONTRACTS.md`](docs/API_CONTRACTS.md) |
| Auth, RBAC, PII | [`SECURITY.md`](docs/SECURITY.md) |
| System design | [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`DECISIONS.md`](docs/DECISIONS.md) |
| WhatsApp, payments, email, SMS | [`INTEGRATIONS.md`](docs/INTEGRATIONS.md) · [`ENVIRONMENT.md`](docs/ENVIRONMENT.md) |
| Setup, tests | [`DEVELOPMENT.md`](docs/DEVELOPMENT.md) · [`TESTING.md`](docs/TESTING.md) |
| Terms | [`GLOSSARY.md`](docs/GLOSSARY.md) |
