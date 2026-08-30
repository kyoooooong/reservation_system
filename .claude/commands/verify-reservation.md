# Verify Reservation Project

Run the project verification flow and report exact results.

1. Inspect `git status --short --branch`.
2. Run `pnpm guidance:check` when repository guidance changed.
3. Run `pnpm build`.
4. Run `pnpm lint`.
5. Run `pnpm test`.
6. If Docker Desktop and the PostgreSQL 18.6 image are available, run `RUN_E2E=1 pnpm test:e2e`.
7. If Docker image pull works, run `docker compose up --build` long enough to confirm postgres, migrate, seed, app startup, `/healthz`, and `/readyz`.
8. Run `pnpm smoke:api` against the compose app.
9. Do not commit or push unless the user explicitly approves after reviewing the changes.

Report failures with the failing command and the first actionable error.
