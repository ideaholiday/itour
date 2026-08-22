# Repository Guidelines

## Project Structure & Module Organization
This repository is a full-stack marketplace with three active code areas:

- `app/`: Next.js router pages, API routes, and auth/checkout UI.
- `backend/`: Express API, database layer, migrations, and tests.
- `frontend/`: Vite-based React client.
- `components/`, `lib/`, `supabase/`: shared UI, helpers, validations, and config.
- `backend/test/`: backend tests (`*.test.js`).

## Build, Test, and Development Commands
Run commands from each package root.

- Root app:
  - `npm install`
  - `npm run dev` - start the Next.js app.
  - `npm run build` - create the production build.
  - `npm run start` - run the built app.
  - `npm run lint` - run Next.js lint checks.
- Backend:
  - `cd backend && npm install`
  - `npm run dev` - start the API with file watching.
  - `npm start` - run the API.
  - `npm test` - execute `node:test` suites under `backend/test/`.
  - `npm run migrate:postgres` - migrate SQLite data to Postgres.
- Frontend:
  - `cd frontend && npm install`
  - `npm run dev` - start the dev server.
  - `npm run build` - produce the frontend bundle.
  - `npm run preview` - preview the built output.

## Coding Style & Naming Conventions
Follow the existing style in each package:

- Use 2-space indentation and keep semicolons where they already exist.
- Keep imports at the top and prefer explicit relative paths.
- Use `PascalCase` for React components, `camelCase` for functions and variables, and `*.test.js` for backend tests.
- Match local quoting and module style; the backend uses ESM with double quotes, while the Next.js app often uses single quotes.

## Testing Guidelines
Backend tests live in `backend/test/` and are named `*.test.js`. Add coverage for service logic, API behavior, and database edge cases; keep tests deterministic and avoid live network calls. Run `cd backend && npm test` before opening a PR.

## Commit & Pull Request Guidelines
There is no commit history here, so no repo-specific convention exists yet. Use short, imperative commit subjects such as `backend: fix booking validation`. PRs should include:

- A concise summary of the change and affected area.
- Test results or a note explaining why tests were not run.
- Screenshots or screen recordings for UI changes.
- Any new environment variables, migrations, or setup steps.

## Configuration Tips
Keep secrets in local `.env` files and never commit them. Review `README.md` before changing deployment, payment, or database code.
