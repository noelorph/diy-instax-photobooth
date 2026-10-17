import { validateTrialJpeg } from '../image';
import type { PrinterConnection } from './bluetooth';
import {
  INSTAX_IMAGE_CHUNK_BYTES,
  INSTAX_OPCODES,
  type InstaxOpcode,
  type InstaxResponse,
} from './protocol';

export type PrintPhase = 'preflight' | 'uploading' | 'command-sent' | 'command-acknowledged';
export type SendResult =
  | { kind: 'accepted' }
  | { kind: 'rejected-before-command'; message: string }
  | { kind: 'uncertain'; message: string };

function successful(response: InstaxResponse, opcode: InstaxOpcode): void {
  if (response.opcode !== opcode || response.payload[0] !== 0) {
    throw new Error(`Printer rejected command 0x${opcode.toString(16)}`);
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function preflightPrinter(
  connection: PrinterConnection
): Promise<{ filmRemaining: number }> {
  try {
    successful(
      await connection.exchange(INSTAX_OPCODES.handshake, undefined, 15_000),
      INSTAX_OPCODES.handshake
    );
  } catch {
    /* Some Mini Link 3 firmware ignores handshake; support-info responses are the gate. */
  }
  const support = await connection.exchange(
    INSTAX_OPCODES.supportFunctionInfo,
    new Uint8Array([0]),
    10_000
  );
  successful(support, INSTAX_OPCODES.supportFunctionInfo);
  if (
    support.payload.length < 6 ||
    support.payload[1] !== 0 ||
    support.payload[2] !== 2 ||
    support.payload[3] !== 88 ||
    support.payload[4] !== 3 ||
    support.payload[5] !== 32
  ) {
    throw new Error('Printer does not report 600 × 800 image support');
  }
  const status = await connection.exchange(
    INSTAX_OPCODES.supportFunctionInfo,
    new Uint8Array([2]),
    10_000
  );
  successful(status, INSTAX_OPCODES.supportFunctionInfo);
  if (status.payload.length < 3 || status.payload[1] !== 2)
    throw new Error('Printer film status is incomplete');
  const filmRemaining = status.payload[2] & 15;
  if (filmRemaining === 0) throw new Error('Printer reports no film remaining');
  return { filmRemaining };
}

export async function sendTrialPrint(
  connection: PrinterConnection,
  jpeg: Uint8Array,
  onPhase: (phase: PrintPhase) => void
): Promise<SendResult> {
  let commandStarted = false;
  try {
    validateTrialJpeg(jpeg);
    onPhase('preflight');
    await preflightPrinter(connection);
    onPhase('uploading');
    const startPayload = new Uint8Array(8);
    startPayload[0] = 2;
    new DataView(startPayload.buffer).setUint32(4, jpeg.byteLength, false);
    successful(
      await connection.exchange(INSTAX_OPCODES.downloadStart, startPayload),
      INSTAX_OPCODES.downloadStart
    );
    for (
      let offset = 0, index = 0;
      offset < jpeg.byteLength;
      offset += INSTAX_IMAGE_CHUNK_BYTES, index++
    ) {
      const chunk = new Uint8Array(4 + INSTAX_IMAGE_CHUNK_BYTES);
      new DataView(chunk.buffer).setUint32(0, index, false);
      chunk.set(jpeg.subarray(offset, offset + INSTAX_IMAGE_CHUNK_BYTES), 4);
      successful(
        await connection.exchange(INSTAX_OPCODES.downloadData, chunk, 10_000),
        INSTAX_OPCODES.downloadData
      );
      await delay(50);
    }
    successful(await connection.exchange(INSTAX_OPCODES.downloadEnd), INSTAX_OPCODES.downloadEnd);
    await delay(1000);
    commandStarted = true;
    onPhase('command-sent');
    successful(
      await connection.exchange(INSTAX_OPCODES.printImage, undefined, 15_000),
      INSTAX_OPCODES.printImage
    );
    onPhase('command-acknowledged');
    return { kind: 'accepted' };
  } catch (error) {
    return commandStarted
      ? { kind: 'uncertain', message: `${message(error)}. Inspect printer; do not resend.` }
      : { kind: 'rejected-before-command', message: message(error) };
  }
}

export function startStatusObservation(
  connection: PrinterConnection,
  onStatus: (response: InstaxResponse) => void,
  onError: (error: Error) => void
): () => void {
  let elapsed = 0;
  let busy = false;
  let stopped = false;
  const interval = setInterval(async () => {
    elapsed += 900;
    if (elapsed >= 60_000) {
      clearInterval(interval);
      stopped = true;
      return;
    }
    if (busy) return;
    busy = true;
    try {
      const response = await connection.exchange(
        INSTAX_OPCODES.supportFunctionInfo,
        new Uint8Array([2]),
        10_000
      );
      if (!stopped) onStatus(response);
    } catch (error) {
      if (!stopped) onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      busy = false;
    }
  }, 900);
  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
