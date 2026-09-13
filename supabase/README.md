# supabase/ — legacy CLI folder

**Do not use `supabase/migrations/` for schema changes.** Nothing runs these files.

- They are an early UUID-based design for the `public` schema, from August 2026.
  The Supabase project has no CLI migration history, and its `public` tables
  from this design are empty. `public.profiles` (the auth trigger file) was never applied.
- The live schema is `marketplace`, built by `backend/migrations/` through
  `runPendingMigrations()` at API startup. See `docs/DATA_MODEL.md`.
- `config.toml` is only for running Supabase locally with the CLI.
