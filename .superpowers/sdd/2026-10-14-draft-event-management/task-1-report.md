# Task 1 report — Draft input and schedule validation

Status: complete.

Implementation commit: `3449935` — feat: validate Draft Event input and venue schedules.
A follow-up commit contains the self-review whitespace-count regression coverage and this report; its hash is supplied in the task response.

## Scope and interface

- Added `src/features/admin/events/draft-event.schema.ts` with `parseDraftEventInput(input: unknown): ValidatedDraftEvent`, `DraftEventInput`, and `ValidatedDraftEvent`.
- Required input fields: `title`, `clientName`, `clientEmail`, `clientPhone`, `venueAddress`, `timeZone`, `startsAtLocal`, `endsAtLocal`, `filmPackageCount`, `originalPrintAllowance`.
- Text is trimmed, whitespace-only input is rejected, and Client email is validated. Counts are independent numeric whole values, including zero, in 0..2,147,483,647. This bound matches PostgreSQL `integer` columns and prevents unsafe integer rounding or persistence overflow; Task 2 must use the same bound.
- Output removes venue-local schedule inputs and provides `startsAtUtc` and `endsAtUtc` ISO UTC instant strings while preserving the chosen trimmed IANA identifier.
- Venue-local input accepts ISO date/time values with minutes and optional seconds/fraction, without offset or zone annotations. Malformed dates and leap-second input are rejected instead of silently changed.
- Named IANA zones are checked using Temporal; fixed numeric offset identifiers are rejected. Recognized aliases are allowed and preserved.
- Temporal conversion uses explicit `disambiguation: 'reject'`. Both gap and overlap failures become Zod field issues with an explanation and an instruction to choose an unambiguous local time.
- Ordering uses `Temporal.Instant.compare`; the end must be strictly later than the start.
- Invalid input throws `ZodError` with paths referring to input fields. The form and server can call this same parser and derive field messages from its issues.
- Pinned and locked `zod@4.6.7`, `react-hook-form@7.90.0`, and `@js-temporal/polyfill@0.5.1`. React Hook Form is installed for the later approved UI task.

## Required downstream handoff

**Task 3 must explicitly reject any supplied non-Draft state before parsing, or use an adapter that performs that guard.** Zod's object parser strips unknown properties, including `state`; stripping is not rejection and must never authorize a Live/Completed/Cancelled request. The parser itself does not provide a state mutation interface.

Counts in `DraftEventInput` are numbers. A React Hook Form adapter can use `valueAsNumber`. A server FormData adapter must validate that count strings are present and nonblank before converting; do not let `Number('')` or `Number('   ')` turn missing counts into valid zero values. The parser rejects blank strings, NaN, fractional, negative, unsafe, and out-of-column-range numbers.

The parser contains no authorization or persistence. Task 3 must require the active Admin, call the parser again on server input, then persist only the validated booking fields. Tasks 2–4 retain the responsibility for Draft-only storage, state denial, stale revisions, UI, and database/browser tests.

## TDD and verification

Used the approved pure-parser seam and local TDD skill. Each new validation/conversion rule was tested RED before implementing its minimum behavior, then GREEN. Required missing fields already failed through the initial object schema. Zero-count regressions already passed through the general numeric input implementation; no artificial failure was introduced. The self-review blank-count regressions also passed through existing number-type checks without implementation changes.

The initial missing-module failure was observed before the parser existed. Independent UTC literals cover Manila conversion and New York's spring offset change. Both requested New York values are tested on **both** start and end fields: 2026-03-08 02:30 (gap) and 2026-11-01 01:30 (overlap). All ten required fields have missing-value and whitespace-only input coverage.

An early invalid-zone fixture used `EST`; review recognized that it is an IANA alias and replaced it with the genuinely invalid `Manila` before implementing zone validation. The original and corrected RED runs are retained below.

Final checks:

| Command | Result |
| --- | --- |
| `npm test -- tests/unit/draft-event.schema.test.ts` | 40 passed; exit 0 (includes two self-review blank-count regressions) |
| `npm test` | 9 files / 112 tests passed; exit 0, before the two extra regression assertions |
| `npx tsc --noEmit` | exit 0; no diagnostics |
| `npm run lint` | exit 0; no diagnostics |
| `npx prettier --check src/features/admin/events/draft-event.schema.ts tests/unit/draft-event.schema.test.ts` | exit 0; both files formatted |
| `git diff --check` | exit 0 |

The full suite first failed during fixture setup because the sandbox prohibited the local Supabase CLI telemetry write. Retried the same full command with approved escalation, and all local integration tests passed. No remote Supabase project was used.

## Self-review

Reviewed the parser, tests, dependency lock changes, approved brief/spec, ADR-0014, glossary vocabulary, and relevant installed Next.js forms/server-client guides. Standards: no remaining finding. Spec: all Task 1 requirements covered. Self-review added explicit whitespace-only input checks for both count fields. There is no gated Event operation or database change.

The runtime's installed IANA zone data governs conversion; future zone-law changes can require refreshed runtime data. DST gaps and overlaps deliberately remain unsavable. The two downstream adapter requirements above are integration obligations, not completed behavior claims for later tasks.

No qualifying Next.js feedback candidate was identified during this task; the pre-final reporting pass therefore required no feedback CLI invocation.

## RED/GREEN commands and observed output

### RED 1

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 1.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs


⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/draft-event.schema.test.ts [ tests/unit/draft-event.schema.test.ts ]
Error: Cannot find package '@/features/admin/events/draft-event.schema' imported from '/Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs/tests/unit/draft-event.schema.test.ts'
 ❯ tests/unit/draft-event.schema.test.ts:3:1
      1| // @vitest-environment node
      2| import { describe, expect, it } from 'vitest';
      3| import { parseDraftEventInput } from '@/features/admin/events/draft-ev…
       | ^
      4|
      5| const validInput = {

Caused by: Error: Failed to load url @/features/admin/events/draft-event.schema (resolved id: @/features/admin/events/draft-event.schema) in /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs/tests/unit/draft-event.schema.test.ts. Does the file exist?
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/config.js:22907:33

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  no tests
   Start at  13:19:32
   Duration  664ms (transform 54ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 136ms)
```

### GREEN 1

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 0.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ✓ tests/unit/draft-event.schema.test.ts (1 test) 25ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  13:21:47
   Duration  969ms (transform 77ms, setup 0ms, collect 264ms, tests 25ms, environment 0ms, prepare 162ms)
```

### RED 2

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 1.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ❯ tests/unit/draft-event.schema.test.ts (19 tests | 8 failed) 67ms
   ✓ Draft Event input > requires title with an error on the field 10ms
   ✓ Draft Event input > requires clientName with an error on the field 1ms
   ✓ Draft Event input > requires clientEmail with an error on the field 1ms
   ✓ Draft Event input > requires clientPhone with an error on the field 0ms
   ✓ Draft Event input > requires venueAddress with an error on the field 1ms
   ✓ Draft Event input > requires timeZone with an error on the field 1ms
   ✓ Draft Event input > requires startsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires endsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires filmPackageCount with an error on the field 1ms
   ✓ Draft Event input > requires originalPrintAllowance with an error on the field 1ms
   × Draft Event input > rejects whitespace-only title 33ms
     → expected undefined to be an instance of ZodError
   × Draft Event input > rejects whitespace-only clientName 2ms
     → expected undefined to be an instance of ZodError
   × Draft Event input > rejects whitespace-only clientEmail 1ms
     → expected undefined to be an instance of ZodError
   × Draft Event input > rejects whitespace-only clientPhone 1ms
     → expected undefined to be an instance of ZodError
   × Draft Event input > rejects whitespace-only venueAddress 4ms
     → expected undefined to be an instance of ZodError
   × Draft Event input > rejects whitespace-only timeZone 2ms
     → expected RangeError: Invalid time zone:  to be an instance of ZodError
   × Draft Event input > rejects whitespace-only startsAtLocal 1ms
     → expected RangeError: invalid RFC 9557 string:
  to be an instance of ZodError
   × Draft Event input > rejects whitespace-only endsAtLocal 2ms
     → expected RangeError: invalid RFC 9557 string:
  to be an instance of ZodError
   ✓ Draft Event input > trims booking details and preserves independent counts and the venue zone 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 8 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects whitespace-only title
 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects whitespace-only clientName
 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects whitespace-only clientEmail
 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects whitespace-only clientPhone
 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects whitespace-only venueAddress
AssertionError: expected undefined to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:54:17
     52|     error = caught;
     53|   }
     54|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
     55|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
     56|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:28:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/8]⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects whitespace-only timeZone
AssertionError: expected RangeError: Invalid time zone:  to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:54:17
     52|     error = caught;
     53|   }
     54|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
     55|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
     56|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:28:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/8]⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects whitespace-only startsAtLocal
 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects whitespace-only endsAtLocal
AssertionError: expected RangeError: invalid RFC 9557 string:
  to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:54:17
     52|     error = caught;
     53|   }
     54|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
     55|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
     56|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:28:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/8]⎯


 Test Files  1 failed (1)
      Tests  8 failed | 11 passed (19)
   Start at  13:21:49
   Duration  1.18s (transform 102ms, setup 0ms, collect 380ms, tests 67ms, environment 0ms, prepare 183ms)
```

### GREEN 2

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 0.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ✓ tests/unit/draft-event.schema.test.ts (19 tests) 34ms

 Test Files  1 passed (1)
      Tests  19 passed (19)
   Start at  13:22:07
   Duration  1.02s (transform 92ms, setup 0ms, collect 293ms, tests 34ms, environment 0ms, prepare 165ms)
```

### RED 3

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 1.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ❯ tests/unit/draft-event.schema.test.ts (20 tests | 1 failed) 38ms
   × Draft Event input > rejects an invalid Client email with an actionable field error 27ms
     → expected undefined to be an instance of ZodError
   ✓ Draft Event input > requires title with an error on the field 2ms
   ✓ Draft Event input > requires clientName with an error on the field 0ms
   ✓ Draft Event input > requires clientEmail with an error on the field 1ms
   ✓ Draft Event input > requires clientPhone with an error on the field 0ms
   ✓ Draft Event input > requires venueAddress with an error on the field 0ms
   ✓ Draft Event input > requires timeZone with an error on the field 0ms
   ✓ Draft Event input > requires startsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires endsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires filmPackageCount with an error on the field 0ms
   ✓ Draft Event input > requires originalPrintAllowance with an error on the field 0ms
   ✓ Draft Event input > rejects whitespace-only title 0ms
   ✓ Draft Event input > rejects whitespace-only clientName 0ms
   ✓ Draft Event input > rejects whitespace-only clientEmail 0ms
   ✓ Draft Event input > rejects whitespace-only clientPhone 0ms
   ✓ Draft Event input > rejects whitespace-only venueAddress 0ms
   ✓ Draft Event input > rejects whitespace-only timeZone 0ms
   ✓ Draft Event input > rejects whitespace-only startsAtLocal 0ms
   ✓ Draft Event input > rejects whitespace-only endsAtLocal 0ms
   ✓ Draft Event input > trims booking details and preserves independent counts and the venue zone 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects an invalid Client email with an actionable field error
AssertionError: expected undefined to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:57:17
     55|     error = caught;
     56|   }
     57|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
     58|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
     59|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:21:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 19 passed (20)
   Start at  13:22:09
   Duration  909ms (transform 86ms, setup 0ms, collect 294ms, tests 38ms, environment 0ms, prepare 131ms)
```

### GREEN 3

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 0.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ✓ tests/unit/draft-event.schema.test.ts (20 tests) 35ms

 Test Files  1 passed (1)
      Tests  20 passed (20)
   Start at  13:22:21
   Duration  1.14s (transform 90ms, setup 0ms, collect 302ms, tests 35ms, environment 0ms, prepare 146ms)
```

### RED 4

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 1.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ❯ tests/unit/draft-event.schema.test.ts (22 tests | 2 failed) 39ms
   × Draft Event input > rejects negative, fractional, or unrepresentable filmPackageCount 26ms
     → expected undefined to be an instance of ZodError
   × Draft Event input > rejects negative, fractional, or unrepresentable originalPrintAllowance 3ms
     → expected undefined to be an instance of ZodError
   ✓ Draft Event input > rejects an invalid Client email with an actionable field error 1ms
   ✓ Draft Event input > requires title with an error on the field 1ms
   ✓ Draft Event input > requires clientName with an error on the field 0ms
   ✓ Draft Event input > requires clientEmail with an error on the field 0ms
   ✓ Draft Event input > requires clientPhone with an error on the field 0ms
   ✓ Draft Event input > requires venueAddress with an error on the field 0ms
   ✓ Draft Event input > requires timeZone with an error on the field 0ms
   ✓ Draft Event input > requires startsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires endsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires filmPackageCount with an error on the field 0ms
   ✓ Draft Event input > requires originalPrintAllowance with an error on the field 0ms
   ✓ Draft Event input > rejects whitespace-only title 0ms
   ✓ Draft Event input > rejects whitespace-only clientName 0ms
   ✓ Draft Event input > rejects whitespace-only clientEmail 0ms
   ✓ Draft Event input > rejects whitespace-only clientPhone 0ms
   ✓ Draft Event input > rejects whitespace-only venueAddress 0ms
   ✓ Draft Event input > rejects whitespace-only timeZone 0ms
   ✓ Draft Event input > rejects whitespace-only startsAtLocal 0ms
   ✓ Draft Event input > rejects whitespace-only endsAtLocal 0ms
   ✓ Draft Event input > trims booking details and preserves independent counts and the venue zone 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects negative, fractional, or unrepresentable filmPackageCount
 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects negative, fractional, or unrepresentable originalPrintAllowance
AssertionError: expected undefined to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:64:17
     62|     error = caught;
     63|   }
     64|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
     65|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
     66|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:23:9

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 20 passed (22)
   Start at  13:22:24
   Duration  907ms (transform 76ms, setup 0ms, collect 210ms, tests 39ms, environment 0ms, prepare 162ms)
```

### GREEN 4

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 0.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ✓ tests/unit/draft-event.schema.test.ts (22 tests) 31ms

 Test Files  1 passed (1)
      Tests  22 passed (22)
   Start at  13:22:43
   Duration  912ms (transform 62ms, setup 0ms, collect 236ms, tests 31ms, environment 0ms, prepare 147ms)
```

### RED 5 (zero regressions pass)

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 1.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ❯ tests/unit/draft-event.schema.test.ts (29 tests | 3 failed) 61ms
   ✓ Draft Event input > preserves independent Draft counts 0 and 0 24ms
   ✓ Draft Event input > preserves independent Draft counts 0 and 37 2ms
   ✓ Draft Event input > preserves independent Draft counts 2 and 0 2ms
   ✓ Draft Event input > preserves independent Draft counts 2147483647 and 2147483647 1ms
   × Draft Event input > rejects Mars/Olympus as an invalid venue IANA zone 12ms
     → expected RangeError: Unrecognized time zone Mars/O… to be an instance of ZodError
   × Draft Event input > rejects +08:00 as an invalid venue IANA zone 4ms
     → expected undefined to be an instance of ZodError
   × Draft Event input > rejects EST as an invalid venue IANA zone 3ms
     → expected undefined to be an instance of ZodError
   ✓ Draft Event input > rejects negative, fractional, or unrepresentable filmPackageCount 2ms
   ✓ Draft Event input > rejects negative, fractional, or unrepresentable originalPrintAllowance 1ms
   ✓ Draft Event input > rejects an invalid Client email with an actionable field error 1ms
   ✓ Draft Event input > requires title with an error on the field 1ms
   ✓ Draft Event input > requires clientName with an error on the field 0ms
   ✓ Draft Event input > requires clientEmail with an error on the field 0ms
   ✓ Draft Event input > requires clientPhone with an error on the field 0ms
   ✓ Draft Event input > requires venueAddress with an error on the field 0ms
   ✓ Draft Event input > requires timeZone with an error on the field 0ms
   ✓ Draft Event input > requires startsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires endsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires filmPackageCount with an error on the field 0ms
   ✓ Draft Event input > requires originalPrintAllowance with an error on the field 0ms
   ✓ Draft Event input > rejects whitespace-only title 0ms
   ✓ Draft Event input > rejects whitespace-only clientName 0ms
   ✓ Draft Event input > rejects whitespace-only clientEmail 0ms
   ✓ Draft Event input > rejects whitespace-only clientPhone 0ms
   ✓ Draft Event input > rejects whitespace-only venueAddress 0ms
   ✓ Draft Event input > rejects whitespace-only timeZone 0ms
   ✓ Draft Event input > rejects whitespace-only startsAtLocal 0ms
   ✓ Draft Event input > rejects whitespace-only endsAtLocal 0ms
   ✓ Draft Event input > trims booking details and preserves independent counts and the venue zone 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects Mars/Olympus as an invalid venue IANA zone
AssertionError: expected RangeError: Unrecognized time zone Mars/O… to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:77:17
     75|     error = caught;
     76|   }
     77|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
     78|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
     79|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:30:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects +08:00 as an invalid venue IANA zone
 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects EST as an invalid venue IANA zone
AssertionError: expected undefined to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:77:17
     75|     error = caught;
     76|   }
     77|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
     78|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
     79|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:30:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 26 passed (29)
   Start at  13:22:45
   Duration  826ms (transform 64ms, setup 0ms, collect 226ms, tests 61ms, environment 0ms, prepare 105ms)
```

### RED 5 corrected invalid-zone fixture

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 1.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ❯ tests/unit/draft-event.schema.test.ts (29 tests | 3 failed) 48ms
   ✓ Draft Event input > preserves independent Draft counts 0 and 0 20ms
   ✓ Draft Event input > preserves independent Draft counts 0 and 37 2ms
   ✓ Draft Event input > preserves independent Draft counts 2 and 0 1ms
   ✓ Draft Event input > preserves independent Draft counts 2147483647 and 2147483647 1ms
   × Draft Event input > rejects Mars/Olympus as an invalid venue IANA zone 10ms
     → expected RangeError: Unrecognized time zone Mars/O… to be an instance of ZodError
   × Draft Event input > rejects +08:00 as an invalid venue IANA zone 2ms
     → expected undefined to be an instance of ZodError
   × Draft Event input > rejects Manila as an invalid venue IANA zone 1ms
     → expected RangeError: Unrecognized time zone Manila to be an instance of ZodError
   ✓ Draft Event input > rejects negative, fractional, or unrepresentable filmPackageCount 2ms
   ✓ Draft Event input > rejects negative, fractional, or unrepresentable originalPrintAllowance 1ms
   ✓ Draft Event input > rejects an invalid Client email with an actionable field error 1ms
   ✓ Draft Event input > requires title with an error on the field 1ms
   ✓ Draft Event input > requires clientName with an error on the field 0ms
   ✓ Draft Event input > requires clientEmail with an error on the field 0ms
   ✓ Draft Event input > requires clientPhone with an error on the field 0ms
   ✓ Draft Event input > requires venueAddress with an error on the field 0ms
   ✓ Draft Event input > requires timeZone with an error on the field 0ms
   ✓ Draft Event input > requires startsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires endsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires filmPackageCount with an error on the field 0ms
   ✓ Draft Event input > requires originalPrintAllowance with an error on the field 0ms
   ✓ Draft Event input > rejects whitespace-only title 1ms
   ✓ Draft Event input > rejects whitespace-only clientName 0ms
   ✓ Draft Event input > rejects whitespace-only clientEmail 0ms
   ✓ Draft Event input > rejects whitespace-only clientPhone 0ms
   ✓ Draft Event input > rejects whitespace-only venueAddress 0ms
   ✓ Draft Event input > rejects whitespace-only timeZone 0ms
   ✓ Draft Event input > rejects whitespace-only startsAtLocal 0ms
   ✓ Draft Event input > rejects whitespace-only endsAtLocal 0ms
   ✓ Draft Event input > trims booking details and preserves independent counts and the venue zone 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects Mars/Olympus as an invalid venue IANA zone
AssertionError: expected RangeError: Unrecognized time zone Mars/O… to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:77:17
     75|     error = caught;
     76|   }
     77|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
     78|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
     79|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:30:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects +08:00 as an invalid venue IANA zone
AssertionError: expected undefined to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:77:17
     75|     error = caught;
     76|   }
     77|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
     78|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
     79|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:30:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects Manila as an invalid venue IANA zone
AssertionError: expected RangeError: Unrecognized time zone Manila to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:77:17
     75|     error = caught;
     76|   }
     77|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
     78|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
     79|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:30:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 26 passed (29)
   Start at  13:23:02
   Duration  1.09s (transform 111ms, setup 0ms, collect 306ms, tests 48ms, environment 0ms, prepare 142ms)
```

### GREEN 5

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 0.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ✓ tests/unit/draft-event.schema.test.ts (29 tests) 58ms

 Test Files  1 passed (1)
      Tests  29 passed (29)
   Start at  13:23:05
   Duration  1.41s (transform 92ms, setup 0ms, collect 300ms, tests 58ms, environment 0ms, prepare 164ms)
```

### RED 6

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 1.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ❯ tests/unit/draft-event.schema.test.ts (33 tests | 4 failed) 58ms
   × Draft Event input > rejects the New York DST gap on startsAtLocal with a field explanation 30ms
     → expected undefined to be an instance of ZodError
   × Draft Event input > rejects the New York DST gap on endsAtLocal with a field explanation 3ms
     → expected undefined to be an instance of ZodError
   × Draft Event input > rejects the New York DST overlap on startsAtLocal with a field explanation 2ms
     → expected undefined to be an instance of ZodError
   × Draft Event input > rejects the New York DST overlap on endsAtLocal with a field explanation 1ms
     → expected undefined to be an instance of ZodError
   ✓ Draft Event input > preserves independent Draft counts 0 and 0 3ms
   ✓ Draft Event input > preserves independent Draft counts 0 and 37 1ms
   ✓ Draft Event input > preserves independent Draft counts 2 and 0 1ms
   ✓ Draft Event input > preserves independent Draft counts 2147483647 and 2147483647 1ms
   ✓ Draft Event input > rejects Mars/Olympus as an invalid venue IANA zone 1ms
   ✓ Draft Event input > rejects +08:00 as an invalid venue IANA zone 0ms
   ✓ Draft Event input > rejects Manila as an invalid venue IANA zone 0ms
   ✓ Draft Event input > rejects negative, fractional, or unrepresentable filmPackageCount 2ms
   ✓ Draft Event input > rejects negative, fractional, or unrepresentable originalPrintAllowance 1ms
   ✓ Draft Event input > rejects an invalid Client email with an actionable field error 0ms
   ✓ Draft Event input > requires title with an error on the field 1ms
   ✓ Draft Event input > requires clientName with an error on the field 0ms
   ✓ Draft Event input > requires clientEmail with an error on the field 0ms
   ✓ Draft Event input > requires clientPhone with an error on the field 0ms
   ✓ Draft Event input > requires venueAddress with an error on the field 0ms
   ✓ Draft Event input > requires timeZone with an error on the field 0ms
   ✓ Draft Event input > requires startsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires endsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires filmPackageCount with an error on the field 0ms
   ✓ Draft Event input > requires originalPrintAllowance with an error on the field 0ms
   ✓ Draft Event input > rejects whitespace-only title 0ms
   ✓ Draft Event input > rejects whitespace-only clientName 0ms
   ✓ Draft Event input > rejects whitespace-only clientEmail 0ms
   ✓ Draft Event input > rejects whitespace-only clientPhone 0ms
   ✓ Draft Event input > rejects whitespace-only venueAddress 0ms
   ✓ Draft Event input > rejects whitespace-only timeZone 1ms
   ✓ Draft Event input > rejects whitespace-only startsAtLocal 0ms
   ✓ Draft Event input > rejects whitespace-only endsAtLocal 0ms
   ✓ Draft Event input > trims booking details and preserves independent counts and the venue zone 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects the New York DST gap on startsAtLocal with a field explanation
 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects the New York DST gap on endsAtLocal with a field explanation
AssertionError: expected undefined to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:88:17
     86|     error = caught;
     87|   }
     88|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
     89|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
     90|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:22:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects the New York DST overlap on startsAtLocal with a field explanation
 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > rejects the New York DST overlap on endsAtLocal with a field explanation
AssertionError: expected undefined to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:88:17
     86|     error = caught;
     87|   }
     88|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
     89|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
     90|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:28:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed | 29 passed (33)
   Start at  13:23:32
   Duration  903ms (transform 85ms, setup 0ms, collect 242ms, tests 58ms, environment 0ms, prepare 122ms)
```

### GREEN 6

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 0.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ✓ tests/unit/draft-event.schema.test.ts (33 tests) 44ms

 Test Files  1 passed (1)
      Tests  33 passed (33)
   Start at  13:23:35
   Duration  927ms (transform 79ms, setup 0ms, collect 254ms, tests 44ms, environment 0ms, prepare 135ms)
```

### RED 7

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 1.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ❯ tests/unit/draft-event.schema.test.ts (36 tests | 3 failed) 62ms
   × Draft Event input > requires the scheduled end to be after start (2026-10-20T17:59) 29ms
     → expected undefined to be an instance of ZodError
   × Draft Event input > requires the scheduled end to be after start (2026-10-20T18:00) 2ms
     → expected undefined to be an instance of ZodError
   × Draft Event input > compares UTC instants when the schedule crosses a DST offset change 5ms
     → expected undefined to be an instance of ZodError
   ✓ Draft Event input > rejects the New York DST gap on startsAtLocal with a field explanation 2ms
   ✓ Draft Event input > rejects the New York DST gap on endsAtLocal with a field explanation 1ms
   ✓ Draft Event input > rejects the New York DST overlap on startsAtLocal with a field explanation 1ms
   ✓ Draft Event input > rejects the New York DST overlap on endsAtLocal with a field explanation 1ms
   ✓ Draft Event input > preserves independent Draft counts 0 and 0 1ms
   ✓ Draft Event input > preserves independent Draft counts 0 and 37 1ms
   ✓ Draft Event input > preserves independent Draft counts 2 and 0 1ms
   ✓ Draft Event input > preserves independent Draft counts 2147483647 and 2147483647 1ms
   ✓ Draft Event input > rejects Mars/Olympus as an invalid venue IANA zone 1ms
   ✓ Draft Event input > rejects +08:00 as an invalid venue IANA zone 1ms
   ✓ Draft Event input > rejects Manila as an invalid venue IANA zone 1ms
   ✓ Draft Event input > rejects negative, fractional, or unrepresentable filmPackageCount 2ms
   ✓ Draft Event input > rejects negative, fractional, or unrepresentable originalPrintAllowance 1ms
   ✓ Draft Event input > rejects an invalid Client email with an actionable field error 0ms
   ✓ Draft Event input > requires title with an error on the field 1ms
   ✓ Draft Event input > requires clientName with an error on the field 0ms
   ✓ Draft Event input > requires clientEmail with an error on the field 0ms
   ✓ Draft Event input > requires clientPhone with an error on the field 0ms
   ✓ Draft Event input > requires venueAddress with an error on the field 0ms
   ✓ Draft Event input > requires timeZone with an error on the field 0ms
   ✓ Draft Event input > requires startsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires endsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires filmPackageCount with an error on the field 0ms
   ✓ Draft Event input > requires originalPrintAllowance with an error on the field 0ms
   ✓ Draft Event input > rejects whitespace-only title 0ms
   ✓ Draft Event input > rejects whitespace-only clientName 0ms
   ✓ Draft Event input > rejects whitespace-only clientEmail 0ms
   ✓ Draft Event input > rejects whitespace-only clientPhone 0ms
   ✓ Draft Event input > rejects whitespace-only venueAddress 0ms
   ✓ Draft Event input > rejects whitespace-only timeZone 0ms
   ✓ Draft Event input > rejects whitespace-only startsAtLocal 0ms
   ✓ Draft Event input > rejects whitespace-only endsAtLocal 0ms
   ✓ Draft Event input > trims booking details and preserves independent counts and the venue zone 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > requires the scheduled end to be after start (2026-10-20T17:59)
 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > requires the scheduled end to be after start (2026-10-20T18:00)
AssertionError: expected undefined to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:102:17
    100|     error = caught;
    101|   }
    102|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
    103|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
    104|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:22:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > compares UTC instants when the schedule crosses a DST offset change
AssertionError: expected undefined to be an instance of ZodError
 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:102:17
    100|     error = caught;
    101|   }
    102|   expect(error).toBeInstanceOf(ZodError);
       |                 ^
    103|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
    104|   expect(issue).toBeDefined();
 ❯ tests/unit/draft-event.schema.test.ts:30:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 33 passed (36)
   Start at  13:24:01
   Duration  1.20s (transform 109ms, setup 0ms, collect 371ms, tests 62ms, environment 0ms, prepare 190ms)
```

### GREEN 7

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 0.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ✓ tests/unit/draft-event.schema.test.ts (36 tests) 50ms

 Test Files  1 passed (1)
      Tests  36 passed (36)
   Start at  13:24:04
   Duration  836ms (transform 65ms, setup 0ms, collect 217ms, tests 50ms, environment 0ms, prepare 104ms)
```

### RED 8

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 1.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ❯ tests/unit/draft-event.schema.test.ts (38 tests | 2 failed) 54ms
   × Draft Event input > requires a valid venue-local date and time on startsAtLocal 25ms
     → expected 'This local time does not exist or is …' to match /valid.*local.*date.*time/i
   × Draft Event input > requires a valid venue-local date and time on endsAtLocal 2ms
     → expected 'This local time does not exist or is …' to match /valid.*local.*date.*time/i
   ✓ Draft Event input > requires the scheduled end to be after start (2026-10-20T17:59) 2ms
   ✓ Draft Event input > requires the scheduled end to be after start (2026-10-20T18:00) 1ms
   ✓ Draft Event input > compares UTC instants when the schedule crosses a DST offset change 5ms
   ✓ Draft Event input > rejects the New York DST gap on startsAtLocal with a field explanation 1ms
   ✓ Draft Event input > rejects the New York DST gap on endsAtLocal with a field explanation 1ms
   ✓ Draft Event input > rejects the New York DST overlap on startsAtLocal with a field explanation 1ms
   ✓ Draft Event input > rejects the New York DST overlap on endsAtLocal with a field explanation 1ms
   ✓ Draft Event input > preserves independent Draft counts 0 and 0 1ms
   ✓ Draft Event input > preserves independent Draft counts 0 and 37 1ms
   ✓ Draft Event input > preserves independent Draft counts 2 and 0 1ms
   ✓ Draft Event input > preserves independent Draft counts 2147483647 and 2147483647 1ms
   ✓ Draft Event input > rejects Mars/Olympus as an invalid venue IANA zone 1ms
   ✓ Draft Event input > rejects +08:00 as an invalid venue IANA zone 0ms
   ✓ Draft Event input > rejects Manila as an invalid venue IANA zone 0ms
   ✓ Draft Event input > rejects negative, fractional, or unrepresentable filmPackageCount 1ms
   ✓ Draft Event input > rejects negative, fractional, or unrepresentable originalPrintAllowance 1ms
   ✓ Draft Event input > rejects an invalid Client email with an actionable field error 0ms
   ✓ Draft Event input > requires title with an error on the field 1ms
   ✓ Draft Event input > requires clientName with an error on the field 0ms
   ✓ Draft Event input > requires clientEmail with an error on the field 0ms
   ✓ Draft Event input > requires clientPhone with an error on the field 0ms
   ✓ Draft Event input > requires venueAddress with an error on the field 0ms
   ✓ Draft Event input > requires timeZone with an error on the field 0ms
   ✓ Draft Event input > requires startsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires endsAtLocal with an error on the field 0ms
   ✓ Draft Event input > requires filmPackageCount with an error on the field 0ms
   ✓ Draft Event input > requires originalPrintAllowance with an error on the field 0ms
   ✓ Draft Event input > rejects whitespace-only title 0ms
   ✓ Draft Event input > rejects whitespace-only clientName 0ms
   ✓ Draft Event input > rejects whitespace-only clientEmail 0ms
   ✓ Draft Event input > rejects whitespace-only clientPhone 0ms
   ✓ Draft Event input > rejects whitespace-only venueAddress 0ms
   ✓ Draft Event input > rejects whitespace-only timeZone 1ms
   ✓ Draft Event input > rejects whitespace-only startsAtLocal 0ms
   ✓ Draft Event input > rejects whitespace-only endsAtLocal 0ms
   ✓ Draft Event input > trims booking details and preserves independent counts and the venue zone 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > requires a valid venue-local date and time on startsAtLocal
 FAIL  tests/unit/draft-event.schema.test.ts > Draft Event input > requires a valid venue-local date and time on endsAtLocal
AssertionError: expected 'This local time does not exist or is …' to match /valid.*local.*date.*time/i

- Expected:
/valid.*local.*date.*time/i

+ Received:
"This local time does not exist or is ambiguous in the venue time zone. Choose an unambiguous local time."

 ❯ expectFieldError tests/unit/draft-event.schema.test.ts:112:39
    110|   const issue = (error as ZodError).issues.find((issue) => issue.path[…
    111|   expect(issue).toBeDefined();
    112|   if (message) expect(issue?.message).toMatch(message);
       |                                       ^
    113| }
    114|
 ❯ tests/unit/draft-event.schema.test.ts:23:9

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 36 passed (38)
   Start at  13:24:30
   Duration  903ms (transform 77ms, setup 0ms, collect 286ms, tests 54ms, environment 0ms, prepare 139ms)
```

### GREEN 8

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 0.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ✓ tests/unit/draft-event.schema.test.ts (38 tests) 50ms

 Test Files  1 passed (1)
      Tests  38 passed (38)
   Start at  13:24:32
   Duration  800ms (transform 67ms, setup 0ms, collect 203ms, tests 50ms, environment 0ms, prepare 110ms)
```

### Self-review regression (blank count inputs)

Command: `npm test -- tests/unit/draft-event.schema.test.ts`; exit 0.

```text
> diy-instax-photobooth@0.1.0 test
> vitest run tests/unit/draft-event.schema.test.ts


 RUN  v3.2.7 /Users/brandonorphiano/Documents/Documents/my_portfolio/projects/diy-instax-photobooth/.worktrees/admin-foundation-specs

 ✓ tests/unit/draft-event.schema.test.ts (40 tests) 49ms

 Test Files  1 passed (1)
      Tests  40 passed (40)
   Start at  13:26:45
   Duration  843ms (transform 73ms, setup 0ms, collect 254ms, tests 49ms, environment 0ms, prepare 139ms)
```

## Full-suite retry final output

Command: `npm test` with required sandbox escalation; exit 0.

```text
✓ tests/integration/admin-routes.test.ts (7 tests) 32215ms
   ✓ Admin page responses with local Auth sessions > renders truthful protected foundation pages only for the provisioned Admin  911ms
   ✓ Admin page responses with local Auth sessions > denies a real signed-in identity that is not on the Admin allowlist  639ms
   ✓ Admin page responses with local Auth sessions > denies an expired signed Admin token when its refresh credential is unavailable  2230ms
   ✓ Admin page responses with local Auth sessions > immediately denies two original unexpired Admin JWTs after global revocation  1226ms
   ✓ Admin page responses with local Auth sessions > refreshes an expired Auth cookie and makes the response private and uncached  2374ms
   ✓ Admin page responses with local Auth sessions > sends root requests to the public or protected entry for the current session  483ms
 ✓ tests/integration/password-reset.test.ts (10 tests) 33314ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > resets through the delivered link, revokes two existing sessions and recovery, then allows fresh sign-in  6790ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects mismatched and short passwords while leaving the recovery link usable  4960ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects an ordinary password session even when the submitted state claims recovery  856ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects unapproved callback redirect https://untrusted.example/ without exchanging the code  2644ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects unapproved callback redirect //untrusted.example/ without exchanging the code  3015ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects unapproved callback redirect /dashboard without exchanging the code  2343ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects invalid and reused codes even with an existing password session  2363ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > rejects a genuinely expired PKCE code without changing the password  2566ms
   ✓ Password recovery through local Mailpit, PKCE and active-session RLS > does not report completion until global revocation succeeds and supports same-password retry  3067ms

 Test Files  9 passed (9)
      Tests  112 passed (112)
   Start at  13:25:24
   Duration  35.76s (transform 985ms, setup 0ms, collect 6.15s, tests 120.33s, environment 10.12s, prepare 3.08s)
```
