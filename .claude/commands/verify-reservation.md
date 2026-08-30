# Verify Reservation Project

Run the project verification flow and report exact results.

1. Inspect `git status --short --branch`.
2. Run `pnpm build`.
3. Run `pnpm lint`.
4. Run `pnpm test`.
5. If Docker Desktop and the PostgreSQL 18.6 image are available, run `RUN_E2E=1 pnpm test:e2e`.
6. If Docker image pull works, run `docker compose up --build` long enough to confirm postgres, migrate, seed, app startup, `/healthz`, and `/readyz`.
7. Run `pnpm smoke:api` against the compose app.
8. Do not commit or push unless the user explicitly approves after reviewing the changes.

Report failures with the failing command and the first actionable error.
