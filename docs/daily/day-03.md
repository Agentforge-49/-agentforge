# Day 3 Report — Versioned Agent Builder

Date: 2026-07-26

## Audited

- Reviewed all six production agents, their tool links, and all 21 historical
  runs before migration.
- Confirmed every existing agent was still in the legacy `draft` state and had
  no version record.
- Preserved existing runnable behavior by promoting each legacy agent into an
  immutable published version 1.

## Built

- Added immutable `agent_versions` snapshots with sequential version numbers,
  source-version lineage, change summaries, tool snapshots, and publish times.
- Added explicit agent lifecycle metadata for draft changes, the current
  published version, latest version number, and pause/resume state.
- Added atomic database functions for publishing and rollback.
- Added run-to-version foreign keys and backfilled all historical runs.
- Added backend validation for names, prompts, categories, personalities,
  supported models, temperature, token limits, and tool identifiers.
- Made new agents drafts that cannot run until they are published.
- Made published runs use the immutable version snapshot instead of mutable
  draft fields.
- Made chain execution load immutable published agent versions and reject
  unpublished agents.
- Added edit, publish, version-history, rollback, pause, and resume workflows to
  the frontend.
- Added published-version visibility to run results and run history.
- Limited model selection to the two models currently supported by the engine.

## Verified

- Backend configuration unit tests: 5 passed.
- Backend JavaScript syntax checks: passed.
- Frontend lint: passed.
- Frontend production build: passed.
- Database migration transaction dry run: passed.
- Production migration: passed atomically.
- Production lifecycle test: publish v1, publish v2, rollback to v1 as v3, and
  immutable-update rejection all passed.
- Temporary production lifecycle test data: removed successfully.
- Production data after migration: 6 agents, 6 versions, and 21
  version-traceable runs.
- Existing agents published as active version 1: 6 of 6.

## Blockers

- The free Render instance sleeps after inactivity, so the first production
  request after a quiet period can take roughly 50 seconds.
- Supabase leaked-password checking requires a paid plan and remains disabled.
- The frontend build still reports a non-blocking large-bundle warning; bundle
  splitting is planned for the security and performance pass.
- The latest React Router release still carries a high-severity advisory in its
  server-component action path. AgentForge uses client-side routing and does
  not use that affected feature, but the advisory remains tracked until an
  upstream patched release is available.

## Next priority

Build durable execution: job records, queue and worker abstractions,
idempotency keys, timeouts, retries, cancellation, and a foundation that can
move safely from the free single-service deployment to independent workers.
