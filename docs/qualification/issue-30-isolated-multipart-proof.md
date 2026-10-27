# Issue #30 — isolated multipart qualification

**Current applicability — 2026-10-27:** [ADR-0031](../adr/0031-temporarily-disable-event-media-uploads.md) permits F2 to continue with uploads unavailable and the planned UI preserved. The NOT QUALIFIED verdict and separate original/instrumented evidence below are unchanged. Enabled media and complete media-bearing cleanup remain deferred; no further failure probes are authorized.

Date: 2026-10-27 (Asia/Manila); saved final runs: 2026-10-26 16:17–16:19 UTC. Application base: `fd1dbf4`, branch `feat/issue-30-event-preparation-media`.

**Verdict: NOT QUALIFIED for adoption.** Original-image supported-operation controls passed, and the same controls passed on the instrumented image with its hook disabled. The armed failure attempt was inconclusive, and the concurrency matrix did not run. Application TUS uploads, the scoped guard and pending-deletion behavior are unchanged. F2-04 and Task 4 remain gated.

## Evidence separation

Support follow-up, 2026-10-27: the [managed Storage capability request](issue-30-supabase-recovery-vendor-draft.md) was sent from authenticated `noelorphiano5@gmail.com` to `support@supabase.com` at 08:58:19 Asia/Manila (00:58:19 UTC). Gmail message/thread ID: `1a17add83a64ebb5`; full read-back confirmed the sender, recipient, body and `SENT` label. No raw artifacts or attachments were sent. A subsequent authenticated automated acknowledgment at 09:03:25 Asia/Manila (01:03:25 UTC) confirms receipt and ticket **SU-526385** (Gmail reply `1a17ae23238dbee1`). It supplies no substantive answer or qualification evidence; no automatic monitoring is configured. No further probes or runtime experiments were run. The NOT QUALIFIED verdict and F2-04/Task 4 blockers remain unchanged pending the vendor answer and subsequent qualification.

| Evidence                                                                                                           | Result                                                 | Scope                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [Original image](multipart-isolated/evidence/original-final.jsonl)                                                 | PASS for implemented control cases                     | Unmodified pinned Storage image; no test hook                                                                       |
| [Instrumented image](multipart-isolated/evidence/instrumented-final.jsonl), `instrumented-disabled-control-result` | PASS for matching control cases                        | Derived image, hook unarmed; separately reported because the async hook changes scheduling                          |
| Same instrumented log, `failed-session-persistence`                                                                | INCONCLUSIVE; harness exited with an assertion failure | Required exact injected-error observation failed before marker/arm verification and explicit orphan cleanup retries |
| [Image comparison](multipart-isolated/evidence/image-filesystem-comparison.json)                                   | PASS                                                   | Exactly two changed/added non-directory entries; declared hashes match                                              |
| In-flight UploadPart versus Abort; Complete versus Abort/Delete                                                    | NOT RUN                                                | No scheduling hooks implemented or executed; no concurrency qualification                                           |

The raw instrumented log says `FAIL` because an assertion failed. It does not establish a completed cleanup counterexample or a passing cleanup result. The interpretations in this report take precedence over treating that generic status as a backend verdict.

## Environment and isolation

The proof used its own `instax-multipart-isolated-20261026` Docker project, database and Storage containers, separate database/bytes/control volumes, new synthetic credentials and bridge. Storage was exposed only on `127.0.0.1:57431`; the response-drop proxy used `127.0.0.1:57432`. The database had no published port. No current application migration or shared-database trigger/cancellation mechanism was used.

Original Storage image and RepoDigest: `public.ecr.aws/supabase/storage-api@sha256:6a32896ae2d1ae2ea2d05ecaf6ed6c8a6b091739b469a8cf860ee89b2604d28f` (installed v1.79.36). Derived image ID: `sha256:b444a205e23bd41bee6ffeaf53f8f535b8a8bf778aaeb2e1d305bf911aba1884`. Database image ID: `sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108`.

Runtime configuration is recorded in each log. It uses the file backend, vendor-created database roles, `DB_INSTALL_ROLES=false`, `LOG_LEVEL=silent` during cases and `PG_QUEUE_ENABLE=false`. These are isolated test settings, not proof of equivalence to every development/hosted deployment. There is no Auth service or browser UI in this fixture; capability checks use HTTP clients and synthetic JWTs. The two final runs use identical harness hashes and settings except the image and fresh generated resource identities/credentials.

Existing development container IDs, images, start times and mounts were captured before and after each completed run and remained equal. This is configuration/lifecycle evidence, not a byte-for-byte audit of existing databases. No application files, application dependencies, existing uploads or hosted resources were modified.

## Instrumentation assurance

The [vendor patch](multipart-isolated/instrumentation/vendor.patch) adds one awaited hook call after backend multipart creation and before the database session-persistence call. The [hook](multipart-isolated/instrumentation/qualification-hook.cjs) consumes an arm file, writes a reached marker and throws a one-shot JavaScript error. Control files are on a separate volume outside `/mnt`.

An [independent static review](multipart-isolated/reviews/instrumentation.md) approved this limited patch and the amended build recipe before instrumented execution. No authorization check, RLS policy, cleanup algorithm, existing error handler, lock/transaction operation or successful-response construction was edited. The exception models rejection before the persistence call begins; it does not reproduce database crash, partial commit, rollback or every database error.

The exported-rootfs comparison examined 90,513 original and 90,514 derived non-directory entries, comparing content hash, type, mode, owner/group, link target and size. Only the handler and added hook differ. Timestamps and directories are excluded. Handler hashes are `aace33b5104341183e2f4efcfa0653a41014858060b11e9776b430d9f3b9c990` original and `8f684d2aafa819cb82ee963d911276265f4c6ba5f3f896749345b36c5ee79c5b` derived. Hook SHA-256 is `d6304ccfd59e05739ed6e6285a6a9298fc84658caaae331af227f02ca87ace3c`.

Matching disabled controls provide additional behavioral evidence within their covered cases. They do not establish that instrumentation is observationally identical under every possible schedule: even the unarmed async hook adds a continuation boundary.

## Passed control cases — both images, hook disabled

- Exact 10,000,000-byte PNG and 50,000,000-byte AVC MP4 multipart transfers, download hashes and the existing trusted content validator. Video duration was 30,000 ms. The synthetic 2×2 PNG and 32×32, 1 fps video use PNG tEXt/MP4 free-box padding to reach those byte limits. This proves transfer size and validator acceptance, not equivalent real-world decoding load or iPad playback; video validation does not decode H.264 pixels.
- Actual dropped Create response followed by recovery through ListMultipartUploads, duplicate sessions for one key and pagination.
- Actual dropped video Complete response followed by GetObject recovery; repeated Complete returned `NoSuchUpload`.
- Interrupted UploadPart with 1,000,000 bytes observed on disk, then successful retry/resume to 6,000,000 bytes and matching downloaded hash. This is not an Abort concurrency race.
- Presigned part capability restrictions for bucket, key, part, session and nonpermitted methods. The exact permitted part request succeeded. A request using the same capability was rejected after its expiry window with HTTP 400; an expiry-specific error reason was not retained.
- Valid anonymous requests denied for ordinary upload, signed-upload minting and TUS creation. REST returned HTTP 400 with explicit API 403/Unauthorized; TUS returned HTTP 403. Earlier malformed-request denials were not accepted as authorization proof.
- Unexpired late part and Complete retries after an ordinary Abort returned 404, followed by another empty scan.
- Supported cleanup left empty public object/session inventories and zero files in the proof's Storage volume before forced teardown for each completed control case.

Known client requests were settled before scans. A bounded rescan accommodated asynchronous cleanup. This does not establish a general server-drain timeout or every concurrent request ordering. The capability holder was an HTTP client, not a browser; browser CORS and current Admin/Booth session integration were not qualified.

## Inconclusive armed attempt

The hook was armed after the disabled controls. The request failed, but the SDK did not expose the literal `QualificationInjectedPersistenceError` expected by `proof.mjs:135`. The worker identified that assertion in its status report; the saved JSONL retains only a generic strict-equality failure and does not independently identify the precise assertion. That reported assertion stopped the case before the reached-marker and consumed-arm checks, explicit cleanup by recovered orphan ID, one-shot follow-up and late retries for this failure scenario.

The failure handler recorded empty object/session inventories with a **36-byte `metadata.json`** under the proof's multipart directory. A second snapshot after cleanup based on public inventories still showed the same file. Those observations are real and are retained. However, the required instrumentation-observation gate did not complete; public inventories were empty, so that cleanup loop had no enumerated resources to act on. The explicit by-ID Abort/Delete retries later in the planned case did not run.

Do not attribute this residue conclusively to the intended injected error, claim that every supported cleanup operation failed, or call it an original-image failure. Further investigation was stopped by the security check described below.

## Rejection and stop behavior

A shell-sandbox diagnostic earlier returned exactly `zsh:1: operation not permitted: ps`. It was not retried through escalation or an equivalent process-list command.

After the inconclusive armed attempt, the proof agent's turn was stopped with:

> This content was flagged for possible cybersecurity risk.

The message did not identify a particular tool call or command. At that point the agent was investigating observation of the injected error. The record does not establish which action triggered the check. No equivalent retry, revised probe or replacement execution agent was used after this rejection. Remaining work was limited to reading saved evidence, documenting results, static review and exact-resource housekeeping audit. This was not a sandbox approval-review rejection of an identified Docker command.

## Reproducibility and earlier attempts

The [qualification directory](multipart-isolated/README.md) retains exact-run harness source, isolated dependency lock, image recipes, patch and sanitized evidence. The `proof.mjs`, `runtime.mjs`, `acceptance.mjs` and package-lock hashes currently match the hashes embedded in both final logs. Source files are preserved byte-for-byte rather than reformatted after execution. No claim is made that the incomplete harness is a passing adoption suite. Execution remains stopped; the retained commands are a historical recipe, not a request to work around the rejection.

Earlier output files remain separately named. Initial setup failed on database readiness/listening and vendor schema ownership; a build attempt failed because the original image lacked `patch`. The amended recipe prepares a hash-checked handler outside the image and copies it into the derived image. Earlier case attempts also had insufficient authorization assertions. None of those attempts is silently counted as a successful final case.

[Independent read-only review](multipart-isolated/reviews/saved-evidence.md) corroborated the matching hashes, evidence separation, narrow patch and NOT QUALIFIED conclusion. Its reporting corrections (expiry specificity, padded fixtures and assertion provenance) are incorporated here; the latent recipe issue is disclosed below.

A controller scan found no JWT strings, bearer credentials or signed-URL credential/signature query values in the retained JSON/JSONL/Markdown artifacts. Docker held newly generated credentials in container configuration until removal; no credential-bearing runtime logs were retained. The isolated package lock does not change the application's dependencies.

## Housekeeping and adoption gate

Both saved final runs record exact-owned-resource teardown after their observations. Forced teardown is not product cleanup evidence. A subsequent controller read-only audit confirmed absence of the exact proof database, Storage, source/export containers, three volumes and network. One audit parser initially did not recognize Docker's lowercase “no such volume”; correcting that parser completed the audit without executing any proof case. The derived image remains a local build artifact.

The read-only review also found a latent safety issue in the retained recipe: container teardown verifies ownership labels, but volume/network teardown checks exact names only. A future invocation could mishandle a pre-existing same-name resource. No such damage is established in the saved runs. The harness is preserved as exact-run evidence, not approved for reuse; ownership/collision guards must be corrected and reviewed before any independently permitted future execution. No further execution or runtime fix was attempted after the security stop.

Still required before any adoption: confirmed failure-boundary observation, complete supported cleanup of all backend artifacts, deterministic in-flight part/abort and completion/abort/delete cases, late nonresurrection, and application integration review. Hosted storage and old TUS artifacts are separate gates. Keep current uploads and pending deletion unchanged.
