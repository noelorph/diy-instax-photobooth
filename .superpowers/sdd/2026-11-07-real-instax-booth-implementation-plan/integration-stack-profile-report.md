# Fixed integration test-stack profile

2026-11-09. Implementation only; no stack was started and no database or migration was changed.

## Scope and behavior

- Added `INSTAX_TEST_PROFILE=integration` through the shared selector used by startup and fixture discovery. It fixes project `diy-instax-integration-verification`, resolved `.worktrees/instax-verification-stack`, API/Mailpit 60321/60324 and generated port range 60320–60329. Historical 5932x ports are not used.
- Unknown nonempty profiles and conflicting integration workdirs fail before any subprocess or startup writes. Equivalent resolved workdirs are accepted. No URL, port or project environment override was added.
- Default discovery remains ordinary 56321; existing `INSTAX_TEST_WORKDIR` discovery remains retirement 58321. Default startup remains retirement at `.worktrees/verification-stack`.
- Startup checks the base project/API identity, refuses differing existing generated config before writes, preserves empty seed paths, and retains additive migration copying and existing service exclusions. Exact API, Docker project-label, Live/unresolved and nonempty-Event discovery guards remain intact. No reset, stop or delete action was added.
- Changes reach only the shared selector, startup script, focused unit tests and current setup evidence. Existing local-supabase/browser/admin fixtures consume the selector already; no application, migration, config, package-script, dependency, hardware, owner environment or hosted setting change was needed.

## Red/green and verification

- Read local Supabase skill and TDD guidance. Reviewed the current Supabase CLI reference at https://supabase.com/docs/reference/cli/supabase-start. Changelog retrieval was unavailable (web content-type failure, shell DNS restriction). `node_modules/.bin/supabase start --help` failed before help because the installed CLI attempted a sandbox-prohibited owner telemetry write; no startup was invoked.
- Wrote selection/guard tests before implementing: `npm test -- tests/unit/test-stack.test.ts` was red, 9 failed / 8 passed, for missing integration selection/profile validation and consequent guard mismatches. After implementation those 17 tests passed.
- Added startup generation/conflict and further boundary tests against real script execution with only filesystem mutation/subprocess boundaries mocked. Startup coverage caught an invalid edit, which was corrected before proceeding. Final focused run: **24 passed**. Tests verify all active generated ports (including shadow DB/pooler), no-seed behavior, exact startup command, default retirement startup, matching workdir normalization, API/project mismatch rejection and each retained-work rejection.
- Final `node_modules/.bin/tsc --noEmit`: passed.
- Final scoped `node_modules/.bin/eslint tests/fixtures/test-stack.mjs tests/fixtures/start-verification-stack.mjs tests/unit/test-stack.test.ts`: passed.
- Final scoped `node_modules/.bin/prettier --check` on those files: passed. `git diff --check`: passed.
- Self-review: preserved existing discovery SQL and all guards unchanged; reviewed shared callers and generated port mapping. No Next.js feedback candidate arose.

## Coordinator commands and remaining limits

After reviewing this change and checking that the entire port range and project/container/volume names are available, initially use a fresh fixture directory:

```sh
INSTAX_TEST_PROFILE=integration node tests/fixtures/start-verification-stack.mjs
INSTAX_TEST_PROFILE=integration npm test
```

Use the same profile for existing Playwright commands. Do not reset, stop, settle or delete either existing populated stack. If the new stack has retained Events or unresolved work, discovery refuses it; do not bypass that refusal.

Full `npm test` was deliberately not run because integration hooks invoke Docker/database fixture discovery, contrary to this task's no-Docker phase. Live startup, port/container/volume availability, migration application, SQL checks, full tests and browser verification remain for the coordinator. No browser check is required for this fixture-only change. Additive chain copying is still not F8 baseline acceptance; reused directories can retain removed migration files, and reused volumes do not guarantee an empty/current schema. Physical/iPad and other product gates remain open.
