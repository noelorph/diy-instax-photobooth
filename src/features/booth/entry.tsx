import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { getBoothPrinterMode } from '@/lib/operations/printer-gate';
import { boothCookie, hashSecret } from '@/lib/operations/booth-authority';
import { readPackageBoothState } from '@/lib/operations/package-state';
import { BoothClient, BoothPaused } from './booth-client';
export async function BoothEntry() {
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
  // Task 3 installs physical adapter ownership; never fall back to simulation for a physical run.
  if (evidenceVersion === 'instax-fi033-0102-dev-v1') return <BoothPaused />;
  if (evidenceVersion === 'simulator-v1' || getBoothPrinterMode() === 'simulated')
    return <BoothClient />;
  return <BoothPaused />;
}
