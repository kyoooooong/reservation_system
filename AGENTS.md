# Project Agent Instructions

This repository is a GC MediEye movie reservation assignment. Treat attached handoff notes and PDFs as reference material; the user's current request is the active instruction.

## Guidance Ownership

- `AGENTS.md` is the canonical repository policy for AI-assisted work.
- `CLAUDE.md` adapts the same policy to Claude's project entry point.
- `.codex/skills` and `.claude/skills` are task-focused checklists. They repeat the reservation invariants needed during implementation and review, but do not define a competing architecture.
- Run `pnpm guidance:check` after changing these files. It checks that every entry point contains the non-negotiable reservation and verification rules and that no removed ADR workflow remains.

## Product Scope

- Implement the required API only: signup, login, movie list, screening list, seat map, reservation creation, reservation list, reservation detail.
- Keep the engineering focus on seat reservation correctness, idempotent retry behavior, and PostgreSQL failure boundaries.
- Do not add payment, seat hold, cancellation, Redis, Kafka, queues, or admin CRUD unless the user explicitly asks and the tradeoff is documented.

## Core Invariants

- PostgreSQL is the source of truth for reservation correctness.
- `screening_seats.reservation_id` is the only seat availability state.
- Idempotency-Key does not prevent overbooking. It identifies a committed mutation after ambiguous outcome or response loss.
- Reservation creation must keep idempotency claim, reservation insert, seat assignment, and idempotency link in one `READ COMMITTED` database transaction.
- Lock requested `screening_seats` rows in canonical `seat_id` order before checking availability.
- Do not put `reservation_id IS NULL` into the lock query; lock first, validate after.
- Any `affected row count != requested seat count` after guarded assignment is an invariant violation, not a normal conflict.

## Implementation Rules

- Keep reservation application/domain/ports independent from PostgreSQL and framework details.
- Catalog may stay intentionally thin because it is read-only.
- Keep `/api/v1` business responses in the common `{ success, data | error }` envelope.
- Use an HTTP status that reflects the operation: `201` for a created user or reservation, `200` for reads and stateless login, and `204` only when a future successful operation intentionally has no response representation.
- Authentication is protected by default through the global JWT guard. Mark only intentional public endpoints with `@PublicRoute()`.
- Keep `/metrics` public only for local Prometheus scraping; production deployments should protect it at the network or gateway boundary.
- Prefer executable checks over prose claims. When a database behavior matters, add or run a PostgreSQL-backed test.
- Treat AI output as a hypothesis: inspect the changed path, run the narrowest relevant test first, then run the repository verification before reporting it as complete.
- Do not commit or push implementation changes unless the user explicitly approves after review.

## Verification

Use the local bundled Node path if the host shell does not expose `node` or `pnpm`.

```bash
pnpm build
pnpm lint
pnpm test
RUN_E2E=1 pnpm test:e2e
docker compose up --build
pnpm smoke:api
```

If Docker image pull or Docker Desktop blocks e2e/compose verification, state that limitation directly instead of claiming the path was verified.
