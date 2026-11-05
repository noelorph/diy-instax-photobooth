'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormFeedback } from '@/components/shared/form-feedback';
import type { OperationalEvent } from './types';
import styles from './panel.module.css';
import { AddPackages } from './add-packages';
import { BoothSetup } from './booth-setup';
import { BoothControls } from './booth-controls';
import { boothFetch } from '@/features/booth/flow';
import { STATE_POLL_MS } from '@/lib/operations/package-contract';

const phoneReadinessSchema = z.object({
  revision: z.number().int().nonnegative(),
  allowedActions: z.object({ resume: z.boolean().nullable().optional() }),
  blockers: z.array(z.string()),
  equipment: z
    .object({
      expiresAt: z.iso.datetime().nullable(),
      cameraLive: z.boolean(),
      printerConnected: z.boolean(),
      serverReachable: z.boolean(),
      filmLoaded: z.boolean(),
    })
    .nullable(),
});

export function OperationsPanel({
  event: serverEvent,
  adminUserId,
}: {
  event: OperationalEvent;
  adminUserId: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [handoffPending, setHandoffPending] = useState(false);
  const handoffActive = useRef(false);
  const pollRequest = useRef<Promise<void> | null>(null);
  const [readiness, setReadiness] = useState<{
    source: OperationalEvent;
    value: Pick<OperationalEvent, 'equipment' | 'resumeAllowed' | 'blockers'>;
    error?: string;
  } | null>(null);
  const sample = readiness?.source === serverEvent ? readiness : null;
  const event = sample ? { ...serverEvent, ...sample.value } : serverEvent;
  const idleWaiters = useRef<(() => void)[]>([]);
  const refreshAdmin = useCallback(() => {
    if (!handoffActive.current) startRefresh(() => router.refresh());
  }, [router, startRefresh]);
  // Local sign-out waits for this device's already-issued Admin reads.
  const prepareHandoff = useCallback(() => {
    handoffActive.current = true;
    setHandoffPending(true);
    const idle = new Promise<void>((resolve) => idleWaiters.current.push(resolve));
    return Promise.all([idle, pollRequest.current]).then(() => {});
  }, []);
  const releaseHandoff = useCallback(() => {
    handoffActive.current = false;
    setHandoffPending(false);
  }, []);
  useEffect(() => {
    if (!refreshing) idleWaiters.current.splice(0).forEach((resolve) => resolve());
  }, [refreshing, handoffPending]);
  useEffect(() => () => idleWaiters.current.splice(0).forEach((resolve) => resolve()), []);
  useEffect(() => {
    if (serverEvent.state !== 'Live' || refreshing) return;
    const controller = new AbortController();
    const poll = () => {
      if (document.visibilityState !== 'visible' || handoffActive.current || pollRequest.current)
        return;
      const request = (async () => {
        try {
          const state = phoneReadinessSchema.parse(
            await boothFetch(
              `/api/admin/events/${serverEvent.id}/booth/state`,
              undefined,
              adminUserId,
              controller.signal
            )
          );
          if (
            controller.signal.aborted ||
            handoffActive.current ||
            state.revision < serverEvent.revision
          )
            return;
          if (state.revision > serverEvent.revision) {
            // Counts, history and terminal Event state must come from the same page refresh.
            refreshAdmin();
            return;
          }
          setReadiness({
            source: serverEvent,
            value: {
              equipment: state.equipment,
              resumeAllowed: state.allowedActions.resume === true,
              blockers: state.blockers,
            },
          });
        } catch (error) {
          if (controller.signal.aborted || handoffActive.current) return;
          setReadiness({
            source: serverEvent,
            value: {
              equipment: null,
              resumeAllowed: false,
              blockers: [...new Set([...serverEvent.blockers, 'server_unreachable'])],
            },
            error:
              'Booth status could not be refreshed. Check the connection; status will be checked again.',
          });
          if (
            error instanceof Error &&
            'status' in error &&
            [401, 403].includes(Number(error.status))
          )
            refreshAdmin();
        }
      })().finally(() => {
        if (pollRequest.current === request) pollRequest.current = null;
      });
      pollRequest.current = request;
    };
    const timer = window.setInterval(poll, STATE_POLL_MS);
    window.addEventListener('focus', poll);
    window.addEventListener('online', poll);
    document.addEventListener('visibilitychange', poll);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', poll);
      window.removeEventListener('online', poll);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [serverEvent, adminUserId, refreshing, refreshAdmin]);

  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
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
      <header className={styles.panelHeader}>
        <h2>Event operations</h2>
        <p className={styles.stateMeta} data-state={event.state}>
          {event.state} Event
        </p>
      </header>
      {sample?.error && <FormFeedback kind="error">{sample.error}</FormFeedback>}
      {event.runState && (
        <section
          aria-label="Booth status"
          aria-live="polite"
          className={styles.runStatus}
          data-state={event.runState}
        >
          <h3>
            {
              {
                Prepared: 'Preparing Booth Mode',
                Active: 'Booth running',
                Paused: 'Booth paused',
                Finishing: 'Finishing Booth Mode',
                Finished: 'Booth Mode finished',
              }[event.runState]
            }
          </h3>
          <p>
            {event.runState === 'Paused'
              ? 'Only you can resume the booth from the phone.'
              : event.runState === 'Finishing'
                ? 'New Guests are blocked. Waiting for the current print to be resolved.'
                : event.runState === 'Finished'
                  ? event.state === 'Live'
                    ? 'The iPad shows the finished screen. Complete the Event to keep it in History, or prepare a new run on the Booth iPad.'
                    : 'This run is finished. Event records remain in History.'
                  : event.runState === 'Prepared'
                    ? 'Waiting for secure access on the Booth iPad.'
                    : 'New Guests can start only while equipment is ready and no print outcome is pending.'}
          </p>
        </section>
      )}
      <div className={styles.totals}>
        <section aria-label="Booked print capacity">
          <h3>Booked print capacity</h3>
          <p className={styles.totalsMeta}>
            {counts.originalPackages} original Film Packages · {counts.additionalPackages}{' '}
            additional Film Packages
          </p>
          <p className={styles.stat}>{counts.totalBookedPrints} total booked prints</p>
          <p className={styles.stat}>{counts.printed} printed</p>
          <p className={styles.stat} data-attention={counts.unresolved > 0 || undefined}>
            {counts.unresolved} print pending
          </p>
          <p className={styles.stat}>{counts.printsRemaining} prints remaining</p>
          <p className={styles.stat}>{counts.printsAvailable} prints available</p>
        </section>
      </div>
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
      <p className={styles.muted}>{event.captures} Captures</p>
      {counts.unresolved > 0 && (
        <p className={styles.warning}>
          A print is pending. Its booked print remains held until resolved.
        </p>
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
            <Button
              variant="quiet"
              disabled={busy || handoffPending || counts.unresolved > 0}
              onClick={(event) =>
                setPortalContainer(event.currentTarget.closest<HTMLElement>('.admin-shell'))
              }
            >
              Cancel Event
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal container={portalContainer}>
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
      <section id="print-attempts" className={styles.attempts}>
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
        {event.attempts.length === 0 && <p className={styles.muted}>No Print Attempts yet.</p>}
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
