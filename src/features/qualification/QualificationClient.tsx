'use client';

import { useEffect, useRef, useState } from 'react';
import {
  connectMiniLink3,
  type PrinterConnection,
  type WebBluetoothPort,
} from './instax/bluetooth';
import { INSTAX_OPCODES } from './instax/protocol';
import { createCandidateObservation, type CandidateSnapshot } from './instax/candidates';
import {
  preflightPrinter,
  sendTrialPrint,
  startStatusObservation,
  type PrintPhase,
} from './instax/session';
import { capturePrintableFrame, revokePreview } from './image';
import { createTrialLog, type TrialEvent, type TrialLog } from './trial-log';
import { createTrialController, type TrialController, type TrialState } from './trial';
import styles from './QualificationClient.module.css';

export type QualificationServices = {
  secureContext: boolean;
  bluetooth?: WebBluetoothPort;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  connect: typeof connectMiniLink3;
  preflight: typeof preflightPrinter;
  prepare: typeof capturePrintableFrame;
  revoke: typeof revokePreview;
  send: typeof sendTrialPrint;
  observe: typeof startStatusObservation;
  storage: Storage;
};

function browserServices(): QualificationServices {
  const browser = navigator as Navigator & { bluetooth?: WebBluetoothPort };
  return {
    secureContext: window.isSecureContext,
    bluetooth: browser.bluetooth,
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    connect: connectMiniLink3,
    preflight: preflightPrinter,
    prepare: capturePrintableFrame,
    revoke: revokePreview,
    send: sendTrialPrint,
    observe: startStatusObservation,
    storage: localStorage,
  };
}

const initialState: TrialState = { remaining: 3, phase: 'ready', needsReconciliation: false };
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function hex(bytes: Uint8Array): string {
  return [...bytes.subarray(0, 128)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function LiveUtcClock() {
  const clockRef = useRef<HTMLTimeElement>(null);

  useEffect(() => {
    const update = () => {
      const iso = new Date().toISOString();
      if (!clockRef.current) return;
      clockRef.current.dateTime = iso;
      clockRef.current.textContent = `${iso.slice(11, 23)} UTC`;
    };
    update();
    const interval = setInterval(update, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.clockPanel}>
      <span>Phone clock</span>
      <time ref={clockRef} aria-live="off">
        Syncing…
      </time>
    </div>
  );
}

export function QualificationClient({ services }: { services?: QualificationServices }) {
  const [mounted, setMounted] = useState(Boolean(services));
  const [cameraReady, setCameraReady] = useState(false);
  const [printerReady, setPrinterReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reloadRunning, setReloadRunning] = useState(false);
  const [candidateMode, setCandidateMode] = useState<'ejection' | 'reload' | null>(null);
  const [candidateSnapshot, setCandidateSnapshot] = useState<CandidateSnapshot | null>(null);
  const [candidateEvent, setCandidateEvent] = useState<TrialEvent | null>(null);
  const [reloadMarkerTime, setReloadMarkerTime] = useState<string | null>(null);
  const [printerDetails, setPrinterDetails] = useState('');
  const [setupError, setSetupError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [stage, setStage] = useState<'setup' | 'camera' | 'review' | 'pending' | 'uncertain'>(
    'setup'
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [rejection, setRejection] = useState('');
  const [trialState, setTrialState] = useState<TrialState>(initialState);
  const [events, setEvents] = useState<TrialEvent[]>([]);
  const [liveStatus, setLiveStatus] = useState<TrialEvent | null>(null);
  const [sheetsChecked, setSheetsChecked] = useState(false);
  const [logExport, setLogExport] = useState<{ filename: string; json: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [emergenceMarkerTime, setEmergenceMarkerTime] = useState<string | null>(null);
  const [statusTailComplete, setStatusTailComplete] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const connectionRef = useRef<PrinterConnection | null>(null);
  const connectionGenerationRef = useRef(0);
  const observationRef = useRef<{
    mode: 'ejection' | 'reload';
    observationId: string;
    attemptId?: string;
    invalidate(reason: string): void;
  } | null>(null);
  const jpegRef = useRef<Uint8Array | null>(null);
  const previewRef = useRef<string | null>(null);
  const logRef = useRef<TrialLog | null>(null);
  const controllerRef = useRef<TrialController | null>(null);
  const stopObservationRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markerTailRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emergenceMarkedRef = useRef(false);
  const servicesRef = useRef<QualificationServices | null>(services ?? null);

  useEffect(() => {
    // Hydration reveals browser-only APIs and local recovery state after server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const active = services ?? browserServices();
    servicesRef.current = active;
    const log = createTrialLog({
      now: () => performance.now(),
      iso: () => new Date().toISOString(),
    });
    logRef.current = log;
    controllerRef.current = createTrialController(
      {
        send: (jpeg) => {
          const connection = connectionRef.current;
          if (!connection)
            return Promise.resolve({
              kind: 'rejected-before-command',
              message: 'Printer disconnected',
            });
          return active.send(connection, jpeg, (phase: PrintPhase) =>
            record({ kind: 'print-phase', message: phase })
          );
        },
      },
      log,
      active.storage
    );
    setTrialState(controllerRef.current.getState());
    const onVisibilityChange = () => {
      if (document.hidden) observationRef.current?.invalidate('Page hidden during observation');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      observationRef.current = null;
      // Retire callbacks from whichever connection is current at unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      connectionGenerationRef.current++;
      stopObservationRef.current?.();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (markerTailRef.current) clearTimeout(markerTailRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewRef.current) active.revoke(previewRef.current);
      void connectionRef.current?.disconnect();
    };
    // A production page has one service adapter for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function record(input: Parameters<TrialLog['record']>[0]) {
    const event = logRef.current?.record({
      connectionGeneration: connectionGenerationRef.current || undefined,
      ...input,
    });
    if (event) setEvents((previous) => [...previous, event]);
    return event;
  }
  function stopObservation(reason = 'Operator ended observation') {
    const observation = observationRef.current;
    if (observation)
      record({
        kind: `${observation.mode}-observation-stop`,
        observationId: observation.observationId,
        attemptId: observation.attemptId,
        message: reason,
      });
    observationRef.current = null;
    setReloadRunning(false);
    stopObservationRef.current?.();
    stopObservationRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (markerTailRef.current) clearTimeout(markerTailRef.current);
    markerTailRef.current = null;
  }
  function startCandidateObservation(mode: 'ejection' | 'reload') {
    stopObservation();
    const connection = connectionRef.current!;
    const probe = createCandidateObservation(mode);
    const context = {
      observationId: `observation-${crypto.randomUUID()}`,
      attemptId:
        mode === 'ejection'
          ? logRef.current?.getEvents().findLast((event) => event.kind === 'print-start')?.attemptId
          : undefined,
    };
    let previous: CandidateSnapshot | null = null;
    const update = (next: CandidateSnapshot) => {
      if (next.blockedReason && !previous?.blockedReason) {
        record({ kind: 'candidate-invalid', ...context, message: next.blockedReason });
      } else if (next.candidate && !previous?.candidate) {
        setCandidateEvent(
          record({
            kind: `${mode}-candidate`,
            ...context,
            message: 'rea-candidates-v1; unqualified',
          }) ?? null
        );
      }
      if (next.baseline && !previous?.baseline)
        record({ kind: 'reload-baseline', ...context, message: JSON.stringify(next.baseline) });
      previous = next;
      setCandidateSnapshot(next);
    };
    const observation = {
      ...context,
      mode,
      invalidate: (reason: string) => update(probe.invalidate(reason)),
    };
    observationRef.current = observation;
    setCandidateMode(mode);
    setCandidateSnapshot(null);
    setCandidateEvent(null);
    setReloadMarkerTime(null);
    record({
      kind: `${mode}-observation-start`,
      ...context,
      message: 'rea-candidates-v1; 60s; diagnostic only',
    });
    stopObservationRef.current = servicesRef.current!.observe(
      connection,
      (response) => {
        if (observationRef.current !== observation || connectionRef.current !== connection) return;
        const next = probe.observe(response);
        const isHistory = response.payload[1] === 3;
        const event = record({
          kind: isHistory ? 'print-history' : 'status',
          ...context,
          opcode: response.opcode,
          statusByte: response.payload[0],
          filmRemaining:
            !isHistory && response.payload[2] !== undefined ? response.payload[2] & 15 : undefined,
          responseHex: hex(response.payload),
        });
        if (!isHistory && event) setLiveStatus(event);
        update(next);
      },
      (error) => {
        if (observationRef.current !== observation) return;
        record({ kind: 'status-error', ...context, message: error.message });
        observation.invalidate(error.message);
      },
      mode === 'reload'
    );
  }
  function observeReload() {
    if (
      !connectionRef.current ||
      reloadRunning ||
      connecting ||
      trialState.needsReconciliation ||
      trialState.phase !== 'ready'
    )
      return;
    startCandidateObservation('reload');
    setReloadRunning(true);
    setPrinterReady(false);
    timeoutRef.current = setTimeout(
      () => stopObservation('60-second reload observation ended'),
      60_000
    );
  }
  function markReloadCover() {
    const observation = observationRef.current;
    if (observation?.mode !== 'reload' || reloadMarkerTime) return;
    const event = record({
      kind: 'physical-reload-cover-emerged',
      observationId: observation.observationId,
    });
    if (event) setReloadMarkerTime(event.timestamp);
  }
  function clearPhoto() {
    jpegRef.current = null;
    if (previewRef.current) servicesRef.current?.revoke(previewRef.current);
    previewRef.current = null;
    setPreviewUrl(null);
  }
  async function enableCamera() {
    setCameraError('');
    try {
      const active = servicesRef.current!;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await active.getUserMedia({ audio: false, video: { facingMode: 'user' } });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('No video track available');
      track.addEventListener('ended', () => {
        if (streamRef.current !== stream) return;
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraReady(false);
        setCameraError('Camera stream ended. Retry camera in setup.');
        const phase = controllerRef.current?.getState().phase;
        if (phase !== 'sending' && phase !== 'awaiting-observation') {
          clearPhoto();
          setStage('setup');
        }
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraReady(true);
      record({ kind: 'camera-ready' });
    } catch (error) {
      setCameraReady(false);
      setCameraError(`Camera: ${errorText(error)}`);
    }
  }
  async function connectPrinter() {
    if (connecting || reloadRunning) return;
    const active = servicesRef.current!;
    if (!active.bluetooth) {
      setSetupError(
        'Web Bluetooth is unavailable in this browser. Open the trusted HTTPS page in Bluefy.'
      );
      return;
    }
    setSetupError('');
    setConnecting(true);
    setPrinterReady(false);
    setPrinterDetails('');
    const generation = ++connectionGenerationRef.current;
    const previousConnection = connectionRef.current;
    connectionRef.current = null;
    let connection: PrinterConnection | null = null;
    try {
      await previousConnection?.disconnect();
      connection = await active.connect(active.bluetooth, {
        onResponse(response) {
          if (generation !== connectionGenerationRef.current) return;
          const transferResponse =
            response.opcode === INSTAX_OPCODES.downloadStart ||
            response.opcode === INSTAX_OPCODES.downloadData ||
            response.opcode === INSTAX_OPCODES.downloadEnd ||
            response.opcode === INSTAX_OPCODES.printImage;
          record({
            kind: 'printer-response',
            opcode: response.opcode,
            statusByte: transferResponse ? undefined : response.payload[0],
            responseHex: transferResponse ? undefined : hex(response.payload),
          });
        },
        onLink3Status(bytes) {
          if (generation !== connectionGenerationRef.current) return;
          record({ kind: 'link3-status', responseHex: hex(bytes) });
        },
        onLink3StatusReady() {
          if (generation !== connectionGenerationRef.current) return;
          record({ kind: 'link3-status-listening' });
        },
        onLink3StatusError(error) {
          if (generation !== connectionGenerationRef.current) return;
          record({ kind: 'link3-status-unavailable', message: error.message });
        },
        onDisconnect() {
          if (generation !== connectionGenerationRef.current) return;
          observationRef.current?.invalidate('Printer disconnected during observation');
          stopObservation('Printer disconnected');
          connectionGenerationRef.current++;
          connectionRef.current = null;
          setPrinterReady(false);
          setSetupError('Printer disconnected. Reconnect in setup.');
          record({ kind: 'printer-disconnect', connectionGeneration: generation });
          const controller = controllerRef.current;
          if (
            controller &&
            ['sending', 'awaiting-observation'].includes(controller.getState().phase)
          ) {
            try {
              controller.markUncertain('Printer disconnected after command may have started');
            } catch {
              /* The in-flight send resolves uncertain. */
            }
            setTrialState(controller.getState());
            stopObservation();
            clearPhoto();
            setStage('uncertain');
          } else setStage('setup');
        },
      });
      if (generation !== connectionGenerationRef.current) {
        await connection.disconnect();
        return;
      }
      connectionRef.current = connection;
      let preflight: Awaited<ReturnType<typeof preflightPrinter>>;
      try {
        preflight = await active.preflight(connection, true);
      } catch (error) {
        throw new Error(`Printer status check: ${errorText(error)}`);
      }
      if (generation !== connectionGenerationRef.current) return;
      setPrinterDetails(
        `${connection.modelNumber} · firmware ${connection.firmwareRevision} · film reported ${preflight.filmRemaining}`
      );
      setPrinterReady(preflight.filmRemaining > 0);
      record({
        kind: preflight.filmRemaining > 0 ? 'printer-ready' : 'printer-connected',
        filmRemaining: preflight.filmRemaining,
        message: `${connection.modelNumber}; firmware ${connection.firmwareRevision}`,
      });
    } catch (error) {
      if (connection) {
        connectionRef.current = null;
        try {
          await connection.disconnect();
        } catch (disconnectError) {
          record({ kind: 'disconnect-error', message: errorText(disconnectError) });
        }
      }
      setPrinterReady(false);
      setSetupError(
        error instanceof Error && error.message.startsWith('Printer status check:')
          ? error.message
          : `Printer: ${errorText(error)}`
      );
    } finally {
      setConnecting(false);
    }
  }
  async function capture() {
    if (!cameraReady || !videoRef.current) return;
    try {
      setRejection('');
      const image = await servicesRef.current!.prepare(videoRef.current);
      clearPhoto();
      jpegRef.current = image.jpeg;
      previewRef.current = image.previewUrl;
      setPreviewUrl(image.previewUrl);
      setStage('review');
      record({ kind: 'capture' });
    } catch (error) {
      setSetupError(`Capture: ${errorText(error)}`);
      setStage('setup');
    }
  }
  function retake() {
    clearPhoto();
    setStage('camera');
    record({ kind: 'retake' });
  }
  function returnToSetupAfterRejection() {
    clearPhoto();
    setRejection('');
    setPrinterReady(false);
    setPrinterDetails('');
    const connection = connectionRef.current;
    connectionRef.current = null;
    void connection
      ?.disconnect()
      .catch((error) => record({ kind: 'disconnect-error', message: errorText(error) }));
    setStage('setup');
  }
  async function print() {
    const controller = controllerRef.current;
    const jpeg = jpegRef.current;
    if (
      !controller ||
      !jpeg ||
      printing ||
      controller.getState().phase !== 'ready' ||
      !printerReady
    )
      return;
    setPrinting(true);
    setRejection('');
    setEmergenceMarkerTime(null);
    emergenceMarkedRef.current = false;
    setStatusTailComplete(false);
    setLiveStatus(null);
    setCandidateMode(null);
    try {
      await controller.startPrint(jpeg);
      const current = controller.getState();
      setTrialState(current);
      setEvents(logRef.current?.getEvents() ?? []);
      if (current.phase === 'awaiting-observation') {
        setStage('pending');
        startCandidateObservation('ejection');
        timeoutRef.current = setTimeout(() => {
          if (controller.getState().phase !== 'awaiting-observation') return;
          controller.markUncertain(
            emergenceMarkedRef.current
              ? 'Physical emergence was marked, but final confirmation was missed within 60 seconds'
              : 'No observed physical ejection within 60 seconds'
          );
          setTrialState(controller.getState());
          stopObservation('60-second print observation ended');
          clearPhoto();
          setStage('uncertain');
        }, 60_000);
      } else if (current.phase === 'uncertain') {
        stopObservation();
        clearPhoto();
        setStage('uncertain');
      } else if (current.lastMessage) {
        setRejection(`No print command was sent. ${current.lastMessage}`);
      }
    } catch (error) {
      setSetupError(`Print: ${errorText(error)}`);
      setStage('setup');
    } finally {
      setPrinting(false);
    }
  }
  function markPhysicalEmergence() {
    const controller = controllerRef.current;
    if (
      !controller ||
      controller.getState().phase !== 'awaiting-observation' ||
      markerTailRef.current ||
      emergenceMarkerTime
    )
      return;
    const marker = controller.markPhysicalEmergence();
    emergenceMarkedRef.current = true;
    setEvents(logRef.current?.getEvents() ?? []);
    setEmergenceMarkerTime(marker.timestamp);
    setStatusTailComplete(false);
    markerTailRef.current = setTimeout(() => {
      setStatusTailComplete(true);
      markerTailRef.current = null;
    }, 10_000);
  }
  function observedEjection() {
    if (!emergenceMarkerTime || !statusTailComplete) return;
    const controller = controllerRef.current!;
    controller.observeEjection(new Date().toISOString());
    setTrialState(controller.getState());
    stopObservation();
    setEmergenceMarkerTime(null);
    emergenceMarkedRef.current = false;
    setStatusTailComplete(false);
    clearPhoto();
    setStage(controller.getState().phase === 'exhausted' ? 'setup' : 'camera');
  }
  function reconcile() {
    if (!sheetsChecked || reloadRunning) return;
    const controller = controllerRef.current!;
    controller.beginNewRun(true);
    setTrialState(controller.getState());
    setSheetsChecked(false);
    setRejection('');
    setStage('setup');
    setEvents([]);
    setLogExport(null);
    setEmergenceMarkerTime(null);
    emergenceMarkedRef.current = false;
    setStatusTailComplete(false);
    setLiveStatus(null);
    setCandidateMode(null);
    setCandidateSnapshot(null);
    setCandidateEvent(null);
    setReloadMarkerTime(null);
  }
  function exportLog() {
    const log = logRef.current;
    if (!log) return;
    setLogExport({ filename: `${log.runId}.json`, json: log.exportJson() });
    setCopyStatus('');
  }
  async function copyLog() {
    if (!logExport) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(logExport.json);
      setCopyStatus('JSON copied. Paste it into the evidence record.');
    } catch {
      setCopyStatus('Copy unavailable. Touch and hold the JSON text, then Select All and Copy.');
    }
  }

  if (!mounted) return <main className={styles.shell}>Loading local qualification…</main>;
  const active = servicesRef.current;
  const blocked = !active?.secureContext || !active.bluetooth;
  const statusHex =
    liveStatus?.opcode === INSTAX_OPCODES.supportFunctionInfo ? liveStatus.responseHex : undefined;
  const statusField = statusHex && statusHex.length >= 10 ? statusHex.slice(6, 10) : undefined;
  const statusFieldLabel =
    statusField === '127f'
      ? '12 7f present'
      : statusField === '0000'
        ? '12 7f cleared'
        : statusField
          ? `Status field ${statusField.slice(0, 2)} ${statusField.slice(2)}`
          : 'No status response yet';
  return (
    <main className={styles.shell}>
      <div className={styles.topline}>
        <span>iPhone print qualification</span>
        <span>Development trial</span>
      </div>
      <header className={styles.heading}>
        <h1>Capture to film</h1>
        <p>Supervised Mini Link 3 trial. Physical ejection must be observed.</p>
      </header>
      <div className={styles.count} aria-live="polite">
        {trialState.remaining} sheets available
      </div>
      {blocked && (
        <p className={styles.alert} role="alert">
          {!active?.secureContext ? 'Trusted HTTPS is required. ' : ''}
          {!active?.bluetooth
            ? 'Web Bluetooth is unavailable in this browser. Open this page in Bluefy.'
            : ''}
        </p>
      )}
      {setupError && (
        <p className={styles.alert} role="alert">
          {setupError}
        </p>
      )}
      {cameraError && (
        <p className={styles.alert} role="alert">
          {cameraError}
        </p>
      )}
      {rejection && (
        <p className={styles.alert} role="alert">
          {rejection}
        </p>
      )}
      <section
        className={`${styles.stage} ${stage === 'pending' ? styles.pendingStage : ''}`}
        aria-label="Trial view"
      >
        <video
          ref={videoRef}
          className={`${styles.camera} ${stage === 'camera' || (stage === 'setup' && cameraReady) ? '' : styles.hidden}`}
          autoPlay
          muted
          playsInline
          aria-label="Camera preview"
        />
        {/* The blob is the exact JPEG sent to the printer; optimization would change the preview. */}
        {stage === 'review' && previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.review}
            src={previewUrl}
            alt="Unmirrored portrait crop that will be printed"
          />
        )}
        {stage === 'setup' && !cameraReady && (
          <div className={styles.emptyFrame}>
            <span>Printer and camera setup</span>
            <small>Permissions stay with the operator.</small>
          </div>
        )}
        {stage === 'pending' && (
          <div className={styles.pendingFrame}>
            <strong>Waiting for film ejection</strong>
            <p>Watch the sheet. Printer status is diagnostic only.</p>
            <LiveUtcClock />
            <div className={styles.signalPanel} role="group" aria-label="Live printer status">
              <span className={styles.signalHeading}>Live printer status</span>
              <span className={styles.signalValue}>{statusFieldLabel}</span>
              {liveStatus && (
                <>
                  {liveStatus.filmRemaining !== undefined && (
                    <span>
                      Printer reports {liveStatus.filmRemaining} sheet
                      {liveStatus.filmRemaining === 1 ? '' : 's'}
                    </span>
                  )}
                  <time dateTime={liveStatus.timestamp}>
                    Response at {liveStatus.timestamp.slice(11, 23)} UTC
                  </time>
                </>
              )}
            </div>
          </div>
        )}
        {stage === 'uncertain' && (
          <div className={styles.emptyFrame}>
            <strong>Outcome uncertain</strong>
            <small>
              {trialState.lastMessage}. Inspect the printer and physical sheets. Do not resend.
            </small>
          </div>
        )}
      </section>
      <section className={styles.controls} aria-label="Trial controls">
        {stage === 'setup' && (
          <>
            <div className={styles.setupRow}>
              <span>{cameraReady ? 'Camera ready' : 'Camera needs permission'}</span>
              <button type="button" onClick={enableCamera}>
                {cameraError ? 'Retry camera' : 'Enable camera'}
              </button>
            </div>
            <div className={styles.setupRow}>
              <span>
                {printerReady
                  ? 'Printer ready'
                  : connectionRef.current
                    ? 'Connected for diagnostics; check printer before printing'
                    : 'Printer not connected'}
              </span>
              <button
                type="button"
                onClick={connectPrinter}
                disabled={blocked || connecting || reloadRunning}
              >
                {connecting ? 'Connecting…' : 'Connect printer'}
              </button>
            </div>
            {printerDetails && <p className={styles.detail}>{printerDetails}</p>}
            <button
              type="button"
              onClick={reloadRunning ? () => stopObservation() : observeReload}
              disabled={
                blocked ||
                connecting ||
                !connectionRef.current ||
                trialState.needsReconciliation ||
                trialState.phase !== 'ready'
              }
            >
              {reloadRunning ? 'Stop reload observation' : 'Observe reload'}
            </button>
            <p className={styles.detail}>
              Reload observation reads status and history for 60 seconds. Keep the cover closed
              until the baseline is captured. Reconnect to check print readiness afterward.
            </p>
            <button
              className={styles.primary}
              type="button"
              disabled={
                blocked ||
                reloadRunning ||
                connecting ||
                !cameraReady ||
                !printerReady ||
                trialState.phase !== 'ready'
              }
              onClick={() => setStage('camera')}
            >
              Start trial
            </button>
          </>
        )}
        {stage === 'camera' && (
          <button
            className={styles.shutter}
            type="button"
            disabled={!cameraReady || !printerReady || trialState.phase !== 'ready'}
            onClick={capture}
          >
            Capture
          </button>
        )}
        {stage === 'review' && (
          <>
            <div className={styles.actionRow}>
              <button type="button" disabled={printing} onClick={retake}>
                Retake
              </button>
              <button
                className={styles.primary}
                type="button"
                disabled={printing || !!rejection || !printerReady || trialState.phase !== 'ready'}
                onClick={print}
              >
                Print
              </button>
            </div>
            {rejection && (
              <button type="button" onClick={returnToSetupAfterRejection}>
                Return to setup
              </button>
            )}
          </>
        )}
        {stage === 'pending' && (
          <div className={styles.pendingActions}>
            <button type="button" disabled={!!emergenceMarkerTime} onClick={markPhysicalEmergence}>
              Sheet fully emerged
            </button>
            <p className={styles.detail} aria-live="polite">
              {emergenceMarkerTime
                ? statusTailComplete
                  ? `Marker saved at ${new Date(emergenceMarkerTime).toLocaleTimeString()}. Status recording complete. Tap “Observed film ejection” below now to confirm the sheet.`
                  : `Marker saved at ${new Date(emergenceMarkerTime).toLocaleTimeString()}. Status recording continues for 10 seconds.`
                : 'Tap only when the entire sheet is outside the printer. This is a timing marker, not automatic confirmation.'}
            </p>
            <button
              className={styles.primary}
              type="button"
              disabled={!emergenceMarkerTime || !statusTailComplete}
              onClick={observedEjection}
            >
              Observed film ejection
            </button>
          </div>
        )}
        {(stage === 'uncertain' ||
          trialState.needsReconciliation ||
          trialState.phase === 'exhausted') && (
          <div className={styles.reconcile}>
            <label>
              <input
                type="checkbox"
                checked={sheetsChecked}
                onChange={(event) => setSheetsChecked(event.target.checked)}
              />{' '}
              I checked the physical sheets and printer
            </label>
            <button type="button" disabled={!sheetsChecked} onClick={reconcile}>
              Reconcile physical sheets
            </button>
          </div>
        )}
      </section>
      {candidateMode && (
        <section className={styles.signalPanel} aria-label="REA candidate diagnostics">
          <strong>
            {candidateMode === 'ejection' ? 'Ejection' : 'Reload'} candidate · unqualified
          </strong>
          {reloadRunning && <LiveUtcClock />}
          <p role="status">
            {candidateSnapshot?.blockedReason
              ? `Candidate unavailable: ${candidateSnapshot.blockedReason}`
              : candidateEvent
                ? `Candidate observed at ${candidateEvent.timestamp.slice(11, 23)} UTC`
                : 'No candidate observed'}
          </p>
          {candidateSnapshot?.status && (
            <span>
              Cover {candidateSnapshot.status.coverOpen ? 'open' : 'closed'} · operation{' '}
              {candidateSnapshot.status.operating ? 'active' : 'idle'} (
              {candidateSnapshot.status.operationInfo}) · result{' '}
              {candidateSnapshot.status.printResult} · error {candidateSnapshot.status.errorCode}
              {candidateSnapshot.status.error ? ' (flag set)' : ''} · film reported{' '}
              {candidateSnapshot.status.filmRemaining}
            </span>
          )}
          {candidateMode === 'reload' && (
            <>
              <span>
                {candidateSnapshot?.baseline
                  ? `Baseline captured: prints ${candidateSnapshot.baseline.totalPrints}, FC ${candidateSnapshot.baseline.totalEjectFC}. Observe one cover cycle.`
                  : 'Waiting for closed-cover baseline.'}
              </span>
              {candidateSnapshot?.history && (
                <span>
                  History: prints {candidateSnapshot.history.totalPrints}, FC{' '}
                  {candidateSnapshot.history.totalEjectFC}
                </span>
              )}
              <button
                type="button"
                onClick={markReloadCover}
                disabled={!reloadRunning || !!reloadMarkerTime}
              >
                Reload cover fully emerged
              </button>
              {reloadMarkerTime && (
                <time dateTime={reloadMarkerTime}>
                  Physical cover marker at {reloadMarkerTime.slice(11, 23)} UTC
                </time>
              )}
              <span>
                {reloadRunning ? 'Reload observation running' : 'Reload observation stopped'}
              </span>
            </>
          )}
          <p>
            Diagnostic candidates do not confirm physical ejection, prove usable film, or change the
            trial allowance. Compare timestamps with synchronized video and physical markers.
          </p>
        </section>
      )}
      <details className={styles.diagnostics}>
        <summary>Operator diagnostics</summary>
        <p>
          Run {logRef.current?.runId ?? 'loading'} · printer responses are evidence, not ejection
          confirmation.
        </p>
        <button type="button" onClick={exportLog}>
          Export non-photo log
        </button>
        {logExport && (
          <div className={styles.exportPanel}>
            <p>Log ready. Download it or copy the JSON below if Bluefy does not save the file.</p>
            <div className={styles.exportActions}>
              <a
                href={`data:application/json;charset=utf-8,${encodeURIComponent(logExport.json)}`}
                download={logExport.filename}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download JSON
              </a>
              <button type="button" onClick={copyLog}>
                Copy JSON
              </button>
            </div>
            <label htmlFor="qualification-log-json">Non-photo log JSON</label>
            <textarea
              id="qualification-log-json"
              readOnly
              rows={8}
              value={logExport.json}
              onFocus={(event) => event.currentTarget.select()}
            />
            {copyStatus && <p role="status">{copyStatus}</p>}
          </div>
        )}
        <ol>
          {events.slice(-20).map((event, index) => (
            <li key={`${event.timestamp}-${index}`}>
              {event.timestamp} · {event.kind}
              {event.opcode === undefined ? '' : ` · 0x${event.opcode.toString(16)}`}
              {event.responseHex ? ` · ${event.responseHex}` : ''}
            </li>
          ))}
        </ol>
      </details>
    </main>
  );
}
