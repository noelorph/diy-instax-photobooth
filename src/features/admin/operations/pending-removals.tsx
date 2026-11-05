'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FormFeedback } from '@/components/shared/form-feedback';
import type { PendingMediaRemoval } from '@/lib/events/history';
export function PendingRemovals({ removals }: { removals: PendingMediaRemoval[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  if (!removals.length) return null;
  return (
    <section className="my-8 grid gap-4 border-t border-ds-border-subtle pt-6">
      <h2 className="m-0 text-lg leading-[1.625rem] font-semibold">Pending media removal</h2>
      <p className="m-0 max-w-prose text-sm leading-5 text-ds-text-muted">
        Identifying details are erased. Opaque audit references are retained. Cleanup is not
        complete until media removal succeeds.
      </p>
      {message && <FormFeedback kind="status">{message}</FormFeedback>}
      {removals.map((row) => (
        <div
          key={row.eventId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ds-warning-soft px-4 py-3"
        >
          <p className="m-0 min-w-0 flex-1 basis-56 wrap-anywhere">
            Draft deletion · Reference {row.eventId}
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const response = await fetch(`/api/admin/events/${row.eventId}/delete-draft`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    expectedRevision: row.revision,
                    operationId: row.operationId,
                  }),
                });
                const result = await response.json();
                setMessage(
                  response.ok
                    ? result.mediaRemovalState === 'complete'
                      ? 'Media removal complete.'
                      : 'Media removal still pending. Retry cleanup.'
                    : 'Unable to complete cleanup. Reload current state and try again.'
                );
                router.refresh();
              } catch {
                setMessage('Connection interrupted. Retry cleanup.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Retry media removal
          </Button>
        </div>
      ))}
    </section>
  );
}
