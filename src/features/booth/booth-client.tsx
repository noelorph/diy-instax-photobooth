'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BoothFlow, boothFetch } from './flow';
import { BrowserBoothCamera, type BoothCamera } from './camera';
import { BrowserBoothMetadataJournal } from './print-journal';
import { getBoothPrinter, hasLiveCamera } from './equipment';
import { STATE_POLL_MS } from '@/lib/operations/package-contract';
import styles from './booth.module.css';
import { CirclePause, CircleCheck, KeyRound, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { DispatchAuthorization } from '@/lib/operations/package-contract';
export function BoothPaused() {
  return (
    <main className={styles.booth}>
      <section className={styles.content}>
        <h1>Booth paused</h1>
        <p>Please ask the Admin for help.</p>
        <a href="/sign-in?from=booth">Sign in</a>
      </section>
    </main>
  );
}
export function BoothClient({
  flow: suppliedFlow,
  camera: suppliedCamera,
}: {
  flow?: BoothFlow;
  camera?: BoothCamera;
}) {
  const [flow] = useState(
    () =>
      suppliedFlow ??
      new BoothFlow({
        transport: (path, body, signal) => boothFetch(path, body, undefined, signal),
        printer: getBoothPrinter(),
        journal: new BrowserBoothMetadataJournal({
          getItem: (key) => sessionStorage.getItem(key),
          setItem: (key, value) => sessionStorage.setItem(key, value),
          removeItem: (key) => sessionStorage.removeItem(key),
        }),
      })
  );
  const [camera] = useState(() => suppliedCamera ?? new BrowserBoothCamera());
  const view = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const video = useRef<HTMLVideoElement>(null);
  const owner = useRef<symbol | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const wasGuest = useRef(false);
  const report = useCallback(() => {
    const live = hasLiveCamera(video.current);
    return flow.reportEquipment({
      cameraPermission: live,
      cameraLive: live,
      serverReachable: navigator.onLine,
      printerConnected: true,
      printerReady: true,
      oldJobCleared: true,
    });
  }, [flow]);
  useEffect(() => {
    const token = Symbol();
    owner.current = token;
    const controls = window as Window & {
      __boothSimulatorEject?: (authorization: DispatchAuthorization) => void;
      __boothSimulatorReady?: () => void;
    };
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.NEXT_PUBLIC_BOOTH_SIMULATOR_CONTROLS === 'true'
    ) {
      controls.__boothSimulatorEject = (authorization) =>
        getBoothPrinter().emit('full_ejection_confirmed', authorization);
      controls.__boothSimulatorReady = () => getBoothPrinter().emit('ready_for_new_job');
    }
    const current = () => owner.current === token;
    const url = new URL(window.location.href);
    const handoff = url.searchParams.get('handoff') ?? undefined;
    if (handoff) {
      url.searchParams.delete('handoff');
      history.replaceState(null, '', url.pathname + url.search);
    }
    const start = async () => {
      await flow.initialize(handoff);
      if (
        !current() ||
        !video.current ||
        ['finished', 'access-required'].includes(flow.getSnapshot().phase)
      )
        return;
      try {
        await camera.start(
          video.current,
          () => {
            if (current()) void report();
          },
          'existing'
        );
      } catch {
        /* Enable Camera remains available. */
      }
      if (current()) await report();
    };
    void start();
    const tick = () => {
      if (current() && document.visibilityState === 'visible') {
        void flow.refresh();
        void report();
      }
    };
    const timer = window.setInterval(tick, STATE_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    window.addEventListener('online', tick);
    window.addEventListener('offline', tick);
    return () => {
      delete controls.__boothSimulatorEject;
      delete controls.__boothSimulatorReady;
      owner.current = null;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
      window.removeEventListener('online', tick);
      window.removeEventListener('offline', tick);
      queueMicrotask(() => {
        if (owner.current === null) {
          camera.stop();
          flow.dispose();
        }
      });
    };
  }, [flow, camera, report]);
  useEffect(() => {
    heading.current?.focus();
    if (['preview', 'countdown', 'capturing', 'review', 'printing'].includes(view.phase))
      wasGuest.current = true;
    if (
      ['paused', 'finishing', 'finished', 'access-required'].includes(view.phase) ||
      (view.phase === 'unavailable' && wasGuest.current)
    ) {
      camera.stop();
      void report();
    }
  }, [view.phase, camera, report]);
  useEffect(() => {
    if (view.phase !== 'countdown') return;
    let remaining = 3;
    const timer = window.setInterval(() => {
      remaining--;
      if (remaining > 0) setCountdown(remaining);
      else {
        clearInterval(timer);
        void flow.shutter(() => camera.capture());
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [view.phase, flow, camera]);
  async function enableCamera() {
    if (busy || !video.current) return;
    const token = owner.current;
    setBusy(true);
    try {
      await camera.start(
        video.current,
        () => {
          if (owner.current === token) void report();
        },
        'request'
      );
    } catch {
      /* A failed request stays an actionable blocker. */
    }
    if (owner.current === token) {
      await report();
      setBusy(false);
    }
  }
  const unavailable = view.counts?.unresolved
    ? 'Booth is temporarily unavailable.'
    : view.counts?.printsRemaining === 0
      ? 'All booked prints have been used.'
      : view.blockers.includes('offline')
        ? 'Wi-Fi disconnected.'
        : view.blockers.includes('server_unreachable')
          ? 'Connection unavailable.'
          : view.blockers.includes('printer_connection') || view.allowedActions.connectPrinter
            ? 'Bluetooth disconnected.'
            : view.blockers.includes('camera')
              ? 'Camera disconnected.'
              : view.blockers.includes('film_reload_needed')
                ? 'Printer is out of film.'
                : view.blockers.includes('booked_prints_exhausted')
                  ? 'All booked prints have been used.'
                  : 'Booth is temporarily unavailable.';
  const titles = {
    loading: 'Preparing Booth Mode',
    welcome: 'Make a memory',
    preview: 'Take your photo',
    countdown: 'Get ready',
    capturing: 'Preparing your photo',
    review: 'Your photo',
    printing: 'Preparing your print',
    confirmed: 'Print complete',
    paused: 'Booth paused',
    finishing: 'Finishing Booth Mode',
    finished: 'Booth Mode finished',
    'access-required': 'Booth access ended',
    unavailable,
  };
  const messages = {
    loading: 'Please wait while Booth access is checked.',
    welcome: 'Equipment ready.',
    preview: 'Look at the camera, then take your photo.',
    countdown: 'Hold still.',
    capturing: 'Please wait.',
    review: 'Choose Retake or Print.',
    printing: 'Please wait for the print outcome.',
    confirmed: 'Your print is ready.',
    paused: 'Please wait for the Admin to resume from the phone.',
    finishing: view.counts?.unresolved
      ? 'Waiting for the current print to be resolved.'
      : 'Waiting for Booth Mode to finish.',
    finished: '',
    'access-required': 'Please inform the Admin.',
    unavailable:
      unavailable === 'All booked prints have been used.'
        ? 'Please ask the Admin to add another Film Package.'
        : 'Please inform the Admin.',
  };
  const needsAdmin = view.phase === 'access-required' || view.phase === 'unavailable';
  const showPreview = [
    'welcome',
    'preview',
    'countdown',
    'capturing',
    'review',
    'printing',
  ].includes(view.phase);
  const StatusIcon =
    view.phase === 'paused'
      ? CirclePause
      : view.phase === 'finished' || view.phase === 'confirmed'
        ? CircleCheck
        : view.phase === 'access-required'
          ? KeyRound
          : view.phase === 'loading' || view.phase === 'finishing'
            ? LoaderCircle
            : TriangleAlert;
  return (
    <main className={styles.booth}>
      <section className={`${styles.content} ${showPreview ? styles.previewContent : ''}`}>
        {!showPreview && <StatusIcon className={styles.statusIcon} aria-hidden="true" />}
        <h1 ref={heading} tabIndex={-1} aria-live="polite">
          {titles[view.phase]}
        </h1>
        <div className={styles.frame} hidden={!showPreview}>
          <video
            ref={video}
            className={`${styles.preview} ${view.phase === 'welcome' || view.phase === 'review' || view.phase === 'printing' ? styles.previewHidden : ''}`}
            muted
            playsInline
            aria-label="Mirrored camera preview"
          />
          {view.phase === 'welcome' && <div className={styles.emptyFrame} aria-hidden="true" />}
          {(view.phase === 'review' || view.phase === 'printing') && view.photoUrl && (
            // Browser-owned blob URLs are never sent to the Next image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.photo} src={view.photoUrl} alt="Your final photo" />
          )}
          {view.phase === 'countdown' && (
            <div className={styles.countdown} aria-live="assertive">
              {countdown}
            </div>
          )}
        </div>
        <div role="status" className={styles.status}>
          {!needsAdmin && messages[view.phase] && <p>{messages[view.phase]}</p>}
        </div>
        <p role="alert" className={styles.alert}>
          {view.counts?.unresolved
            ? 'A print outcome is pending. Please inform the Admin. New Guests must wait.'
            : needsAdmin
              ? messages[view.phase]
              : null}
        </p>
        <div className={styles.actions}>
          {view.phase === 'welcome' && (
            <>
              <p>One print per turn. Your photo stays on this device until printing is done.</p>
              <button
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void flow.start().finally(() => setBusy(false));
                }}
              >
                Start
              </button>
            </>
          )}
          {view.phase === 'preview' && (
            <button
              className={styles.shutter}
              onClick={() => {
                setCountdown(3);
                flow.countdown();
              }}
            >
              Take Photo
            </button>
          )}
          {view.phase === 'review' && (
            <>
              <button className={styles.secondary} onClick={() => flow.retake()}>
                Retake
              </button>
              <button onClick={() => void flow.print()}>Print</button>
            </>
          )}
          {view.allowedActions.enableCamera && (
            <button disabled={busy} onClick={() => void enableCamera()}>
              Enable Camera
            </button>
          )}
          {view.allowedActions.connectPrinter && (
            <button onClick={() => void flow.connectPrinter().then(report)}>
              Connect to Instax
            </button>
          )}
          {(view.phase === 'access-required' || view.phase === 'finished') && (
            <a href="/sign-in?from=booth">Sign in</a>
          )}
        </div>
      </section>
    </main>
  );
}
