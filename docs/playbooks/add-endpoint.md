# Playbook: add or change an API endpoint

> **Summary:** route, validation, auth, service, test and docs for an Express endpoint, in this repo's style.
> **Read when:** adding or changing anything under `/api`. Also read `docs/SECURITY.md` §1 and §3.

1. **Find the router.** Use `docs/CODEMAP.md`. Every router is mounted twice (`/api` and `/api/v1`) by
   `mountApiRoutes()` in `backend/src/server.js`. Add a new router file only for a new area, and mount it there.
2. **Validate input.** Add a zod 4 schema to `backend/src/validators/apiSchemas.js` next to its area
   (use the local `object`, `text`, `optionalText` helpers). Apply it with `validateBody(schema)`
   (or `validateQuery` / `validateParams`) from `middleware/validation.js`.
3. **Authorize.** `authenticate` then `requireRoles("ADMIN", ...)` from `middleware/auth.js`.
   Supplier routes also check the user owns that supplier (`requireSupplierSelf` in `auth.js`, `requireSupplierAccess` in
   `routes/suppliers.js`). Never trust client-sent ids, roles or totals.
4. **Keep the route thin.** Business logic and transactions go in `backend/src/services/<x>Service.js`.
   Services throw errors with a `status`; the route maps them (see `failure()` in `routes/enquiries.js`).
5. **Respond consistently:** `{ success: true, ... }` on success, and `{ error, code? }` with the right HTTP status on failure.
   Never echo secrets, OTPs or full PII. Log with `logger` and include `req.requestId`.
6. **Express 4 trap:** async handlers need their own `try/catch`. A rejected promise is **not** passed to `next()`.
7. **Money or booking state?** The backend computes it inside a transaction. Re-read `BUSINESS_RULES.md` first.
8. **Test it:**
   - Service logic: a unit test in `backend/test/<service>.test.js`.
   - The HTTP contract (auth, status codes, body): a journey in `backend/integration/` using
     `startTestServer()` / `requestJson()` from `integration/helpers/serverHarness.js`.
   - Include at least one refused case (401/403/400).
9. **Frontend caller:** add it to `frontend/src/lib/api.js` rather than calling `fetch` from a page.
10. **Document it** in `docs/API_CONTRACTS.md` (path, role, request, response, errors), and in CODEMAP if it's a new area.
11. **Finish** with [finish-task.md](finish-task.md).
