'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormFeedback } from '@/components/shared/form-feedback';
import { SimulatedPrinter, type SimulatedOutcome } from '@/features/booth/printer/simulator';
import type { PrinterObservation } from '@/features/booth/printer/contract';
import type { OperationalEvent } from './types';
import styles from './panel.module.css';

type Review = {
  label: string;
  effect: string;
  path: string;
  body: Record<string, unknown>;
  reason?: string;
};
export function OperationsPanel({
  event,
  simulatorEnabled,
}: {
  event: OperationalEvent;
  simulatorEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [review, setReview] = useState<Review | null>(null),
    [reason, setReason] = useState('');
  const [quantity, setQuantity] = useState('1'),
    [stockReason, setStockReason] = useState('');
  const [replacementTitle, setReplacementTitle] = useState('');
  const [checked, setChecked] = useState(false);
  const [connectionId, setConnectionId] = useState(event.connectionId ?? '');
  const [outcome, setOutcome] = useState<SimulatedOutcome>('ejected');
  const testProgress = useRef<{
    id: string;
    observations: (PrinterObservation & { observedAt: string })[];
    index: number;
  } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const base = `/api/admin/events/${event.id}`;
  const available =
    event.originalAllowance +
    event.additionalPrints -
    event.confirmedPrints -
    event.allowanceReserved;
  const holds = event.stockReserved > 0;
  const terminal = ['Completed', 'Cancelled'].includes(event.state);
  async function post(path: string, body: Record<string, unknown>) {
    const signature = JSON.stringify([path, body]);
    if (!pending.current || pending.current.signature !== signature)
      pending.current = { signature, key: crypto.randomUUID() };
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, operationKey: pending.current.key }),
    });
    const data = await response.json();
    if (!response.ok) {
      pending.current = null;
      throw new Error(
        data.code === 'state_conflict'
          ? 'The Event changed or is not ready. Reload current state before trying again.'
          : data.code === 'pending_attempt'
            ? 'Resolve the pending print first. Review unresolved prints below.'
            : (data.message ?? 'Unable to record this operation.')
      );
    }
    pending.current = null;
    return data;
  }
  async function act(path: string, body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await post(path, body);
      setReview(null);
      setReason('');
      setNotice(
        data.mediaRemovalState === 'pending'
          ? 'Media removal pending. Retry cleanup to finish.'
          : 'Recorded. Refreshing current totals.'
      );
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Connection interrupted. Try again with the same operation.'
      );
    } finally {
      setBusy(false);
    }
  }
  async function testPrint() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!testProgress.current) {
        const reserved = await post(`${base}/test-attempts`, { connectionId });
        if (reserved.state !== 'Reserved')
          throw new Error(
            'The Test Print already has a recorded outcome. Reload and inspect it; do not resend.'
          );
        // Generated calibration raster only; no Guest photo is involved or persisted.
        const calibration = new Uint8Array(32 * 32 * 3);
        for (let y = 0; y < 32; y++)
          for (let x = 0; x < 32; x++) {
            const i = (y * 32 + x) * 3;
            calibration[i] = x * 8;
            calibration[i + 1] = y * 8;
            calibration[i + 2] = (x + y) % 2 ? 255 : 0;
          }
        const observations = await new SimulatedPrinter(outcome).sendOnce(
          reserved.attemptId,
          calibration
        );
        testProgress.current = {
          id: reserved.attemptId,
          observations: observations.map((value) => ({
            ...value,
            observedAt: new Date().toISOString(),
          })),
          index: 0,
        };
      }
      const progress = testProgress.current;
      while (progress.index < progress.observations.length) {
        const observation = progress.observations[progress.index];
        await post(`/api/admin/print-attempts/${progress.id}/observations`, {
          observationKind: observation.kind,
          evidenceCode:
            observation.kind === 'commandAccepted'
              ? 'command_acknowledged'
              : observation.kind === 'physicalEjectionVerified'
                ? 'simulator_ejection'
                : observation.kind === 'preFilmRejected'
                  ? 'pre_film_rejection'
                  : 'ambiguous_outcome',
          observedAt: observation.observedAt,
        });
        progress.index++;
      }
      testProgress.current = null;
      setNotice(
        outcome === 'ejected'
          ? 'Simulated ejection recorded. Inspect the Test Print output and record whether it is usable.'
          : outcome === 'accepted'
            ? 'Command accepted; physical ejection remains unverified.'
            : 'Test outcome recorded. Review the Print Attempt.'
      );
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Test interrupted. Retry reporting without sending again.'
      );
    } finally {
      setBusy(false);
    }
  }
  function ask(value: Review) {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setReason('');
    setReview(value);
  }
  const revision = { expectedRevision: event.revision };
  const usable =
    connectionId &&
    event.attempts.some(
      (a) => a.kind === 'Test' && a.connection_id === connectionId && a.test_output_usable === true
    );
  return (
    <section className={styles.panel} aria-label="Event operations">
      <h2>Event operations</h2>
      <p>
        {event.state} · {event.runState ?? 'Booth not started'}
      </p>
      <div className={styles.totals}>
        <section>
          <h3>Print Allowance · this Event</h3>
          <p>{available} prints available</p>
          <p>{event.allowanceReserved} prints reserved</p>
          <small>
            Original {event.originalAllowance} · Additional Prints {event.additionalPrints}
          </small>
        </section>
        <section>
          <h3>Film Stock · shared across Events</h3>
          <p>{event.onHand - event.stockReserved} sheets available</p>
          <p>{event.stockReserved} sheets reserved</p>
          <small>
            Physical inventory recorded by Admin; printer-reported counts are diagnostics only.
          </small>
        </section>
      </div>
      <p>
        {event.captures} Captures · {event.confirmedPrints} Confirmed Prints
      </p>
      {error && !review && (
        <FormFeedback kind="error">
          {error}{' '}
          <Button variant="quiet" onClick={() => router.refresh()}>
            Reload current state
          </Button>
        </FormFeedback>
      )}
      {notice && <FormFeedback kind="status">{notice}</FormFeedback>}
      {!simulatorEnabled && (
        <p className={styles.warning}>
          Printer-dependent controls are disabled pending #17: physical ejection confirmation must
          be validated. The actual-iPad release gate remains open.
        </p>
      )}
      {holds && (
        <p>
          Unresolved reservations block finish, deletion and stock reconciliation.{' '}
          <a href="#print-attempts">Review unresolved prints</a>
        </p>
      )}
      {!terminal && (
        <>
          <h3>Readiness</h3>
          <ul>
            <li>{available > 0 ? 'Guest allowance available' : 'Add guest allowance'}</li>
            <li>
              {event.onHand - event.stockReserved > 0
                ? 'Film available'
                : 'Add physical Film Stock'}
            </li>
            <li>
              {usable
                ? 'Usable Test Print inspected for this connection'
                : 'A usable Test Print is required for this connection'}
            </li>
            <li>{holds ? 'Resolve the pending print' : 'No unresolved print holds'}</li>
          </ul>
          {simulatorEnabled && (
            <>
              <label>
                Simulated Test outcome
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as SimulatedOutcome)}
                >
                  <option value="ejected">Verified simulated ejection</option>
                  <option value="accepted">Accepted only</option>
                  <option value="uncertain">Uncertain</option>
                  <option value="rejected">Rejected before film use</option>
                </select>
              </label>
              <Button
                disabled={busy || holds || event.runState === 'Active'}
                onClick={() => {
                  setConnectionId(crypto.randomUUID());
                  setChecked(false);
                }}
              >
                Connect simulator
              </Button>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                Camera, printer and Guided Access setup checked for this simulated session
              </label>
            </>
          )}
          <div className={styles.actions}>
            <Button
              disabled={
                !simulatorEnabled || busy || !connectionId || holds || event.runState === 'Active'
              }
              onClick={testPrint}
            >
              Test Print
            </Button>
            <Button
              disabled={
                !simulatorEnabled ||
                busy ||
                !checked ||
                !usable ||
                holds ||
                available <= 0 ||
                event.onHand - event.stockReserved <= 0 ||
                event.runState === 'Active'
              }
              onClick={async () => {
                setBusy(true);
                setError('');
                let prepared: { handoffId: string };
                try {
                  prepared = await post(`${base}/booth-handoffs`, {
                    ...revision,
                    connectionId,
                    setupEvidence: {
                      cameraReady: true,
                      printerReady: true,
                      guidedAccessReady: true,
                    },
                  });
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : 'Unable to prepare Booth Mode. Reload current state.'
                  );
                  setBusy(false);
                  return;
                }
                try {
                  await post(`/api/admin/booth-handoffs/${prepared.handoffId}/issue`, {});
                  // Full navigation discards authenticated client state after device-local sign-out.
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.assign(
                    `/booth?handoff=${encodeURIComponent(prepared.handoffId)}`
                  );
                } catch {
                  // Full navigation discards authenticated client state after device-local sign-out.
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.assign('/sign-in?from=booth');
                }
              }}
            >
              {event.state === 'Draft' ? 'Start Booth Mode' : 'Resume Booth Mode'}
            </Button>
            {event.state === 'Live' && (
              <>
                <Button
                  disabled={busy || !['Active', 'Prepared'].includes(event.runState ?? '')}
                  onClick={() => act(`${base}/pause`, revision)}
                >
                  Pause Booth Mode
                </Button>
                <Button
                  disabled={busy || holds}
                  onClick={() =>
                    ask({
                      label: 'Finish Event',
                      effect:
                        'End Booth Mode and revoke Guest access. This Event moves to History with its accounting records.',
                      path: `${base}/complete`,
                      body: revision,
                    })
                  }
                >
                  Finish Event
                </Button>
              </>
            )}
            <Button
              variant="quiet"
              disabled={busy || holds}
              onClick={() =>
                ask({
                  label: 'Cancel Event',
                  effect:
                    'Revoke Guest access and move this Event to History. Recorded stock and print totals remain.',
                  path: `${base}/cancel`,
                  body: revision,
                })
              }
            >
              Cancel Event
            </Button>
          </div>
          <h3>Allowance and stock</h3>
          <label>
            Quantity
            <Input
              type="number"
              min="0"
              max="2147483647"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label>
            Stock reason
            <Input
              value={stockReason}
              onChange={(e) => setStockReason(e.target.value)}
              maxLength={1000}
            />
          </label>
          <div className={styles.actions}>
            <Button
              disabled={busy || !Number.isInteger(Number(quantity)) || Number(quantity) <= 0}
              onClick={() => act(`${base}/additional-prints`, { quantity: Number(quantity) })}
            >
              Add guest prints
            </Button>
            <Button
              disabled={
                busy ||
                !stockReason.trim() ||
                !Number.isInteger(Number(quantity)) ||
                Number(quantity) <= 0
              }
              onClick={() =>
                act('/api/admin/film-stock/additions', {
                  sheets: Number(quantity),
                  reason: stockReason,
                })
              }
            >
              Add Film Stock
            </Button>
            <Button
              disabled={
                busy ||
                holds ||
                !stockReason.trim() ||
                !Number.isInteger(Number(quantity)) ||
                Number(quantity) < 0
              }
              onClick={() =>
                ask({
                  label: 'Reconcile Film Stock',
                  effect: `Replace shared physical stock balance with the observed ${quantity} sheets. The signed correction and reason remain in history.`,
                  path: '/api/admin/film-stock/reconciliations',
                  body: { observedSheets: Number(quantity), reason: stockReason },
                })
              }
            >
              Reconcile Film Stock
            </Button>
          </div>
        </>
      )}
      <section id="print-attempts">
        <h3>Print Attempts</h3>
        {event.attempts.length === 0 && <p>No Print Attempts yet.</p>}
        {event.attempts.map((a) => (
          <article key={a.id} className={styles.attempt}>
            <p>
              {a.kind} ·{' '}
              {a.state === 'Accepted'
                ? 'Command accepted · physical ejection unverified'
                : a.state === 'Confirmed'
                  ? a.kind === 'Test'
                    ? 'Test Print · verified ejection'
                    : 'Confirmed Print · verified ejection'
                  : a.state === 'Ejected'
                    ? 'Test Print · verified ejection'
                    : a.state}
            </p>
            <small>Reference {a.id}</small>
            {a.state === 'Uncertain' && (
              <div className={styles.actions}>
                {(['ejected', 'unused'] as const).map((outcome) => (
                  <Button
                    key={outcome}
                    disabled={busy || (outcome === 'ejected' && !simulatorEnabled)}
                    onClick={() =>
                      ask({
                        label: `Record ${outcome} outcome`,
                        effect:
                          outcome === 'unused'
                            ? `Release the held sheet${a.kind === 'Guest' ? ' and guest print' : ''}; no film was consumed.`
                            : `Consume the held sheet${a.kind === 'Guest' ? ' and guest allowance' : ''}. This records inspected ejection.`,
                        path: `/api/admin/print-attempts/${a.id}/resolve`,
                        body: { outcome },
                        reason: 'Inspection reason',
                      })
                    }
                  >
                    Resolve as {outcome}
                  </Button>
                ))}
              </div>
            )}
            {a.kind === 'Test' &&
              ['Reserved', 'Accepted'].includes(a.state) &&
              simulatorEnabled && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    act(`/api/admin/print-attempts/${a.id}/observations`, {
                      observationKind: 'uncertain',
                      evidenceCode: 'ambiguous_outcome',
                      observedAt: new Date().toISOString(),
                    })
                  }
                >
                  Report interrupted Test as uncertain
                </Button>
              )}
            {a.kind === 'Test' &&
              ['Confirmed', 'AdminResolvedEjected'].includes(a.state) &&
              a.test_output_usable === null && (
                <div className={styles.actions}>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      act(`/api/admin/print-attempts/${a.id}/test-output`, { usable: true })
                    }
                  >
                    Inspected: output usable
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      act(`/api/admin/print-attempts/${a.id}/test-output`, { usable: false })
                    }
                  >
                    Inspected: output unusable
                  </Button>
                </div>
              )}
            {a.kind === 'Guest' && ['Confirmed', 'AdminResolvedEjected'].includes(a.state) && (
              <Button
                disabled={busy}
                onClick={() =>
                  ask({
                    label: 'Record Wasted Film',
                    effect:
                      'Restore one guest print; Film Stock stays reduced. A replacement needs a new Guest Session and Capture. The closed session and discarded photo cannot be restored.',
                    path: `/api/admin/print-attempts/${a.id}/wasted-film`,
                    body: {},
                    reason: 'Reason',
                  })
                }
              >
                Mark Wasted Film
              </Button>
            )}
          </article>
        ))}
      </section>
      {event.state === 'Draft' && (
        <Button
          variant="quiet"
          disabled={busy || holds}
          onClick={() =>
            ask({
              label: 'Delete Draft',
              effect:
                'Erase Client details, Event title, venue, schedule and media. Opaque operational history and Film Stock effects are retained. Deletion completes only after media removal.',
              path: `${base}/delete-draft`,
              body: revision,
            })
          }
        >
          Delete Draft
        </Button>
      )}
      {terminal && !event.redacted && (
        <>
          <label>
            Non-identifying replacement title (optional)
            <Input value={replacementTitle} onChange={(e) => setReplacementTitle(e.target.value)} />
          </label>
          <Button
            variant="destructive"
            disabled={busy || holds}
            onClick={() =>
              ask({
                label: 'Redact Client',
                effect:
                  'Erase Client contact details and Event Media. Booking details, anonymous totals and operational history remain. Replace a title that identifies the Client.',
                path: `${base}/redact-client`,
                body: {
                  ...revision,
                  ...(replacementTitle.trim() ? { replacementTitle: replacementTitle.trim() } : {}),
                },
              })
            }
          >
            Redact Client
          </Button>
        </>
      )}
      {event.redacted && <p>Client redacted · anonymous totals retained.</p>}
      {event.mediaRemovalState === 'pending' && (
        <>
          <p>Media removal pending. Identifying details have already been erased.</p>
          <Button disabled={busy} onClick={() => act(`${base}/redact-client`, revision)}>
            Retry media removal
          </Button>
        </>
      )}
      <Dialog.Root
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !busy) setReview(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content
            className={styles.dialog}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocus.current?.focus();
            }}
          >
            <Dialog.Title>{review?.label}</Dialog.Title>
            <Dialog.Description>{review?.effect}</Dialog.Description>
            {error && <FormFeedback kind="error">{error}</FormFeedback>}
            {review?.reason && (
              <label>
                {review.reason}
                <Input
                  value={reason}
                  maxLength={1000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            <div className={styles.actions}>
              <Button
                className={
                  review &&
                  ['Delete Draft', 'Redact Client', 'Cancel Event', 'Finish Event'].includes(
                    review.label
                  )
                    ? 'bg-ds-danger text-ds-on-danger border-ds-danger enabled:hover:bg-ds-danger-hover enabled:hover:border-ds-danger-hover'
                    : undefined
                }
                disabled={busy || (!!review?.reason && !reason.trim())}
                onClick={() =>
                  review &&
                  act(review.path, {
                    ...review.body,
                    ...(review.reason
                      ? {
                          [review.reason === 'Inspection reason' ? 'inspectionReason' : 'reason']:
                            reason,
                        }
                      : {}),
                  })
                }
              >
                {review?.label}
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
    </section>
  );
}
