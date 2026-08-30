# Claude Project Instructions

This project is a Node.js/PostgreSQL movie ticket reservation assignment for GC MediEye. `AGENTS.md` is the canonical repository policy; this file is Claude's project entry point and applies the same scope and verification discipline.

## Guidance Role

- `AGENTS.md` owns the shared architecture, safety, and delivery rules.
- This file, `.claude/skills`, and `.claude/commands` turn those rules into a Claude-friendly review checklist.
- Codex and Claude files intentionally have different entry-point wording, but must agree on the seat ownership model, idempotency meaning, API boundary, and verification commands. Run `pnpm guidance:check` after editing guidance.

## Keep Scope Narrow

- Required business APIs only: auth, catalog reads, seat reservation, reservation reads.
- No payment, hold, cancellation, Redis, Kafka, queue, or admin CRUD unless explicitly requested.
- README should describe actual implemented behavior only.

## Seat Reservation Rules

- PostgreSQL is the single source of truth.
- `screening_seats.reservation_id IS NULL` means available.
- Idempotency-Key is for retry correctness after ambiguous outcomes, not for overbooking prevention.
- Reservation mutation must run in one READ COMMITTED transaction.
- Claim idempotency first, then validate screening, then lock seats ordered by `seat_id`, then insert reservation, guarded-update seats, and link idempotency.
- Treat unexpected affected-row counts as internal invariant violations.

## API Boundary

- Business APIs live under `/api/v1`.
- Success responses use `{ success: true, data }`; failures use `{ success: false, error, traceId }`.
- Use `201` when signup or reservation creation returns the created representation, `200` for reads and stateless login, and reserve `204` for a future successful mutation with no body to return.
- The global JWT guard protects endpoints by default. Use `@PublicRoute()` only for signup, login, catalog reads, health, readiness, and local Prometheus `/metrics`.

## Before Reporting Done

Run:

```bash
pnpm build
pnpm lint
pnpm test
```

Run `RUN_E2E=1 pnpm test:e2e`, `docker compose up --build`, and `pnpm smoke:api` when Docker and PostgreSQL 18.6 image access are available. Do not commit or push without explicit user approval.

Treat generated code and prose as review inputs, not final evidence. Inspect the changed invariant, run the closest executable check, and only then make a broader claim in README or a completion report.
