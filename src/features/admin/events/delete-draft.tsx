'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormFeedback } from '@/components/shared/form-feedback';
import styles from '../operations/panel.module.css';

export function DeleteDraft({
  eventId,
  revision,
  title,
  disabled,
}: {
  eventId: string;
  revision: number;
  title: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const request = useRef<{ operationId: string; expectedRevision: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);

  async function remove() {
    if (busy) return;
    request.current ??= { operationId: crypto.randomUUID(), expectedRevision: revision };
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/events/${eventId}/delete-draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request.current),
      });
      const result = await response.json();
      if (!response.ok) {
        setBlocked(response.status < 500);
        setMessage(result.message ?? 'Deletion could not be confirmed. Retry the same request.');
      } else if (result.mediaRemovalState === 'complete') {
        router.push('/events');
        router.refresh();
      } else {
        setPending(true);
        setMessage(
          'Draft details are erased. Media cleanup is still pending. Retry cleanup or return to Events.'
        );
      }
    } catch {
      setMessage('Deletion could not be confirmed. Retry the same request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy) setOpen(value);
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          variant="destructive"
          disabled={disabled}
          onClick={(event) =>
            setPortalContainer(event.currentTarget.closest<HTMLElement>('[data-theme]'))
          }
        >
          Delete Draft
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-xl leading-7 font-semibold">Delete Draft?</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="quiet"
                size="icon"
                aria-label="Close Delete Draft dialog"
                title="Close Delete Draft dialog"
                disabled={busy}
              >
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <p>{title}</p>
          <Dialog.Description>
            Delete this Draft and its Event Media. This cannot be undone. Deletion is complete only
            after media cleanup succeeds.
          </Dialog.Description>
          {message && <FormFeedback kind={pending ? 'status' : 'error'}>{message}</FormFeedback>}
          <div className={styles.actions}>
            {pending ? (
              <Link href="/events">Back to Events</Link>
            ) : (
              <Dialog.Close asChild>
                <Button variant="secondary" disabled={busy}>
                  {message ? 'Close' : 'Keep Draft'}
                </Button>
              </Dialog.Close>
            )}
            {blocked ? (
              <a href={`/events/${eventId}`}>Reload latest Draft</a>
            ) : (
              <Button
                className="border-ds-danger bg-ds-danger text-ds-on-danger enabled:hover:border-ds-danger-hover enabled:hover:bg-ds-danger-hover"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy
                  ? 'Deleting…'
                  : pending
                    ? 'Retry cleanup'
                    : message
                      ? 'Retry deletion'
                      : 'Delete Draft'}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
