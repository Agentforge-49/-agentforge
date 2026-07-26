# Day 2 Report — Database Foundation

Date: 2026-07-25

## Audited

- Inventoried all eight production tables, columns, indexes, constraints, RLS
  policies, grants, functions, and triggers.
- Confirmed existing production data was consistent before migration:
  2 profiles, 6 agents, 8 agent-tool links, 20 agent runs, 2 chains, 5 chain
  runs, 6 templates, and 7 tools.
- Confirmed zero agent-run, chain-run, chain-agent, or branch ownership
  mismatches.

## Built

- Added an idempotent, version-controlled Supabase production baseline.
- Added a repeatable seed file for all seven built-in engine tools.
- Added missing nonnegative, token-limit, and minimum-chain constraints.
- Added composite ownership foreign keys for runs, chains, and branches.
- Added a database trigger that rejects missing, duplicate, or cross-owner
  agents in a chain.
- Added query indexes for user, agent, chain, and chronological run lookups.
- Added automatic `updated_at` triggers.
- Secured the signup trigger with an empty search path and conflict-safe profile
  creation.
- Rebuilt all RLS policies with explicit roles.
- Removed anonymous write grants and restricted profile writes so users cannot
  change their own subscription tier, API quota, or usage counter.
- Added atomic database functions for API and template usage counters.
- Updated the backend to use atomic counters and validate chain ownership.
- Fixed branch fields being silently discarded when creating a chain.
- Fixed the agent-run-history route being shadowed by the generic run route.
- Raised the Supabase minimum password length from 6 to 8.
- Enabled recent reauthentication and current-password checks for password
  changes.

## Verified

- Migration transaction dry run: passed.
- Production migration: passed atomically.
- Production RLS tables: 8.
- Production RLS policies: 10.
- Required new constraints: 9 of 9.
- Anonymous write grants: 0.
- Protected profile quota and subscription columns: not client-updatable.
- Production data counts after migration: unchanged.
- Supabase Security Advisor: 0 errors.
- Backend JavaScript syntax: passed.
- Frontend lint: passed.
- Frontend production build: passed.

## Blockers

- Supabase leaked-password checking requires a Pro plan, so it remains disabled.
  No purchase was made.
- Railway still requires plan reactivation before the backend and engine can run
  in production.

## Next priority

Build the versioned agent configuration and publishing model: immutable agent
versions, draft/published states, validated configuration contracts, rollback,
and run-to-version traceability.
