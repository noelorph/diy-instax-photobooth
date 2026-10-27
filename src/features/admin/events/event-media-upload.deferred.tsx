'use client';

// Deferred until private upload/cleanup proof and the remaining media editor work are complete.
import { useEffect, useRef, useState } from 'react';
import { Upload } from 'tus-js-client';
import { createClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormFeedback } from '@/components/shared/form-feedback';
import type { MediaKind } from '@/lib/events/media-types';
import type { PackageOperationResult } from '@/lib/operations/package-contract';
import styles from './draft.module.css';

type Pending = {
  file: File;
  kind: MediaKind;
  operationId: string;
  expectedRevision: number;
  finishKey: string;
  assetId?: string;
  upload?: Upload;
};
type Stage =
  | 'idle'
  | 'beginning'
  | 'begin_error'
  | 'transferring'
  | 'paused'
  | 'validating'
  | 'uncertain'
  | 'error'
  | 'success';

export function EventMediaEditor({ eventId, revision }: { eventId: string; revision: number }) {
  const currentRevision = useRef(revision);
  const pending = useRef<Pending | null>(null);
  const inputs = useRef<Partial<Record<MediaKind, HTMLInputElement | null>>>({});
  const [stage, setStage] = useState<Stage>('idle');
  const [message, setMessage] = useState('');
  const [percent, setPercent] = useState(0);
  const busy = [
    'beginning',
    'transferring',
    'paused',
    'validating',
    'uncertain',
    'begin_error',
  ].includes(stage);
  useEffect(
    () => () => {
      void pending.current?.upload?.abort();
    },
    []
  );

  async function attach() {
    const job = pending.current;
    if (!job?.assetId) return;
    setStage('validating');
    setMessage('Transfer complete. Validating media…');
    try {
      const response = await fetch(`/api/admin/events/${eventId}/media/${job.assetId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operationId: job.finishKey,
          expectedRevision: job.expectedRevision,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.message);
        setStage(response.status >= 500 ? 'uncertain' : 'error');
        return;
      }
      currentRevision.current = result.revision;
      pending.current = null;
      setStage('success');
      setMessage('Media attached.');
    } catch {
      setStage('uncertain');
      setMessage('Attachment could not be confirmed. Retry to recover its result.');
    }
  }

  async function transfer() {
    const job = pending.current;
    if (!job) return;
    setStage('beginning');
    setMessage('Preparing upload…');
    try {
      const response = await fetch(`/api/admin/events/${eventId}/media/uploads`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operationId: job.operationId,
          expectedRevision: job.expectedRevision,
          kind: job.kind,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.message);
        setStage(response.status >= 500 ? 'begin_error' : 'error');
        return;
      }
      const result = body as PackageOperationResult<{
        assetId: string;
        bucket: string;
        path: string;
      }>;
      job.assetId = result.receipt.result.assetId;
      job.expectedRevision = result.revision;
      currentRevision.current = result.revision;
      const client = createClient();
      job.upload = new Upload(job.file, {
        endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [],
        uploadDataDuringCreation: false,
        storeFingerprintForResuming: false,
        metadata: {
          bucketName: result.receipt.result.bucket,
          objectName: result.receipt.result.path,
          contentType: ['image/png', 'image/jpeg', 'image/webp', 'video/mp4'].includes(
            job.file.type
          )
            ? job.file.type
            : job.kind === 'background'
              ? 'image/png'
              : 'video/mp4',
          cacheControl: '0',
        },
        onBeforeRequest: async (request) => {
          const session = (await client.auth.getSession()).data.session;
          if (!session) throw new Error('Sign in to continue.');
          request.setHeader('authorization', `Bearer ${session.access_token}`);
          request.setHeader('x-upsert', 'false');
        },
        onProgress: (sent, total) => setPercent(Math.floor((sent / total) * 100)),
        onError: (error) => {
          const forbidden =
            'originalResponse' in error && error.originalResponse?.getStatus() === 403;
          setStage(forbidden ? 'error' : 'paused');
          setMessage(
            forbidden
              ? 'Upload no longer permitted. Reload the Event.'
              : 'Upload interrupted. Resume to continue.'
          );
        },
        onSuccess: () => {
          void attach();
        },
      });
      setPercent(0);
      setStage('transferring');
      setMessage('Uploading media…');
      job.upload.start();
    } catch {
      setStage('begin_error');
      setMessage('Upload preparation could not be confirmed. Retry the same request.');
    }
  }

  function start(kind: MediaKind) {
    const file = inputs.current[kind]?.files?.[0];
    if (!file) {
      setStage('error');
      setMessage('Choose a file first.');
      return;
    }
    pending.current = {
      file,
      kind,
      operationId: crypto.randomUUID(),
      expectedRevision: currentRevision.current,
      finishKey: crypto.randomUUID(),
    };
    void transfer();
  }

  return (
    <section className={styles.media} aria-labelledby="event-media-heading">
      <h2 id="event-media-heading">Event Media</h2>
      <p className={styles.help}>
        Optional Draft media. Still JPEG, PNG or WebP up to 10 MB; H.264 MP4 up to 50 MB and 30
        seconds. Montage playback is muted.
      </p>
      {(['background', 'montage'] as const).map((kind) => (
        <div className={styles.fields} key={kind}>
          <label htmlFor={`event-${kind}`}>
            {kind === 'background' ? 'Background image' : 'Welcome montage'}
          </label>
          <Input
            id={`event-${kind}`}
            type="file"
            accept={kind === 'background' ? 'image/jpeg,image/png,image/webp' : 'video/mp4'}
            disabled={busy}
            ref={(input) => {
              inputs.current[kind] = input;
            }}
          />
          <Button variant="secondary" disabled={busy} onClick={() => start(kind)}>
            Upload {kind}
          </Button>
        </div>
      ))}
      {stage === 'transferring' && (
        <>
          <progress aria-label="Media transfer" max={100} value={percent} />
          <Button
            variant="quiet"
            onClick={async () => {
              await pending.current?.upload?.abort();
              setStage('paused');
              setMessage('Upload paused.');
            }}
          >
            Pause upload
          </Button>
        </>
      )}
      {message && (
        <FormFeedback
          kind={
            ['error', 'uncertain', 'paused', 'begin_error'].includes(stage)
              ? 'error'
              : stage === 'success'
                ? 'success'
                : 'status'
          }
        >
          {message}
        </FormFeedback>
      )}
      {stage === 'paused' && (
        <Button
          onClick={() => {
            setStage('transferring');
            setMessage('Uploading media…');
            pending.current?.upload?.start();
          }}
        >
          Resume upload
        </Button>
      )}
      {stage === 'uncertain' && <Button onClick={() => void attach()}>Retry attachment</Button>}
      {stage === 'begin_error' && (
        <Button onClick={() => void transfer()}>Retry preparation</Button>
      )}
    </section>
  );
}
