'use client';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import type { RunState } from '@/lib/operations/package-contract';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormFeedback } from '@/components/shared/form-feedback';
import { BrowserBoothCamera } from '@/features/booth/camera';
import { getBoothPrinter, hasLiveCamera } from '@/features/booth/equipment';
import { boothFetch, packageReplySchema } from '@/features/booth/flow';
import {
  packageActionSchemas,
  packageOperationSchema,
} from '@/lib/operations/package-action-schemas';
import { STATE_POLL_MS, READINESS_MAX_AGE_MS } from '@/lib/operations/package-contract';
import styles from './panel.module.css';
const readinessSchema = z.object({
  ready: z.boolean(),
  counts: z.object({ printsAvailable: z.number() }),
});
const setupSchema = z.object({
  revision: z.number().int(),
  readinessWindowId: z.uuid(),
  readiness: readinessSchema,
});
export function BoothSetup({
  eventId,
  revision,
  runId,
  runState,
  possibleDelivery = false,
  adminUserId,
  prepareHandoff,
  releaseHandoff,
}: {
  eventId: string;
  revision: number;
  runId?: string | null;
  runState?: RunState | null;
  possibleDelivery?: boolean;
  adminUserId?: string;
  prepareHandoff?: () => Promise<void>;
  releaseHandoff?: () => void;
}) {
  const newRun = !runId || runState === 'Finished';
  const replaceAllowed =
    !!runId && ['Prepared', 'Active', 'Paused'].includes(runState ?? '') && !possibleDelivery;
  const [review, setReview] = useState(false);
  const reviewedReplacement = useRef<z.infer<typeof packageActionSchemas.recoverAccess> | null>(
    null
  );
  const [camera] = useState(() => new BrowserBoothCamera());
  const [printer] = useState(getBoothPrinter);
  const video = useRef<HTMLVideoElement>(null);
  const mounted = useRef(false);
  const reporting = useRef(false);
  const localSetup = useRef(false);
  const starting = useRef(false);
  const holdingHandoff = useRef(false);
  const handoff = useRef<{
    id: string;
    issue: string;
    confirm: string;
  } | null>(null);
  const startCommand = useRef<{
    kind: 'start' | 'recover_access';
    path: string;
    body:
      | z.infer<typeof packageActionSchemas.start>
      | z.infer<typeof packageActionSchemas.recoverAccess>;
  } | null>(null);
  const [uncertainStart, setUncertainStart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [error, setError] = useState('');
  const [accessRequired, setAccessRequired] = useState(false);
  const [ready, setReady] = useState(false);
  const confirmations = useRef({
    filmLoadedConfirmed: false,
    powerConfirmed: false,
    guidedAccessConfirmed: false,
  });
  const [physical, setPhysical] = useState({
    filmLoadedConfirmed: false,
    powerConfirmed: false,
    guidedAccessConfirmed: false,
  });
  const latest = useRef<{
    window: string;
    revision: number;
    at: number;
    printerId: string;
    connectionGeneration: number;
  } | null>(null);
  const endpoint = `/api/admin/events/${eventId}/booth`;
  async function refresh() {
    if (
      !newRun ||
      !localSetup.current ||
      !mounted.current ||
      reporting.current ||
      starting.current ||
      startCommand.current
    )
      return;
    reporting.current = true;
    setReady(false);
    try {
      const local = await printer.readReadiness();
      if (!mounted.current) return;
      const at = Date.now();
      const data = setupSchema.parse(
        await boothFetch(
          `${endpoint}/setup-readiness?printerId=${encodeURIComponent(local.printerId)}&connectionGeneration=${local.connectionGeneration}`,
          undefined,
          adminUserId
        )
      );
      if (!mounted.current || starting.current) return;
      const live = hasLiveCamera(video.current);
      const body = packageActionSchemas.setupReadiness.parse({
        operationId: crypto.randomUUID(),
        readinessWindowId: data.readinessWindowId,
        printerId: local.printerId,
        connectionGeneration: local.connectionGeneration,
        observedAgeMs: local.observedAgeMs,
        observation: {
          cameraPermission: live,
          cameraLive: live,
          serverReachable: navigator.onLine,
          printerConnected: local.connected,
          printerReady: local.ready,
          oldJobCleared: local.ready,
        },
        ...confirmations.current,
      });
      const acknowledgement = packageReplySchema.parse(
        await boothFetch(`${endpoint}/setup-readiness`, body, adminUserId)
      );
      const serverReady = readinessSchema.parse(acknowledgement.receipt.result);
      if (!mounted.current || starting.current) return;
      latest.current = {
        window: data.readinessWindowId,
        revision: acknowledgement.revision,
        at,
        printerId: local.printerId,
        connectionGeneration: local.connectionGeneration,
      };
      setReady(
        serverReady.ready &&
          serverReady.counts.printsAvailable > 0 &&
          live &&
          local.connected &&
          local.ready &&
          local.observedAgeMs + Date.now() - at <= READINESS_MAX_AGE_MS &&
          Object.values(confirmations.current).every(Boolean)
      );
    } catch {
      if (mounted.current) {
        latest.current = null;
        setReady(false);
      }
    } finally {
      reporting.current = false;
    }
  }
  useEffect(() => {
    mounted.current = true;
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = setInterval(tick, STATE_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      camera.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, printer, endpoint, newRun]);
  useEffect(
    () => () => {
      if (holdingHandoff.current) {
        holdingHandoff.current = false;
        releaseHandoff?.();
      }
    },
    [releaseHandoff]
  );
  async function enableCamera() {
    if (cameraBusy || !video.current) return;
    localSetup.current = true;
    setCameraBusy(true);
    setError('');
    try {
      await camera.start(
        video.current,
        () => {
          if (mounted.current) {
            setReady(false);
            void refresh();
          }
        },
        'request'
      );
      if (mounted.current) await refresh();
    } catch {
      if (mounted.current) {
        setReady(false);
        setError('Camera unavailable. Allow camera access and try Enable Camera again.');
      }
    } finally {
      if (mounted.current) setCameraBusy(false);
    }
  }
  async function start(replacement = false) {
    if (
      starting.current ||
      (!startCommand.current &&
        (replacement
          ? !replaceAllowed || !reviewedReplacement.current
          : reporting.current || !ready || !latest.current))
    )
      return;
    starting.current = true;
    setBusy(true);
    setError('');
    try {
      holdingHandoff.current = true;
      await prepareHandoff?.();
      if (!mounted.current) return;
      if (!startCommand.current && replacement) {
        startCommand.current = {
          kind: 'recover_access',
          path: `${endpoint}/recover-access`,
          body: reviewedReplacement.current!,
        };
      }
      if (!startCommand.current) {
        const observed = latest.current!;
        const local = await printer.readReadiness();
        if (
          !hasLiveCamera(video.current) ||
          !local.connected ||
          !local.ready ||
          local.printerId !== observed.printerId ||
          local.connectionGeneration !== observed.connectionGeneration ||
          Date.now() - observed.at > READINESS_MAX_AGE_MS
        )
          throw new Error('Equipment changed. Recheck setup before starting.');
        startCommand.current = {
          kind: 'start',
          path: `${endpoint}/start`,
          body: packageActionSchemas.start.parse({
            operationId: crypto.randomUUID(),
            expectedRevision: observed.revision ?? revision,
            readinessWindowId: observed.window,
            printerId: local.printerId,
            connectionGeneration: local.connectionGeneration,
          }),
        };
      }
      if (!handoff.current) {
        const { body, path, kind } = startCommand.current!;
        if (kind === 'recover_access') {
          // Bind this browser's device; readiness is reestablished under the scoped grant.
          const local = await printer.readReadiness();
          await boothFetch(
            `${endpoint}/setup-readiness?printerId=${encodeURIComponent(local.printerId)}&connectionGeneration=${local.connectionGeneration}`,
            undefined,
            adminUserId
          );
        }
        let result;
        try {
          result = packageReplySchema.parse(await boothFetch(path, body, adminUserId));
        } catch (error) {
          if (
            typeof error === 'object' &&
            error !== null &&
            'status' in error &&
            typeof error.status === 'number' &&
            error.status < 500
          ) {
            startCommand.current = null;
            throw error;
          }
          const recovered = z
            .object({ receipt: packageReplySchema.shape.receipt.nullable() })
            .parse(
              await boothFetch(
                `/api/admin/events/${eventId}/operations/${body.operationId}`,
                undefined,
                adminUserId
              )
            );
          if (recovered.receipt) {
            if (
              recovered.receipt.operationId !== body.operationId ||
              recovered.receipt.kind !== kind
            )
              throw new Error('Setup receipt does not match this command.');
            result = recovered;
          } else {
            result = packageReplySchema.parse(await boothFetch(path, body, adminUserId));
          }
        }
        const id = z.object({ handoffId: z.uuid() }).parse(result.receipt?.result).handoffId;
        handoff.current = {
          id,
          issue: crypto.randomUUID(),
          confirm: crypto.randomUUID(),
        };
        startCommand.current = null;
        setUncertainStart(false);
      }
      if (!mounted.current) return;
      const pending = handoff.current;
      try {
        packageReplySchema.parse(
          await boothFetch(
            `/api/admin/booth-handoffs/${pending.id}/issue`,
            packageOperationSchema.parse({ operationId: pending.issue }),
            adminUserId
          )
        );
      } catch {
        throw new Error(
          'Booth access could not be issued. Ask the Admin to recover Booth access; do not start another run.'
        );
      }
      try {
        packageReplySchema.parse(
          await boothFetch(
            '/api/booth/handoff/confirm',
            packageActionSchemas.confirmHandoff.parse({
              operationId: pending.confirm,
              handoffId: pending.id,
            })
          )
        );
      } catch {
        const state = z
          .object({ state: z.enum(['Active', 'Paused']), runId: z.uuid() })
          .parse(await boothFetch('/api/booth/state'));
        if (!state.runId)
          throw new Error(
            'Booth access confirmation is unavailable. Ask the Admin to recover access.'
          );
      }
      if (mounted.current) {
        camera.stop();
        // A cached /booth tree may own a disposed controller and released equipment.
        window.location.replace('/booth');
      }
    } catch (error) {
      if (mounted.current) {
        setUncertainStart(!!startCommand.current && !handoff.current);
        setAccessRequired(!!handoff.current);
        setReady(false);
        setError(
          error instanceof Error ? error.message : 'Unable to start Booth. Reload current state.'
        );
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
      // An issued/lost reply cannot be blindly reissued; its owner stays suspended.
      if (!handoff.current) {
        starting.current = false;
        if (holdingHandoff.current) {
          holdingHandoff.current = false;
          releaseHandoff?.();
        }
      }
    }
  }
  if (!newRun && !busy && !uncertainStart && !review && !replaceAllowed)
    return possibleDelivery ? (
      <p>Resolve the pending print outcome before replacing Booth access.</p>
    ) : null;
  const feedback = error && (
    <FormFeedback kind="error">
      {error}
      {accessRequired && (
        <Button asChild variant="quiet">
          <a href="/sign-in?from=booth">Admin sign in</a>
        </Button>
      )}
    </FormFeedback>
  );
  if (!newRun || review)
    return (
      <Dialog.Root
        open={review}
        onOpenChange={(open) => {
          if (!busy && !uncertainStart) setReview(open);
        }}
      >
        <section aria-label="Booth access setup" className={styles.panel}>
          <p>Exceptional access replacement must be performed on the Booth device.</p>
          <Dialog.Trigger asChild>
            <Button
              variant="secondary"
              disabled={!replaceAllowed || busy || uncertainStart}
              onClick={() => {
                reviewedReplacement.current = packageActionSchemas.recoverAccess.parse({
                  operationId: crypto.randomUUID(),
                  expectedRevision: revision,
                  runId,
                });
              }}
            >
              Replace Booth access
            </Button>
          </Dialog.Trigger>
          {!review && feedback}
          <Dialog.Portal>
            <Dialog.Overlay className={styles.overlay} />
            <Dialog.Content className={styles.dialog}>
              <Dialog.Title>Replace Booth access</Dialog.Title>
              <Dialog.Description>
                Replace access for this same run on this Booth device. Admin signs out locally; the
                phone stays signed in. The run stays Paused after replacement. Restore equipment
                readiness, then explicitly Resume Booth from the phone. Counts do not reset.
              </Dialog.Description>
              {feedback}
              {busy && (
                <FormFeedback kind="status">Preparing replacement Booth access.</FormFeedback>
              )}
              <div className={styles.actions}>
                <Button
                  disabled={busy || (!uncertainStart && !replaceAllowed)}
                  onClick={() => void start(true)}
                >
                  {uncertainStart ? 'Retry access replacement' : 'Confirm replacement'}
                </Button>
                <Dialog.Close asChild>
                  <Button variant="quiet" disabled={busy || uncertainStart}>
                    Back
                  </Button>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </section>
      </Dialog.Root>
    );
  return (
    <section aria-label="Booth setup" className={styles.panel}>
      <h3>Booth setup</h3>
      <p>Always test the printer before starting Booth Mode.</p>
      <video
        ref={video}
        muted
        playsInline
        aria-label="Setup camera preview"
        className={styles.camera}
      />
      <div className={styles.actions}>
        <Button disabled={busy || cameraBusy} onClick={() => void enableCamera()}>
          Enable Camera
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            localSetup.current = true;
            void printer
              .connect()
              .then(refresh)
              .catch(() => setError('Printer unavailable. Try connecting again.'));
          }}
        >
          Connect to Instax
        </Button>
      </div>
      {(['filmLoadedConfirmed', 'powerConfirmed', 'guidedAccessConfirmed'] as const).map(
        (key, i) => (
          <label key={key} className={styles.confirmation}>
            <input
              type="checkbox"
              checked={physical[key]}
              disabled={busy}
              onChange={(event) => {
                confirmations.current = { ...confirmations.current, [key]: event.target.checked };
                setPhysical(confirmations.current);
                setReady(false);
                void refresh();
              }}
            />
            {
              [
                'Film is physically loaded',
                'Continuous printer power is connected',
                'Guided Access is ready',
              ][i]
            }
          </label>
        )
      )}
      <p role="status">
        {ready
          ? 'Equipment ready. Start within five seconds of the latest check.'
          : 'Complete equipment setup and physical confirmations.'}
      </p>
      {feedback}
      <Button disabled={busy || (!ready && !uncertainStart)} onClick={() => void start()}>
        {uncertainStart ? 'Retry Start Booth Mode' : 'Start Booth Mode'}
      </Button>
    </section>
  );
}
