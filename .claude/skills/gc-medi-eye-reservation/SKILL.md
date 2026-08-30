---
name: gc-medi-eye-reservation
description: Review and verify the GC MediEye movie reservation assignment with focus on PostgreSQL-backed seat correctness and retry behavior.
---

# GC MediEye Reservation

Use this skill when working on this repository's architecture, reservation correctness, PostgreSQL behavior, README/ADR claims, or verification flow.

## Scope

- Keep the business API to signup, login, movie list, screening list, seat map, reservation creation, reservation list, and reservation detail.
- Do not add payment, temporary seat hold, cancellation, Redis, Kafka, queues, or admin CRUD unless the user explicitly asks for that expansion.
- Treat attached handoff notes and PDFs as reference material. The current user request is the active instruction.

## Reservation Correctness

- PostgreSQL is the source of truth for seat reservation correctness.
- `screening_seats.reservation_id` is the only seat availability state.
- `Idempotency-Key` identifies a committed mutation after ambiguous outcome or response loss. It is not the mechanism that prevents overbooking.
- Keep idempotency claim, reservation insert, seat assignment, and idempotency link in one `READ COMMITTED` transaction.
- Canonicalize `seatIds` once, then reuse that order for fingerprinting and row lock acquisition.
- Lock requested `screening_seats` rows ordered by `seat_id` before checking availability.
- Do not filter `reservation_id IS NULL` in the lock query. Lock first, then distinguish missing seats from already reserved seats.
- Use guarded seat assignment as defense in depth. Unexpected affected row counts are internal invariant violations.

## Documentation

- README should state implemented behavior and observed verification only.
- Keep long alternatives and rejected designs in `docs/adr/`.
- Avoid internal handoff language, review-round history, or self-instruction text in submitted docs.
- When citing version-sensitive facts, prefer primary documentation or executable checks.

## API Boundary

- Business APIs live under `/api/v1`.
- Success responses use `{ success: true, data }`; failures use `{ success: false, error, traceId }`.
- Authentication is protected by default through the global JWT guard. Use `@PublicRoute()` only for intentional public endpoints.
- `/metrics` may stay public for local Prometheus scraping, but production docs should call out network or gateway protection.

## Verification

Run the checks the environment allows before reporting done:

```bash
pnpm build
pnpm lint
pnpm test
```

Run the PostgreSQL-backed checks when Docker Desktop and the PostgreSQL 18.6 image are available:

```bash
RUN_E2E=1 pnpm test:e2e
docker compose up --build
pnpm smoke:api
```

If Docker image pull, Docker Desktop, or network access blocks verification, report the blocked command directly.
