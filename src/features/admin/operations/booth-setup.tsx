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
import boothStyles from '@/features/booth/booth.module.css';
const readinessSchema = z.object({
  ready: z.boolean(),
  blockers: z.array(z.string()).default([]),
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
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const reviewedReplacement = useRef<z.infer<typeof packageActionSchemas.recoverAccess> | null>(
    null
  );
  const [camera] = useState(() => new BrowserBoothCamera());
  const [printer] = useState(getBoothPrinter);
  const video = useRef<HTMLVideoElement>(null);
  const mounted = useRef(false);
  const reporting = useRef<Promise<void> | null>(null);
  const cameraEpoch = useRef(0);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
  const [measured, setMeasured] = useState<{
    internet: boolean;
    camera: boolean;
    connected: boolean;
    printerReady: boolean;
  } | null>(null);
  const [readiness, setReadiness] = useState<z.infer<typeof readinessSchema> | null>(null);
  const [readinessError, setReadinessError] = useState('');
  const [setupDenial, setSetupDenial] = useState<
    'qualification_required' | 'access_required' | null
  >(null);
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
  async function refresh(): Promise<void> {
    if (reporting.current) return reporting.current;
    if (
      !newRun ||
      !localSetup.current ||
      !mounted.current ||
      starting.current ||
      startCommand.current
    )
      return Promise.resolve();
    return (reporting.current = measureReadiness().finally(() => {
      reporting.current = null;
    }));
    async function measureReadiness() {
      const observedCameraEpoch = cameraEpoch.current;
      try {
        const binding = await printer.readReadiness();
        if (!mounted.current) return;
        const at = Date.now();
        const data = setupSchema.parse(
          await boothFetch(
            `${endpoint}/setup-readiness?printerId=${encodeURIComponent(binding.printerId)}&connectionGeneration=${binding.connectionGeneration}`,
            undefined,
            adminUserId
          )
        );
        if (!mounted.current) return;
        const local = await printer.readReadiness();
        if (!mounted.current) return;
        const observedAt = Date.now() - local.observedAgeMs;
        if (
          local.printerId !== binding.printerId ||
          local.connectionGeneration !== binding.connectionGeneration ||
          local.observedAgeMs > READINESS_MAX_AGE_MS
        )
          throw new Error('Equipment changed during setup');
        const live = hasLiveCamera(video.current);
        setMeasured({
          internet: navigator.onLine,
          camera: live,
          connected: local.connected,
          printerReady: local.ready && Date.now() - observedAt <= READINESS_MAX_AGE_MS,
        });
        const body = packageActionSchemas.setupReadiness.parse({
          operationId: crypto.randomUUID(),
          readinessWindowId: data.readinessWindowId,
          printerId: local.printerId,
          connectionGeneration: local.connectionGeneration,
          printerEvidence: local.evidence,
          observedAgeMs: Date.now() - observedAt,
          observation: {
            ...(local.loadFault
              ? { loadFault: local.loadFault, loadFaultId: local.loadFaultId }
              : {}),
            cameraPermission: live,
            cameraLive: live,
            serverReachable: navigator.onLine,
            printerConnected: local.connected,
            printerReady: local.ready,
            oldJobCleared: local.oldJobCleared,
          },
          ...confirmations.current,
        });
        const acknowledgement = packageReplySchema.parse(
          await boothFetch(`${endpoint}/setup-readiness`, body, adminUserId)
        );
        const serverReady = readinessSchema.parse(acknowledgement.receipt.result);
        if (!mounted.current) return;
        const currentLive = hasLiveCamera(video.current);
        setMeasured((current) => current && { ...current, camera: currentLive });
        if (observedCameraEpoch !== cameraEpoch.current || (live && !currentLive)) {
          latest.current = null;
          setReady(false);
          // Report the newer camera state before releasing a queued Start.
          await measureReadiness();
          return;
        }
        setReadiness(serverReady);
        setReadinessError('');
        setSetupDenial(null);
        const eligible =
          serverReady.ready &&
          serverReady.counts.printsAvailable > 0 &&
          live &&
          currentLive &&
          local.connected &&
          local.ready &&
          Date.now() - Math.min(at, observedAt) <= READINESS_MAX_AGE_MS &&
          Object.values(confirmations.current).every(Boolean);
        latest.current = eligible
          ? {
              window: data.readinessWindowId,
              revision: acknowledgement.revision,
              at: Math.min(at, observedAt),
              printerId: local.printerId,
              connectionGeneration: local.connectionGeneration,
            }
          : null;
        setReady(eligible);
        clearTimeout(expiry.current);
        expiry.current = setTimeout(
          () => {
            latest.current = null;
            setReady(false);
            setMeasured(null);
          },
          Math.max(0, READINESS_MAX_AGE_MS - (Date.now() - Math.min(at, observedAt))) + 1
        );
      } catch (error) {
        if (mounted.current) {
          latest.current = null;
          setMeasured(null);
          setReady(false);
          const failure = z
            .object({ status: z.number(), code: z.string().optional() })
            .safeParse(error);
          if (failure.success && [401, 403].includes(failure.data.status)) {
            localSetup.current = false;
            clearTimeout(expiry.current);
            setReadiness(null);
            const qualification = failure.data.code === 'qualification_required';
            setSetupDenial(qualification ? 'qualification_required' : 'access_required');
            setReadinessError(
              qualification
                ? 'Booth setup is unavailable on this server. For local testing, enable the development simulator and restart the server. Production printing still requires printer qualification.'
                : 'Booth setup access was denied. Sign in again as Admin, then return to this Event and retry setup.'
            );
          } else {
            setSetupDenial(null);
            setReadinessError(
              'Readiness could not be verified. Check the internet and reconnect equipment; setup will check again.'
            );
          }
        }
      }
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
      clearTimeout(expiry.current);
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
            cameraEpoch.current++;
            latest.current = null;
            clearTimeout(expiry.current);
            setReady(false);
            setMeasured((current) => current && { ...current, camera: false });
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
        (replacement ? !replaceAllowed || !reviewedReplacement.current : !ready || !latest.current))
    )
      return;
    starting.current = true;
    setBusy(true);
    setError('');
    try {
      await reporting.current;
      if (!mounted.current) return;
      if (!replacement && !startCommand.current && !latest.current)
        throw new Error('Equipment changed. Recheck setup before starting.');
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
        const observed = latest.current;
        if (!observed) throw new Error('Equipment changed. Recheck setup before starting.');
        const local = await printer.readReadiness();
        if (
          !hasLiveCamera(video.current) ||
          !local.connected ||
          !local.ready ||
          local.observedAgeMs > READINESS_MAX_AGE_MS ||
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
        setBusy(false);
        setReady(false);
        setError(
          error instanceof Error ? error.message : 'Unable to start Booth. Reload current state.'
        );
      }
    } finally {
      // Successful navigation keeps the neutral surface until the old document is gone.
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
  if (!newRun && !busy && !accessRequired && !uncertainStart && !review && !replaceAllowed)
    return possibleDelivery ? (
      <p>Resolve the pending print outcome before replacing Booth access.</p>
    ) : null;
  const feedback = error && (
    <FormFeedback kind="error">
      {error}
      {accessRequired && (
        <Button asChild variant="quiet">
          <a href="/sign-in?from=booth">Sign in</a>
        </Button>
      )}
    </FormFeedback>
  );
  const handoffSurface = (
    <Dialog.Root open={busy || accessRequired}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.handoffOverlay} />
        <Dialog.Content
          className={`${boothStyles.booth} ${styles.handoff}`}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            if (accessRequired) event.preventDefault();
          }}
        >
          <div className={boothStyles.content}>
            <Dialog.Title>
              {accessRequired ? 'Booth access needs recovery' : 'Preparing Booth Mode'}
            </Dialog.Title>
            <Dialog.Description>
              You will be signed out on this iPad. Your phone stays signed in.
            </Dialog.Description>
            {accessRequired ? (
              <>
                <p role="alert">
                  Booth access could not be confirmed. Ask the Admin to recover access on this
                  device. Do not start another run.
                </p>
                <p>
                  The phone can manage the Event independently. Replacement access stays Paused
                  until the Admin explicitly resumes from the phone.
                </p>
                <Button asChild>
                  <a href="/sign-in?from=booth">Sign in</a>
                </Button>
              </>
            ) : (
              <p role="status">Preparing secure access. Please wait.</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
  if ((!newRun && !uncertainStart) || review)
    return (
      <>
        {handoffSurface}
        <Dialog.Root
          open={review && !busy && !accessRequired}
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
                onClick={(event) => {
                  setPortalContainer(event.currentTarget.closest<HTMLElement>('.admin-shell'));
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
            <Dialog.Portal container={portalContainer}>
              <Dialog.Overlay className={styles.overlay} />
              <Dialog.Content className={styles.dialog}>
                <Dialog.Title>Replace Booth access</Dialog.Title>
                <Dialog.Description>
                  Replace access for this same run on this Booth device. Admin signs out locally;
                  the phone stays signed in. The run stays Paused after replacement. Restore
                  equipment readiness, then explicitly Resume Booth from the phone. Counts do not
                  reset.
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
      </>
    );
  return (
    <>
      {handoffSurface}
      <section aria-label="Booth setup" className={`${styles.panel} ${styles.setup}`}>
        <h3>Booth setup</h3>
        <p>On this Booth iPad</p>
        <dl className={styles.readiness} aria-label="Measured equipment readiness">
          {(
            [
              ['Internet', measured?.internet],
              ['Live camera', measured?.camera],
              ['Instax connection', measured?.connected],
              ['Printer ready', measured?.printerReady],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value === undefined ? 'Not checked' : value ? 'Ready' : 'Unavailable'}</dd>
            </div>
          ))}
        </dl>
        <p>
          {readiness
            ? `${readiness.counts.printsAvailable} prints available`
            : 'Print capacity not yet verified'}
        </p>
        <p>Start requires available booked prints. Physical film does not add booked capacity.</p>
        <video
          ref={video}
          muted
          playsInline
          aria-label="Setup camera preview"
          hidden={!measured?.camera}
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
        <p>Always test the printer before starting Booth Mode.</p>
        <p role="status">
          {ready
            ? 'Equipment ready. Start within five seconds of the latest check.'
            : 'Complete equipment setup and physical confirmations.'}
        </p>
        {readinessError && (
          <FormFeedback kind="error">
            {readinessError}
            {setupDenial && (
              <>
                <Button
                  variant="secondary"
                  disabled={busy || cameraBusy}
                  onClick={() => {
                    localSetup.current = true;
                    void refresh();
                  }}
                >
                  Retry setup checks
                </Button>
                {setupDenial === 'access_required' && (
                  <Button asChild variant="quiet">
                    <a href="/sign-in">Sign in</a>
                  </Button>
                )}
              </>
            )}
          </FormFeedback>
        )}
        {!!readiness?.blockers.length && (
          <ul aria-label="Readiness actions">
            {readiness.blockers.map((blocker) => (
              <li key={blocker}>
                {(
                  {
                    camera: 'Enable Camera and check the live preview.',
                    server_unreachable: 'Check the internet connection.',
                    printer_connection: 'Connect to Instax.',
                    printer_not_safe: 'Check the printer is ready and its previous job is cleared.',
                    film_reload_needed: 'Physically load film, then confirm it.',
                    printer_power: 'Connect continuous printer power, then confirm it.',
                    guided_access: 'Prepare Guided Access, then confirm it.',
                    readiness_stale: 'Wait for a fresh equipment check.',
                    booked_prints_exhausted:
                      'No booked prints are available. Review the Event Film Packages before starting.',
                    qualification_required:
                      'Printer qualification is required before real Booth use.',
                    access_required: 'Sign in as Admin on this Booth device.',
                    setup_unavailable:
                      'Reload the current Event and resolve its existing Booth run before starting.',
                    print_pending: 'Resolve the pending print outcome from the phone.',
                  } as Record<string, string>
                )[blocker] ?? 'Setup is unavailable. Reload current Event state before starting.'}
              </li>
            ))}
          </ul>
        )}
        {feedback}
        <Button disabled={busy || (!ready && !uncertainStart)} onClick={() => void start()}>
          {uncertainStart ? 'Retry Start Booth Mode' : 'Start Booth Mode'}
        </Button>
        <p>You will be signed out on this iPad. Your phone stays signed in.</p>
      </section>
    </>
  );
}
