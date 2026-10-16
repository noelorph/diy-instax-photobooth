'use client';
/* eslint-disable @next/next/no-img-element -- Photo blob URLs must stay in browser memory, outside image optimization. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BoothFlow, boothFetch } from './flow';
import { BrowserBoothCamera, type BoothCamera } from './camera';
import { SimulatedPrinter } from './printer/simulator';
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
        printer: new SimulatedPrinter(),
        storage: {
          getItem: (key) => sessionStorage.getItem(key),
          setItem: (key, value) => sessionStorage.setItem(key, value),
          removeItem: (key) => sessionStorage.removeItem(key),
        },
      })
  );
  const [camera] = useState(() => suppliedCamera ?? new BrowserBoothCamera());
  const view = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const video = useRef<HTMLVideoElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [count, setCount] = useState(3);
  const [idle, setIdle] = useState(0);
  const idleSince = useRef(0);
  const mounted = useRef(false);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelPausePress = () => {
    clearTimeout(pauseTimer.current);
  };
  const cameraVisible = ['preview', 'countdown', 'capturing'].includes(view.phase);
  useEffect(() => {
    mounted.current = true;
    const url = new URL(window.location.href);
    const handoff = url.searchParams.get('handoff') ?? undefined;
    if (handoff) {
      url.searchParams.delete('handoff');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    void flow.initialize(handoff);
    const offline = () => flow.offline(),
      online = () => {
        void flow.online();
      };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    const polling = window.setInterval(() => {
      void flow.refresh();
    }, 1000);
    return () => {
      mounted.current = false;
      clearInterval(polling);
      clearTimeout(pauseTimer.current);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      queueMicrotask(() => {
        if (!mounted.current) flow.dispose();
      });
    };
  }, [flow]);
  useEffect(() => {
    if (!cameraVisible || !video.current) return;
    let cancelled = false;
    void camera
      .start(video.current, () => {
        void flow.connectionChanged();
      })

      .catch(() => {
        if (!cancelled) void flow.connectionChanged();
      });
    return () => {
      cancelled = true;
      camera.stop();
    };
  }, [cameraVisible, camera, flow]);
  useEffect(() => {
    heading.current?.focus();
  }, [view.phase]);
  useEffect(() => {
    if (view.phase !== 'countdown') return;
    let remaining = 3;
    const timer = setInterval(() => {
      remaining--;
      if (remaining === 0) {
        clearInterval(timer);
        void flow.shutter(() => camera.capture());
      } else setCount(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [view.phase, flow, camera]);
  useEffect(() => {
    if (!['preview', 'review'].includes(view.phase)) return;
    idleSince.current = Date.now();
    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - idleSince.current) / 1000);
      setIdle(seconds);
      if (seconds >= 90) void flow.timeout();
    }, 1000);
    return () => clearInterval(timer);
  }, [view.phase, flow]);
  useEffect(() => {
    if (view.phase !== 'printing') return;
    const timer = setTimeout(() => {
      void flow.printTimedOut();
    }, 60000);
    return () => clearTimeout(timer);
  }, [view.phase, flow]);
  useEffect(() => {
    if (view.phase !== 'confirmed') return;
    const timer = setTimeout(() => {
      void flow.welcome();
    }, 3000);
    return () => clearTimeout(timer);
  }, [view.phase, flow]);
  const titles = {
    loading: 'Preparing Booth Mode',
    welcome: view.title ?? 'Make a memory',
    preview: 'Find your frame',
    countdown: 'Get ready',
    capturing: 'Preparing your photo',
    review: 'Your photo',
    preparing: 'Preparing',
    printing: view.message ?? 'Sending',
    confirmed: 'Your print is ready',
    'connection-hold': 'Connection lost',
    uncertain: 'Please ask the Admin for help',
    paused: 'Booth paused',
    unavailable: 'Printing is unavailable right now',
  };
  const neutral = ['paused', 'unavailable', 'uncertain'].includes(view.phase);
  return (
    <main className={styles.booth}>
      <section className={styles.content}>
        <h1 ref={heading} tabIndex={-1} aria-live="polite">
          {titles[view.phase]}
        </h1>
        <div className={styles.status} role={view.phase === 'uncertain' ? 'alert' : 'status'}>
          {view.phase === 'welcome' && (
            <p>
              One photo. One physical print.
              <br />
              Your photo is discarded after your session.
            </p>
          )}
          {view.phase === 'review' && view.message && <p>{view.message}</p>}
          {view.phase === 'connection-hold' && (
            <p>Connection lost. Your photo is still here. Please wait or ask the Admin for help.</p>
          )}
          {view.phase === 'uncertain' && (
            <p>We could not confirm your print. Please ask the Admin for help.</p>
          )}
          {(view.phase === 'paused' || view.phase === 'unavailable') && (
            <p>Please ask the Admin for help.</p>
          )}
          {view.phase === 'confirmed' && <p>Please collect your print.</p>}
        </div>
        {cameraVisible && (
          <div className={styles.frame}>
            <video
              ref={video}
              className={styles.preview}
              muted
              playsInline
              aria-label="Mirrored camera preview"
            />
            {view.phase === 'countdown' && (
              <span className={styles.countdown} role="status">
                {count}
              </span>
            )}
          </div>
        )}
        {view.phase === 'review' && view.photoUrl && (
          <div className={styles.frame}>
            {/* Browser-owned blob URL; never Next Image optimization. */}
            <img src={view.photoUrl} alt="Your final photo" className={styles.photo} />
          </div>
        )}
        {view.phase === 'welcome' && <div className={styles.emptyFrame} aria-hidden="true" />}
        <div className={styles.actions}>
          {view.phase === 'welcome' && (
            <button
              onClick={() => {
                setIdle(0);
                void flow.start();
              }}
            >
              Start
            </button>
          )}
          {view.phase === 'preview' && (
            <button
              onClick={() => {
                setCount(3);
                setIdle(0);
                flow.countdown();
              }}
            >
              Take Photo
            </button>
          )}
          {view.phase === 'review' && (
            <>
              <button
                className={styles.secondary}
                onClick={() => {
                  setIdle(0);
                  flow.retake();
                }}
              >
                Retake
              </button>
              <button
                onClick={() => {
                  setIdle(0);
                  void flow.print();
                }}
              >
                Print
              </button>
            </>
          )}
          {neutral && <a href="/sign-in?from=booth">Admin sign in</a>}
        </div>
        {['preview', 'review'].includes(view.phase) && idle >= 75 && (
          <aside className={styles.warning} role="status">
            <p>Your session ends in {Math.max(0, 90 - idle)} seconds.</p>
            <button
              onClick={() => {
                idleSince.current = Date.now();
                setIdle(0);
              }}
            >
              Continue
            </button>
          </aside>
        )}
        {!neutral && (
          <button
            className={styles.adminPause}
            aria-label="Admin pause"
            title="Hold to pause; keyboard users press Enter or Space"
            onPointerDown={() => {
              cancelPausePress();
              pauseTimer.current = setTimeout(() => {
                void flow.requestPause();
              }, 1500);
            }}
            onPointerUp={cancelPausePress}
            onPointerLeave={cancelPausePress}
            onPointerCancel={cancelPausePress}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                void flow.requestPause();
              }
            }}
            onClick={(event) => {
              if (event.detail === 0) void flow.requestPause();
            }}
          >
            Admin pause
          </button>
        )}
      </section>
    </main>
  );
}
