'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BoothFlow, boothFetch } from './flow';
import { BrowserBoothCamera, type BoothCamera } from './camera';
import { BrowserBoothMetadataJournal } from './print-journal';
import { getBoothPrinter, hasLiveCamera } from './equipment';
import { STATE_POLL_MS } from '@/lib/operations/package-contract';
import styles from './booth.module.css';
export function BoothPaused() {
  return (
    <main className={styles.booth}>
      <section className={styles.content}>
        <h1>Booth paused</h1>
        <p>Please ask the Admin for help.</p>
        <a href="/sign-in?from=booth">Admin sign in</a>
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
        transport: boothFetch,
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
  const report = () => {
    const live = hasLiveCamera(video.current);
    return flow.reportEquipment({
      cameraPermission: live,
      cameraLive: live,
      serverReachable: navigator.onLine,
      printerConnected: true,
      printerReady: true,
      oldJobCleared: true,
    });
  };
  useEffect(() => {
    const token = Symbol();
    owner.current = token;
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
      if (current() && document.visibilityState === 'visible') void report();
    };
    const timer = window.setInterval(tick, STATE_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    window.addEventListener('offline', tick);
    return () => {
      owner.current = null;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
      window.removeEventListener('offline', tick);
      queueMicrotask(() => {
        if (owner.current === null) {
          camera.stop();
          flow.dispose();
        }
      });
    };
    // Resource callbacks belong to this mounted controller, never a setup surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, camera]);
  useEffect(() => {
    heading.current?.focus();
    if (view.phase === 'finished' || view.phase === 'access-required') camera.stop();
  }, [view.phase, camera]);
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
  const titles = {
    loading: 'Preparing Booth Mode',
    welcome: 'Make a memory',
    paused: 'Booth paused',
    finishing: 'Finishing Booth Mode',
    finished: 'Booth Mode finished',
    'access-required': 'Booth access ended',
    unavailable: 'Booth equipment needs attention',
  };
  return (
    <main className={styles.booth}>
      <section className={styles.content}>
        <h1 ref={heading} tabIndex={-1} aria-live="polite">
          {titles[view.phase]}
        </h1>
        <div
          className={styles.frame}
          hidden={view.phase === 'finished' || view.phase === 'access-required'}
        >
          <video
            ref={video}
            className={styles.preview}
            muted
            playsInline
            aria-label="Mirrored camera preview"
          />
        </div>
        <div role="status">
          {view.phase === 'welcome' ? (
            <p>Equipment ready.</p>
          ) : (
            <p>
              {view.phase === 'access-required'
                ? 'Please inform the Admin.'
                : view.phase === 'finished'
                  ? 'Thank you.'
                  : 'Please wait or ask the Admin for help.'}
            </p>
          )}
        </div>
        <div className={styles.actions}>
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
          {view.phase === 'access-required' && <a href="/sign-in?from=booth">Admin sign in</a>}
        </div>
      </section>
    </main>
  );
}
