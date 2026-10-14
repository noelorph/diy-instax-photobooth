# Task 2 report — Draft-only storage and authorization

## Scope and implementation

Implemented the approved Task 2 brief and ADR-0014 without adding operational tables or changing product decisions.

- `supabase/migrations/20261014053345_draft_events.sql`: CLI-generated migration with UUID Event identity, Draft-only state, independent inline Client snapshots, venue/time zone, finite UTC instants, nonnegative PostgreSQL integer counts, revision, and stable Draft schedule index `(starts_at, id)`.
- `tests/integration/draft-events-rls.test.ts`: 28 tests through real local Auth and the Data API, reusing the local-only fixture. The first test additionally passes the approved Task 1 parser's UTC conversion into persistence. No app persistence service exists yet; that remains Task 3.

Column contract: `id`, `state`, `title`, `client_name`, `client_email`, `client_phone`, `venue_address`, `time_zone`, `starts_at`, `ends_at`, `film_package_count`, `original_print_allowance`, `revision`.

Counts support 0 through 2147483647 independently. Defaults are `state = 'Draft'` and `revision = 1`. The private invoker trigger requires an initial revision of 1 and exactly `OLD.revision + 1` on updates. Omitting revision, replaying the previous next revision, and skipping a revision fail directly at the Data API. SQLSTATE is 23514; Task 3 should still filter updates by ID and old revision to identify ordinary conflicts from zero returned rows.

Authorization reuses `private.is_active_admin()` for SELECT, INSERT, and UPDATE, with both USING and WITH CHECK on UPDATE. Explicit revocation precedes explicit grants. Authenticated clients can create/read/edit but cannot DELETE or reassign IDs. Signed-out requests have no table privileges; authenticated non-Admin, revoked-session, and removed-allowlist requests cannot read/create/edit. The trusted service role retains maintenance privileges for fixture cleanup and administrative operations; it is never used by the application or public request tests.

Database guards reject non-Draft states, blank required text, malformed email shape, unknown PostgreSQL time-zone names, nonfinite timestamps, invalid schedule ordering, and negative/fractional/out-of-range counts. App parsing remains responsible for strict email validation and converting local times with DST ambiguity/gap rejection; stored instants themselves are unambiguous. No Client, Booth, printing, or stock tables were added.

## Process and evidence

Read AGENTS.md, PRD/architecture, the approved Draft spec and ADR-0014, the local Supabase skill, TDD guidance, and installed Next.js data-security guide. Verified Supabase 2.120.0 command help for migration generation, reset, migration history, and advisors. Reviewed the current Supabase changelog and RLS documentation, including the explicit-grants change:

- https://supabase.com/changelog.md
- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes
- https://supabase.com/docs/guides/database/postgres/row-level-security

The repository uses imperative migrations. Generated the filename with `npx supabase migration new draft_events`, then replayed the complete local history with `npx supabase db reset --local --yes`. No remote mutation or remote application data access occurred. `npx supabase migration list --local` confirms both 20261014030642 and 20261014053345 applied.

RED: `npm test -- tests/integration/draft-events-rls.test.ts` exited 1, with all 28 failing because `public.events` was absent (`PGRST205`).

GREEN: The same focused command after clean replay exited 0, with all 28 passing. `npx supabase db advisors --local` exited 0 and reported no issues. `npx tsc --noEmit`, focused ESLint, Prettier check, and diff whitespace checks also exited 0.

The first full `npm test` run had 141 passes and one failure: existing `Public password reset form > offers labeled new passwords, persistent validation and preserves values for retry` exceeded its 5000 ms timeout. The unchanged isolated file rerun passed 4/4; the affected test took 411 ms. No unrelated code or timeout adjustment was made. A full repeat was requested to resolve this concrete verification risk and passed: 10 files, 142 tests, exit 0 (48.79 seconds). The initial timeout did not recur. Both outputs are retained below.

## Self-review and concerns

Reviewed table scope, grants, policy authorization, trigger privilege/search-path handling, update atomicity, independent snapshots, count bounds, index ordering, cleanup, and direct bypass tests. No implementation concern found within Task 2. PostgreSQL and the app runtime maintain their own time-zone databases; canonical IANA zones used in tests agree. Required form/server validation and Draft list/detail pages remain later tasks.

The Supabase CLI initially needed escalation for Docker/telemetry access outside the filesystem sandbox, then succeeded normally. No qualifying Next.js feedback candidate arose in this SQL/test task; the reporting pass has nothing to submit.

## Command output

Full RED, GREEN, clean replay, advisors, full-suite and isolated retry outputs follow.

### red

Command: `npm test -- tests/integration/draft-events-rls.test.ts`

```text

> diy-instax-photobooth@0.1.0 test
> vitest run tests/integration/draft-events-rls.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ❯ tests/integration/draft-events-rls.test.ts (28 tests | 28 failed) 18834ms
   × Draft Event storage through local Auth and the Data API > persists parsed booking values, defaults to Draft revision 1, and edits every booking field 813ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > retains independent Client snapshots for two Events 573ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > denies signed-out list, detail, create, update, and delete requests 620ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > denies non-Admin list, detail, create, update, and delete requests 696ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > denies revoked-session list, detail, create, update, and delete requests 511ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > denies removed-Admin list, detail, create, update, and delete requests 554ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > denies Admin deletion and identity reassignment 690ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects Live on both insert and update 532ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects Completed on both insert and update 518ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects Cancelled on both insert and update 628ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects negative package count without changing the saved row 543ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects fractional package count without changing the saved row 541ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects overflow package count without changing the saved row 571ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects negative allowance without changing the saved row 525ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects fractional allowance without changing the saved row 679ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects overflow allowance without changing the saved row 536ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects end before start without changing the saved row 529ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects equal start and end without changing the saved row 644ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects infinite start without changing the saved row 515ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects blank title without changing the saved row 581ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects blank Client name without changing the saved row 565ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects invalid email without changing the saved row 602ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects blank phone without changing the saved row 467ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects blank venue without changing the saved row 590ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects unknown zone without changing the saved row 519ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > rejects null required field without changing the saved row 499ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > accepts the maximum whole count for both independent counts 697ms
     → expected { code: 'PGRST205', …(3) } to be null
   × Draft Event storage through local Auth and the Data API > requires revision 1 on creation and exactly one increment for every direct update 520ms
     → expected 'PGRST205' to be '23514' // Object.is equality

⎯⎯⎯⎯⎯⎯ Failed Tests 28 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > persists parsed booking values, defaults to Draft revision 1, and edits every booking field
AssertionError: expected { code: 'PGRST205', …(3) } to be null

- Expected:
null

+ Received:
{
  "code": "PGRST205",
  "details": null,
  "hint": null,
  "message": "Could not find the table 'public.events' in the schema cache",
}

 ❯ tests/integration/draft-events-rls.test.ts:78:28
     76|       .select()
     77|       .single();
     78|     expect(inserted.error).toBeNull();
       |                            ^
     79|     expect(inserted.data).toMatchObject({ ...booking, state: 'Draft', …
     80|     const changes = {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/28]⎯

 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > retains independent Client snapshots for two Events
AssertionError: expected { code: 'PGRST205', …(3) } to be null

- Expected:
null

+ Received:
{
  "code": "PGRST205",
  "details": null,
  "hint": null,
  "message": "Could not find the table 'public.events' in the schema cache",
}

 ❯ create tests/integration/draft-events-rls.test.ts:50:26
     48|   async function create(client: SupabaseClient) {
     49|     const result = await client.from('events').insert(payload()).selec…
     50|     expect(result.error).toBeNull();
       |                          ^
     51|     return result.data!;
     52|   }
 ❯ tests/integration/draft-events-rls.test.ts:110:19

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/28]⎯

 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > denies signed-out list, detail, create, update, and delete requests
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > denies non-Admin list, detail, create, update, and delete requests
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > denies revoked-session list, detail, create, update, and delete requests
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > denies removed-Admin list, detail, create, update, and delete requests
AssertionError: expected { code: 'PGRST205', …(3) } to be null

- Expected:
null

+ Received:
{
  "code": "PGRST205",
  "details": null,
  "hint": null,
  "message": "Could not find the table 'public.events' in the schema cache",
}

 ❯ create tests/integration/draft-events-rls.test.ts:50:26
     48|   async function create(client: SupabaseClient) {
     49|     const result = await client.from('events').insert(payload()).selec…
     50|     expect(result.error).toBeNull();
       |                          ^
     51|     return result.data!;
     52|   }
 ❯ tests/integration/draft-events-rls.test.ts:137:21

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/28]⎯

 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > denies Admin deletion and identity reassignment
AssertionError: expected { code: 'PGRST205', …(3) } to be null

- Expected:
null

+ Received:
{
  "code": "PGRST205",
  "details": null,
  "hint": null,
  "message": "Could not find the table 'public.events' in the schema cache",
}

 ❯ create tests/integration/draft-events-rls.test.ts:50:26
     48|   async function create(client: SupabaseClient) {
     49|     const result = await client.from('events').insert(payload()).selec…
     50|     expect(result.error).toBeNull();
       |                          ^
     51|     return result.data!;
     52|   }
 ❯ tests/integration/draft-events-rls.test.ts:182:19

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/28]⎯

 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects Live on both insert and update
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects Completed on both insert and update
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects Cancelled on both insert and update
AssertionError: expected { code: 'PGRST205', …(3) } to be null

- Expected:
null

+ Received:
{
  "code": "PGRST205",
  "details": null,
  "hint": null,
  "message": "Could not find the table 'public.events' in the schema cache",
}

 ❯ create tests/integration/draft-events-rls.test.ts:50:26
     48|   async function create(client: SupabaseClient) {
     49|     const result = await client.from('events').insert(payload()).selec…
     50|     expect(result.error).toBeNull();
       |                          ^
     51|     return result.data!;
     52|   }
 ❯ tests/integration/draft-events-rls.test.ts:197:21

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/28]⎯

 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects negative package count without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects fractional package count without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects overflow package count without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects negative allowance without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects fractional allowance without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects overflow allowance without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects end before start without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects equal start and end without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects infinite start without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects blank title without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects blank Client name without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects invalid email without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects blank phone without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects blank venue without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects unknown zone without changing the saved row
 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > rejects null required field without changing the saved row
AssertionError: expected { code: 'PGRST205', …(3) } to be null

- Expected:
null

+ Received:
{
  "code": "PGRST205",
  "details": null,
  "hint": null,
  "message": "Could not find the table 'public.events' in the schema cache",
}

 ❯ create tests/integration/draft-events-rls.test.ts:50:26
     48|   async function create(client: SupabaseClient) {
     49|     const result = await client.from('events').insert(payload()).selec…
     50|     expect(result.error).toBeNull();
       |                          ^
     51|     return result.data!;
     52|   }
 ❯ tests/integration/draft-events-rls.test.ts:227:19

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/28]⎯

 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > accepts the maximum whole count for both independent counts
AssertionError: expected { code: 'PGRST205', …(3) } to be null

- Expected:
null

+ Received:
{
  "code": "PGRST205",
  "details": null,
  "hint": null,
  "message": "Could not find the table 'public.events' in the schema cache",
}

 ❯ tests/integration/draft-events-rls.test.ts:252:26
    250|       .select()
    251|       .single();
    252|     expect(result.error).toBeNull();
       |                          ^
    253|     expect(result.data).toMatchObject({
    254|       film_package_count: 2147483647,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/28]⎯

 FAIL  tests/integration/draft-events-rls.test.ts > Draft Event storage through local Auth and the Data API > requires revision 1 on creation and exactly one increment for every direct update
AssertionError: expected 'PGRST205' to be '23514' // Object.is equality

Expected: "23514"
Received: "PGRST205"

 ❯ tests/integration/draft-events-rls.test.ts:261:94
    259|   it('requires revision 1 on creation and exactly one increment for ev…
    260|     const owner = await admin();
    261|     expect((await owner.client.from('events').insert(payload({ revisio…
       |                                                                                              ^
    262|       '23514'
    263|     );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/28]⎯


 Test Files  1 failed (1)
      Tests  28 failed (28)
   Start at  13:33:23
   Duration  20.53s (transform 119ms, setup 0ms, collect 416ms, tests 18.83s, environment 0ms, prepare 291ms)


```

### reset

Command: `npx supabase db reset --local --yes`

```text
Resetting local database...
Recreating database...
Initialising schema...
Seeding globals from roles.sql...
Applying migration 20261014030642_admin_authorization.sql...
Applying migration 20261014053345_draft_events.sql...
Restarting containers...
Finished supabase db reset on branch codex/issue-14-admin-foundation.
{"target":"local","version":"","message":"Reset local database."}

```

### green

Command: `npm test -- tests/integration/draft-events-rls.test.ts`

```text

> diy-instax-photobooth@0.1.0 test
> vitest run tests/integration/draft-events-rls.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ✓ tests/integration/draft-events-rls.test.ts (28 tests) 24873ms
   ✓ Draft Event storage through local Auth and the Data API > persists parsed booking values, defaults to Draft revision 1, and edits every booking field  1188ms
   ✓ Draft Event storage through local Auth and the Data API > retains independent Client snapshots for two Events  653ms
   ✓ Draft Event storage through local Auth and the Data API > denies signed-out list, detail, create, update, and delete requests  561ms
   ✓ Draft Event storage through local Auth and the Data API > denies non-Admin list, detail, create, update, and delete requests  1131ms
   ✓ Draft Event storage through local Auth and the Data API > denies revoked-session list, detail, create, update, and delete requests  808ms
   ✓ Draft Event storage through local Auth and the Data API > denies removed-Admin list, detail, create, update, and delete requests  657ms
   ✓ Draft Event storage through local Auth and the Data API > denies Admin deletion and identity reassignment  597ms
   ✓ Draft Event storage through local Auth and the Data API > rejects Live on both insert and update  685ms
   ✓ Draft Event storage through local Auth and the Data API > rejects Completed on both insert and update  637ms
   ✓ Draft Event storage through local Auth and the Data API > rejects Cancelled on both insert and update  765ms
   ✓ Draft Event storage through local Auth and the Data API > rejects negative package count without changing the saved row  671ms
   ✓ Draft Event storage through local Auth and the Data API > rejects fractional package count without changing the saved row  849ms
   ✓ Draft Event storage through local Auth and the Data API > rejects overflow package count without changing the saved row  657ms
   ✓ Draft Event storage through local Auth and the Data API > rejects negative allowance without changing the saved row  596ms
   ✓ Draft Event storage through local Auth and the Data API > rejects fractional allowance without changing the saved row  638ms
   ✓ Draft Event storage through local Auth and the Data API > rejects overflow allowance without changing the saved row  607ms
   ✓ Draft Event storage through local Auth and the Data API > rejects end before start without changing the saved row  668ms
   ✓ Draft Event storage through local Auth and the Data API > rejects equal start and end without changing the saved row  647ms
   ✓ Draft Event storage through local Auth and the Data API > rejects infinite start without changing the saved row  641ms
   ✓ Draft Event storage through local Auth and the Data API > rejects blank title without changing the saved row  660ms
   ✓ Draft Event storage through local Auth and the Data API > rejects blank Client name without changing the saved row  631ms
   ✓ Draft Event storage through local Auth and the Data API > rejects invalid email without changing the saved row  666ms
   ✓ Draft Event storage through local Auth and the Data API > rejects blank phone without changing the saved row  676ms
   ✓ Draft Event storage through local Auth and the Data API > rejects blank venue without changing the saved row  702ms
   ✓ Draft Event storage through local Auth and the Data API > rejects unknown zone without changing the saved row  765ms
   ✓ Draft Event storage through local Auth and the Data API > rejects null required field without changing the saved row  627ms
   ✓ Draft Event storage through local Auth and the Data API > accepts the maximum whole count for both independent counts  599ms
   ✓ Draft Event storage through local Auth and the Data API > requires revision 1 on creation and exactly one increment for every direct update  2123ms

 Test Files  1 passed (1)
      Tests  28 passed (28)
   Start at  13:35:47
   Duration  26.46s (transform 123ms, setup 0ms, collect 419ms, tests 24.87s, environment 0ms, prepare 291ms)


```

### advisors

Command: `npx supabase db advisors --local`

```text
Connecting to local database...
No issues found
{"results":[],"message":"db advisors"}

```

### full

Command: `npm test`

```text

> diy-instax-photobooth@0.1.0 test
> vitest run


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ✓ tests/unit/draft-event.schema.test.ts (40 tests) 197ms
 ✓ tests/components/admin-shell-profile.test.tsx (5 tests) 1710ms
   ✓ keeps Profile last and marks the current destination  817ms
   ✓ preserves changed fields after save failure and exposes validation feedback  321ms
 ✓ tests/integration/admin-profile.test.ts (7 tests) 19734ms
   ✓ Profile actions with local Auth and RLS > persists phone and theme under the verified identity and allows clearing phone  1893ms
   ✓ Profile actions with local Auth and RLS > rejects invalid preferences without changing the saved row  1094ms
   ✓ Profile actions with local Auth and RLS > changes the actual password and reports validation and provider failure for retry  2157ms
   ✓ Profile actions with local Auth and RLS > locally signs out and immediately denies the old JWT while another device survives  2164ms
   ✓ Profile actions with local Auth and RLS > reports a failed local sign-out with a still-active session and permits retry  1620ms
   ✓ Profile actions with local Auth and RLS > redirects after an ambiguous sign-out failure if revocation actually committed  1472ms
   ✓ Profile actions with local Auth and RLS > denies direct mutations to an authenticated non-Admin and a revoked Admin  3756ms
 ✓ tests/components/admin-auth.test.tsx (9 tests) 2414ms
   ✓ Public Admin sign-in form > offers labeled credentials and recovery without signup or protected navigation  1097ms
   ✓ Public Admin sign-in form > keeps neutral credential feedback visible through editing and allows retry  314ms
   ✓ Public Admin sign-in form > turns a lost action connection into persistent feedback with preserved email and retry  311ms
 ✓ tests/integration/admin-authorization.test.ts (8 tests) 22217ms
   ✓ Admin authorization through local Auth and the Data API > lets the provisioned Admin read its Profile  1953ms
   ✓ Admin authorization through local Auth and the Data API > persists the Admin phone and theme through the Data API  1426ms
   ✓ Admin authorization through local Auth and the Data API > denies a signed-in non-Admin Profile reads and updates  1898ms
   ✓ Admin authorization through local Auth and the Data API > immediately denies both unexpired Admin JWTs after global sign-out  2503ms
   ✓ Admin authorization through local Auth and the Data API > local sign-out denies the old JWT while a second Admin session stays active  2499ms
   ✓ Admin authorization through local Auth and the Data API > denies anonymous Profile reads and mutations  1577ms
   ✓ Admin authorization through local Auth and the Data API > prevents clients from self-provisioning or changing the Admin identity  3340ms
   ✓ Admin authorization through local Auth and the Data API > rejects public signup while provisioned users can sign in  1125ms
 ✓ tests/integration/admin-auth-actions.test.ts (24 tests) 22358ms
   ✓ Public Admin sign-in action with local Auth > opens dashboard only after Auth and the live Admin Profile check succeed  2045ms
   ✓ Public Admin sign-in action with local Auth > denies and signs out a valid non-Admin locally while another session stays active  1819ms
   ✓ Public Admin sign-in action with local Auth > gives identical neutral credential feedback for wrong passwords and unknown addresses  879ms
   ✓ Public Admin sign-in action with local Auth > reports a connection failure and succeeds when retried  904ms
   ✓ Public Admin sign-in action with local Auth > signs out after an interrupted final authorization check  1107ms
   ✓ Neutral recovery action and local Mailpit delivery > delivers a real Admin recovery email to Mailpit with a fixed callback and neutral unknown-address response  5377ms
   ✓ Neutral recovery action and local Mailpit delivery > keeps repeated known and unknown recovery requests publicly identical during a real cooldown  892ms
 ❯ tests/components/password-reset.test.tsx (4 tests | 1 failed) 5635ms
   × Public password reset form > offers labeled new passwords, persistent validation and preserves values for retry 5149ms
     → Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
   ✓ Public password reset form > offers another link for invalid recovery without showing password fields or Admin navigation 44ms
   ✓ Public password reset form > blocks duplicate submission, then replaces the form with success and fresh sign-in 263ms
   ✓ Public password reset form > retains an actionable connection failure and offers retry 174ms
 ✓ tests/integration/draft-events-rls.test.ts (28 tests) 51292ms
   ✓ Draft Event storage through local Auth and the Data API > persists parsed booking values, defaults to Draft revision 1, and edits every booking field  2393ms
   ✓ Draft Event storage through local Auth and the Data API > retains independent Client snapshots for two Events  1339ms
   ✓ Draft Event storage through local Auth and the Data API > denies signed-out list, detail, create, update, and delete requests  1213ms
   ✓ Draft Event storage through local Auth and the Data API > denies non-Admin list, detail, create, update, and delete requests  2420ms
   ✓ Draft Event storage through local Auth and the Data API > denies revoked-session list, detail, create, update, and delete requests  2122ms
   ✓ Draft Event storage through local Auth and the Data API > denies removed-Admin list, detail, create, update, and delete requests  1915ms
   ✓ Draft Event storage through local Auth and the Data API > denies Admin deletion and identity reassignment  2020ms
   ✓ Draft Event storage through local Auth and the Data API > rejects Live on both insert and update  2238ms
   ✓ Draft Event storage through local Auth and the Data API > rejects Completed on both insert and update  1485ms
   ✓ Draft Event storage through local Auth and the Data API > rejects Cancelled on both insert and update  1085ms
   ✓ Draft Event storage through local Auth and the Data API > rejects negative package count without changing the saved row  1155ms
   ✓ Draft Event storage through local Auth and the Data API > rejects fractional package count without changing the saved row  2342ms
   ✓ Draft Event storage through local Auth and the Data API > rejects overflow package count without changing the saved row  4236ms
   ✓ Draft Event storage through local Auth and the Data API > rejects negative allowance without changing the saved row  1949ms
   ✓ Draft Event storage through local Auth and the Data API > rejects fractional allowance without changing the saved row  1227ms
   ✓ Draft Event storage through local Auth and the Data API > rejects overflow allowance without changing the saved row  1121ms
   ✓ Draft Event storage through local Auth and the Data API > rejects end before start without changing the saved row  1959ms
   ✓ Draft Event storage through local Auth and the Data API > rejects equal start and end without changing the saved row  1881ms
   ✓ Draft Event storage through local Auth and the Data API > rejects infinite start without changing the saved row  1824ms
   ✓ Draft Event storage through local Auth and the Data API > rejects blank title without changing the saved row  1218ms
   ✓ Draft Event storage through local Auth and the Data API > rejects blank Client name without changing the saved row  1633ms
   ✓ Draft Event storage through local Auth and the Data API > rejects invalid email without changing the saved row  1074ms
   ✓ Draft Event storage through local Auth and the Data API > rejects blank phone without changing the saved row  1049ms
   ✓ Draft Event storage through local Auth and the Data API > rejects blank venue without changing the saved row  1091ms
   ✓ Draft Event storage through local Auth and the Data API > rejects unknown zone without changing the saved row  986ms
   ✓ Draft Event storage through local Auth and the Data API > rejects null required field without changing the saved row  906ms
   ✓ Draft Event storage through local Auth and the Data API > accepts the maximum whole count for both independent counts  658ms
   ✓ Draft Event storage through local Auth and the Data API > requires revision 1 on creation and exactly one increment for every direct update  1707ms
 ✓ tests/integration/password-reset.test.ts (10 tests) 55085ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > resets through the delivered link, revokes two existing sessions and recovery, then allows fresh sign-in  8016ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects mismatched and short passwords while leaving the recovery link usable  7836ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects an ordinary password session even when the submitted state claims recovery  1334ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects unapproved callback redirect https://untrusted.example/ without exchanging the code  4967ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects unapproved callback redirect //untrusted.example/ without exchanging the code  8922ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects unapproved callback redirect /dashboard without exchanging the code  6867ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects invalid and reused codes even with an existing password session  4211ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects a genuinely expired PKCE code without changing the password  3536ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > does not report completion until global revocation succeeds and supports same-password retry  4213ms
 ✓ tests/integration/admin-routes.test.ts (7 tests) 59412ms
   ✓ Admin page responses with local Auth sessions > redirects signed-out direct HTML and RSC requests without protected content  380ms
   ✓ Admin page responses with local Auth sessions > renders truthful protected foundation pages only for the provisioned Admin  1371ms
   ✓ Admin page responses with local Auth sessions > denies a real signed-in identity that is not on the Admin allowlist  863ms
   ✓ Admin page responses with local Auth sessions > denies an expired signed Admin token when its refresh credential is unavailable  3060ms
   ✓ Admin page responses with local Auth sessions > immediately denies two original unexpired Admin JWTs after global revocation  1408ms
   ✓ Admin page responses with local Auth sessions > refreshes an expired Auth cookie and makes the response private and uncached  3770ms
   ✓ Admin page responses with local Auth sessions > sends root requests to the public or protected entry for the current session  1381ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/components/password-reset.test.tsx > Public password reset form > offers labeled new passwords, persistent validation and preserves values for retry
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ tests/components/password-reset.test.tsx:7:3
      5|
      6| describe('Public password reset form', () => {
      7|   it('offers labeled new passwords, persistent validation and preserve…
       |   ^
      8|     render(
      9|       <ResetPasswordForm

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 9 passed (10)
      Tests  1 failed | 141 passed (142)
   Start at  13:36:31
   Duration  61.50s (transform 1.32s, setup 0ms, collect 9.27s, tests 240.05s, environment 17.61s, prepare 5.44s)


```

### timeout-rerun

Command: `npm test -- tests/components/password-reset.test.tsx`

```text

> diy-instax-photobooth@0.1.0 test
> vitest run tests/components/password-reset.test.tsx


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ✓ tests/components/password-reset.test.tsx (4 tests) 560ms
   ✓ Public password reset form > offers labeled new passwords, persistent validation and preserves values for retry  411ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  13:37:46
   Duration  6.35s (transform 192ms, setup 0ms, collect 700ms, tests 560ms, environment 3.47s, prepare 294ms)


```

### full-rerun

Command: `npm test`

```text

> diy-instax-photobooth@0.1.0 test
> vitest run


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ✓ tests/unit/draft-event.schema.test.ts (40 tests) 352ms
 ✓ tests/components/admin-auth.test.tsx (9 tests) 1449ms
   ✓ Public Admin sign-in form > offers labeled credentials and recovery without signup or protected navigation  699ms
 ✓ tests/integration/admin-profile.test.ts (7 tests) 17624ms
   ✓ Profile actions with local Auth and RLS > persists phone and theme under the verified identity and allows clearing phone  1476ms
   ✓ Profile actions with local Auth and RLS > rejects invalid preferences without changing the saved row  985ms
   ✓ Profile actions with local Auth and RLS > changes the actual password and reports validation and provider failure for retry  2361ms
   ✓ Profile actions with local Auth and RLS > locally signs out and immediately denies the old JWT while another device survives  2423ms
   ✓ Profile actions with local Auth and RLS > reports a failed local sign-out with a still-active session and permits retry  1508ms
   ✓ Profile actions with local Auth and RLS > redirects after an ambiguous sign-out failure if revocation actually committed  1326ms
   ✓ Profile actions with local Auth and RLS > denies direct mutations to an authenticated non-Admin and a revoked Admin  2327ms
 ✓ tests/integration/admin-authorization.test.ts (8 tests) 19439ms
   ✓ Admin authorization through local Auth and the Data API > lets the provisioned Admin read its Profile  1155ms
   ✓ Admin authorization through local Auth and the Data API > persists the Admin phone and theme through the Data API  1682ms
   ✓ Admin authorization through local Auth and the Data API > denies a signed-in non-Admin Profile reads and updates  1812ms
   ✓ Admin authorization through local Auth and the Data API > immediately denies both unexpired Admin JWTs after global sign-out  2624ms
   ✓ Admin authorization through local Auth and the Data API > local sign-out denies the old JWT while a second Admin session stays active  2497ms
   ✓ Admin authorization through local Auth and the Data API > denies anonymous Profile reads and mutations  1228ms
   ✓ Admin authorization through local Auth and the Data API > prevents clients from self-provisioning or changing the Admin identity  1833ms
   ✓ Admin authorization through local Auth and the Data API > rejects public signup while provisioned users can sign in  821ms
 ✓ tests/components/admin-shell-profile.test.tsx (5 tests) 1988ms
   ✓ keeps Profile last and marks the current destination  985ms
   ✓ prevents duplicate saves, displays success, and recovers from a transport failure  313ms
 ✓ tests/integration/admin-auth-actions.test.ts (24 tests) 20406ms
   ✓ Public Admin sign-in action with local Auth > opens dashboard only after Auth and the live Admin Profile check succeed  1330ms
   ✓ Public Admin sign-in action with local Auth > denies and signs out a valid non-Admin locally while another session stays active  1894ms
   ✓ Public Admin sign-in action with local Auth > gives identical neutral credential feedback for wrong passwords and unknown addresses  859ms
   ✓ Public Admin sign-in action with local Auth > reports a connection failure and succeeds when retried  1030ms
   ✓ Public Admin sign-in action with local Auth > signs out after an interrupted final authorization check  1144ms
   ✓ Neutral recovery action and local Mailpit delivery > delivers a real Admin recovery email to Mailpit with a fixed callback and neutral unknown-address response  4513ms
   ✓ Neutral recovery action and local Mailpit delivery > keeps repeated known and unknown recovery requests publicly identical during a real cooldown  803ms
 ✓ tests/components/password-reset.test.tsx (4 tests) 1689ms
   ✓ Public password reset form > offers labeled new passwords, persistent validation and preserves values for retry  1174ms
   ✓ Public password reset form > blocks duplicate submission, then replaces the form with success and fresh sign-in  363ms
 ✓ tests/integration/draft-events-rls.test.ts (28 tests) 42848ms
   ✓ Draft Event storage through local Auth and the Data API > persists parsed booking values, defaults to Draft revision 1, and edits every booking field  1901ms
   ✓ Draft Event storage through local Auth and the Data API > retains independent Client snapshots for two Events  1398ms
   ✓ Draft Event storage through local Auth and the Data API > denies signed-out list, detail, create, update, and delete requests  1103ms
   ✓ Draft Event storage through local Auth and the Data API > denies non-Admin list, detail, create, update, and delete requests  2691ms
   ✓ Draft Event storage through local Auth and the Data API > denies revoked-session list, detail, create, update, and delete requests  2207ms
   ✓ Draft Event storage through local Auth and the Data API > denies removed-Admin list, detail, create, update, and delete requests  1449ms
   ✓ Draft Event storage through local Auth and the Data API > denies Admin deletion and identity reassignment  1063ms
   ✓ Draft Event storage through local Auth and the Data API > rejects Live on both insert and update  1273ms
   ✓ Draft Event storage through local Auth and the Data API > rejects Completed on both insert and update  1310ms
   ✓ Draft Event storage through local Auth and the Data API > rejects Cancelled on both insert and update  1007ms
   ✓ Draft Event storage through local Auth and the Data API > rejects negative package count without changing the saved row  1309ms
   ✓ Draft Event storage through local Auth and the Data API > rejects fractional package count without changing the saved row  905ms
   ✓ Draft Event storage through local Auth and the Data API > rejects overflow package count without changing the saved row  1087ms
   ✓ Draft Event storage through local Auth and the Data API > rejects negative allowance without changing the saved row  1619ms
   ✓ Draft Event storage through local Auth and the Data API > rejects fractional allowance without changing the saved row  912ms
   ✓ Draft Event storage through local Auth and the Data API > rejects overflow allowance without changing the saved row  1187ms
   ✓ Draft Event storage through local Auth and the Data API > rejects end before start without changing the saved row  2129ms
   ✓ Draft Event storage through local Auth and the Data API > rejects equal start and end without changing the saved row  1202ms
   ✓ Draft Event storage through local Auth and the Data API > rejects infinite start without changing the saved row  953ms
   ✓ Draft Event storage through local Auth and the Data API > rejects blank title without changing the saved row  1133ms
   ✓ Draft Event storage through local Auth and the Data API > rejects blank Client name without changing the saved row  1049ms
   ✓ Draft Event storage through local Auth and the Data API > rejects invalid email without changing the saved row  994ms
   ✓ Draft Event storage through local Auth and the Data API > rejects blank phone without changing the saved row  1063ms
   ✓ Draft Event storage through local Auth and the Data API > rejects blank venue without changing the saved row  1288ms
   ✓ Draft Event storage through local Auth and the Data API > rejects unknown zone without changing the saved row  1502ms
   ✓ Draft Event storage through local Auth and the Data API > rejects null required field without changing the saved row  1110ms
   ✓ Draft Event storage through local Auth and the Data API > accepts the maximum whole count for both independent counts  750ms
   ✓ Draft Event storage through local Auth and the Data API > requires revision 1 on creation and exactly one increment for every direct update  2282ms
 ✓ tests/integration/admin-routes.test.ts (7 tests) 46417ms
   ✓ Admin page responses with local Auth sessions > redirects signed-out direct HTML and RSC requests without protected content  483ms
   ✓ Admin page responses with local Auth sessions > renders truthful protected foundation pages only for the provisioned Admin  1534ms
   ✓ Admin page responses with local Auth sessions > denies a real signed-in identity that is not on the Admin allowlist  871ms
   ✓ Admin page responses with local Auth sessions > denies an expired signed Admin token when its refresh credential is unavailable  4262ms
   ✓ Admin page responses with local Auth sessions > immediately denies two original unexpired Admin JWTs after global revocation  1633ms
   ✓ Admin page responses with local Auth sessions > refreshes an expired Auth cookie and makes the response private and uncached  4225ms
   ✓ Admin page responses with local Auth sessions > sends root requests to the public or protected entry for the current session  606ms
 ✓ tests/integration/password-reset.test.ts (10 tests) 46679ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > resets through the delivered link, revokes two existing sessions and recovery, then allows fresh sign-in  7929ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects mismatched and short passwords while leaving the recovery link usable  6183ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects an ordinary password session even when the submitted state claims recovery  1014ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects unapproved callback redirect https://untrusted.example/ without exchanging the code  3939ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects unapproved callback redirect //untrusted.example/ without exchanging the code  5690ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects unapproved callback redirect /dashboard without exchanging the code  3566ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects invalid and reused codes even with an existing password session  3383ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects a genuinely expired PKCE code without changing the password  5557ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > does not report completion until global revocation succeeds and supports same-password retry  4330ms

 Test Files  10 passed (10)
      Tests  142 passed (142)
   Start at  13:38:56
   Duration  48.79s (transform 971ms, setup 0ms, collect 8.46s, tests 198.89s, environment 13.92s, prepare 3.66s)


```
