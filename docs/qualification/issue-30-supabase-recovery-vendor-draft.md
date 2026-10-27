# Supabase managed Storage recovery capability — submitted request

**Internal scope update — 2026-10-27 (not part of the sent request):** [ADR-0031](../adr/0031-temporarily-disable-event-media-uploads.md) makes new uploads temporarily unavailable while retaining the planned feature/design and pending-deletion safeguards. The submitted message below is preserved verbatim; this later product decision does not establish managed cleanup capability. No follow-up email was sent as part of this scope update.

## Submission record

Submitted with explicit user authorization on **2026-10-27 at 08:58:19 Asia/Manila (00:58:19 UTC)** from **noelorphiano5@gmail.com** to **support@supabase.com**.

- Gmail connection discovery exposed the Noel account; `get_profile` verified the authenticated email before sending. No From-header override was supplied.
- Gmail send succeeded; full message read-back verified the sender, recipient, subject, body and `SENT` label.
- Gmail message ID and thread ID: `1a17add83a64ebb5`.
- RFC Message-ID: `<CAEPYz9hQ_icD5EXAKahPWt0E1P6N=gRr=bQ0Vg4BAUKFXJEzDw@mail.gmail.com>`.
- No attachments, credentials, private project configuration or raw artifacts were submitted.
- Status: **receipt acknowledged; ticket SU-526385 assigned; awaiting a substantive answer**. No automatic monitoring is configured.
- Automated acknowledgment dated 2026-10-27 at 09:03:25 Asia/Manila (01:03:25 UTC), received in the same Gmail thread. Reply message ID: `1a17ae23238dbee1`; RFC Message-ID: `<78ee8305efba28a851f2db01668fb14e@frontapp.com>`. Gmail Authentication-Results reports SPF pass, DKIM pass for `supabase.com`, and DMARC pass; In-Reply-To matches the original request. The body confirms receipt and the ticket ID but answers none of the three capability questions.
- The acknowledgment offers optional account linking at `https://supabase.com/dashboard/support/link?conversationId=cnv_1osj3ty6` so Support can view organization/project details, and explicitly permits continuing by email. No account was linked and no reply was sent during verification.
- The submitted body is reproduced below in Markdown. Internal reviewer notes and the draft-only wrapper were excluded. The lifecycle question asks for clarification rather than asserting broader current API coverage.

**Subject:** Managed Storage: supported discovery and cleanup of multipart creation failures before session persistence

## Request

This is a managed-platform capability question, not a confirmed hosted defect.

Our three primary questions are:

1. Are uploads without a database session record discovered and cleaned up?
2. How does cleanup handle failures, retries, concurrent writes and late writes?
3. What supported signal allows our application to safely declare deletion complete?

We intend to use managed Supabase Storage standard private buckets, with separate staging and production projects. Vercel Pro hosts our Next.js application. Our application currently uses TUS; we have not adopted S3 multipart. Before reporting media deletion complete, we need supported discovery and removal of outstanding transfers, staging data and completed objects, including failures and requests already in flight. Database rejection or an empty object listing alone is insufficient.

Please identify the supported managed-platform recovery mechanism and completion evidence for this failure window:

1. Backend multipart creation succeeds.
2. Persistence of the Storage multipart session row fails or the service stops before it commits.
3. The client receives an error or no response and cannot recover a usable session through the normal API.

This sequence is a static scenario for discussion, not a request to run failure injection on our projects.

## Evidence and limitations

Inspected local image: Storage v1.79.36, `public.ecr.aws/supabase/storage-api@sha256:6a32896ae2d1ae2ea2d05ecaf6ed6c8a6b091739b469a8cf860ee89b2604d28f`.

- Compiled `storage/protocols/s3/s3-handler.js`, `createMultiPartUpload`: backend creation precedes `db.asSuperUser().createMultipartUpload`, without compensation around that sequence.
- The S3 backend adapter creates the provider multipart session with a versioned physical key. Public `listMultipartUploads` reads Storage database session rows; ordinary standard-bucket `abortMultipartUpload` requires the row before calling the backend.
- The inspected internal orphan scanner uses backend object listing. It does not establish enumeration of incomplete provider multipart sessions. The separate Iceberg route is outside our standard-bucket use case.

Original-image controls passed in an isolated local **file-backend** fixture. Separately, matching controls passed on a derived image with an unarmed hook. A subsequent armed attempt was inconclusive: the harness expected a literal error message that the S3 error handler normalizes, so it stopped before independent marker/arm checks and explicit cleanup attempts. Saved inventories showed no public objects/sessions and one 36-byte staging metadata file. We do not present that as a confirmed injected failure, a complete cleanup counterexample, or hosted reproduction. No further failure probes are being run.

The local fixture disabled the queue and did not use hosted infrastructure. Its limitations do not establish that managed Supabase lacks provider-level housekeeping. Our goal is to determine what managed recovery actually guarantees.

## Questions for Supabase

1. Does the documented automatic abort after 24 hours enumerate the physical provider's incomplete multipart sessions independently of `storage.s3_multipart_uploads`? Does it cover sessions created before a failed database insert or lost response? What are its cleanup deadline and retry guarantees?
2. Which supported customer API, recovery job or Support procedure discovers and removes these sessions when no Storage row exists? Can it be scoped to a project/bucket/object prefix, including duplicate sessions and all pages?
3. Does Support's orphan scanner cover only completed provider objects, or also incomplete multipart parts, TUS staging/metadata and completed-but-unpublished objects? Can Support provide pre/post inventory and completion evidence without deleting retained objects?
4. What acknowledgment or status proves all relevant bytes and transfer state are removed after outstanding UploadPart/Complete/TUS work has settled? What happens when a write was authorized before deletion or a cleanup attempt itself fails?
5. Is there a supported fixed Storage version or hosted reconciliation feature for this boundary? Please identify its rollout/configuration and relevant failure/concurrency tests. We are not asking for an unsupported SQL repair or direct access through internal admin endpoints.
6. Is there any supported incomplete-multipart cleanup capability, including bucket lifecycle configuration, beyond the documented automatic abort? Please clarify the scope of the S3 compatibility and JavaScript bucket lifecycle documentation for standard managed buckets, including required plan or feature entitlement.

## Relevant public references

- [S3 multipart upload and automatic abort](https://supabase.com/docs/guides/storage/uploads/s3-uploads)
- [S3 API compatibility](https://supabase.com/docs/guides/storage/s3/compatibility)
- [Current bucket lifecycle API limitations](https://supabase.com/docs/reference/javascript/file-buckets-updatebucketlifecycle)
- [Storage metadata versus physical objects](https://supabase.com/docs/guides/storage/schema/design)
- [Orphan scanner reliability announcement](https://supabase.com/blog/supabase-storage-performance-security-reliability-updates)
- [Support-assisted orphan cleanup discussion](https://github.com/orgs/supabase/discussions/34254)

## Requested outcome

A documented supported recovery path and evidence sufficient for an application to keep deletion pending until cleanup finishes, or confirmation that this completion guarantee is unavailable through the managed service. We will retain current TUS uploads, our scoped Storage commit guard and pending deletion while this is unresolved. Multipart adoption is paused.
