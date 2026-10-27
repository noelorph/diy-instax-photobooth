'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
export function BoothSetup({ eventId, revision }: { eventId: string; revision: number }) {
  const router = useRouter();
  const [camera] = useState(() => new BrowserBoothCamera());
  const [printer] = useState(getBoothPrinter);
  const video = useRef<HTMLVideoElement>(null);
  const mounted = useRef(false);
  const reporting = useRef(false);
  const starting = useRef(false);
  const handoff = useRef<{
    id: string;
    issue: string;
    confirm: string;
    stage: 'prepared' | 'issued' | 'confirmed';
  } | null>(null);
  const startCommand = useRef<z.infer<typeof packageActionSchemas.start> | null>(null);
  const [uncertainStart, setUncertainStart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [error, setError] = useState('');
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
    if (!mounted.current || reporting.current || starting.current || startCommand.current) return;
    reporting.current = true;
    setReady(false);
    try {
      const local = await printer.readReadiness();
      if (!mounted.current) return;
      const at = Date.now();
      const data = setupSchema.parse(
        await boothFetch(
          `${endpoint}/setup-readiness?printerId=${encodeURIComponent(local.printerId)}&connectionGeneration=${local.connectionGeneration}`
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
        await boothFetch(`${endpoint}/setup-readiness`, body)
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
  }, [camera, printer, endpoint]);
  async function enableCamera() {
    if (cameraBusy || !video.current) return;
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
  async function start() {
    if (
      starting.current ||
      (!startCommand.current && (reporting.current || !ready || !latest.current))
    )
      return;
    starting.current = true;
    setBusy(true);
    setError('');
    try {
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
        startCommand.current = packageActionSchemas.start.parse({
          operationId: crypto.randomUUID(),
          expectedRevision: observed.revision ?? revision,
          readinessWindowId: observed.window,
          printerId: local.printerId,
          connectionGeneration: local.connectionGeneration,
        });
      }
      if (!handoff.current) {
        const body = startCommand.current!;
        let result;
        try {
          result = packageReplySchema.parse(await boothFetch(`${endpoint}/start`, body));
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
            .parse(await boothFetch(`/api/admin/events/${eventId}/operations/${body.operationId}`));
          if (recovered.receipt) {
            if (
              recovered.receipt.operationId !== body.operationId ||
              recovered.receipt.kind !== 'start'
            )
              throw new Error('Start receipt does not match this command.');
            result = recovered;
          } else {
            result = packageReplySchema.parse(await boothFetch(`${endpoint}/start`, body));
          }
        }
        const id = z.object({ handoffId: z.uuid() }).parse(result.receipt?.result).handoffId;
        handoff.current = {
          id,
          issue: crypto.randomUUID(),
          confirm: crypto.randomUUID(),
          stage: 'prepared',
        };
        startCommand.current = null;
        setUncertainStart(false);
      }
      const pending = handoff.current;
      try {
        packageReplySchema.parse(
          await boothFetch(
            `/api/admin/booth-handoffs/${pending.id}/issue`,
            packageOperationSchema.parse({ operationId: pending.issue })
          )
        );
        pending.stage = 'issued';
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
        pending.stage = 'confirmed';
      } catch {
        const state = z
          .object({ state: z.enum(['Active', 'Paused']), runId: z.uuid() })
          .parse(await boothFetch('/api/booth/state'));
        if (!state.runId)
          throw new Error(
            'Booth access confirmation is unavailable. Ask the Admin to recover access.'
          );
        pending.stage = 'confirmed';
      }
      if (mounted.current) {
        camera.stop();
        router.replace('/booth');
        router.refresh();
      }
    } catch (error) {
      if (mounted.current) {
        setUncertainStart(!!startCommand.current && !handoff.current);
        setReady(false);
        setError(
          error instanceof Error ? error.message : 'Unable to start Booth. Reload current state.'
        );
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
      /* An issued/lost reply must never be blindly issued again. */ if (!handoff.current)
        starting.current = false;
    }
  }
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
      {error && <FormFeedback kind="error">{error}</FormFeedback>}
      <Button disabled={busy || (!ready && !uncertainStart)} onClick={() => void start()}>
        {uncertainStart ? 'Retry Start Booth Mode' : 'Start Booth Mode'}
      </Button>
    </section>
  );
}
