# AgentForge Supabase

This directory is the version-controlled source of truth for the AgentForge
database.

## Files

- `migrations/`: ordered schema, security, function, trigger, and index changes.
- `seed.sql`: idempotent reference data for the built-in engine tools.

## Local workflow

With the Supabase CLI and Docker installed:

```sh
supabase start
supabase db reset
```

`db reset` recreates the local database, applies every migration, and then runs
`seed.sql`. Never run a database reset against production.

To apply reviewed migrations to the linked remote project:

```sh
supabase link --project-ref elieqqaxxkzfvyseqhlu
supabase db push
```

Do not commit access tokens, database passwords, generated dumps containing user
data, or environment files. Production changes must be tested in a transaction
or local database before they are applied.

## Production status

`20260725090000_production_baseline.sql` was transaction-tested and applied to
the production project on 2026-07-25. It is idempotent and preserves existing
rows.
