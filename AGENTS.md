# Operational Guidelines & Rules for AI Agents: Idea Holiday

> **READ THIS FILE BEFORE WORKING ON THE PROJECT.**
>
> All AI coding assistants, planning agents, and human developers must adhere strictly to the rules, task boundaries, and routing instructions defined herein.
>
> The core principle is:
> **GOAL-DRIVEN → SCOPE-CONTROLLED → MINIMAL → TESTED → DOCUMENTED**

---

## 1. Documentation Router (Context-Efficient Task Mapping)
**Do NOT read all 20 documentation files for every task.**
Use this task router to identify and read only the **1 to 3 specific documents** relevant to your immediate assignment:

| Task Type | Read These Documents First |
| :--- | :--- |
| **New Feature / Product Requirement** | [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) • [`docs/PROJECT_GOALS.md`](docs/PROJECT_GOALS.md) • [`docs/PRD.md`](docs/PRD.md) • [`docs/SCOPE.md`](docs/SCOPE.md) |
| **Native Reservations / Seat Capacity / Holds** | [`docs/native-reservations-phase1.md`](docs/native-reservations-phase1.md) • [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) • [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) • [`docs/native-reservations-release-verification.md`](docs/native-reservations-release-verification.md) |
| **Pricing, Commission, Fares, or Booking State** | [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) • [`docs/PRD.md`](docs/PRD.md) |
| **Database Schema, Table, or Field Mutation** | [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) • [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| **API Route Creation, Modification, or Validation** | [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md) • [`docs/SECURITY.md`](docs/SECURITY.md) |
| **Third-Party Integrations (WhatsApp, PG, SES, SMS)**| [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) • [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) |
| **Authentication, RBAC, Passwords, or Secrets** | [`docs/SECURITY.md`](docs/SECURITY.md) • [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) |
| **Local Setup, Running, Migrations, or Tooling** | [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) |
| **Writing Tests or Verifying CI Quality Gates** | [`docs/TESTING.md`](docs/TESTING.md) |
| **Strategic Planning or Scope Confirmation** | [`docs/SCOPE.md`](docs/SCOPE.md) • [`docs/ROADMAP.md`](docs/ROADMAP.md) |
| **Terminology or Domain Concept Clarification** | [`docs/GLOSSARY.md`](docs/GLOSSARY.md) |

---

## 2. Core Operational Rules for AI Agents

### Rule 1: Project-First Rule
Understand the project's actual goals, architecture, and current scope before making changes. The agent's mission is to fulfill the user's specific request within established constraints—not to redesign or inflate the project.

### Rule 2: Do Not Expand Scope
- Only build functionality authorized for the requested task.
- Do not introduce new third-party libraries, framework changes, extra microservices, or complex background queues unless explicitly requested.
- Review [`docs/SCOPE.md`](docs/SCOPE.md) and [`docs/ROADMAP.md`](docs/ROADMAP.md). Never convert a roadmap "NEXT" or "LATER" item into current implementation without an explicit user prompt.

### Rule 3: Do Not Invent
Do not invent:
- Non-existent API endpoints or query parameters.
- Database tables, columns, or relationships not in [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md).
- Fabricated business or pricing rules.
- Fake credentials, tokens, or provider behaviors.
If details are unknown, inspect the existing code or mark assumptions explicitly as `UNKNOWN` or `TO BE CONFIRMED`.

### Rule 4: Minimal Change Rule
- Make the smallest safe, idiomatic change necessary to accomplish the requested task.
- Do not touch unrelated files or rewrite working modules.
- Preserve existing comments, formatting, and docstrings unrelated to your change.

### Rule 5: Preserve Existing Functionality
- Before modifying a function or component, trace its upstream and downstream dependencies.
- Ensure that fixing one feature does not break adjacent workflows (e.g. altering transfer calculations must not break circuit order pricing).

### Rule 6: No Unrequested Refactoring
Do not perform unrelated:
- Refactoring or code restructuring.
- Dependency upgrades or package replacements.
- UI redesigns or CSS framework replacements.
- Database schema normalizations or renames.
- Mass re-formatting across untouched files.

### Rule 7: Migrations Are Append-Only
- Add a **new** file in `backend/migrations/` for every schema change. Give it a
  number no existing file uses (`npm run migrate:status` warns about duplicates).
- **Never edit or rename an already-applied migration.** The `_schema_migrations`
  ledger keys on the full filename and stores a checksum: editing one blocks
  deployment with `MIGRATION_CHECKSUM_MISMATCH`, and renaming one makes it run a
  second time against databases that already have it.
- Every migration should carry a `-- @down` section; rollback refuses batches
  without one.

---

## 3. Requirement Priority Hierarchy
When instructions or specifications appear to conflict, resolve them using this strict order of precedence:

1. **Explicit current user request**
2. [`AGENTS.md`](AGENTS.md) (This file)
3. [`docs/PROJECT_GOALS.md`](docs/PROJECT_GOALS.md)
4. [`docs/PRD.md`](docs/PRD.md)
5. [`docs/SCOPE.md`](docs/SCOPE.md)
6. [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) & [`docs/SECURITY.md`](docs/SECURITY.md)
7. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) & [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md)
8. Existing codebase implementation
9. Agent assumptions (Never let an assumption override an explicit rule)

---

## 4. Agent Workflow & Execution Checklists

### Before Coding Checklist
1. Read this [`AGENTS.md`](AGENTS.md) file.
2. Route to and read the 1–3 relevant documents in [`docs/`](docs/) based on Section 1 above.
3. Inspect the existing implementation in the workspace using grep/view tools.
4. Formulate a minimal, concrete plan.
5. Execute only the requested changes.

### Stop Conditions (Stop & Ask Clarification)
The agent must **STOP** and ask the user for direction when:
- Requirements are ambiguous, contradictory, or directly conflict with existing business rules.
- A proposed change would cause irreversible data loss or require dropping production database tables/columns.
- A critical architectural fork is reached (e.g., changing payment providers or identity schemes). 
- Secrets or third-party credentials are missing and cannot be loaded from environment files.
- The user request contradicts core project goals or explicitly out-of-scope boundaries.

### Completion Verification Checklist
Before declaring any task complete, verify:
- [ ] The requested requirement is fully implemented.
- [ ] Existing functionality remains unbroken.
- [ ] Backend tests pass: `cd backend && npm test`.
- [ ] Frontend bundle budget is respected: `cd frontend && npm run check:bundle` (or build passes).
- [ ] No secrets, keys, or `.env` files are exposed or committed.
- [ ] Relevant documentation in `docs/` was updated if architecture, schema, or rules were materially altered.
- [ ] Scope was strictly controlled.

---

## 5. Quick Development Reference
- **Backend API**: `cd backend && npm run dev` (Port 4000)
- **Frontend Client**: `cd frontend && npm run dev` (Port 5173, proxies `/api` to `:4000`)
- **Next.js Auth App**: `npm run dev` (Port 3000)
- **Tests**: `cd backend && npm test` (285 unit tests across 9 suites)
- **Integration**: `cd backend && npm run test:integration` (16 real-HTTP journey tests)
- **Coverage**: `cd backend && npm run test:coverage` (Enforced 70% threshold)
- **Concurrency Test**: `cd backend && node scripts/test-native-postgres.js`
- **Migrations**: `cd backend && npm run migrate:status` / `migrate:up` (migrations 001–022)
- **WhatsApp CLI Test**: `cd backend && npm run test:whatsapp <phone>`
- **E2E Browser Tests**: `npm run test:e2e`
