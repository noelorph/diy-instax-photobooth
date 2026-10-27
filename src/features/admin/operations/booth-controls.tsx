'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormFeedback } from '@/components/shared/form-feedback';
import { STATE_POLL_MS } from '@/lib/operations/package-contract';
import type { OperationalEvent } from './types';
import styles from './panel.module.css';

const commandSchema = z.object({
  action: z.enum(['pause', 'resume', 'finish', 'complete', 'cancel']),
  body: z.object({
    operationId: z.uuid(),
    expectedRevision: z.number().int(),
    runId: z.string().optional(),
  }),
});
type Command = z.infer<typeof commandSchema>;
const blockerMessages: Record<string, string> = {
  camera: 'Camera is not ready.',
  readiness_stale: 'Equipment readiness is out of date.',
  server_unreachable: 'The Booth connection is unavailable.',
  printer_connection: 'The printer is disconnected.',
  printer_not_safe: 'The printer needs attention.',
  film_reload_needed: 'Film reload needed.',
  printer_power: 'Continuous printer power needs confirmation.',
  guided_access: 'Guided Access needs confirmation.',
  access_required: 'Booth access must be restored on the Booth device.',
  run_state: 'This run does not currently allow Guest work.',
  guest_session_open: 'A Guest interaction is still open.',
  print_pending: 'A print outcome is pending.',
  booked_prints_exhausted: 'No booked prints are available.',
  qualification_required: 'Printer qualification is required.',
  evidence_discrepancy: 'The printer outcome needs review.',
};
export function BoothControls({
  event,
  adminUserId,
}: {
  event: OperationalEvent;
  adminUserId: string;
}) {
  const router = useRouter();
  const savedKey = `booth-command:${event.id}:${adminUserId}`;
  const pending = useRef<Command | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const reviewedFinish = useRef<Command | null>(null);
  const submitting = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [review, setReview] = useState<'finish' | 'complete' | 'cancel' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = sessionStorage.getItem(savedKey);
        if (saved) {
          pending.current = commandSchema.parse(JSON.parse(saved));
          setUncertain(true);
          setError('Booth command outcome is unconfirmed. Retry the original command.');
        }
        setReady(true);
      } catch {
        setBlocked(true);
        setError(
          'Saved Booth command cannot be read. Restore browser storage and reload before another command.'
        );
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [savedKey]);
  useEffect(() => {
    if (event.state !== 'Live') return;
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = window.setInterval(refresh, STATE_POLL_MS);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [event.state, router]);
  async function submit(action?: Command['action']) {
    if (submitting.current || blocked || !ready) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let command = pending.current;
      const recovering = !!command;
      if (!command) {
        if (!action || (['pause', 'resume'].includes(action) && !event.runId)) return;
        command = ['finish', 'complete', 'cancel'].includes(action)
          ? reviewedFinish.current
          : {
              action,
              body: {
                operationId: crypto.randomUUID(),
                expectedRevision: event.revision,
                runId: event.runId!,
              },
            };
        if (!command) return;
        sessionStorage.setItem(savedKey, JSON.stringify(command));
        pending.current = command;
      }
      setUncertain(true);
      const headers = { 'Content-Type': 'application/json', 'x-package-admin-id': adminUserId };
      let receipt: unknown;
      if (recovering) {
        const lookup = await fetch(
          `/api/admin/events/${event.id}/operations/${command.body.operationId}`,
          { cache: 'no-store', headers }
        );
        if (!lookup.ok) throw new Error();
        receipt = (await lookup.json()).receipt;
      }
      if (!receipt) {
        const path = ['complete', 'cancel'].includes(command.action)
          ? command.action
          : `booth/${command.action}`;
        const response = await fetch(`/api/admin/events/${event.id}/${path}`, {
          method: 'POST',
          cache: 'no-store',
          headers,
          body: JSON.stringify(command.body),
        });
        const result = await response.json();
        if (!response.ok) {
          if ([400, 409].includes(response.status) && result.code !== 'operation_conflict') {
            sessionStorage.removeItem(savedKey);
            pending.current = null;
            setUncertain(false);
            router.refresh();
            throw new Error(
              result.code === 'stale_revision'
                ? 'The Event changed. Review current state before trying again.'
                : (result.message ?? 'Booth command was not recorded. Review current state.')
            );
          }
          throw new Error();
        }
        receipt = result.receipt;
      }
      z.object({
        operationId: z.literal(command.body.operationId),
        kind: z.literal(command.action),
      }).parse(receipt);
      sessionStorage.removeItem(savedKey);
      pending.current = null;
      setUncertain(false);
      setReview(null);
      setNotice('Booth command recorded. Refreshing current state.');
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error &&
          cause.message &&
          !(cause instanceof TypeError) &&
          !(cause instanceof z.ZodError)
          ? cause.message
          : 'Booth command outcome is unconfirmed. Retry the original command.'
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const feedback = (
    <>
      {busy && <FormFeedback kind="status">Recording Booth command. Please wait.</FormFeedback>}
      {error && <FormFeedback kind="error">{error}</FormFeedback>}
      {notice && <FormFeedback kind="status">{notice}</FormFeedback>}
      {uncertain && (
        <Button disabled={busy || blocked} onClick={() => void submit()}>
          Retry Booth command
        </Button>
      )}
    </>
  );
  const disabled = !ready || busy || uncertain || blocked;
  return (
    <Dialog.Root
      open={review !== null}
      onOpenChange={(open) => {
        if (!open && !busy && !uncertain) setReview(null);
      }}
    >
      <section aria-label="Booth controls">
        {event.runState === 'Finishing' && (
          <p>
            Finishing Booth Mode. Waiting for the pending print outcome; new Guests are blocked.
          </p>
        )}
        {event.state === 'Live' && event.runId && (
          <div className={styles.actions}>
            {event.runState === 'Active' && (
              <Button disabled={disabled} onClick={() => void submit('pause')}>
                Pause Booth
              </Button>
            )}
            {event.runState === 'Paused' && (
              <Button
                disabled={disabled || !event.resumeAllowed || event.counts.unresolved > 0}
                onClick={() => void submit('resume')}
              >
                Resume Booth
              </Button>
            )}
            {['Active', 'Paused', 'Prepared'].includes(event.runState ?? '') && (
              <Dialog.Trigger asChild>
                <Button
                  variant="secondary"
                  disabled={disabled}
                  onClick={(e) => {
                    trigger.current = e.currentTarget;
                    setReview('finish');
                    if (event.runId)
                      reviewedFinish.current = {
                        action: 'finish',
                        body: {
                          operationId: crypto.randomUUID(),
                          runId: event.runId!,
                          expectedRevision: event.revision,
                        },
                      };
                  }}
                >
                  Finish Booth Mode
                </Button>
              </Dialog.Trigger>
            )}
          </div>
        )}
        {event.state === 'Live' && (
          <>
            <div className={styles.actions}>
              {(['complete', 'cancel'] as const).map((action) => (
                <Dialog.Trigger key={action} asChild>
                  <Button
                    variant={action === 'cancel' ? 'destructive' : 'secondary'}
                    disabled={
                      disabled || event.runState !== 'Finished' || event.counts.unresolved > 0
                    }
                    onClick={(e) => {
                      trigger.current = e.currentTarget;
                      reviewedFinish.current = {
                        action,
                        body: {
                          operationId: crypto.randomUUID(),
                          expectedRevision: event.revision,
                        },
                      };
                      setReview(action);
                    }}
                  >
                    {action === 'complete' ? 'Complete Event' : 'Cancel Event'}
                  </Button>
                </Dialog.Trigger>
              ))}
            </div>
            {(event.runState !== 'Finished' || event.counts.unresolved > 0) && (
              <p>
                Finish every Booth run and resolve all print outcomes before completing or
                cancelling this Event.
              </p>
            )}
          </>
        )}
        {event.state === 'Live' && event.runState !== 'Finished' && event.blockers.length > 0 && (
          <ul aria-label="Booth readiness blockers">
            {event.blockers.map((blocker) => (
              <li key={blocker}>
                {blockerMessages[blocker] ?? 'Booth readiness needs attention.'}
              </li>
            ))}
          </ul>
        )}
        {!review && feedback}

        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content
            className={styles.dialog}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              trigger.current?.focus();
            }}
          >
            <Dialog.Title>
              {review === 'complete'
                ? 'Complete Event'
                : review === 'cancel'
                  ? 'Cancel Event'
                  : 'Finish Booth Mode'}
            </Dialog.Title>
            <Dialog.Description>
              {review === 'finish'
                ? 'Stop new Guests and finish this run. A command already sent may still print; Booth Mode waits for its outcome. The Event stays Live.'
                : `${review === 'complete' ? 'Complete' : 'Cancel'} this Event. Its booking, counts, Captures, Print Attempts, Event Media and audit history remain in History. Booth Mode cannot restart for this Event.`}
            </Dialog.Description>
            {feedback}
            <div className={styles.actions}>
              <Button disabled={disabled} onClick={() => void submit(review ?? undefined)}>
                Confirm{' '}
                {review === 'complete'
                  ? 'Complete Event'
                  : review === 'cancel'
                    ? 'Cancel Event'
                    : 'Finish Booth Mode'}
              </Button>
              <Dialog.Close asChild>
                <Button variant="quiet" disabled={busy || uncertain}>
                  Back
                </Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </section>
    </Dialog.Root>
  );
}
