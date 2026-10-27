'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { FormFeedback } from '@/components/shared/form-feedback';
import type { OperationalEvent } from './types';
import styles from './panel.module.css';
import { AddPackages } from './add-packages';
import { BoothSetup } from './booth-setup';
import { BoothControls } from './booth-controls';

export function OperationsPanel({
  event,
  adminUserId,
}: {
  event: OperationalEvent;
  adminUserId: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [handoffPending, setHandoffPending] = useState(false);
  const handoffActive = useRef(false);
  const idleWaiters = useRef<(() => void)[]>([]);
  const refreshAdmin = useCallback(() => {
    if (!handoffActive.current) startRefresh(() => router.refresh());
  }, [router, startRefresh]);
  // Local sign-out must wait for this device's already-issued Admin refresh.
  const prepareHandoff = useCallback(() => {
    handoffActive.current = true;
    setHandoffPending(true);
    return new Promise<void>((resolve) => idleWaiters.current.push(resolve));
  }, []);
  const releaseHandoff = useCallback(() => {
    handoffActive.current = false;
    setHandoffPending(false);
  }, []);
  useEffect(() => {
    if (!refreshing) idleWaiters.current.splice(0).forEach((resolve) => resolve());
  }, [refreshing, handoffPending]);
  useEffect(() => () => idleWaiters.current.splice(0).forEach((resolve) => resolve()), []);

  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const operationId = useRef<string | null>(null);
  const [refreshed, setRefreshed] = useState<{
    source: typeof event.counts;
    counts: typeof event.counts;
  } | null>(null);
  const counts = refreshed?.source === event.counts ? refreshed.counts : event.counts;
  const setCounts = (counts: typeof event.counts) => setRefreshed({ source: event.counts, counts });
  async function cancelDraft() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    operationId.current ??= crypto.randomUUID();
    try {
      const response = await fetch(`/api/admin/events/${event.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: operationId.current,
          expectedRevision: event.revision,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        // Server failure may follow a commit; retain its retry identity.
        if (response.status < 500) operationId.current = null;
        throw new Error(
          data.code === 'stale_revision'
            ? 'The Event changed. Reload current state before trying again.'
            : (data.message ?? 'Unable to cancel this Event. Try again.')
        );
      }
      operationId.current = null;
      setReview(false);
      setNotice('Recorded. Refreshing current totals.');
      refreshAdmin();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Connection interrupted. Try again with the same operation.'
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel} aria-label="Event operations">
      <h2>Event operations</h2>
      <p>
        {event.state} · {event.runState ?? 'Booth not started'}
      </p>
      <div className={styles.totals}>
        <section aria-label="Booked print capacity">
          <h3>Booked print capacity</h3>
          <p>
            {counts.originalPackages} original Film Packages · {counts.additionalPackages}{' '}
            additional Film Packages
          </p>
          <p>{counts.totalBookedPrints} total booked prints</p>
          <p>{counts.printed} printed</p>
          <p>{counts.unresolved} print pending</p>
          <p>{counts.printsRemaining} prints remaining</p>
          <p>{counts.printsAvailable} prints available</p>
        </section>
      </div>
      {['Draft', 'Live'].includes(event.state) && (
        <BoothSetup
          key={`setup:${event.id}:${adminUserId}`}
          eventId={event.id}
          revision={event.revision}
          runId={event.runId}
          runState={event.runState}
          adminUserId={adminUserId}
          possibleDelivery={event.possibleDelivery}
          prepareHandoff={prepareHandoff}
          releaseHandoff={releaseHandoff}
        />
      )}
      <BoothControls
        key={`booth:${event.id}:${adminUserId}`}
        event={event}
        adminUserId={adminUserId}
        refreshAdmin={refreshAdmin}
        handoffPending={handoffPending}
      />
      <AddPackages
        key={`${event.id}:${adminUserId}`}
        eventId={event.id}
        adminUserId={adminUserId}
        eligible={event.state === 'Live'}
        counts={counts}
        onCounts={setCounts}
        refreshAdmin={refreshAdmin}
      />
      <p>{event.captures} Captures</p>
      {counts.unresolved > 0 && (
        <p>A print is pending. Its booked print remains held until resolved.</p>
      )}
      {notice && <FormFeedback kind="status">{notice}</FormFeedback>}
      {event.state === 'Draft' && (
        <Dialog.Root
          open={review}
          onOpenChange={(open) => {
            if (!busy) setReview(open);
          }}
        >
          <Dialog.Trigger asChild>
            <Button variant="quiet" disabled={busy || handoffPending || counts.unresolved > 0}>
              Cancel Event
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className={styles.overlay} />
            <Dialog.Content className={styles.dialog}>
              <Dialog.Title>Cancel Event</Dialog.Title>
              <Dialog.Description>
                Cancel this Event. Its booking and Event Media remain in History.
              </Dialog.Description>
              {error && (
                <FormFeedback kind="error">
                  {error}{' '}
                  <Button variant="quiet" onClick={refreshAdmin}>
                    Reload current state
                  </Button>
                </FormFeedback>
              )}
              <div className={styles.actions}>
                <Button disabled={busy} onClick={cancelDraft}>
                  Cancel Event
                </Button>
                <Dialog.Close asChild>
                  <Button variant="quiet" disabled={busy}>
                    Back
                  </Button>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      <section id="print-attempts">
        <h3>Print Attempts</h3>
        <nav aria-label="Print Attempt pages" className={styles.actions}>
          {event.attemptsPage > 0 && (
            <Link href={`/events/${event.id}?attemptPage=${event.attemptsPage - 1}#print-attempts`}>
              Newer print attempts
            </Link>
          )}
          {event.hasOlderAttempts && (
            <Link href={`/events/${event.id}?attemptPage=${event.attemptsPage + 1}#print-attempts`}>
              Older print attempts
            </Link>
          )}
        </nav>
        {event.attempts.length === 0 && <p>No Print Attempts yet.</p>}
        {event.attempts.map((attempt) => (
          <article key={attempt.id} className={styles.attempt}>
            <p>
              {attempt.kind} · {attempt.state}
            </p>
            <small>Reference {attempt.id}</small>
          </article>
        ))}
      </section>
    </section>
  );
}
