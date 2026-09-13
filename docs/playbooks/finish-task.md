# Playbook: finish a task

> **Summary:** what "done" means before you report back or commit.
> **Read when:** you think the change is complete.

1. **It works.** Exercise the real behaviour (a test, a request, or the running app). Don't infer it from reading the code.
2. **A test proves it.** New behaviour has a test that fails without the change. Bug fixes get a regression test.
3. **Everything passes:**
   ```bash
   npm run check                 # agent docs, unit, integration, frontend build
   npx playwright test           # if you changed a user journey or page flow
   ```
   On failure, fix the cause. Don't weaken the test, and don't skip a step.
4. **Scope is clean.** `git diff` shows only files the task needs. No drive-by refactors, reformatting,
   dependency bumps or `console.log`. No secrets, `.env` values or real customer data.
5. **Docs moved only if the truth moved:**

   | You changed | Update |
   | :--- | :--- |
   | Schema | `DATA_MODEL.md` |
   | Endpoint, request or response | `API_CONTRACTS.md` |
   | Pricing, booking state, refunds, eligibility | `BUSINESS_RULES.md` |
   | Where code lives (new file or area) | `CODEMAP.md` |
   | A library's major version | `LIBRARIES.md` and the stack map in `AGENTS.md` |
   | An owner decision | new ADR in `DECISIONS.md` (rule R8) |
   | Environment variable | `ENVIRONMENT.md` and `.env.example` (placeholder only) |

6. **Report honestly:** what changed, how you verified it, and anything skipped, unverified or still broken.
7. **Commit only when asked.** Stage specific files (not `git add -A`), because other work may be in the tree.
   Use a conventional message (`feat(scope): ...`, `fix(scope): ...`, `docs: ...`).
