# Production migration reconciliation

This directory is reconciled from the linked Supabase production migration history for project `lueomnmkbbrllxbnpxph`.

- Production migration entries captured: 25
- Source: `supabase_migrations.schema_migrations`
- Timestamped SQL files are historical snapshots of migrations already applied in production.
- Do **not** re-apply these historical snapshots directly to production.
- Future schema changes should be created as new migrations and validated in a controlled development branch/local database before promotion.
- Runtime credentials are not stored in these snapshots. Migration 009 generates the automation runner secret at execution time.

Reconciled against production on 2026-09-30.
