# Library docs (Context7)

> **Summary:** pinned Context7 IDs for this repo's libraries, matched to the versions we use.
> **Read when:** you need a library or framework API. How *this project* behaves comes from the other docs and the code, not Context7.

Skip `resolve-library-id` and pass these IDs straight to `query-docs`. Keep each
query to one concept. Check the version in the app you are editing first; see the
stack map in `AGENTS.md`.

| Library | Used in | Context7 ID |
| :--- | :--- | :--- |
| Express 4 | backend | `/expressjs/express/4_21_2` |
| zod 4 | backend, frontend | `/colinhacks/zod/v4.0.1` |
| zod 3 | root Next app | `/colinhacks/zod/v3.24.2` |
| React 19 | frontend, root app | `/websites/react_dev_reference` |
| react-router 7 | frontend | `/remix-run/react-router` |
| Vite 8 | frontend | `/vitejs/vite/v8.0.10` |
| Next.js 16 | root app | `/vercel/next.js/v16.2.9` |
| Tailwind CSS 3 | frontend, root app | `/websites/v3_tailwindcss` |
| supabase-js | all | `/supabase/supabase-js` |
| Supabase platform (auth, Postgres, CLI) | all | `/supabase/supabase` |
| better-sqlite3 | backend | `/wiselibs/better-sqlite3` |
| pg (node-postgres) | backend | `/brianc/node-postgres` |
| Node.js (`node:test`, runtime) | backend | `/nodejs/node/v22_20_0` |
| Playwright | e2e | `/microsoft/playwright/v1.61.0` |
| lucide-react | frontend, root app | `/websites/lucide_dev` |

## Known traps

- **Express 4 vs 5:** the Express results mix in Express 5 source. In Express 4,
  a rejected promise in an async handler is **not** passed to `next()`; wrap it or
  use try/catch the way the existing routes do.
- **zod 3 vs 4:** zod 4 adds top-level formats (`z.email()`) and changes error
  customisation. Don't copy zod 4 code into the root Next app, which uses zod 3.
- **Tailwind:** every app is on v3 (`tailwind.config.js`). Ignore v4 `@theme` / CSS-first config examples.

When a dependency's major version changes, update this table in the same change.
