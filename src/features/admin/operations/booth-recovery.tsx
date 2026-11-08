'use client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormFeedback } from '@/components/shared/form-feedback';
import { boothFetch } from '@/features/booth/flow';
import { packageActionSchemas } from '@/lib/operations/package-action-schemas';
import type { OperationalEvent } from './types';
import styles from './panel.module.css';

const commandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('request_reload'), body: packageActionSchemas.requestReload }),
  z.strictObject({ action: z.literal('confirm_reload'), body: packageActionSchemas.confirmReload }),
]);
type Command = z.infer<typeof commandSchema>;
export function BoothRecovery({
  event,
  adminUserId,
  refreshAdmin,
  handoffPending,
}: {
  event: OperationalEvent;
  adminUserId: string;
  refreshAdmin: () => void;
  handoffPending: boolean;
}) {
  const key = `booth-reload:${event.id}:${adminUserId}`;
  const pending = useRef<Command | null>(null);
  const submitting = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = sessionStorage.getItem(key);
        if (saved) {
          pending.current = commandSchema.parse(JSON.parse(saved));
          setUncertain(true);
          setError('Film command outcome is unconfirmed. Retry the original command.');
        }
        setReady(true);
      } catch {
        setBlocked(true);
        setError('Saved film command cannot be read. Restore browser storage and reload.');
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [key]);
  async function submit(action?: Command['action']) {
    if (submitting.current || blocked || !ready || handoffPending) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let command = pending.current;
      const recovering = !!command;
      if (!command) {
        if (!action || !event.runId || !event.printerId || event.connectionGeneration == null)
          return;
        const common = {
          operationId: crypto.randomUUID(),
          expectedRevision: event.revision,
          printerId: event.printerId,
          connectionGeneration: event.connectionGeneration,
        };
        if (action === 'confirm_reload') {
          const request = event.activeReloadRequest;
          if (
            !request ||
            request.printerId !== common.printerId ||
            request.connectionGeneration !== common.connectionGeneration
          ) {
            refreshAdmin();
            setError('The printer connection changed. Refresh before confirming film.');
            return;
          }
          command = { action, body: { ...common, reloadRequestId: request.reloadRequestId } };
        } else
          command = {
            action,
            body: { ...common, runId: event.runId, reason: 'admin_film_reload' },
          };
        command = commandSchema.parse(command);
        const serialized = JSON.stringify(command);
        sessionStorage.setItem(key, serialized);
        if (sessionStorage.getItem(key) !== serialized)
          throw Error('Film command storage unavailable');
        pending.current = command;
      }
      setUncertain(true);
      let receipt: unknown;
      if (recovering) {
        receipt = z
          .object({ receipt: z.unknown() })
          .parse(
            await boothFetch(
              `/api/admin/events/${event.id}/operations/${command.body.operationId}`,
              undefined,
              adminUserId
            )
          ).receipt;
      }
      if (!receipt)
        receipt = z
          .object({ receipt: z.unknown() })
          .parse(
            await boothFetch(
              `/api/admin/events/${event.id}/${command.action === 'request_reload' ? 'reload-requests' : 'reload-confirmations'}`,
              command.body,
              adminUserId
            )
          ).receipt;
      z.object({
        operationId: z.literal(command.body.operationId),
        kind: z.literal(command.action),
      }).parse(receipt);
      sessionStorage.removeItem(key);
      if (sessionStorage.getItem(key) !== null) throw Error('Film command storage unavailable');
      pending.current = null;
      setUncertain(false);
      setNotice('Film command recorded. Refreshing current state.');
      refreshAdmin();
    } catch (cause) {
      const rejection = z
        .object({ status: z.number(), code: z.string().optional() })
        .safeParse(cause);
      if (
        rejection.success &&
        [400, 409].includes(rejection.data.status) &&
        rejection.data.code !== 'operation_conflict'
      ) {
        try {
          sessionStorage.removeItem(key);
        } catch {
          setBlocked(true);
          return;
        }
        pending.current = null;
        setUncertain(false);
        refreshAdmin();
        setError('The Event or printer changed. Review current state before trying again.');
      } else setError('Film command outcome is unconfirmed. Retry the original command.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const disabled = !ready || busy || blocked || uncertain || handoffPending;
  const request = event.activeReloadRequest;
  if (event.state !== 'Live' || !event.runId || event.runState === 'Finished') return null;
  return (
    <section className={styles.controls} aria-label="Film reload controls">
      <h3>{request ? 'Film reload needed' : 'Film loading'}</h3>
      <p>
        Confirm loading only. This does not resolve an uncertain print, add booked prints or resume
        a paused Booth.
      </p>
      {request && (
        <p>
          Load film after requesting reload. If automatic confirmation is unavailable, confirm here
          after checking the printer.
        </p>
      )}
      {event.reloadConfirmation && (
        <FormFeedback kind="status">
          Film loading confirmed
          {event.reloadConfirmation.confirmationSource === 'instax_automatic_reload'
            ? ' automatically'
            : ' by Admin'}
          .
        </FormFeedback>
      )}
      <div className={styles.actions}>
        <Button
          disabled={disabled || !event.printerId}
          onClick={() => void submit('request_reload')}
        >
          Reload film
        </Button>
        {request && (
          <Button
            disabled={
              disabled ||
              request.printerId !== event.printerId ||
              request.connectionGeneration !== event.connectionGeneration
            }
            onClick={() => void submit('confirm_reload')}
          >
            Confirm film loaded
          </Button>
        )}
        {uncertain && (
          <Button disabled={busy || blocked || handoffPending} onClick={() => void submit()}>
            Retry film command
          </Button>
        )}
      </div>
      {busy && <FormFeedback kind="status">Recording film command. Please wait.</FormFeedback>}
      {error && <FormFeedback kind="error">{error}</FormFeedback>}
      {notice && <FormFeedback kind="status">{notice}</FormFeedback>}
    </section>
  );
}
