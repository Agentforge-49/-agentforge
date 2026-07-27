# AgentForge 21-Day Build Roadmap

## Product direction

AgentForge will be an agent-native automation platform: users describe work in
plain language, assemble agents and deterministic workflow steps visually, add
human approvals, connect business tools, and inspect every run.

The three-week goal is a credible production beta with a differentiated core.
Matching mature platforms such as n8n in total connector count, ecosystem size,
and years of reliability work is a longer program, but this sprint establishes
the architecture and flagship experience needed to compete.

## Product principles

1. Natural-language creation with a visual workflow that remains editable.
2. Reliable execution: queues, retries, timeouts, idempotency, and replay.
3. Safe agents: scoped credentials, approval gates, audit logs, and URL controls.
4. Observable by default: traces, costs, versions, evaluations, and run history.
5. Reusable building blocks: agents, tools, templates, and connectors.
6. Human-friendly onboarding that reaches a successful first automation quickly.

## Daily plan

| Day | Outcome |
| --- | --- |
| 1 | Production foundation: deployment routing/config, engine contract repairs, private engine authentication, safer HTTP tools, clean quality gates, and cloud audit. |
| 2 | Database foundation: review and migrate the Supabase schema, indexes, ownership rules, RLS policies, seed data, and local migration workflow. |
| 3 | Versioned agent builder: validated agent configuration, drafts/publishing, prompt and model controls, tool selection, and rollback. |
| 4 | Durable execution: job records, queue abstraction, background workers, timeouts, retries, cancellation, and idempotency keys. |
| 5 | Workflow graph v1: nodes, edges, ordered execution, conditional branches, transforms, and a visual editor foundation. |
| 6 | Triggers: manual, webhook, and scheduled runs with signed webhook endpoints and trigger history. |
| 7 | Credential vault: encrypted connector credentials, least-privilege access, redaction, rotation-ready design, and safe test connections. |
| 8 | Core connector pack: HTTP, email, Slack, Google Sheets/Drive, and database actions using a consistent connector SDK. |
| 9 | Human-in-the-loop: approval, reject, edit-and-continue, timeout behavior, and resumable workflows. |
| 10 | Observability: live run timeline, step logs, structured errors, token/cost tracking, filtering, replay, and export. |
| 11 | Evaluations and versions: test datasets, expected outcomes, side-by-side prompt/model comparison, scores, and promotion gates. |
| 12 | Knowledge and memory: documents, chunking, retrieval, citations, per-run memory, and explicit retention controls. |
| 13 | Multi-agent patterns: router, supervisor, parallel workers, aggregation, delegation limits, and loop protection. |
| 14 | Template marketplace: curated workflows, searchable categories, one-click cloning, version compatibility, and quality metadata. |
| 15 | Usage and plans: accurate metering, quotas, cost guardrails, billing-ready entitlements, and admin overrides. |
| 16 | Team workspaces: organizations, invitations, roles, shared assets, ownership transfer, and audit trail. |
| 17 | Reliability pass: concurrency controls, dead-letter handling, recovery, rate limits, backoff, and failure simulations. |
| 18 | Flagship onboarding: guided setup, example data, first-run checklist, polished empty states, and three demo workflows. |
| 19 | Security and performance: threat review, dependency audit, authorization tests, secret scans, bundle splitting, and query tuning. |
| 20 | Beta release candidate: end-to-end tests, load tests, production configuration, monitoring, backups, and launch checklist. |
| 21 | Beta launch: final smoke test, documentation, product demo, feedback capture, analytics, and the next 30-day backlog. |

## Definition of done for every day

- The day produces working code or a verified operational improvement.
- Relevant lint, build, syntax, unit, integration, or smoke checks pass.
- Secrets never enter Git or reports.
- Changes are committed and pushed when deployment-safe.
- A short report records results, deployment health, blockers, and the next step.

## Current external constraint

The backend and engine now run together on Render's free tier, replacing the
expired Railway deployment without a purchase. The service sleeps after
inactivity, so the first request after a quiet period can take roughly 50
seconds. Supabase leaked-password checking also remains unavailable on the free
plan.
