# Disposable multipart qualification

This is an isolated investigation, not an application upload implementation or a passing adoption suite. Read [the evidence report](../issue-30-isolated-multipart-proof.md) before interpreting results. The user approved this separate project; test-image instrumentation received an independent static review. No hosted resource is used.

Run from repository root with Node `v24.22.1`, Docker Desktop and the existing application dependencies installed at candidate `fd1dbf4`. The isolated lock pins AWS S3 client and presigner `3.1070.0`; image constants are immutable. The existing validator and synthetic AVC fixture are imported read-only from the repository. No application package or configuration is edited.

**Execution is stopped following an automatic security check. The commands below preserve the historical recipe; do not rerun this workflow as a workaround for the rejection.**

```sh
npm ci --prefix docs/qualification/multipart-isolated
node --test docs/qualification/multipart-isolated/acceptance.test.mjs
node docs/qualification/multipart-isolated/prepare-image.mjs
docker build --pull=false -t instax-multipart-isolated:reviewed docs/qualification/multipart-isolated/instrumentation
python3 docs/qualification/multipart-isolated/compare-images.py > docs/qualification/multipart-isolated/evidence/image-filesystem-comparison.json
node docs/qualification/multipart-isolated/proof.mjs original > /tmp/multipart-original-rerun.jsonl
node docs/qualification/multipart-isolated/proof.mjs instrumented > /tmp/multipart-instrumented-rerun.jsonl
```

Preserve new outputs under new names. Do not overwrite dated evidence. The saved instrumented run stopped at its exact injected-error assertion before marker/arm verification and the planned cleanup assertions. It is inconclusive; do not weaken its assertions to label it a pass. Review any additional instrumentation before running it.

`runtime.mjs` is the Docker recipe: separate project `instax-multipart-isolated-20261026`, DB and Storage containers, dedicated DB/bytes/control volumes and bridge. Only Storage is published at `127.0.0.1:57431`; the local response-drop proxy uses `127.0.0.1:57432`. The database has no published port. Docker Desktop's internal bridge blocked host loopback forwarding in the startup attempt, so the final recipe uses a separate standard bridge. The harness never addresses hosted services.

The stock database image initializes its own vendor schemas and roles. The harness sets a newly generated password for its existing `supabase_storage_admin` role through stdin, then lets the unchanged Storage image apply its own migrations. `DB_INSTALL_ROLES=false` matches the installed role setup. No application migration, trigger or database-session cancellation is used. PostgreSQL listens on its own Docker network; all credentials are newly generated in process memory and supplied to Docker through environment names, not command-line values or files. Docker necessarily holds container environment configuration until removal. No signed capability is saved or printed. Storage logs are disabled during proof cases; startup-only diagnostics preceded any signed request and redacted synthetic credentials.

The proxy discards a complete upstream Create/Complete response and destroys the downstream socket before delivering any headers/body. AWS automatic retries are disabled. Recovery uses ListMultipartUploads or GetObject. An interrupted part is observed at 1,000,000 physical bytes before disconnect, then retried at 6,000,000 bytes. This is interrupted/resume evidence, not an in-flight Abort race or a general server-drain guarantee.

Large fixtures use PNG tEXt and MP4 free-box padding. Byte-limit transfer and validator acceptance do not qualify realistic decoding workloads or iPad playback. The post-expiry request retained HTTP 400 only, not an expiry-specific error reason.

The capability holder uses only fetch, a presigned part URL and a public anon JWT. Server signing credentials stay in the harness's server-side client. These are HTTP capability checks, not an actual browser/CORS or application-session test. Private bucket policies allow no anon writes. REST errors can carry API status 403 inside HTTP 400; the assertions require an authorization status, not just any error.

`files()` reads every file under this proof's `/mnt`, recording relative path, byte length and SHA-256. Control markers are on a separate mount and are never counted as media cleanup. After API operations settle, empty objects/sessions and zero physical files are required. A bounded rescan accommodates the vendor's asynchronous completed-part-directory removal; elapsed time is not treated as a general drain boundary. Late retries are followed by another complete scan. Known client promises settle; this does not measure every internal server task or prove all concurrency orderings.

The failed-creation case models only a JavaScript rejection immediately before session persistence, after backend metadata creation. It does not model a database crash, partial commit or transaction rollback. The same controls run first with no arm file. The enabled case requires a fresh empty control mount, consumed one-shot arm, exact reached marker and exact injected error. A subsequent normal Create/Abort verifies the error was one-shot.

The saved runs removed the dedicated resources after recording evidence. Static review found that the retained recipe verifies container labels but relies on exact names for volume/network removal; it could mishandle a pre-existing same-name resource. Ownership/collision guards require correction and review before any independently permitted future execution. This exact-run harness is retained for evidence, not approved for reuse. It never counts as supported Storage cleanup. The original development stack is compared by container ID, image, start time and mounts before/after. The derived image is a retained reproducible build artifact, not a running environment.
