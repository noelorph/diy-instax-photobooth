'use client';

import { useEffect, useRef, useState } from 'react';
import {
  connectMiniLink3,
  type PrinterConnection,
  type WebBluetoothPort,
} from './instax/bluetooth';
import { INSTAX_OPCODES } from './instax/protocol';
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

export function QualificationClient({ services }: { services?: QualificationServices }) {
  const [mounted, setMounted] = useState(Boolean(services));
  const [cameraReady, setCameraReady] = useState(false);
  const [printerReady, setPrinterReady] = useState(false);
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
  const [sheetsChecked, setSheetsChecked] = useState(false);
  const [logExport, setLogExport] = useState<{ filename: string; json: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [emergenceMarkerTime, setEmergenceMarkerTime] = useState<string | null>(null);
  const [statusTailComplete, setStatusTailComplete] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const connectionRef = useRef<PrinterConnection | null>(null);
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
    return () => {
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
    const event = logRef.current?.record(input);
    if (event) setEvents((previous) => [...previous, event]);
  }
  function stopObservation() {
    stopObservationRef.current?.();
    stopObservationRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (markerTailRef.current) clearTimeout(markerTailRef.current);
    markerTailRef.current = null;
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
    const active = servicesRef.current!;
    if (!active.bluetooth) {
      setSetupError(
        'Web Bluetooth is unavailable in this browser. Open the trusted HTTPS page in Bluefy.'
      );
      return;
    }
    setSetupError('');
    let connection: PrinterConnection | null = null;
    try {
      connection = await active.connect(active.bluetooth, {
        onResponse(response) {
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
          record({ kind: 'link3-status', responseHex: hex(bytes) });
        },
        onLink3StatusReady() {
          record({ kind: 'link3-status-listening' });
        },
        onLink3StatusError(error) {
          record({ kind: 'link3-status-unavailable', message: error.message });
        },
        onDisconnect() {
          connectionRef.current = null;
          setPrinterReady(false);
          setSetupError('Printer disconnected. Reconnect in setup.');
          record({ kind: 'printer-disconnect' });
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
      connectionRef.current = connection;
      let preflight: Awaited<ReturnType<typeof preflightPrinter>>;
      try {
        preflight = await active.preflight(connection);
      } catch (error) {
        throw new Error(`Printer status check: ${errorText(error)}`);
      }
      setPrinterDetails(
        `${connection.modelNumber} · firmware ${connection.firmwareRevision} · film reported ${preflight.filmRemaining}`
      );
      setPrinterReady(true);
      record({ kind: 'printer-ready', filmRemaining: preflight.filmRemaining });
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
    try {
      await controller.startPrint(jpeg);
      const current = controller.getState();
      setTrialState(current);
      setEvents(logRef.current?.getEvents() ?? []);
      if (current.phase === 'awaiting-observation') {
        setStage('pending');
        stopObservationRef.current = servicesRef.current!.observe(
          connectionRef.current!,
          (response) =>
            record({
              kind: 'status',
              opcode: response.opcode,
              statusByte: response.payload[0],
              filmRemaining:
                response.payload[2] === undefined ? undefined : response.payload[2] & 15,
              responseHex: hex(response.payload),
            }),
          (error) => record({ kind: 'status-error', message: error.message })
        );
        timeoutRef.current = setTimeout(() => {
          if (controller.getState().phase !== 'awaiting-observation') return;
          controller.markUncertain(
            emergenceMarkedRef.current
              ? 'Physical emergence was marked, but final confirmation was missed within 60 seconds'
              : 'No observed physical ejection within 60 seconds'
          );
          setTrialState(controller.getState());
          stopObservation();
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
    if (!sheetsChecked) return;
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
      <section className={styles.stage} aria-label="Trial view">
        <video
          ref={videoRef}
          className={`${styles.camera} ${stage === 'camera' ? '' : styles.hidden}`}
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
        {stage === 'setup' && (
          <div className={styles.emptyFrame}>
            <span>Printer and camera setup</span>
            <small>Permissions stay with the operator.</small>
          </div>
        )}
        {stage === 'pending' && (
          <div className={styles.emptyFrame}>
            <strong>Waiting for film ejection</strong>
            <small>Command acceptance does not confirm a print.</small>
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
              <span>{printerReady ? 'Printer ready' : 'Printer not connected'}</span>
              <button type="button" onClick={connectPrinter} disabled={blocked}>
                Connect printer
              </button>
            </div>
            {printerDetails && <p className={styles.detail}>{printerDetails}</p>}
            <button
              className={styles.primary}
              type="button"
              disabled={blocked || !cameraReady || !printerReady || trialState.phase !== 'ready'}
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
