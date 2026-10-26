# Issue #30 — local Supabase multipart investigation

Date: 2026-10-26. Application candidate: `2b93c85` on `feat/issue-30-event-preparation-media`.

**Verdict: partial evidence only; not qualified for adoption.** Ordinary multipart transfer works on the installed local backend. Complete cleanup under failure, concurrency and late requests remains unproven. F2-04 and Task 4 remain gated, and the application's existing pending-deletion fallback is unchanged.

The user approved an isolated local proof before changing the upload design. No application code, application dependency, product decision, hosted configuration, activation or hardware behavior changed.

## Environment and retained evidence

- Local Supabase API: loopback port 56321; project `diy-instax-package-contracts`.
- Storage image: `public.ecr.aws/supabase/storage-api:v1.79.36`, local file backend.
- Node `v24.22.1`; isolated AWS S3 client/presigner packages `3.1070.0`.
- Private synthetic bucket `multipart-proof-07c0af67-004f-4ade-a949-3c6e6be65cc2`; opaque test prefix `7a22e569-ae25-42cd-badb-7d3c7c3c4e1f/`.
- [Saved sanitized run output](evidence/issue-30-multipart-normal-run.jsonl). SHA-256: `0ab12141d3da4a0b198bc460753bfd498fb1f0be2adb29a8d6f7a1e115c67de1`.

The isolated harness used real Supabase S3 commands and short-lived presigned UploadPart URLs kept in memory. The browser was not involved. The bucket had no browser object policies. Credentials and URLs were not emitted in the saved output.

The interrupted, unqualified harness and its isolated package lock are retained locally at `.superpowers/sdd/2026-10-24-issue-10-f2-event-preparation-media/multipart-proof-interrupted/`. They are not part of the maintained application or its test commands. This report and saved output are evidence artifacts, not a reproducible passing qualification suite. The source snapshot retained after interruption may contain edits subsequent to the saved run; it is not an exact-revision rerun claim.

## Observed results

| Check                                        | Result                                                                                                                                             | Limit of the evidence                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| PNG payload, exactly 10,000,000 bytes        | Passed: two parts, ListParts count, completion, download length and SHA-256 match                                                                  | Synthetic PNG; existing trusted media validator was not invoked                                              |
| AVC MP4 payload, exactly 50,000,000 bytes    | Passed: nine parts, ListParts count, completion, download length and SHA-256 match                                                                 | Synthetic fixture; existing trusted media validator was not invoked                                          |
| Repeat Complete after successful completion  | Both returned HTTP 404 `NoSuchUpload`; committed object was recovered through GetObject before the repeat                                          | Actual network-response loss was not induced; no application receipt/attachment proof                        |
| Enumerate two committed sessions for one key | Both upload IDs recovered through paginated ListMultipartUploads and aborted through the API                                                       | IDs were also known to the harness; actual lost Create response was not induced                              |
| Ordinary API Delete/Abort cleanup            | Physical inspection reported no files after deleting the two completed objects and aborting the two empty sessions, before forced fixture teardown | Does not cover a partially written part, an in-flight request, a failed session creation or unknown sessions |
| Creation-failure probe                       | Harness assertion failed; saved output does not identify the precise assertion                                                                     | Inconclusive: neither a proven orphan nor a successful cleanup result                                        |

The output labels `normal-and-lost-complete-recovery` and `lost-create-response-after-commit` are broader than the observations. The table above is authoritative: these checks exercise reconciliation primitives after known successful requests, not deliberate network-response loss.

## Source concern, not a demonstrated runtime failure

Read-only inspection of the installed code found that `storage/protocols/s3/s3-handler.js:454` calls backend multipart creation before inserting its database session record (`:474`, `:489`). The local file backend writes `metadata.json` during that first call (`storage/backend/file.js:299`). Public multipart listing uses database records (`storage/database/pg.js:743`). No compensating cleanup appears in the inspected creation method.

This suggests a possible inventory gap if database session recording fails after backend creation. The interrupted runtime probe did not establish that outcome. Do not call this a demonstrated leak or infer that hosted Supabase behaves identically.

## Execution restriction and missing proof

An automatic security check stopped the proof agent. A reduced follow-up was also stopped. The controller did not retry fault injection, query cancellation, authorization probes or equivalent execution through another worker. It only inspected saved artifacts and performed the read-only housekeeping audit below.

Still unproven:

- Interrupted part/resume and actual lost-response recovery.
- Signed part capability scope/expiry and denial of alternate browser write paths.
- In-flight UploadPart versus Abort and Complete versus Abort/delete.
- Complete inventory after failed session creation, and removal of every payload, part, staging file and metadata artifact.
- Late part/completion attempts after cleanup cannot recreate any bytes.
- Integration with Event authority, revisions, receipts, current guard, content validation and attachment.
- Hosted/S3-backed runtime behavior and cleanup of existing TUS artifacts.

These gaps prevent a positive qualification verdict. No full application suite or production migration was attempted. Keep deletion pending and do not replace the upload protocol based on these results alone.

## Housekeeping audit

The saved run executed exact-resource teardown after recording its assertions. That teardown is not product cleanup proof.

Following the interrupted agent, the controller independently checked:

- No matching `node ...proof.mjs` process.
- No `multipart-proof-*` bucket or multipart session; no `multipart_proof_*` temporary trigger/function.
- A read-only filesystem walk of `/mnt`, restricted to the exact bucket path above: `{"ownedProofFiles":0,"ownedProofBytes":0}`.

Unknown older TUS artifacts were untouched. No database reset, service restart, hosted request or broad deletion occurred.

## Reference boundaries

Supabase documents multipart creation, listing, completion, abort and presigning in its [S3 compatibility guide](https://supabase.com/docs/guides/storage/s3/compatibility). API availability does not itself prove the missing cases. The [Storage schema guide](https://supabase.com/docs/guides/storage/schema/design) distinguishes database metadata from underlying bytes. AWS's [AbortMultipartUpload documentation](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html) also requires accounting for in-flight parts; it is not proof of this installed Supabase implementation.
