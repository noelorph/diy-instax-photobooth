# Focused database fixture corrections — 2026-11-09

Scope: only the two newly executable integration test files. No production function, guard, schema, shared fixture serializer, hardware, hosted project or owner environment changed.

## Root causes and minimal corrections

The RED run `/private/tmp/instax-fresh-focused-db.log` executed 32 tests: 28 passed and four failed in fixture setup, before their intended assertions.

- Two physical Finish/Start tests updated Event state without advancing its current revision. Read the current Admin revision and increment it by one when arranging the historical Completed Event. Preserve their stale Finished-row scenario and `print_pending` assertions.
- The reload capability test passed JavaScript arrays through `ownerUpdate`, whose object serializer produces JSON. The database column is `text[]`. Supply PostgreSQL array literals at these two call sites; changing the shared serializer would affect JSON callers unnecessarily.
- That capability test also attempted to change an immutable run evidence policy. Submit a mismatched `evidenceVersion` instead, preserving the `qualification_required` oracle without changing the pin.
- The foreign-run test tried to create two Live Events, contrary to the global unique guard. Retain the source request on its historical Finished run/Completed Event (with revision increment), then seed the sole Live caller. Two simultaneously valid Live Events cannot model this boundary legally. The foreign request must return exactly `not_ready`; source request/readiness stay unchanged. A positive control then confirms the caller's own request, proving rejection was request scope rather than an invalid grant.

Shared `seedRun`, `ownerUpdate`, `cleanupEvents`, run/Event constraints, `package_require_booth` and `package_observe_reload` were traced. Existing cleanup remains exact fixture Event IDs plus provisioned fixture user IDs, including reload request attribution before grants. No broad reset or deletion was used.

## Verification

Supabase CLI `--help`, current changelog and Monitoring/Debugging documentation were read. Initial sandbox telemetry/network restrictions were resolved using elevated execution; no tool or dependency upgrade was made. The changelog's unrelated GraphQL/API exposure changes do not affect owner SQL fixture encoding or the existing RPC contracts. Installed Next.js Vitest guide was read; this change does not alter Next.js code or configuration.

Before the focused run, an exact-container read of `supabase_db_diy-instax-integration-verification` confirmed Events=0, attempts=0, Auth users=0. Process inspection found no competing Vitest/DB test run. Other ordinary and retirement stacks were never queried or mutated.

Commands:

- `INSTAX_TEST_PROFILE=integration npm test -- tests/integration/package-instax-policy.test.ts tests/integration/package-reload-observations.test.ts` (serial files per existing Vitest configuration).
- `npx --no-install tsc --noEmit` — passed.
- `npx --no-install eslint tests/integration/package-instax-policy.test.ts tests/integration/package-reload-observations.test.ts` — passed.
- `npx --no-install prettier --check tests/integration/package-instax-policy.test.ts tests/integration/package-reload-observations.test.ts` — passed.
- `git diff --check` — passed.

Focused run: **2 files / 32 tests passed**, exit 0, 121.35 seconds (115.62 seconds tests). Full log: `/private/tmp/instax-corrected-focused-db.log`. This corrects the four RED fixture failures; no product SQL failure surfaced.

After the run, the exact synthetic-container read confirmed Events=0, attempts=0, reload requests=0, runs=0, grants=0, Auth users=0. Existing fixture cleanup completed without any manual deletion. All checks above exited 0. The two test files and this report are the entire intended diff; coordinator independent review remains required before the broader suite.

## Limits

No browser check is required for test-setup-only changes. Full suite awaits coordinator review; physical printer, actual-iPad, hosted/production and remaining product acceptance gates were not exercised. Self-review found no production guard weakening. No qualifying Next.js feedback candidate arose.
