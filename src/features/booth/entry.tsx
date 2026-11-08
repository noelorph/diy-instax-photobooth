import { z } from 'zod';
import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { getBoothPrinterMode } from '@/lib/operations/printer-gate';
import { boothCookie, hashSecret } from '@/lib/operations/booth-authority';
import { readPackageBoothState } from '@/lib/operations/package-state';
import { BoothClient, BoothPaused } from './booth-client';
export async function BoothEntry({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  await connection();
  if (process.env.NODE_ENV === 'production') return <BoothPaused />;
  let evidenceVersion: string | null = null;
  try {
    const secret = (await cookies()).get(boothCookie)?.value;
    if (secret && /^[0-9a-f]{64}$/.test(secret))
      evidenceVersion = (await readPackageBoothState(hashSecret(secret))).evidenceVersion;
  } catch {
    // A new handoff can establish access; a disabled mode alone cannot create an owner.
  }
  const currentMode = getBoothPrinterMode();
  const pinnedMode =
    evidenceVersion === 'instax-fi033-0102-dev-v1'
      ? 'instax-development'
      : evidenceVersion === 'simulator-v1'
        ? 'simulated'
        : null;
  const printerMode = pinnedMode ?? currentMode;
  if (printerMode === 'disabled') return <BoothPaused />;
  const entry = z.uuid().safeParse((await searchParams)?.entry);
  return (
    <BoothClient
      key={`${entry.success ? entry.data : 'scoped'}:${printerMode}:${printerMode !== currentMode}`}
      printerMode={printerMode}
      reconciliationOnly={printerMode !== currentMode}
    />
  );
}
